const express = require("express");
const router = express.Router();
const upload = require("../middlewares/upload");


const {
  createevent,
  getAllEvent,
  updateEvent,
  deleteEvent,
} = require("../controllers/event.controller");

router.get("/getAllEvent", getAllEvent);
// router.post("/create-event", createevent);
router.post(
  "/createEvent",
  upload.single("image"),
  createevent
);
router.put("/updateEvent/:id", updateEvent);
router.delete("/deleteEvent/:id", deleteEvent);

module.exports = router;
