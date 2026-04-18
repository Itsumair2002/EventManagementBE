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

    const eventObj = savedEvent.toObject();
    if (eventObj.imageUrl) {
      eventObj.imageUrl = `/uploads/${eventObj.imageUrl}`;

    }

    res.status(201).json({
      data: eventObj,
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

    const eventsWithImageUrl = allEvents.map((event) => {
      const eventObj = event.toObject();
      if (eventObj.imageUrl) {
        eventObj.imageUrl = `/uploads/${eventObj.imageUrl}`;
      }
      return eventObj;
    });

    res.status(200).json({
      events: eventsWithImageUrl,
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
    const { id } = req?.params
    console.log(id);

    const allEvents = await Event.findById(id)
      .populate("category") // full category object
      .populate("createdBy", "name email"); // only name + email
    console.log("allEvents", allEvents);

    if (!allEvents) {
      return res.status(422).json({
        message: "No events found",
        status_code: 422
      });
    }

    const eventObj = allEvents.toObject();
    if (eventObj.imageUrl) {
      eventObj.imageUrl = `/uploads/${eventObj.imageUrl}`;

    }

    res.status(200).json({
      events: eventObj,
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
    const updateData = { ...req.body };
    if (req.file) {
      updateData.imageUrl = req.file.filename;
    }

    const updatedEvent = await Event.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    if (!updatedEvent) {
      return res.status(404).json({
        message: "Event not found",
      });
    }

    const eventObj = updatedEvent.toObject();
    if (eventObj.imageUrl) {
      eventObj.imageUrl = `/uploads/${eventObj.imageUrl}`;

    }

    res.status(200).json({
      event: eventObj,
      message: "Event updated successfully",
      status_code: 200
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
        status_code: 404,
        status: false
      });
    }

    res.status(200).json({
      message: "Event deleted successfully",
      status_code: 200,
      status: true
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
      status_code: 500,
      status: false
    });
  }
};
