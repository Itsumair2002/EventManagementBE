const Booking = require("../models/bookings.model");
const Event = require("../models/events.model");

// CREATE BOOKING
exports.createBooking = async (req, res) => {
  try {
    const { eventId, numberOfTickets } = req.body;
    const userId = req.user.userId;

    if (!eventId || !numberOfTickets) {
      return res.status(400).json({ message: "Event ID and number of tickets are required" });
    }

    if (numberOfTickets <= 0) {
      return res.status(400).json({ message: "Number of tickets must be at least 1" });
    }

    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    if (event.status !== "published") {
      return res.status(400).json({ message: "Event is not published" });
    }

    if (event.availableSeats < numberOfTickets) {
      return res.status(400).json({ message: "Not enough seats available" });
    }

    const totalAmount = event.price * numberOfTickets;
    
    // In a real application, you would generate a real QR code using a package like 'qrcode'
    // and upload it to a storage service (S3, Cloudinary) to get a URL.
    // For now, generating a mock string.
    const qrCodeData = `BOOKING-${userId}-${eventId}-${Date.now()}`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${qrCodeData}`;

    const booking = await Booking.create({
      userId,
      eventId,
      numberOfTickets,
      totalAmount,
      qrCodeData,
      qrCodeUrl,
      status: "confirmed"
    });

    // Update event available seats
    event.availableSeats -= numberOfTickets;
    await event.save();

    res.status(201).json({
      message: "Booking created successfully",
      booking,
      status_code: 201
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET USER BOOKINGS
exports.getUserBookings = async (req, res) => {
  try {
    const userId = req.user.userId;
    const bookings = await Booking.find({ userId })
      .populate("eventId", "eventName eventDate venue location imageUrl price")
      .sort({ bookingDate: -1 });

    res.status(200).json({
      message: "Bookings retrieved successfully",
      bookings,
      status_code: 200
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET SINGLE BOOKING
exports.getSingleBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const booking = await Booking.findOne({ _id: id, userId })
      .populate("eventId", "eventName eventDate venue location imageUrl price");

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    res.status(200).json({
      message: "Booking retrieved successfully",
      booking,
      status_code: 200
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
