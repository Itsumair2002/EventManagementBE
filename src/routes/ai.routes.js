const express = require("express");
const { getRecommendations, chat } = require("../controllers/ai.controller");

const router = express.Router();

router.get("/recommendations", getRecommendations);
router.post("/chat", chat);

module.exports = router;
