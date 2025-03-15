require("dotenv").config();
const express = require("express");
const cors = require("cors");
const csvParser = require("csv-parser"); // Import csv-parser
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY); // ✅ Ensure API Key is Set
const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");
const ordersFilePath = path.join(__dirname, "orders.json");
const csvFilePath = "email_subscribers.csv"; // ✅ Opt-in email list
const createCsvWriter = require("csv-writer").createObjectCsvWriter;

const app = express();
const corsOptions = {
    origin: "https://safe-feline-evident.ngrok-free.app", // ✅ ONLY Allow Localhost Now
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


// ✅ Load orders if file exists
let orders = fs.existsSync(ordersFilePath) ? JSON.parse(fs.readFileSync(ordersFilePath)) : [];

// ✅ Save order function
function saveOrder(order) {
  let orders = [];

  if (fs.existsSync(ordersFilePath)) {
      orders = JSON.parse(fs.readFileSync(ordersFilePath));
  }

  orders.push(order);
  fs.writeFileSync(ordersFilePath, JSON.stringify(orders, null, 2));

  // ✅ Update Orders CSV
  appendOrderToCSV(order);
}


const emailCsvWriter = createCsvWriter({
  path: "email_subscribers.csv",
  header: [
    { id: "email", title: "Email" },
    { id: "date", title: "Date Opted In" },
  ],
  append: true,
});

const exportCsvWriter = createCsvWriter({
  path: csvFilePath,
  header: [
      { id: "email", title: "Email" },
      { id: "date", title: "Date Opted In" },
  ],
});


async function saveEmailSubscriber(email) {
  if (!email) return;

  try {
      await emailCsvWriter.writeRecords([{ email, date: new Date().toISOString() }]);
      console.log(`✅ Email saved: ${email}`);
  } catch (error) {
      console.error("❌ Error saving email:", error);
  }
}



// ✅ Get unique opted-in customers
function getUniqueOptedInEmails() {
    const uniqueEmails = new Set();
    orders.forEach(order => {
        if (order.emailOptIn) {
            uniqueEmails.add(order.email);
        }
    });
    return Array.from(uniqueEmails);
}

app.get("/export-email-optins", (req, res) => {
  if (!fs.existsSync("email_subscribers.csv")) {
      return res.status(404).json({ message: "No opted-in emails found." });
  }

  res.download("email_subscribers.csv");
});
const ordersCsvWriter = createCsvWriter({
  path: "orders_export.csv",
  header: [
      { id: "email", title: "Email" },
      { id: "pickupDay", title: "Pickup Day" },
      { id: "cart", title: "Cart Items" },
      { id: "totalAmount", title: "Total Amount ($)" },
      { id: "discountCode", title: "Discount Code" },
      { id: "date", title: "Order Date" },
  ],
  append: true, // ✅ Append orders instead of overwriting
});

function appendOrderToCSV(order) {
  const csvData = [{
      email: order.email,
      pickupDay: order.pickupDay,
      cart: order.cart.map(item => `${item.quantity}x ${item.name} ($${item.price})`).join("; "),
      totalAmount: order.totalAmount || "0.00",
      discountCode: order.discountCode || "None",
      date: new Date(order.date).toLocaleString(),
  }];

  ordersCsvWriter.writeRecords(csvData)
      .then(() => console.log(`✅ Order saved to CSV: ${order.email}`))
      .catch(err => console.error("❌ Error saving order to CSV:", err));
}

// ✅ Export Orders as CSV
app.get("/export-orders", (req, res) => {
  if (!fs.existsSync(ordersFilePath)) {
      return res.status(404).json({ message: "No orders found." });
  }

  const orders = JSON.parse(fs.readFileSync(ordersFilePath, "utf-8"));

  if (orders.length === 0) {
      return res.status(404).json({ message: "No orders found." });
  }

  const csvData = orders.map(order => ({
      email: order.email,
      pickupDay: order.pickupDay,
      cart: order.cart.map(item => `${item.quantity}x ${item.name} ($${item.price})`).join("; "),
      totalAmount: order.totalAmount || "0.00",
      discountCode: order.discountCode || "None",
      date: new Date(order.date).toLocaleString(),
  }));

  ordersCsvWriter.writeRecords(csvData).then(() => {
      res.download("orders_export.csv");
  }).catch(err => {
      console.error("❌ Error exporting orders CSV:", err);
      res.status(500).json({ error: "Failed to export orders." });
  });
});


// Function to load the CSV and populate pickupSlots
async function loadPickupSlots() {
  const filePath = path.join(__dirname, "public", "pickupSlots.csv");
  const slots = {};

  console.log("📝 Reading pickupSlots.csv from:", filePath);

  return new Promise((resolve, reject) => {
      fs.readFile(filePath, "utf8", (err, data) => {
          if (err) {
              console.error("❌ Error reading pickupSlots.csv:", err);
              return reject(err);
          }

          console.log("📂 Raw CSV Data:\n", data); // Debug: Show raw CSV file contents

          // Parse CSV Data
          const lines = data.trim().split("\n");
          const headers = lines.shift().split(",");

          lines.forEach(line => {
              const [date, amount, booked] = line.split(",");
              const availableSlots = parseInt(amount, 10) || 0;
              const bookedSlots = parseInt(booked, 10) || 0; 

              slots[date.trim()] = {
                  available: availableSlots,
                  booked: bookedSlots
              };
          });

          console.log("✅ Parsed pickupSlots:", slots);
          pickupSlots = slots; // Assign to global variable
          resolve();
      });
  });
}


// Load slots when the server starts
loadPickupSlots().then(() => {
    console.log("✅ Server is running and pickup slots are ready");
}).catch((err) => {
    console.error("❌ Error loading pickup slots:", err);
});

// Route to check availability for all pickup slots
app.get("/check-availability", (req, res) => {
  try {
      const slotsData = Object.keys(pickupSlots).reduce((acc, date) => {
          const available = pickupSlots[date]?.available || 0;
          const booked = pickupSlots[date]?.booked || 0;
          const remaining = Math.max(available - booked, 0); // ✅ Correct calculation

          acc[date] = { remaining };
          return acc;
      }, {});

      res.json(slotsData);
  } catch (error) {
      console.error("❌ Error fetching pickup slots:", error);
      res.status(500).json({ error: "Failed to load pickup slots." });
  }
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

  // ✅ **Update `booked` count**
  slot.booked += quantity;
  slot.available -= quantity; // Reduce available slots

  console.log(`✅ Updated booked slots for ${pickupDay}: ${slot.booked}`);
  console.log(`📉 Remaining slots for ${pickupDay}: ${slot.available}`);

  // ✅ **Write updated slots back to `pickupSlots.csv`**
  const filePath = path.join(__dirname, "public", "pickupSlots.csv");
  const updatedData = "date,amount,booked\n" + 
      Object.keys(pickupSlots)
          .map(date => `${date},${pickupSlots[date].available + pickupSlots[date].booked},${pickupSlots[date].booked}`)
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
  console.log("📅 Checking slots for pickup day:", pickupDay);
  console.log("📊 All pickup slots at check time:", pickupSlots);

  if (!pickupSlots[pickupDay]) {
      console.log("❌ No slot entry found for this date.");
      return { available: false, remaining: 0 };
  }

  const slot = pickupSlots[pickupDay];
  const remaining = slot.available - slot.booked;

  console.log(`✅ Slot Found: Available = ${slot.available}, Booked = ${slot.booked}, Remaining = ${remaining}`);
  return { available: remaining > 0, remaining };
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

app.post("/log-venmo-order", async (req, res) => {
  try {
      const { cart, email, pickupDay, discountCode, totalAmount } = req.body;

      // Save order with discount applied
      const newOrder = {
          email,
          pickupDay,
          cart,
          totalAmount,
          discountCode,
          date: new Date().toISOString(),
          paymentMethod: "Venmo"
      };

      saveOrder(newOrder);  // Save to orders.json & CSV

      // Send order confirmation email
      await sendVenmoOrderConfirmationEmail(email, cart, pickupDay, totalAmount);

      res.json({ success: true });
  } catch (error) {
      console.error("❌ Error logging Venmo order:", error);
      res.status(500).json({ error: "Failed to log Venmo order." });
  }
});

async function sendVenmoOrderConfirmationEmail(email, cart, pickupDay, totalAmount) {
  const orderDetails = cart.map(item => `• ${item.quantity}x ${item.name} ($${item.price.toFixed(2)})`).join("\n");

  const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Your Bascom Bread Order (Venmo Payment Pending)",
      text: `Thank you for your order!\n\nYou have purchased:\n${orderDetails}\n\nPickup Date: ${pickupDay}\nTotal after Venmo discount: $${totalAmount.toFixed(2)}\n\n⚠️ Your order will not be fulfilled until payment is received via Venmo. Please complete your payment as soon as possible.`,
  };

  try {
      await transporter.sendMail(mailOptions);
      console.log("✅ Venmo order confirmation email sent to:", email);
  } catch (error) {
      console.error("❌ Error sending Venmo order email:", error);
  }
}



app.post("/confirm-venmo-payment", async (req, res) => {
  try {
      const { email } = req.body;

      // Load existing orders
      let orders = fs.existsSync(ordersFilePath) ? JSON.parse(fs.readFileSync(ordersFilePath)) : [];
      let orderIndex = orders.findIndex(order => order.email === email && order.paymentMethod === "Venmo" && order.status === "Pending Payment");

      if (orderIndex === -1) {
          return res.status(404).json({ error: "No pending Venmo payment found for this email." });
      }

      // Confirm payment
      orders[orderIndex].status = "Paid";

      // Update booked slots after payment confirmation
      await updateBookedSlots(orders[orderIndex].pickupDay, orders[orderIndex].cart.reduce((sum, item) => sum + item.quantity, 0));

      // Save updated orders
      fs.writeFileSync(ordersFilePath, JSON.stringify(orders, null, 2));

      console.log(`✅ Venmo payment confirmed for ${email}. Pickup slot updated.`);
      res.status(200).json({ message: "Payment confirmed and slot booked." });

  } catch (error) {
      console.error("❌ Error confirming Venmo payment:", error);
      res.status(500).json({ error: "Failed to confirm payment." });
  }
});


// Checkout API Endpoint
app.post("/create-checkout-session", async (req, res) => {
  try {
      const { cart, email, pickupDay, emailOptIn, discountCode, totalAmount, paymentMethod } = req.body;

      console.log("🛒 Incoming Checkout Request:", req.body); // ✅ Log incoming request data

      if (!paymentMethod) {
          return res.status(400).json({ error: "Payment method not specified." });
      }

      const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: cart.map(item => ({
              price_data: {
                  currency: "usd",
                  product_data: { name: item.name },
                  unit_amount: Math.round(item.price * 100),
              },
              quantity: item.quantity || 1,
          })),
          mode: "payment",
          success_url: "https://safe-feline-evident.ngrok-free.app/success.html",
          cancel_url: "https://safe-feline-evident.ngrok-free.app/cancel.html",
          customer_email: email,
          metadata: { cart: JSON.stringify(cart), pickupDay, emailOptIn, discountCode, totalAmount, paymentMethod }
      });

      console.log("✅ Stripe Session Created:", session.url);
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
