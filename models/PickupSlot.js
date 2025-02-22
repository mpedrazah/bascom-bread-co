const mongoose = require("mongoose");

const pickupSchema = new mongoose.Schema({
    date: String,  // Format: "YYYY-MM-DD"
    times: [String] // Example: ["09:00 AM", "11:00 AM"]
});

const PickupSlot = mongoose.model("PickupSlot", pickupSchema);

module.exports = PickupSlot;
