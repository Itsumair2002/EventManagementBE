const express = require("express");
const router = express.Router();
const upload = require("../middlewares/upload");


const {
  createevent,
  getAllEvent,
  updateEvent,
  deleteEvent,
  getSingleEvent,
} = require("../controllers/event.controller");

router.get("/getAllEvent", getAllEvent);
router.get("/getSingleEvent/:id", getSingleEvent);
// router.post("/create-event", createevent);
router.post(
  "/createEvent",
  upload.single("image"),
  createevent
);
router.put("/updateEvent/:id", upload.single("image"), updateEvent);
router.delete("/deleteEvent/:id", deleteEvent);

module.exports = router;
