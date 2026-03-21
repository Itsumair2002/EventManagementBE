const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema({

  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

  eventId: { type: mongoose.Schema.Types.ObjectId, ref: "Event", required: true },

  numberOfTickets: { type: Number, required: true },

  totalAmount: { type: Number, required: true },

  bookingDate: { type: Date, default: Date.now },

  qrCodeData: { type: String, required: true },  // encoded data

  qrCodeUrl: { type: String, required: true },

  status: { 
    type: String, 
    enum: ["confirmed", "cancelled", "attended"], 
    default: "confirmed" 
  },

  isScanned: { type: Boolean, default: false },

  scannedAt: { type: Date }
});

module.exports = mongoose.model("Booking", bookingSchema);
