const Event = require("../models/events.model");
const aiService = require("../services/ai.service");
const recommendationService = require("../services/recommendation.service");

const withEvents = async (items) => {
  const ids = items.map((item) => item.eventId);
  const events = await Event.find({ _id: { $in: ids } }).populate("category");
  const eventMap = new Map(events.map((event) => [event._id.toString(), event]));

  return items
    .map((item) => {
      const event = eventMap.get(item.eventId);
      if (!event) return null;
      const eventObj = event.toObject();
      if (eventObj.imageUrl) {
        eventObj.imageUrl = `/uploads/${eventObj.imageUrl}`;
      }
      return {
        event: eventObj,
        reason: item.reason,
      };
    })
    .filter(Boolean);
};

exports.getRecommendations = async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 6, 10);
    const result = await recommendationService.getRecommendations({
      authorization: req.headers.authorization,
      limit,
    });

    res.status(200).json({
      success: true,
      source: result.source,
      personalized: result.personalized,
      recommendations: await withEvents(result.recommendations),
      status_code: 200,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.chat = async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: "Message is required",
      });
    }

    const result = await aiService.chat({
      authorization: req.headers.authorization,
      message: message.trim(),
      clientId: req.ip,
    });

    res.status(200).json({
      success: true,
      ...result,
      status_code: 200,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
