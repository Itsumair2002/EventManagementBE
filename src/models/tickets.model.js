const mongoose = require("mongoose");

const ticketSchema = new mongoose.Schema({
  bookingId: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", required: true },
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: "Event", required: true },
  buyerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  ownerEmail: { type: String, required: true },
  ticketCode: { type: String, required: true, unique: true },
  qrCodeData: { type: String, required: true },
  qrCodeUrl: { type: String, required: true },
  status: { 
    type: String, 
    enum: ["active", "transferred", "scanned"], 
    default: "active" 
  },
  scannedAt: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model("Ticket", ticketSchema);
