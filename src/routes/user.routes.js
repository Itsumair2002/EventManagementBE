const express = require("express");
const router = express.Router();
const userController = require("../controllers/user.controller");
const authController = require("../controllers/auth.controller");

const { protect } = require("../middlewares/auth.middleware");

// GET CURRENT USER PROFILE
router.get("/profile", protect, userController.getUserProfile);

// UPDATE USER PROFILE
router.put("/profile", protect, userController.updateUserProfile);

// Change user password
router.post("/change-password", protect, authController.changePassword);


module.exports = router;
