const Booking = require("../models/bookings.model");
const Ticket = require("../models/tickets.model");
const Event = require("../models/events.model");
const PDFDocument = require("pdfkit");
const https = require("https");
const sendEmail = require("../utils/sendEmail");
const { generateTicketPDF } = require("../utils/ticketGenerator");
const User = require("../models/users.model");
const { invalidateUser } = require("../services/recommendation.service");



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

    // Fetch user details for individual tickets owner settings
    const user = await User.findById(userId);

    // Generate and save individual tickets
    const tickets = [];
    const emailsList = req.body.emails || [];

    for (let i = 1; i <= numberOfTickets; i++) {
      const ticketCode = `TKT-${booking._id.toString().substring(18).toUpperCase()}-${i}`;
      // Use email from provided list, fallback to buyer email
      const assignedEmail = (emailsList[i - 1] || user.email).toLowerCase();
      const ticketQrData = `Ticket Code: ${ticketCode}\nEvent Name: ${event.eventName}\nVenue: ${event.venue}\nDate & Time: ${eventDateStr}\nOwner: ${assignedEmail}`;
      const ticketQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(ticketQrData)}`;

      const ticket = new Ticket({
        bookingId: booking._id,
        eventId: event._id,
        buyerId: userId,
        ownerEmail: assignedEmail,
        ticketCode,
        qrCodeData: ticketQrData,
        qrCodeUrl: ticketQrUrl,
        status: "active"
      });
      await ticket.save();
      tickets.push(ticket);
    }

    // Update event available seats
    event.availableSeats -= numberOfTickets;
    await event.save();

    // New booking changes this user's taste profile — refresh their recs.
    invalidateUser(userId?.toString());

    // SEND EMAIL WITH INDIVIDUAL TICKETS ATTACHED
    try {
      if (user && user.email) {
        // Generate PDFs for all individual tickets
        const attachments = [];
        for (let i = 0; i < tickets.length; i++) {
          const ticket = tickets[i];
          const pdfBuffer = await generateTicketPDF(ticket, event);
          attachments.push({
            filename: `Ticket-${event.eventName.replace(/\s+/g, "_")}-${ticket.ticketCode}.pdf`,
            content: pdfBuffer,
            contentType: "application/pdf"
          });
        }

        await sendEmail({
          email: user.email,
          subject: `Your Ticket Confirmation for ${event.eventName} - VibeCheck`,
          message: `
            <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
              <h1 style="color: #1a237e; text-align: center;">Booking Confirmed!</h1>
              <p>Hi ${user.fullName || "there"},</p>
              <p>Exciting news! Your booking for <strong>${event.eventName}</strong> is confirmed. We have generated <strong>${numberOfTickets} individual ticket(s)</strong>, which are attached as PDFs to this email.</p>
              
              <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <p style="margin: 5px 0;"><strong>Event:</strong> ${event.eventName}</p>
                <p style="margin: 5px 0;"><strong>Venue:</strong> ${event.venue}</p>
                <p style="margin: 5px 0;"><strong>Date:</strong> ${new Date(event.eventDate).toLocaleDateString()}</p>
                <p style="margin: 5px 0;"><strong>Tickets:</strong> ${numberOfTickets}</p>
              </div>

              <p style="margin: 20px 0;">You can also log in to your VibeCheck account to view, download, or securely transfer individual tickets to your friends.</p>
              <p>See you there!</p>
              <p>Best regards,<br/><strong>Team VibeCheck</strong></p>
              <hr style="border: 0; border-top: 1px solid #eee; margin-top: 20px;"/>
              <p style="font-size: 12px; color: #999; text-align: center;">This is an automated message, please do not reply.</p>
            </div>
          `,
          attachments
        });

        // Send email to each individual ticket owner if they are not the buyer
        for (let i = 0; i < tickets.length; i++) {
          const ticket = tickets[i];
          if (ticket.ownerEmail.toLowerCase() !== user.email.toLowerCase()) {
            try {
              const pdfBuffer = await generateTicketPDF(ticket, event);
              await sendEmail({
                email: ticket.ownerEmail,
                subject: `You've received a Ticket for ${event.eventName} - VibeCheck`,
                message: `
                  <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                    <h1 style="color: #ea580c; text-align: center;">You received a Ticket!</h1>
                    <p>Hi there,</p>
                    <p>Exciting news! <strong>${user.fullName || user.email}</strong> has booked a ticket for <strong>${event.eventName}</strong> and assigned a seat to you.</p>
                    
                    <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0; color: #333;">
                      <p style="margin: 5px 0;"><strong>Event:</strong> ${event.eventName}</p>
                      <p style="margin: 5px 0;"><strong>Venue:</strong> ${event.venue}</p>
                      <p style="margin: 5px 0;"><strong>Date:</strong> ${new Date(event.eventDate).toLocaleDateString()}</p>
                      <p style="margin: 5px 0;"><strong>Ticket Code:</strong> ${ticket.ticketCode}</p>
                    </div>

                    <p>We have attached your personal digital PDF ticket to this email. Please carry it (printed or on your phone) to the venue for entry.</p>
                    <p>If you don't have a VibeCheck account yet, sign up using your email (<strong>${ticket.ownerEmail}</strong>) to see your ticket in your dashboard!</p>
                    <p>Best regards,<br/><strong>Team VibeCheck</strong></p>
                  </div>
                `,
                attachmentBuffer: pdfBuffer,
                attachmentName: `Ticket-${event.eventName.replace(/\s+/g, "_")}-${ticket.ticketCode}.pdf`
              });
            } catch (friendEmailError) {
              console.error(`Failed to send email to ticket owner ${ticket.ownerEmail}:`, friendEmailError);
            }
          }
        }
      }
    } catch (emailError) {
      console.error("Email Sending Failed:", emailError);
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

// GET BOOKING INDIVIDUAL TICKETS
exports.getBookingTickets = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const userId = req.user.userId;

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    // Only allow the buyer to view the tickets list
    if (booking.userId.toString() !== userId) {
      return res.status(403).json({ message: "Unauthorized to access these tickets" });
    }

    const tickets = await Ticket.find({ bookingId }).populate("eventId");
    res.status(200).json({ tickets });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET MY OWNED/TRANSFERRED TICKETS
exports.getMyOwnedTickets = async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Find tickets owned by this email
    const tickets = await Ticket.find({ ownerEmail: user.email.toLowerCase() }).populate("eventId").populate("bookingId");
    res.status(200).json({ tickets });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// TRANSFER TICKET
exports.transferTicket = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { email } = req.body;
    const userId = req.user.userId;

    if (!email) {
      return res.status(400).json({ message: "Recipient email is required" });
    }

    const ticket = await Ticket.findById(ticketId).populate("eventId");
    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    // Only the current owner's user account or the original buyer can transfer the ticket
    const currentUser = await User.findById(userId);
    if (ticket.ownerEmail.toLowerCase() !== currentUser.email.toLowerCase() && ticket.buyerId.toString() !== userId) {
      return res.status(403).json({ message: "Unauthorized to transfer this ticket" });
    }

    if (ticket.status === "scanned") {
      return res.status(400).json({ message: "Ticket has already been scanned/used" });
    }

    const originalEmail = ticket.ownerEmail;
    ticket.ownerEmail = email.toLowerCase();
    ticket.status = "transferred";

    // Regenerate ticket QR code with the new owner's details
    const event = ticket.eventId;
    const eventDateStr = event.eventDate ? new Date(event.eventDate).toLocaleString() : "TBA";
    const ticketQrData = `Ticket Code: ${ticket.ticketCode}\nEvent Name: ${event.eventName}\nVenue: ${event.venue}\nDate & Time: ${eventDateStr}\nOwner: ${email}`;
    const ticketQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(ticketQrData)}`;

    ticket.qrCodeData = ticketQrData;
    ticket.qrCodeUrl = ticketQrUrl;

    await ticket.save();

    // Send email to the recipient (new owner) with the updated ticket
    try {
      const pdfBuffer = await generateTicketPDF(ticket, event);
      await sendEmail({
        email: ticket.ownerEmail,
        subject: `Ticket Transferred to You: ${event.eventName} - VibeCheck`,
        message: `
          <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
            <h1 style="color: #ea580c; text-align: center;">You received a Ticket!</h1>
            <p>Hi there,</p>
            <p>Exciting news! <strong>${currentUser.fullName}</strong> (${originalEmail}) has transferred an individual ticket for <strong>${event.eventName}</strong> to you.</p>
            
            <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0; color: #333;">
              <p style="margin: 5px 0;"><strong>Event:</strong> ${event.eventName}</p>
              <p style="margin: 5px 0;"><strong>Venue:</strong> ${event.venue}</p>
              <p style="margin: 5px 0;"><strong>Date:</strong> ${new Date(event.eventDate).toLocaleDateString()}</p>
              <p style="margin: 5px 0;"><strong>Ticket Code:</strong> ${ticket.ticketCode}</p>
            </div>

            <p>We have attached your personal digital PDF ticket to this email. Please carry it (printed or on your phone) to the venue for entry.</p>
            <p>If you don't have a VibeCheck account yet, sign up using your email (<strong>${email}</strong>) to see your ticket in your dashboard!</p>
            <p>Best regards,<br/><strong>Team VibeCheck</strong></p>
          </div>
        `,
        attachmentBuffer: pdfBuffer,
        attachmentName: `Ticket-${event.eventName.replace(/\s+/g, "_")}-${ticket.ticketCode}.pdf`
      });
    } catch (emailError) {
      console.error("Failed to send transfer email:", emailError);
    }

    res.status(200).json({ message: "Ticket transferred successfully", ticket });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// DOWNLOAD INDIVIDUAL TICKET PDF
exports.downloadTicketPDF = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const userId = req.user.userId;

    const currentUser = await User.findById(userId);
    const ticket = await Ticket.findById(ticketId).populate("eventId");

    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    // Only allow owner or buyer to download
    if (ticket.ownerEmail.toLowerCase() !== currentUser.email.toLowerCase() && ticket.buyerId.toString() !== userId) {
      return res.status(403).json({ message: "Unauthorized to download this ticket" });
    }

    const event = ticket.eventId;
    const pdfBuffer = await generateTicketPDF(ticket, event);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=Ticket-${ticket.ticketCode}.pdf`);
    res.send(pdfBuffer);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
