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
    const { email, pickup_day, items, total_price, payment_method, email_optin } = req.body;

    console.log("🛠 Received order:", req.body);

    if (!email || !pickup_day || !items || !total_price || !payment_method) {
      console.error("❌ Missing required fields:", { email, pickup_day, items, total_price, payment_method });
      return res.status(400).json({ success: false, error: "All fields are required!" });
    }

    const emailOptInValue = email_optin === true; // ✅ Ensure it's stored as a boolean

    const query = `
      INSERT INTO orders (email, pickup_day, items, total_price, payment_method, email_optin, order_date)
      VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *;
    `;
    const values = [email, pickup_day, items, total_price, payment_method, emailOptInValue];

    const result = await pool.query(query, values);
    console.log("✅ Order saved:", result.rows[0]);

    // ✅ Send Email Confirmation if Opted-in
    if (emailOptInValue) {
      await sendOrderConfirmationEmail(email, items, pickup_day, total_price, payment_method);
    }

    res.json({ success: true, order: result.rows[0] });

  } catch (error) {
    console.error("❌ Error saving order:", error);
    res.status(500).json({ success: false, error: error.message || "Failed to save order." });
  }
});






// ✅ API Endpoint to Fetch Orders
app.get("/get-orders", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM orders ORDER BY id DESC");
    
    console.log("✅ Orders fetched:", result.rows);

    res.json(result.rows);
  } catch (error) {
    console.error("❌ Error fetching orders:", error);
    res.status(500).json({ error: "Failed to load orders." });
  }
});



// ✅ Send Order Confirmation Email
// ✅ Send Order Confirmation Email
async function sendOrderConfirmationEmail(email, items, pickupDay, totalAmount, paymentMethod) {
  const orderDetails = items.split(", ").map(item => `• ${item}`).join("<br>");

  // Format email content based on payment method
  let emailBody;
  if (paymentMethod === "Venmo") {
    emailBody = `
      <p>Thank you for your order!</p>
      <p><strong>You have purchased:</strong></p>
      <p>${orderDetails}</p>
      <p><strong>Pickup Date:</strong> ${pickupDay}</p>
      <p>You can do a porch pickup from <strong>1508 Cooper Drive, Irving, 75061</strong> between <strong>10:00 AM - 12:00 PM</strong></p>
      <p><strong>Total after Venmo discount:</strong> $${totalAmount}</p>
      <p style="color: red; font-weight: bold;">⚠️ Your order will not be fulfilled until payment is received via Venmo. Please complete your payment as soon as possible.</p>
      <br>
      <p>Thank you,</p>
      <p>Margaret</p>
    `;
  } else {
    emailBody = `
      <p>Thank you for your order!</p>
      <p><strong>You have purchased:</strong></p>
      <p>${orderDetails}</p>
      <p><strong>Pickup Date:</strong> ${pickupDay}</p>
      <p>You can do a porch pickup from <strong>1508 Cooper Drive, Irving, 75061</strong> between <strong>10:00 AM - 12:00 PM</strong></p>
      <br>
      <p>Thank you,</p>
      <p>Margaret</p>
    `;
  }

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: "Your Bascom Bread Order Confirmation",
    html: emailBody, // ✅ Use HTML for better formatting
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
    console.log("🛠 Received Stripe checkout request:", req.body); // ✅ Log incoming request

    const { cart, email, pickup_day, totalAmount, payment_method } = req.body;

    if (!cart || !email || !pickup_day || !totalAmount || !payment_method) {
      console.error("❌ Missing required fields:", { cart, email, pickup_day, totalAmount, payment_method });
      return res.status(400).json({ error: "Missing required fields for Stripe checkout." });
    }

    console.log("✅ All required fields are present. Proceeding to Stripe API...");

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
      metadata: { cart: JSON.stringify(cart), pickup_day, totalAmount, payment_method }
    });

    console.log("✅ Stripe Session Created:", session.url);
    res.json({ url: session.url });

  } catch (error) {
    console.error("❌ Stripe Checkout Error:", error);
    res.status(500).json({ error: error.message });
  }
});


// ✅ Export Orders as CSV for Admin Download
app.get("/export-orders", async (req, res) => {
  try {
      const result = await pool.query("SELECT id, name, email, pickup_day, items, total_price, payment_method, order_date FROM orders ORDER BY id DESC");

      if (result.rows.length === 0) {
          return res.status(404).json({ message: "No orders found." });
      }

      const csvWriter = createCsvWriter({
          path: "orders.csv",
          header: [
              { id: "id", title: "Order ID" },
              { id: "name", title: "Name" },
              { id: "email", title: "Email" },
              { id: "pickup_day", title: "Pickup Day" },
              { id: "items", title: "Items" },
              { id: "total_price", title: "Total Price" },
              { id: "payment_method", title: "Payment Method" },
              { id: "order_date", title: "Order Date" }
          ],
      });

      await csvWriter.writeRecords(result.rows);
      console.log("✅ Orders exported successfully!");

      res.download("orders.csv");

  } catch (error) {
      console.error("❌ Error exporting orders:", error);
      res.status(500).json({ error: "Failed to export orders." });
  }
});


// ✅ Export Email Subscribers
app.get("/export-email-optins", async (req, res) => {
  try {
      const result = await pool.query("SELECT DISTINCT email FROM orders WHERE email_opt_in = TRUE");

      if (result.rows.length === 0) {
          return res.status(404).json({ message: "No opted-in emails found." });
      }

      const csvWriter = createCsvWriter({
          path: "opted_in_emails.csv",
          header: [{ id: "email", title: "Email" }],
      });

      await csvWriter.writeRecords(result.rows);
      console.log("✅ Opted-in emails exported successfully!");

      res.download("opted_in_emails.csv");

  } catch (error) {
      console.error("❌ Error exporting opted-in emails:", error);
      res.status(500).json({ error: "Failed to export opted-in emails." });
  }
});


// ✅ Start Server
const PORT = process.env.PORT || 0;
const server = app.listen(PORT, () => {
  console.log(`✅ Server running on port ${server.address().port}`);
});
