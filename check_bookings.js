const mongoose = require("mongoose");
const User = require("./src/models/users.model");
const Event = require("./src/models/events.model");
const Booking = require("./src/models/bookings.model");
const dotenv = require("dotenv");

dotenv.config();

const check = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const bookings = await Booking.find({})
      .populate("userId")
      .populate("eventId");

    console.log("=== All Bookings in DB ===");
    console.log("Total Booking Count:", bookings.length);
    bookings.forEach((b) => {
      console.log(`- Booking ID: ${b._id}`);
      console.log(`  User: ${b.userId?.email || "N/A"} (${b.userId?.fullName || "N/A"})`);
      console.log(`  Event: ${b.eventId?.eventName || "N/A"}`);
      console.log(`  Tickets: ${b.numberOfTickets}`);
      console.log(`  Total: ${b.totalAmount}`);
    });

    process.exit(0);
  } catch (error) {
    console.error("Check failed:", error);
    process.exit(1);
  }
};

check();
