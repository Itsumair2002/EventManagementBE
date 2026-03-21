const express = require("express");
const router = express.Router();

const {
  createBooking,
  getUserBookings,
  getSingleBooking
} = require("../controllers/booking.controller");
const { protect } = require("../middlewares/auth.middleware");

// Routes for logged-in users
router.post("/", protect, createBooking);
router.get("/my-bookings", protect, getUserBookings);
router.get("/:id", protect, getSingleBooking);

module.exports = router;
