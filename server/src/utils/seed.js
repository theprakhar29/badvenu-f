import "dotenv/config";
import bcrypt from "bcryptjs";
import { connectDB } from "../config/db.js";
import mongoose from "mongoose";
import Organizer from "../models/Organizer.js";
import Event from "../models/Event.js";

async function main() {
  await connectDB();

  const passwordHash = await bcrypt.hash("password123", 10);

  const organizer = await Organizer.findOneAndUpdate(
    { email: "demo@marquee.test" },
    { name: "Demo Organizer", email: "demo@marquee.test", passwordHash },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await Event.findOneAndUpdate(
    { slug: "friday-night-open-mic-demo" },
    {
      organizer: organizer._id,
      title: "Friday Night Open Mic",
      slug: "friday-night-open-mic-demo",
      description: "A relaxed evening of stand-up from local comics.",
      venueName: "The Backyard",
      city: "Delhi",
      startAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      capacity: 100,
      status: "PUBLISHED",
      pricingTiers: [
        { name: "General", price: 299, totalQty: 80 },
        { name: "VIP (Front Row)", price: 599, totalQty: 20 },
      ],
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  console.log("Seeded demo organizer: demo@marquee.test / password123");
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
