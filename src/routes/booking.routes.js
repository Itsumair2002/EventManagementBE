const express = require("express");
const router = express.Router();

const {
  createBooking,
  getUserBookings,
  getSingleBooking,
  downloadBookingPDF,
  getBookingTickets,
  getMyOwnedTickets,
  transferTicket,
  downloadTicketPDF
} = require("../controllers/booking.controller");
const { protect } = require("../middlewares/auth.middleware");

// Routes for logged-in users
router.post("/", protect, createBooking);
router.get("/my-bookings", protect, getUserBookings);
router.get("/my-tickets", protect, getMyOwnedTickets);
router.get("/:id", protect, getSingleBooking);
router.get("/:id/download", protect, downloadBookingPDF);
router.get("/:bookingId/tickets", protect, getBookingTickets);
router.post("/tickets/:ticketId/transfer", protect, transferTicket);
router.get("/tickets/:ticketId/download", protect, downloadTicketPDF);

module.exports = router;
