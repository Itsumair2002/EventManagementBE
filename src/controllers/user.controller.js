const User = require("../models/users.model");

// GET USER PROFILE
exports.getUserProfile = async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId).select("-passwordHash");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Split fullName into firstName and lastName if they are missing
    if (user.fullName && (!user.firstName || !user.lastName)) {
      const names = user.fullName.split(" ");
      user.firstName = names[0] || "";
      user.lastName = names.slice(1).join(" ") || "";
    }

    res.status(200).json({
      message: "User profile retrieved successfully",
      user,
      status_code: 200
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// UPDATE USER PROFILE
exports.updateUserProfile = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { firstName, lastName, phoneNumber, city, state } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Updating allowed fields
    if (firstName !== undefined) user.firstName = firstName;
    if (lastName !== undefined) user.lastName = lastName;
    
    // Update fullName if both are provided or if either is updated
    if (firstName || lastName) {
        const first = firstName || user.firstName || "";
        const last = lastName || user.lastName || "";
        user.fullName = `${first} ${last}`.trim();
    }

    if (phoneNumber !== undefined) user.phoneNumber = phoneNumber;
    if (city !== undefined) user.city = city;
    if (state !== undefined) user.state = state;
    
    user.updatedAt = Date.now();

    await user.save();

    res.status(200).json({
      message: "Profile updated successfully",
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: user.fullName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        city: user.city,
        state: user.state,
      },
      status_code: 200
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
