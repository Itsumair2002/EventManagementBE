// AI recommendation engine — a pure, in-house ranking algorithm.
//
// Deliberately does NOT call any LLM. Ranking events for a user is a scoring
// problem, not a language problem, so this runs entirely in Node/Mongo:
//   * zero external API calls  -> never touches the Gemini quota
//   * deterministic & instant  -> same inputs give same output, no latency
//   * always available         -> no upstream to rate-limit or fail
//
// It blends four classic recommender signals:
//   1. Content-based   – how well an event matches the categories/locations
//                        the user has booked before.
//   2. Collaborative   – "users who booked what you booked also booked this".
//   3. Popularity      – overall demand (bookings + how full the event is).
//   4. Urgency/recency – upcoming, soon, and filling-up events float up.

const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const Booking = require("../models/bookings.model");
const Event = require("../models/events.model");
const { TTLCache } = require("../utils/aiCache");

// Recommendations are stable for a while, and this endpoint is hit on every
// homepage load, so cache aggressively per audience.
const recCache = new TTLCache({ ttlMs: 10 * 60 * 1000, maxEntries: 1000 });
// Global demand stats are shared across all users; refresh a bit more often.
const statsCache = new TTLCache({ ttlMs: 5 * 60 * 1000, maxEntries: 4 });

// Relative importance of each signal. Tune here — they need not sum to 1.
const WEIGHTS = {
  category: 34,
  collaborative: 26,
  popularity: 16,
  location: 12,
  urgency: 12,
};

const normalizeEvent = (event) => {
  const obj = event.toObject ? event.toObject() : event;
  const categoryName =
    obj.category && typeof obj.category === "object"
      ? obj.category.categoryName
      : obj.category || "General";

  return {
    id: obj._id?.toString(),
    eventName: obj.eventName,
    category: categoryName,
    eventDate: obj.eventDate,
    venue: obj.venue,
    location: obj.location,
    totalSeats: obj.totalSeats || 0,
    availableSeats: obj.availableSeats || 0,
    price: obj.price || 0,
  };
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

// --- Data gathering -------------------------------------------------------

const getCandidateEvents = async () => {
  return Event.find({ status: "published", availableSeats: { $gt: 0 } })
    .populate("category")
    .sort({ eventDate: 1 })
    .limit(200);
};

const getUserBookings = async (userId) => {
  if (!userId) return [];
  return Booking.find({ userId, status: { $ne: "cancelled" } })
    .populate({ path: "eventId", populate: { path: "category" } })
    .sort({ bookingDate: -1 })
    .limit(50);
};

// Global demand per event: total tickets + distinct orders. Cached & shared.
const getPopularityStats = async () => {
  const cached = statsCache.get("popularity");
  if (cached) return cached;

  const rows = await Booking.aggregate([
    { $match: { status: { $ne: "cancelled" } } },
    {
      $group: {
        _id: "$eventId",
        tickets: { $sum: "$numberOfTickets" },
        orders: { $sum: 1 },
      },
    },
  ]);

  const byEvent = new Map();
  let maxTickets = 1;
  rows.forEach((row) => {
    const id = row._id?.toString();
    if (!id) return;
    byEvent.set(id, { tickets: row.tickets || 0, orders: row.orders || 0 });
    if (row.tickets > maxTickets) maxTickets = row.tickets;
  });

  return statsCache.set("popularity", { byEvent, maxTickets });
};

// Collaborative signal: find people who booked the same events as this user,
// then count how often they booked each *other* event.
const getCollaborativeScores = async (userId, bookedEventIds) => {
  if (!userId || bookedEventIds.length === 0) return { byEvent: new Map(), maxPeers: 1 };

  const objectUserId = mongoose.isValidObjectId(userId)
    ? new mongoose.Types.ObjectId(userId)
    : userId;
  const bookedObjectIds = bookedEventIds
    .filter((id) => mongoose.isValidObjectId(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  if (bookedObjectIds.length === 0) return { byEvent: new Map(), maxPeers: 1 };

  // Peers = other users who attended at least one of the same events.
  const peerRows = await Booking.aggregate([
    {
      $match: {
        eventId: { $in: bookedObjectIds },
        userId: { $ne: objectUserId },
        status: { $ne: "cancelled" },
      },
    },
    { $group: { _id: "$userId" } },
    { $limit: 500 },
  ]);
  const peerIds = peerRows.map((row) => row._id).filter(Boolean);
  if (peerIds.length === 0) return { byEvent: new Map(), maxPeers: 1 };

  // What else did those peers book (that this user hasn't)?
  const coRows = await Booking.aggregate([
    {
      $match: {
        userId: { $in: peerIds },
        eventId: { $nin: bookedObjectIds },
        status: { $ne: "cancelled" },
      },
    },
    { $group: { _id: "$eventId", peers: { $addToSet: "$userId" } } },
    { $project: { peerCount: { $size: "$peers" } } },
  ]);

  const byEvent = new Map();
  let maxPeers = 1;
  coRows.forEach((row) => {
    const id = row._id?.toString();
    if (!id) return;
    byEvent.set(id, row.peerCount);
    if (row.peerCount > maxPeers) maxPeers = row.peerCount;
  });

  return { byEvent, maxPeers };
};

// --- Scoring --------------------------------------------------------------

const buildUserProfile = (bookings) => {
  const bookedEvents = bookings
    .map((b) => b.eventId)
    .filter(Boolean)
    .map(normalizeEvent);

  const categoryCounts = new Map();
  const locationCounts = new Map();
  const bookedIds = new Set();

  bookedEvents.forEach((event) => {
    bookedIds.add(event.id);
    categoryCounts.set(event.category, (categoryCounts.get(event.category) || 0) + 1);
    [event.location, event.venue].filter(Boolean).forEach((loc) => {
      const key = loc.toLowerCase();
      locationCounts.set(key, (locationCounts.get(key) || 0) + 1);
    });
  });

  const total = bookedEvents.length || 1;
  return { categoryCounts, locationCounts, bookedIds, totalBookings: bookedEvents.length, total };
};

const scoreEvent = (event, ctx) => {
  const { profile, popularity, collaborative } = ctx;
  const now = Date.now();
  const eventTime = event.eventDate ? new Date(event.eventDate).getTime() : now;
  const daysAway = Math.round((eventTime - now) / (1000 * 60 * 60 * 24));

  const contributions = [];
  let score = 0;

  // 1. Content — category affinity (fraction of history in this category).
  const catCount = profile.categoryCounts.get(event.category) || 0;
  if (catCount > 0) {
    const affinity = catCount / profile.total; // 0..1
    const pts = WEIGHTS.category * affinity;
    score += pts;
    contributions.push({ key: "category", pts, category: event.category });
  }

  // 2. Content — location affinity.
  const locKeys = [event.location, event.venue].filter(Boolean).map((l) => l.toLowerCase());
  const locCount = locKeys.reduce((sum, key) => sum + (profile.locationCounts.get(key) || 0), 0);
  if (locCount > 0) {
    const affinity = Math.min(1, locCount / profile.total);
    const pts = WEIGHTS.location * affinity;
    score += pts;
    contributions.push({ key: "location", pts, location: event.location });
  }

  // 3. Collaborative.
  const peers = collaborative.byEvent.get(event.id) || 0;
  if (peers > 0) {
    const pts = WEIGHTS.collaborative * (peers / collaborative.maxPeers);
    score += pts;
    contributions.push({ key: "collaborative", pts, peers });
  }

  // 4. Popularity — log-scaled tickets + how full the event already is.
  const demand = popularity.byEvent.get(event.id);
  const bookedRatio = event.totalSeats > 0 ? 1 - event.availableSeats / event.totalSeats : 0;
  if (demand || bookedRatio > 0) {
    const ticketScore = demand
      ? Math.log1p(demand.tickets) / Math.log1p(popularity.maxTickets)
      : 0;
    const pts = WEIGHTS.popularity * (0.6 * ticketScore + 0.4 * bookedRatio);
    score += pts;
    contributions.push({ key: "popularity", pts, bookedRatio });
  }

  // 5. Urgency — upcoming and soon ranks higher; past/very-far ranks lower.
  if (daysAway >= 0) {
    const urgency = daysAway <= 30 ? 1 - daysAway / 30 : Math.max(0, 0.4 - daysAway / 365);
    const pts = WEIGHTS.urgency * Math.max(0, urgency);
    score += pts;
    if (pts > 0) contributions.push({ key: "urgency", pts, daysAway });
  } else {
    score -= 100; // event already happened — push it out.
  }

  contributions.sort((a, b) => b.pts - a.pts);
  return { score, contributions, daysAway };
};

const reasonFromContribution = (top, event) => {
  if (!top) return "A popular upcoming event we think you'll enjoy.";
  switch (top.key) {
    case "category":
      return `Because you've booked ${top.category} events before.`;
    case "location":
      return `Happening in ${event.location}, near where you usually go out.`;
    case "collaborative":
      return `People with tastes like yours also booked this event.`;
    case "popularity":
      return top.bookedRatio > 0.6
        ? "Trending now and filling up fast."
        : "One of the most-booked events right now.";
    case "urgency":
      return top.daysAway <= 7
        ? "Coming up this week — don't miss it."
        : "An upcoming event worth catching soon.";
    default:
      return "Recommended for you.";
  }
};

// Light diversity pass: avoid returning many events from one category in a row.
const diversify = (ranked, limit) => {
  const perCategoryCap = Math.max(2, Math.ceil(limit / 2));
  const counts = new Map();
  const picked = [];
  const overflow = [];

  for (const item of ranked) {
    const cat = item.event.category;
    const used = counts.get(cat) || 0;
    if (used < perCategoryCap) {
      counts.set(cat, used + 1);
      picked.push(item);
    } else {
      overflow.push(item);
    }
    if (picked.length >= limit) break;
  }
  // Backfill from overflow if diversity left us short.
  for (const item of overflow) {
    if (picked.length >= limit) break;
    picked.push(item);
  }
  return picked.slice(0, limit);
};

// --- Public API -----------------------------------------------------------

const getRecommendations = async ({ authorization, limit = 6 }) => {
  const userId = getUserIdFromAuthHeader(authorization);
  const cacheKey = `${userId || "guest"}:${limit}`;
  const cached = recCache.get(cacheKey);
  if (cached) return cached;

  const [candidates, bookings, popularity] = await Promise.all([
    getCandidateEvents(),
    getUserBookings(userId),
    getPopularityStats(),
  ]);

  const normalizedCandidates = candidates.map(normalizeEvent);
  const profile = buildUserProfile(bookings);
  const collaborative = await getCollaborativeScores(userId, [...profile.bookedIds]);

  const ctx = { profile, popularity, collaborative };

  const ranked = normalizedCandidates
    .filter((event) => !profile.bookedIds.has(event.id)) // don't re-recommend booked events
    .map((event) => {
      const { score, contributions, daysAway } = scoreEvent(event, ctx);
      return { event, score, contributions, daysAway };
    })
    .filter((item) => item.daysAway >= 0)
    .sort((a, b) => b.score - a.score);

  const top = diversify(ranked, limit);

  const recommendations = top.map((item) => ({
    eventId: item.event.id,
    reason: reasonFromContribution(item.contributions[0], item.event),
    score: Math.round(item.score * 10) / 10,
  }));

  const result = {
    source: "engine",
    personalized: profile.totalBookings > 0,
    recommendations,
  };
  return recCache.set(cacheKey, result);
};

// Allow other code (e.g. after a new booking) to bust a user's cache.
const invalidateUser = (userId) => {
  const prefix = `${userId || "guest"}:`;
  for (const key of recCache.store.keys()) {
    if (key.startsWith(prefix)) recCache.store.delete(key);
  }
};

module.exports = { getRecommendations, invalidateUser };
