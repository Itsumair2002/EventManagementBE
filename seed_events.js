const mongoose = require("mongoose");
const dotenv = require("dotenv");
const Category = require("./src/models/categories.model");
const Event = require("./src/models/events.model");

dotenv.config();

const sampleCategories = [
  { categoryName: "Music", description: "Concerts, gigs, and festivals" },
  { categoryName: "Tech", description: "Hackathons, conferences, and workshops" },
  { categoryName: "Art", description: "Exhibitions, galleries, and theater" },
  { categoryName: "Food", description: "Food tastings, culinary experiences, and markets" }
];

const getSampleEvents = (categoryIds) => [
  {
    eventName: "Sunburn Kolkata Festival",
    description: "Experience the ultimate electronic dance music festival featuring world-renowned DJs live in Kolkata.",
    category: categoryIds["Music"],
    eventDate: new Date("2026-11-20T17:00:00Z"),
    venue: "Nicco Park Grounds",
    location: "Kolkata, India",
    totalSeats: 2000,
    availableSeats: 1540,
    price: 1500,
    status: "published"
  },
  {
    eventName: "Tech Summit 2026",
    description: "The premier technology conference featuring talks on Generative AI, Web3, and Web Development.",
    category: categoryIds["Tech"],
    eventDate: new Date("2026-09-15T09:00:00Z"),
    venue: "Science City Auditorium",
    location: "Kolkata, India",
    totalSeats: 500,
    availableSeats: 480,
    price: 499,
    status: "published"
  },
  {
    eventName: "Mumbai Jazz Nights",
    description: "A soulful evening of classic and contemporary jazz performances by international artists.",
    category: categoryIds["Music"],
    eventDate: new Date("2026-08-05T19:30:00Z"),
    venue: "The Royal Opera House",
    location: "Mumbai, India",
    totalSeats: 300,
    availableSeats: 120,
    price: 2500,
    status: "published"
  },
  {
    eventName: "India Art Fair",
    description: "An annual exhibition of contemporary and modern art showcasing works from leading South Asian galleries.",
    category: categoryIds["Art"],
    eventDate: new Date("2026-10-12T11:00:00Z"),
    venue: "NSIC Exhibition Grounds",
    location: "New Delhi, India",
    totalSeats: 1000,
    availableSeats: 850,
    price: 350,
    status: "published"
  },
  {
    eventName: "Bengaluru Culinary Tour",
    description: "Explore the diverse food heritage of Bengaluru with curated street food walks and gourmet dinners.",
    category: categoryIds["Food"],
    eventDate: new Date("2026-08-25T12:00:00Z"),
    venue: "Indiranagar Food Hub",
    location: "Bengaluru, India",
    totalSeats: 100,
    availableSeats: 45,
    price: 1200,
    status: "published"
  }
];

const seedDB = async () => {
  try {
    const mongoURI = process.env.MONGO_URI;
    console.log("Connecting to database...");
    await mongoose.connect(mongoURI);
    console.log("Connected to MongoDB!");

    // Clear existing events and categories to avoid duplicates
    console.log("Cleaning old events and categories...");
    await Event.deleteMany({});
    await Category.deleteMany({});

    console.log("Seeding categories...");
    const createdCategories = await Category.insertMany(sampleCategories);
    console.log(`Inserted ${createdCategories.length} categories.`);

    // Map category name to ID
    const categoryIds = {};
    createdCategories.forEach(cat => {
      categoryIds[cat.categoryName] = cat._id;
    });

    console.log("Seeding events...");
    const sampleEvents = getSampleEvents(categoryIds);
    const createdEvents = await Event.insertMany(sampleEvents);
    console.log(`Inserted ${createdEvents.length} events successfully.`);

    console.log("Database seeded successfully!");
    process.exit(0);
  } catch (error) {
    console.error("Seeding failed:", error);
    process.exit(1);
  }
};

seedDB();
