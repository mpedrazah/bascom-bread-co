require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const createCsvWriter = require("csv-writer").createObjectCsvWriter;

const app = express();
const PORT = process.env.PORT || 5000;
const ordersFilePath = "orders.csv"; // Store orders here
const csvFilePath = "email_subscribers.csv"; // Store opted-in emails

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// ✅ Setup Email Transporter (For Order Confirmation)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ✅ Save Order to CSV
app.post("/save-order", (req, res) => {
  const order = req.body;
  const csvRow = `\n${new Date().toISOString()},${order.name},${order.email},${order.pickupDate},${order.items},${order.totalPrice},${order.paymentMethod}`;

  fs.appendFile(ordersFilePath, csvRow, (err) => {
    if (err) {
      console.error("❌ Error saving order:", err);
      return res.json({ success: false, error: "Failed to save order" });
    }
    res.json({ success: true });
  });
});

// ✅ Fetch Orders from CSV for Admin Panel
app.get("/get-orders", (req, res) => {
  fs.readFile(ordersFilePath, "utf8", (err, data) => {
    if (err) {
      console.error("❌ Error reading orders:", err);
      return res.json([]);
    }

    const orders = data.trim().split("\n").slice(1).map(row => {
      const [timestamp, name, email, pickupDate, items, totalPrice, paymentMethod] = row.split(",");
      return { timestamp, name, email, pickupDate, items, totalPrice, paymentMethod };
    });

    res.json(orders);
  });
});

// ✅ Send Order Confirmation Email
async function sendOrderConfirmationEmail(email, cart, pickupDay, totalAmount) {
  const orderDetails = cart.map(item => `• ${item.quantity}x ${item.name} ($${item.price.toFixed(2)})`).join("\n");

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

// ✅ Stripe Checkout API
app.post("/create-checkout-session", async (req, res) => {
  try {
    const { cart, email, pickupDay, totalAmount, paymentMethod } = req.body;

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
      success_url: "https://your-site.com/success.html",
      cancel_url: "https://your-site.com/cancel.html",
      customer_email: email,
      metadata: { cart: JSON.stringify(cart), pickupDay, totalAmount, paymentMethod }
    });

    console.log("✅ Stripe Session Created:", session.url);
    res.json({ url: session.url });

  } catch (error) {
    console.error("❌ Stripe Checkout Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ✅ Export Orders as CSV for Admin Download
app.get("/export-orders", (req, res) => {
  if (!fs.existsSync(ordersFilePath)) {
    return res.status(404).json({ message: "No orders found." });
  }
  res.download(ordersFilePath);
});

// ✅ Export Email Subscribers
app.get("/export-email-optins", (req, res) => {
  if (!fs.existsSync(csvFilePath)) {
    return res.status(404).json({ message: "No opted-in emails found." });
  }
  res.download(csvFilePath);
});

// ✅ Start Server
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
