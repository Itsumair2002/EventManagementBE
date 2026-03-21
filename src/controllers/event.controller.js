const Event = require("../models/events.model");

// CREATE EVENT


exports.createevent = async (req, res) => {
  try {
    const {
      eventName,
      description,
      category,
      eventDate,
      venue,
      location,
      totalSeats,
      availableSeats,
      price,
      status,
    } = req.body;

    const newEvent = new Event({
      eventName,
      description,
      category, // ObjectId
      eventDate,
      venue,
      location,
      totalSeats,
      availableSeats,
      price,
      status,
      createdBy: req.user?.id, // from token

      imageUrl: req.file
        ? req.file.filename
        : null,
    });

    const savedEvent = await newEvent.save();

    res.status(201).json({
      data: savedEvent,
      message: "Event created successfully",
      status_code: 201,
    });
  } catch (error) {
    res.status(400).json({
      message: error.message,
    });
  }
};



// GET ALL EVENTS
exports.getAllEvent = async (req, res) => {
  try {
    const allEvents = await Event.find()
      .populate("category") // full category object
      .populate("createdBy", "name email"); // only name + email

    if (!allEvents.length) {
      return res.status(404).json({
        message: "No events found",
      });
    }

    res.status(200).json({
      events: allEvents,
      message: "Events fetched successfully",
      status_code: 200,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};



exports.getSingleEvent = async (req, res) => {
  try {
    const{id}=req?.params
    console.log(id);
    
    const allEvents = await Event.findById(id)
      .populate("category") // full category object
      .populate("createdBy", "name email"); // only name + email
    console.log("allEvents",allEvents);
    
    if (!allEvents) {
      return res.status(422).json({
        message: "No events found",
        status_code:422
      });
    }

    res.status(200).json({
      events: allEvents,
      message: "Events fetched successfully",
      status_code: 200,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// UPDATE EVENT
exports.updateEvent = async (req, res) => {
  try {
    const updatedEvent = await Event.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    if (!updatedEvent) {
      return res.status(404).json({
        message: "Event not found",
      });
    }

    res.status(200).json({
      event: updatedEvent,
      message: "Event updated successfully",
    });
  } catch (error) {
    res.status(400).json({
      message: error.message,
    });
  }
};

// DELETE EVENT
exports.deleteEvent = async (req, res) => {
  try {
    const deletedEvent = await Event.findByIdAndDelete(req.params.id);

    if (!deletedEvent) {
      return res.status(404).json({
        message: "Event not found",
      });
    }

    res.status(200).json({
      message: "Event deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};
