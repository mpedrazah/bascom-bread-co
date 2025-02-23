require("dotenv").config();
const express = require("express");
const cors = require("cors");
const csvParser = require("csv-parser"); // Import csv-parser
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY); // ✅ Ensure API Key is Set
const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");
const ordersFilePath = path.join(__dirname, "orders.json");



const app = express();
const corsOptions = {
    origin: "https://3aa0-2603-8080-c6f0-a660-581e-6698-dc36-63c3.ngrok-free.app", // ✅ ONLY Allow Localhost Now
    methods: "GET,POST",
    allowedHeaders: "Content-Type",
};

app.use(cors(corsOptions)); // ✅ Apply CORS Fix
app.use(express.json());
app.use(express.static("public"));

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});


function saveOrder(order) {
  let orders = [];

  // Check if the file exists
  if (fs.existsSync(ordersFilePath)) {
      try {
          const fileData = fs.readFileSync(ordersFilePath, "utf-8");
          orders = JSON.parse(fileData);
      } catch (error) {
          console.error("❌ Error reading orders file:", error);
      }
  }

  // Add new order and save
  orders.push(order);
  try {
      fs.writeFileSync(ordersFilePath, JSON.stringify(orders, null, 2));
      console.log("✅ Order saved successfully:", order);
  } catch (error) {
      console.error("❌ Error saving order:", error);
  }
}

// Function to load the CSV and populate pickupSlots
async function loadPickupSlots() {
    const filePath = path.join(__dirname, 'public', 'pickupSlots.csv');
    const slots = {};

    return new Promise((resolve, reject) => {
        fs.createReadStream(filePath)
            .pipe(csvParser())
            .on('data', (row) => {
                const { date, amount } = row;
                if (!slots[date]) {
                    slots[date] = {
                        available: parseInt(amount), // Maximum available slots per day
                        booked: 0, // Initially no slots are booked
                    };
                }
            })
            .on('end', () => {
                pickupSlots = slots; // Assign parsed slots to the global variable
                console.log("✅ Pickup slots loaded successfully", pickupSlots);
                resolve();
            })
            .on('error', (err) => {
                console.error("❌ Error reading CSV:", err);
                reject(err);
            });
    });
}

// Load slots when the server starts
loadPickupSlots().then(() => {
    console.log("✅ Server is running and pickup slots are ready");
}).catch((err) => {
    console.error("❌ Error loading pickup slots:", err);
});

// Route to check availability for a specific day
app.get("/check-availability", (req, res) => {
  const { pickupDay } = req.query;
  console.log(`Received request for ${pickupDay}`); // Debugging log

  if (!pickupSlots[pickupDay]) {
    console.log("❌ Day not found:", pickupDay);
    return res.status(404).json({ error: "Day not found" });
  }

  const slot = pickupSlots[pickupDay];
  const remaining = slot.available - slot.booked;

  console.log(`Remaining slots for ${pickupDay}: ${remaining}`);

  res.json({
    available: remaining > 0,
    remaining: remaining,
  });
});



// Function to update booked slots and modify the CSV file
async function updateBookedSlots(pickupDay, quantity) {
    if (!pickupSlots[pickupDay]) {
        console.error("❌ Invalid pickup day:", pickupDay);
        throw new Error("Invalid day");
    }

    const slot = pickupSlots[pickupDay];

    console.log(`📅 Updating booked slots for ${pickupDay}`);
    console.log(`🔢 Current booked: ${slot.booked}`);
    console.log(`🛒 Requested quantity: ${quantity}`);
    console.log(`🚦 Available slots before update: ${slot.available}`);

    if (slot.booked + quantity > slot.available) {
        console.error("❌ Not enough available slots!", {
            booked: slot.booked,
            requested: quantity,
            available: slot.available,
        });
        throw new Error("Not enough available slots");
    }

    // Update booked slots
    slot.booked += quantity;
    slot.available -= quantity; // Decrease available slots

    console.log(`✅ Updated booked slots for ${pickupDay}: ${slot.booked}`);
    console.log(`📉 Remaining slots for ${pickupDay}: ${slot.available}`);

    // Write updated slots back to CSV file
    const filePath = path.join(__dirname, "public", "pickupSlots.csv");
    const updatedData = "date,time,amount\n" + Object.keys(pickupSlots)
        .map(date => `${date},12:00 PM,${pickupSlots[date].available}`)
        .join("\n");

    try {
        fs.writeFileSync(filePath, updatedData);
        console.log("✅ pickupSlots.csv updated successfully!");
    } catch (err) {
        console.error("❌ Error updating pickupSlots.csv:", err);
        throw new Error("Failed to update pickupSlots.csv");
    }
}

async function checkRemainingSlots(pickupDay) {
  if (!pickupSlots[pickupDay]) {
    return { available: false, remaining: 0 }; // Return false if no such day exists
  }

  const slot = pickupSlots[pickupDay];
  const remaining = slot.available - slot.booked;

  return { available: remaining > 0, remaining }; // Return true if there are available slots
}

// Checkout API Endpoint
// Function to send confirmation email
async function sendOrderConfirmationEmail(email, cart, pickupDay) {
  const orderDetails = cart.map(item => `• ${item.quantity}x ${item.name} ($${item.price.toFixed(2)})`).join("\n");
  const totalAmount = cart.reduce((sum, item) => sum + item.quantity * item.price, 0);

  const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Your Bascom Bread Order Confirmation",
      text: `Thank you for your order!\n\nYou have purchased:\n${orderDetails}\n\nPickup Date: ${pickupDay}\nTotal: $${totalAmount.toFixed(2)}\n\nWe look forward to seeing you!`,
  };

  try {
      await transporter.sendMail(mailOptions);
      console.log("✅ Order confirmation email sent to:", email);
  } catch (error) {
      console.error("❌ Error sending email:", error);
  }
}

// Checkout API Endpoint
app.post("/create-checkout-session", async (req, res) => {
  try {
      const { cart, email, pickupDay } = req.body;

      // Calculate total quantity of items in cart
      const totalQuantity = cart.reduce((sum, item) => sum + item.quantity, 0);

      // Check available pickup slots
      const { available, remaining } = await checkRemainingSlots(pickupDay);
      console.log(`🔍 Checking slots for ${pickupDay} - Requested: ${totalQuantity}, Remaining: ${remaining}`);

      if (!available || totalQuantity > remaining) {
          console.error("❌ Not enough slots available");
          return res.status(400).json({ error: `No available slots for selected day. Remaining slots: ${remaining}` });
      }

      // Create Stripe Checkout Session
      const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: cart.map(item => ({
              price_data: {
                  currency: "usd",
                  product_data: { name: item.name },
                  unit_amount: item.price * 100,
              },
              quantity: item.quantity || 1,
          })),
          mode: "payment",
          success_url: "https://3aa0-2603-8080-c6f0-a660-581e-6698-dc36-63c3.ngrok-free.app/success.html",
          cancel_url: "https://3aa0-2603-8080-c6f0-a660-581e-6698-dc36-63c3.ngrok-free.app/cancel.html",
          customer_email: email,
          metadata: { cart: JSON.stringify(cart), pickupDay },
      });

      console.log("✅ Stripe Checkout Session Created:", session);

      // Save order to file
      const newOrder = { email, pickupDay, cart, date: new Date().toISOString() };
      saveOrder(newOrder);

      // Update booked slots
      await updateBookedSlots(pickupDay, totalQuantity);
      console.log(`✅ Updated booked slots for ${pickupDay} - Now remaining: ${remaining - totalQuantity}`);

      // Send confirmation email
      await sendOrderConfirmationEmail(email, cart, pickupDay);
      console.log(`📧 Order confirmation email sent to ${email}`);

      // Return the session URL for checkout
      res.json({ url: session.url });

  } catch (error) {
      console.error("❌ Stripe Checkout Error:", error);
      res.status(500).json({ error: error.message });
  }
});



// Fetch orders for the admin panel
app.get("/orders", async (req, res) => {
    try {
        // Check if orders file exists
        if (!fs.existsSync(ordersFilePath)) {
            return res.json([]); // Return an empty array if no orders exist
        }

        const ordersData = fs.readFileSync(ordersFilePath, "utf-8");
        const orders = JSON.parse(ordersData);

        res.json(orders);
    } catch (error) {
        console.error("❌ Error fetching orders:", error);
        res.status(500).json({ error: "Failed to load orders." });
    }
});

// Serve Success & Cancel Pages
app.get("/success.html", (req, res) => res.sendFile(path.join(__dirname, "public/success.html")));
app.get("/cancel.html", (req, res) => res.sendFile(path.join(__dirname, "public/cancel.html")));

// Start Server on Railway's Dynamic Port
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
