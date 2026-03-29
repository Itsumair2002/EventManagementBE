const express = require("express");
const router = express.Router();
const { protect, adminOnly } = require("../middlewares/auth.middleware");
const { getAllBookings, getDashboardSummary, updateBookingStatus } = require("../controllers/admin.controller");

// Admin dashboard summary
router.get("/summary", protect, adminOnly, getDashboardSummary);

// Admin order listing
router.get("/bookings", protect, adminOnly, getAllBookings);

// Update booking status
router.patch("/bookings/:id/status", protect, adminOnly, updateBookingStatus);

module.exports = router;
