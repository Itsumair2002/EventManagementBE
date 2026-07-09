// EventMate chatbot service.
//
// This is the ONE place we still call Gemini, because understanding free-form
// user questions genuinely needs a language model. Recommendations were moved
// out to recommendation.service.js (a pure algorithm) so that the homepage no
// longer burns the Gemini quota on every visit.
//
// To survive the free tier this service adds:
//   * response caching        – identical questions don't re-hit the API
//   * per-user rate limiting   – one abusive client can't drain the quota
//   * retry with backoff on 429/5xx
//   * a robust keyword fallback so the bot always answers, even offline.

const jwt = require("jsonwebtoken");
const Booking = require("../models/bookings.model");
const Event = require("../models/events.model");
const Category = require("../models/categories.model");
const { TTLCache, RateLimiter } = require("../utils/aiCache");

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models";

// Cache answers to identical questions for 30 min (keyed per user + message).
const chatCache = new TTLCache({ ttlMs: 30 * 60 * 1000, maxEntries: 1000 });
// Cap Gemini calls to a sane rate per user/guest so quota lasts.
const chatLimiter = new RateLimiter({ windowMs: 60 * 1000, max: 8 });

const normalizeEvent = (event) => {
  const obj = event.toObject ? event.toObject() : event;
  const categoryName =
    obj.category && typeof obj.category === "object"
      ? obj.category.categoryName
      : obj.category || "General";

  return {
    id: obj._id?.toString(),
    eventName: obj.eventName,
    description: obj.description,
    category: categoryName,
    eventDate: obj.eventDate,
    venue: obj.venue,
    location: obj.location,
    totalSeats: obj.totalSeats || 0,
    availableSeats: obj.availableSeats || 0,
    price: obj.price || 0,
    status: obj.status,
  };
};

const extractJson = (text) => {
  if (!text) return null;
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch (_) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (_) {
        /* fall through to salvage */
      }
    }
    // Salvage: the JSON was truncated mid-stream (e.g. token limit). Pull out
    // the reply string and any complete event IDs so we still show clean text
    // instead of leaking raw JSON to the user.
    const replyMatch = cleaned.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (replyMatch) {
      const reply = replyMatch[1].replace(/\\"/g, '"').replace(/\\n/g, " ").trim();
      const ids = [...cleaned.matchAll(/"([a-f0-9]{24})"/gi)].map((m) => m[1]);
      return { reply, suggestedEventIds: ids };
    }
    return null;
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const callGemini = async (prompt, { retries = 2, json = false } = {}) => {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-1.5-flash";

  if (!apiKey) throw new Error("Gemini API key is not configured");
  if (typeof fetch !== "function") throw new Error("This Node.js version does not include fetch");

  // Ask Gemini for raw JSON (no ```json fences) and give enough room to finish
  // the object so it never gets truncated into invalid JSON.
  const generationConfig = { temperature: 0.4, maxOutputTokens: 1024 };
  if (json) generationConfig.responseMimeType = "application/json";

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);

    try {
      const response = await fetch(
        `${GEMINI_API_URL}/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig,
          }),
        }
      ).finally(() => clearTimeout(timeout));

      if (response.ok) {
        const data = await response.json();
        return (
          data?.candidates?.[0]?.content?.parts?.map((part) => part.text).join("\n") || ""
        );
      }

      const detail = await response.text();
      lastError = new Error(`Gemini request failed: ${response.status} ${detail}`);

      // Retry only on rate-limit / transient server errors.
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt === retries) throw lastError;
      await sleep(400 * Math.pow(2, attempt)); // 400ms, 800ms backoff
    } catch (error) {
      lastError = error;
      if (error.name === "AbortError" && attempt < retries) {
        await sleep(400 * Math.pow(2, attempt));
        continue;
      }
      if (attempt === retries) throw lastError;
    }
  }
  throw lastError;
};

const getUserIdFromAuthHeader = (authorization) => {
  if (!authorization || !authorization.startsWith("Bearer ")) return null;
  try {
    const decoded = jwt.verify(authorization.split(" ")[1], process.env.JWT_SECRET);
    return decoded.userId || decoded.id || null;
  } catch (_) {
    return null;
  }
};

const getUserBookingContext = async (userId) => {
  if (!userId) return [];
  return Booking.find({ userId })
    .populate({ path: "eventId", populate: { path: "category" } })
    .sort({ bookingDate: -1 })
    .limit(10);
};

const buildChatFallback = (message, events) => {
  const lowerMessage = message.toLowerCase();
  const eventList = events.map(normalizeEvent);
  const matchingEvents = eventList
    .filter((event) => {
      const haystack =
        `${event.eventName} ${event.category} ${event.location} ${event.venue}`.toLowerCase();
      return lowerMessage
        .split(/\s+/)
        .filter((word) => word.length > 3)
        .some((word) => haystack.includes(word));
    })
    .slice(0, 3);

  if (lowerMessage.includes("booking") || lowerMessage.includes("ticket")) {
    return {
      reply:
        "You can book from any event detail page. After booking, open My Bookings to view your QR ticket or download the PDF.",
      suggestedEventIds: matchingEvents.map((event) => event.id),
    };
  }

  if (matchingEvents.length) {
    return {
      reply: `I found ${matchingEvents.length} event${
        matchingEvents.length > 1 ? "s" : ""
      } that match your request. You can open them below and book from the event page.`,
      suggestedEventIds: matchingEvents.map((event) => event.id),
    };
  }

  return {
    reply:
      "I can help you find events by category, location, budget, or date. Try asking for music events in your city, cheap events, or upcoming events this week.",
    suggestedEventIds: eventList.slice(0, 3).map((event) => event.id),
  };
};

const buildChatPrompt = ({ message, events, bookings }) => {
  const eventSummaries = events.map(normalizeEvent).slice(0, 25);
  const bookingSummaries = bookings
    .map((booking) => booking.eventId)
    .filter(Boolean)
    .map(normalizeEvent);

  return `
You are EventMate, a warm, concise assistant for an event booking website.
Answer the user's question in 2-4 short sentences, in a friendly, helpful tone.

You can help with:
- recommending or finding events by category, city, venue, budget, or date
- explaining how booking, QR tickets, PDF downloads, and "My Bookings" work

Rules:
- Never invent events. Only suggest event IDs that appear in the candidate list.
- If several events fit, suggest the 2-3 best rather than listing everything.
- If the question is about the user's own account/data and context is missing,
  briefly tell them where in the app to find it.
- Be specific and encouraging, but do not overpromise.
- Return ONLY valid JSON, no markdown.

JSON shape:
{
  "reply": "string",
  "suggestedEventIds": ["eventId"]
}

User message:
${message}

User booking history:
${JSON.stringify(bookingSummaries, null, 2)}

Candidate events:
${JSON.stringify(eventSummaries, null, 2)}
`;
};

const getFilteredEventsForChat = async (message) => {
  const lowerMessage = message.toLowerCase();

  try {
    const categories = await Category.find({});
    const matchedCategoryIds = [];
    categories.forEach((cat) => {
      const name = cat.categoryName.toLowerCase();
      if (lowerMessage.includes(name) || (name === "music" && lowerMessage.includes("concert"))) {
        matchedCategoryIds.push(cat._id);
      }
    });

    const query = { status: "published" };

    const locations = [
      "kolkata", "mumbai", "delhi", "bengaluru", "bangalore",
      "pune", "chennai", "hyderabad",
    ];
    let matchedLocation = null;
    for (const loc of locations) {
      if (lowerMessage.includes(loc)) {
        matchedLocation = loc;
        break;
      }
    }

    if (matchedLocation) {
      const locRegex = matchedLocation === "bangalore" ? "bengaluru" : matchedLocation;
      query.location = { $regex: locRegex, $options: "i" };
    }

    if (matchedCategoryIds.length > 0) {
      query.category = { $in: matchedCategoryIds };
    }

    let events = await Event.find(query).populate("category").sort({ eventDate: 1 });

    if (events.length === 0 && (matchedLocation || matchedCategoryIds.length > 0)) {
      events = await Event.find({ status: "published" })
        .populate("category")
        .sort({ eventDate: 1 })
        .limit(5);
    } else if (events.length > 5) {
      events = events.slice(0, 5);
    }

    return events;
  } catch (error) {
    console.error("Error pre-filtering events for chat:", error);
    return Event.find({ status: "published" }).populate("category").sort({ eventDate: 1 }).limit(5);
  }
};

const chat = async ({ authorization, message, clientId }) => {
  const userId = getUserIdFromAuthHeader(authorization);
  const identity = userId || clientId || "guest";
  const normalizedMessage = message.trim().toLowerCase().replace(/\s+/g, " ");

  // 1. Serve identical repeat questions from cache — no API call.
  const cacheKey = `${identity}:${normalizedMessage}`;
  const cachedReply = chatCache.get(cacheKey);
  if (cachedReply) {
    return { ...cachedReply, source: "cache" };
  }

  const [events, bookings] = await Promise.all([
    getFilteredEventsForChat(message),
    getUserBookingContext(userId),
  ]);
  const fallback = buildChatFallback(message, events);

  // 2. Rate-limit Gemini use; when exhausted, still answer via fallback.
  const { allowed } = chatLimiter.check(identity);
  if (!allowed) {
    return { source: "fallback", ...fallback };
  }

  try {
    const prompt = buildChatPrompt({ message, events, bookings });
    const text = await callGemini(prompt, { json: true });
    const parsed = extractJson(text);

    // If we couldn't get a clean reply out of the model, use the keyword
    // fallback rather than ever showing raw JSON/markdown to the user.
    if (!parsed?.reply) {
      return { source: "fallback", ...fallback };
    }

    const validIds = new Set(events.map((event) => event._id.toString()));
    const suggestedEventIds = (parsed.suggestedEventIds || [])
      .filter((id) => validIds.has(id))
      .slice(0, 4);

    const result = {
      source: "gemini",
      reply: parsed.reply,
      suggestedEventIds,
    };

    // 3. Cache the successful answer for repeat questions.
    chatCache.set(cacheKey, { reply: result.reply, suggestedEventIds });
    return result;
  } catch (error) {
    console.error("Gemini chatbot fallback:", error.message);
    return { source: "fallback", ...fallback };
  }
};

module.exports = { chat };
