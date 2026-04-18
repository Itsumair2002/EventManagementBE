const Booking = require("../models/bookings.model");

// GET ALL BOOKINGS (Admin Only)
exports.getAllBookings = async (req, res) => {
  try {
    const { status, page = 1, limit = 10, search } = req.query;
    
    const query = {};
    if (status) query.status = status;
    
    // Total count for pagination
    const totalBookings = await Booking.countDocuments(query);
    
    const bookings = await Booking.find(query)
      .populate("userId", "fullName email phoneNumber")
      .populate("eventId", "eventName eventDate venue location imageUrl price")
      .sort({ bookingDate: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const bookingsWithImageUrl = bookings.map((booking) => {
      const bookingObj = booking.toObject();
      if (bookingObj.eventId && bookingObj.eventId.imageUrl) {
        bookingObj.eventId.imageUrl = `/uploads/${bookingObj.eventId.imageUrl}`;
      }
      return bookingObj;
    });

    res.status(200).json({
      success: true,
      count: bookings.length,
      totalBookings,
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalBookings / limit),
      bookings: bookingsWithImageUrl,
      status_code: 200,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message
    });
  }
};

// GET DASHBOARD SUMMARY (Admin Only)
exports.getDashboardSummary = async (req, res) => {
  try {
    const totalBookings = await Booking.countDocuments();
    const confirmedBookings = await Booking.countDocuments({ status: "confirmed" });
    const cancelledBookings = await Booking.countDocuments({ status: "cancelled" });
    const attendedBookings = await Booking.countDocuments({ status: "attended" });

    const totalSales = await Booking.aggregate([
      { $match: { status: "confirmed" } },
      { $group: { _id: null, total: { $sum: "$totalAmount" } } }
    ]);

    const totalTicketsSold = await Booking.aggregate([
        { $match: { status: "confirmed" } },
        { $group: { _id: null, total: { $sum: "$numberOfTickets" } } }
      ]);

    res.status(200).json({
      success: true,
      summary: {
        totalBookings,
        confirmedBookings,
        cancelledBookings,
        attendedBookings,
        totalRevenue: totalSales.length > 0 ? totalSales[0].total : 0,
        totalTicketsSold: totalTicketsSold.length > 0 ? totalTicketsSold[0].total : 0
      },
      status_code: 200
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message
    });
  }
};

// UPDATE BOOKING STATUS (Admin Only)
exports.updateBookingStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["confirmed", "cancelled", "attended"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const booking = await Booking.findByIdAndUpdate(id, { status }, { new: true });

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    res.status(200).json({
      success: true,
      message: `Booking status updated to ${status}`,
      booking,
      status_code: 200
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message
    });
  }
};
