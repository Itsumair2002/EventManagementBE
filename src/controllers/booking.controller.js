const Booking = require("../models/bookings.model");
const Event = require("../models/events.model");
const PDFDocument = require("pdfkit");
const https = require("https");



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

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=Ticket-${booking._id}.pdf`);

    const doc = new PDFDocument({ size: "A4", margin: 40 });
    doc.pipe(res);

    // Color Palette
    const primaryColor = "#1a237e"; // Deep Indigo
    const accentColor = "#ff4081"; // Pink Accent
    const textColor = "#333333";
    const headerColor = "#ffffff";

    // Header Background
    doc.rect(0, 0, doc.page.width, 150).fill(primaryColor);

    // Header Text
    doc.fillColor(headerColor)
       .font("Helvetica-Bold")
       .fontSize(32)
       .text("EVENT TICKET", 40, 50, { characterSpacing: 2 });
    
    doc.fontSize(12).font("Helvetica")
       .text("Booking Confirmation", 40, 95, { characterSpacing: 1 });

    // Logo Placeholder or Event Title in Header
    doc.fontSize(20).font("Helvetica-Bold")
       .text(event?.eventName?.toUpperCase() || "EVENT", 0, 60, { align: "right", width: doc.page.width - 40 });

    doc.moveDown(5); // Move below header

    // Main Ticket Section
    const ticketTop = 170;
    const ticketHeight = 350;
    const ticketWidth = doc.page.width - 80;

    // Ticket Container Box
    doc.rect(40, ticketTop, ticketWidth, ticketHeight)
       .strokeColor("#cccccc")
       .lineWidth(1)
       .stroke();

    // Event Information (Left Column)
    const col1X = 60;
    const col2X = 350;

    // Use a helper function or inline to fetch QR image
    let qrBuffer = null;
    try {
      qrBuffer = await new Promise((resolve, reject) => {
        https.get(booking.qrCodeUrl, (res) => {
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => resolve(Buffer.concat(chunks)));
          res.on("error", (err) => reject(err));
        }).on("error", (err) => reject(err));
      });
    } catch (err) {
      console.error("Error fetching QR code:", err);
    }

    doc.fillColor(textColor).font("Helvetica-Bold").fontSize(14).text("EVENT DETAILS", col1X, ticketTop + 20);
    doc.moveTo(60, ticketTop + 40).lineTo(330, ticketTop + 40).stroke();

    doc.fontSize(11).font("Helvetica-Bold").text("Venue:", col1X, ticketTop + 55);
    doc.font("Helvetica").text(event?.venue || "N/A", col1X + 50, ticketTop + 55);

    doc.fontSize(11).font("Helvetica-Bold").text("Location:", col1X, ticketTop + 80);
    doc.font("Helvetica").text(event?.location || "N/A", col1X + 60, ticketTop + 80);

    doc.fontSize(11).font("Helvetica-Bold").text("Date:", col1X, ticketTop + 105);
    doc.font("Helvetica").text(event?.eventDate ? new Date(event.eventDate).toLocaleDateString() : "N/A", col1X + 50, ticketTop + 105);

    doc.fontSize(11).font("Helvetica-Bold").text("Time:", col1X, ticketTop + 130);
    doc.font("Helvetica").text(event?.eventDate ? new Date(event.eventDate).toLocaleTimeString() : "N/A", col1X + 50, ticketTop + 130);

    // Booking Information (Right Column)
    doc.fillColor(textColor).font("Helvetica-Bold").fontSize(14).text("BOOKING DETAILS", col2X, ticketTop + 20);
    doc.moveTo(col2X, ticketTop + 40).lineTo(doc.page.width - 60, ticketTop + 40).stroke();

    doc.fontSize(10).font("Helvetica-Bold").text("Passenger:", col2X, ticketTop + 55);
    doc.font("Helvetica").fontSize(10).text(booking.userId?.fullName || "N/A", col2X + 70, ticketTop + 55);

    doc.fontSize(10).font("Helvetica-Bold").text("Booking ID:", col2X, ticketTop + 75);
    doc.font("Helvetica").fontSize(8).text(booking._id.toString(), col2X + 70, ticketTop + 75);

    doc.fontSize(10).font("Helvetica-Bold").text("Tickets:", col2X, ticketTop + 95);
    doc.font("Helvetica").fontSize(10).text(`${booking.numberOfTickets} Seat(s)`, col2X + 70, ticketTop + 95);

    doc.fontSize(10).font("Helvetica-Bold").text("Total Paid:", col2X, ticketTop + 115);
    doc.font("Helvetica-Bold").fontSize(12).fillColor(primaryColor).text(`Rs. ${booking.totalAmount}`, col2X + 70, ticketTop + 115);

    // QR Code Section
    doc.fillColor(textColor).font("Helvetica-Bold").fontSize(12).text("SCAN TO VERIFY", col2X, ticketTop + 160);
    
    if (qrBuffer) {
      doc.image(qrBuffer, col2X, ticketTop + 180, { width: 120 });
    } else {
      doc.fontSize(8).fillColor("blue").text(booking.qrCodeUrl, col2X, ticketTop + 180, { link: booking.qrCodeUrl, underline: true });
    }

    // Watermark (Moved for better placement)
    doc.save()
       .fillColor("#e0e0e0")
       .font("Helvetica-Bold")
       .fontSize(50)
       .opacity(0.15)
       .translate(doc.page.width / 2, doc.page.height - 150)
       .rotate(-30)
       .text("TICKET CONFIRMED", -250, 0, { align: "center", width: 500 })
       .restore();

    // Divider Line
    doc.moveTo(40, doc.page.height - 100).lineTo(doc.page.width - 40, doc.page.height - 100).strokeColor("#eee").stroke();

    // Footer
    doc.fillColor("#999999").fontSize(9)
       .text("This is an electronically generated ticket. Please carry a valid photo ID for verification at the entrance.", 40, doc.page.height - 80, { align: "center" });
    doc.text("For any queries, contact support@eventman.com", 40, doc.page.height - 60, { align: "center" });

    doc.end();
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ message: error.message });
    }
  }
};
