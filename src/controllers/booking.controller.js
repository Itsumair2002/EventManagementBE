const Booking = require("../models/bookings.model");
const Event = require("../models/events.model");
const PDFDocument = require("pdfkit");
const https = require("https");
const sendEmail = require("../utils/sendEmail");
const { generateTicketPDF } = require("../utils/ticketGenerator");
const User = require("../models/users.model");



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
    
    const booking = new Booking({
      userId,
      eventId,
      numberOfTickets,
      totalAmount,
      status: "confirmed"
    });

    // Generate QR code data with required details
    const eventDateStr = event.eventDate ? new Date(event.eventDate).toLocaleString() : "TBA";
    const qrCodeData = `Booking ID: ${booking._id}\nEvent Name: ${event.eventName}\nVenue: ${event.venue}\nDate & Time: ${eventDateStr}\nSeats: ${numberOfTickets}`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrCodeData)}`;

    booking.qrCodeData = qrCodeData;
    booking.qrCodeUrl = qrCodeUrl;
    
    await booking.save();

    // Update event available seats
    event.availableSeats -= numberOfTickets;
    await event.save();

    // SEND EMAIL WITH TICKET
    try {
      const user = await User.findById(userId);
      if (user && user.email) {
        // Prepare data for PDF
        const populatedBooking = await Booking.findById(booking._id).populate("userId", "fullName email");
        const pdfBuffer = await generateTicketPDF(populatedBooking, event);

        await sendEmail({
          email: user.email,
          subject: `Your Ticket Confirmation for ${event.eventName} - VibeCheck`,
          message: `
            <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
              <h1 style="color: #1a237e; text-align: center;">Booking Confirmed!</h1>
              <p>Hi ${user.fullName || "there"},</p>
              <p>Exciting news! Your booking for <strong>${event.eventName}</strong> is confirmed. We've attached your digital ticket to this email.</p>
              
              <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <p style="margin: 5px 0;"><strong>Event:</strong> ${event.eventName}</p>
                <p style="margin: 5px 0;"><strong>Venue:</strong> ${event.venue}</p>
                <p style="margin: 5px 0;"><strong>Date:</strong> ${new Date(event.eventDate).toLocaleDateString()}</p>
                <p style="margin: 5px 0;"><strong>Tickets:</strong> ${numberOfTickets}</p>
              </div>

              <p>Please carry the attached PDF (printed or on your phone) to the venue for entry.</p>
              <p>See you there!</p>
              <p>Best regards,<br/><strong>Team VibeCheck</strong></p>
              <hr style="border: 0; border-top: 1px solid #eee; margin-top: 20px;"/>
              <p style="font-size: 12px; color: #999; text-align: center;">This is an automated message, please do not reply.</p>
            </div>
          `,
          attachmentBuffer: pdfBuffer,
          attachmentName: `Ticket-${event.eventName.replace(/\s+/g, "_")}.pdf`
        });
      }
    } catch (emailError) {
      console.error("Email Sending Failed:", emailError);
      // We don't want to fail the whole booking if email fails, but we should log it.
    }

    res.status(201).json({
      message: "Booking created successfully and confirmation email sent",
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

    const bookingsWithImageUrl = bookings.map((booking) => {
      const bookingObj = booking.toObject();
      if (bookingObj.eventId && bookingObj.eventId.imageUrl) {
        bookingObj.eventId.imageUrl = `/uploads/${bookingObj.eventId.imageUrl}`;
      }
      return bookingObj;
    });

    res.status(200).json({
      message: "Bookings retrieved successfully",
      bookings: bookingsWithImageUrl,
      status_code: 200,
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

    const bookingObj = booking.toObject();
    if (bookingObj.eventId && bookingObj.eventId.imageUrl) {
      bookingObj.eventId.imageUrl = `/uploads/${bookingObj.eventId.imageUrl}`;
    }

    res.status(200).json({
      message: "Booking retrieved successfully",
      booking: bookingObj,
      status_code: 200,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// DOWNLOAD BOOKING PDF
exports.downloadBookingPDF = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const booking = await Booking.findOne({ _id: id, userId })
      .populate("eventId")
      .populate("userId", "fullName email");


    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    const event = booking.eventId;
    const pdfBuffer = await generateTicketPDF(booking, event);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=Ticket-${booking._id}.pdf`);
    res.send(pdfBuffer);

  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ message: error.message });
    }
  }
};
