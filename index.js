const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");
const categoryRoutes = require("./src/routes/category.routes");
const authRoutes = require("./src/routes/auth.routes");
const eventRoutes = require("./src/routes/event.routes");
const bookingRoutes = require("./src/routes/booking.routes");

dotenv.config();

const app = express();
app.use(cors());
//app.options("*", cors());
app.use(express.json());

// MongoDB connection
mongoose
  .connect("mongodb://localhost:27017/eventmanagement")
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error(err));

// Routes
app.use("/api/categories", categoryRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/event", eventRoutes);
app.use("/api/bookings", bookingRoutes);

const PORT = 8000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
