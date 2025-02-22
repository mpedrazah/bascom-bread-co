const mongoose = require("mongoose");
require("dotenv").config();
const PickupSlot = require("./models/PickupSlot");

mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 5000, // ✅ New option instead of deprecated ones
}).then(async () => {
    console.log("✅ Connected to MongoDB");

    await PickupSlot.insertMany([
        { date: "2025-02-25", times: ["10:00 AM", "12:00 PM", "02:00 PM"] },
        { date: "2025-02-26", times: ["11:00 AM", "01:00 PM", "03:00 PM"] },
        { date: "2025-02-27", times: ["09:00 AM", "11:00 AM", "01:00 PM"] }
    ]);

    console.log("✅ Pickup slots added to MongoDB!");
    mongoose.connection.close();
}).catch(err => console.error("❌ MongoDB Error:", err));
