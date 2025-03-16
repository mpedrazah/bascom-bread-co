require("dotenv").config();
const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const createCsvWriter = require("csv-writer").createObjectCsvWriter;

const { Pool } = require("pg");
const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, "public")));



const ordersFilePath = "orders.csv"; // Store orders here
const csvFilePath = "email_subscribers.csv"; // Store opted-in emails


// ✅ Setup Email Transporter (For Order Confirmation)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ✅ Connect to Railway PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }, // Required for Railway
});

// ✅ Retry connecting to PostgreSQL before failing
async function setupDatabase(retries = 5, delay = 5000) {
  for (let i = 0; i < retries; i++) {
      try {
          const client = await pool.connect();
          console.log("✅ Database connected successfully!");
          await client.query(`
              CREATE TABLE IF NOT EXISTS orders (
                  id SERIAL PRIMARY KEY,
                  timestamp TIMESTAMP DEFAULT NOW(),
                  name TEXT,
                  email TEXT,
                  pickupDate TEXT,
                  items TEXT,
                  totalPrice NUMERIC(10,2),
                  paymentMethod TEXT
              )
          `);
          client.release();
          return; // ✅ Exit if successful
      } catch (err) {
          console.error(`❌ Database connection attempt ${i + 1} failed. Retrying in ${delay / 1000} seconds...`);
          await new Promise((resolve) => setTimeout(resolve, delay)); // Wait before retrying
      }
  }
  console.error("🚨 Database connection failed after multiple attempts. Exiting.");
  process.exit(1); // Stop the app so Railway doesn't keep restarting it
}

// ✅ Call the function to initialize the DB
setupDatabase();


// ✅ Function to Save Orders in PostgreSQL
async function saveOrderToDatabase(order) {
  const query = `
      INSERT INTO orders (email, pickup_day, items, total_price, payment_method, order_date)
      VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *;
  `;
  const values = [order.email, order.pickupDay, order.items, order.totalPrice, order.paymentMethod];

  try {
      const result = await pool.query(query, values);
      console.log("✅ Order saved to PostgreSQL successfully!", result.rows[0]);
      return result.rows[0];
  } catch (err) {
      console.error("❌ Error saving order to PostgreSQL:", err);
      throw err;
  }
}


// ✅ API Endpoint to Save Orders

app.post("/save-order", async (req, res) => {
  try {
    const { email, pickupDay, items, totalPrice, paymentMethod } = req.body;

    const query = `
      INSERT INTO orders (email, pickup_day, items, total_price, payment_method, order_date)
      VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *;
    `;

    const values = [email, pickupDay, items, totalPrice, paymentMethod];

    const result = await pool.query(query, values);
    console.log("✅ Order saved:", result.rows[0]);

    res.json({ success: true, order: result.rows[0] });
  } catch (error) {
    console.error("❌ Error saving order:", error);
    res.status(500).json({ success: false, error: "Failed to save order" });
  }
});



// ✅ API Endpoint to Fetch Orders
app.get("/get-orders", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM orders ORDER BY id DESC");
    res.json(result.rows);
  } catch (error) {
    console.error("❌ Error fetching orders:", error);
    res.status(500).json({ error: "Failed to load orders." });
  }
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
const PORT = process.env.PORT || 0;
const server = app.listen(PORT, () => {
  console.log(`✅ Server running on port ${server.address().port}`);
});
