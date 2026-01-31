const User = require("../models/users.model");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// REGISTER
exports.registerUser = async (req, res) => {
  try {
    const { fullName, email, phoneNumber, password } = req.body;

    if (!fullName || !email || !phoneNumber || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: "Email already registered" });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await User.create({
      fullName,
      email,
      phoneNumber,
      passwordHash,
    });

    res.status(201).json({
      message: "User registered successfully",
      userId: user._id,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// LOGIN
exports.loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.status(200).json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
      },
      status_code:200
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


// const createAdmin = async () => {
//   try {
//     const adminEmail = "admin@yopmail.com";

//     const existingAdmin = await User.findOne({ email: adminEmail });
//     if (existingAdmin) {
//       console.log("Admin already exists");
//       process.exit();
//     }

//     const hashedPassword = await bcrypt.hash("12345", 10);

//     await User.create({
//       fullName: "Admin",
//       email: adminEmail,
//       phoneNumber: "9999999999",
//       passwordHash: hashedPassword,
//       role: "admin",
//     });

//     console.log("✅ Admin created successfully");
//     process.exit();
//   } catch (error) {
//     console.error(error);
//     process.exit(1);
//   }
// };

// createAdmin();