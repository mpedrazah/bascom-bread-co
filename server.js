const express = require("express");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const cors = require("cors");
const nodemailer = require("nodemailer");
const fs = require("fs");

const app = express();
// Use the database connection
const MONGO_URI = process.env.MONGO_URI;

// For non-webhook routes: use JSON parser
app.use(express.json());
app.use(cors());
app.use(express.static("public"));

// Nodemailer Setup – update with your credentials
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
    },
});

// Simple order storage using a JSON file
const ordersFile = "orders.json";
function saveOrder(order) {
  let orders = [];
  if (fs.existsSync(ordersFile)) {
    orders = JSON.parse(fs.readFileSync(ordersFile));
  }
  orders.push(order);
  fs.writeFileSync(ordersFile, JSON.stringify(orders, null, 2));
}

// Create Checkout Session Endpoint
app.post("/create-checkout-session", async (req, res) => {
    try {
      const { cart, email, pickupDay, pickupTime } = req.body;
      if (!cart || cart.length === 0) {
        return res.status(400).json({ error: "Cart is empty." });
      }
      const line_items = cart.map(item => ({
        price_data: {
          currency: "usd",
          product_data: { name: item.name },
          unit_amount: item.price * 100,
        },
        quantity: item.quantity || 1,
      }));
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items,
        mode: "payment",
        success_url: "http://localhost:3000/success.html",
        cancel_url: "http://localhost:3000/cancel.html",
        customer_email: email,
        metadata: {
          cart: JSON.stringify(cart),
          pickupDay: pickupDay,
          pickupTime: pickupTime,
        },
      });
      res.json({ url: session.url });
    } catch (error) {
      console.error("Stripe Checkout Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Serve success and cancel pages
app.get("/success.html", (req, res) => {
    res.sendFile(path.join(__dirname, "public/success.html"));
});

app.get("/cancel.html", (req, res) => {
    res.sendFile(path.join(__dirname, "public/cancel.html"));
});
  
// --- Stripe Webhook Setup ---

// --- Stripe Webhook Setup ---
app.post("/webhook", express.raw({ type: "application/json" }), (req, res) => {
    const endpointSecret = 'whsec_db3198d6c02e451b718cef7c2c35b19b59419fe2579e9d480dc8580b9f44cb65';
    let event;

    try {
        event = stripe.webhooks.constructEvent(
            req.body,
            req.headers["stripe-signature"],
            endpointSecret
        );
    } catch (err) {
        console.error("❌ Webhook signature verification failed.", err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle successful payment event
    if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        const email = session.customer_email;
        const cart = JSON.parse(session.metadata.cart);
        const pickupDay = session.metadata.pickupDay;
        const pickupTime = session.metadata.pickupTime;

        // ✅ Save the order in orders.json
        const order = { email, cart, pickupDay, pickupTime, date: new Date().toISOString() };
        saveOrder(order);

        // ✅ Prepare and send email confirmation
        const orderSummary = cart.map(item =>
            `- ${item.quantity} x ${item.name}: $${(item.price * item.quantity).toFixed(2)}`
        ).join("\n");

        const mailOptions = {
            from: "mpedrazash@gmail.com",
            to: email,
            subject: "Thank You for Your Order - Bascom Bread",
            text: `Hello,\n\nThank you for your order! Here is your order summary:\n\n${orderSummary}\n\nYour pickup is scheduled for ${pickupDay} at ${pickupTime}.\n\nBest,\nBascom Bread`,
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error("❌ Error sending confirmation email:", error);
            } else {
                console.log("✅ Confirmation email sent:", info.response);
            }
        });
    }

    res.json({ received: true });
});

// Endpoint to view past orders (for admin use)
// ✅ Admin View Orders API
const path = require("path"); // Add this if not already included

const ordersFilePath = path.join(__dirname, "public", "orders.json"); // Correct file path

app.get("/orders", (req, res) => {
    if (fs.existsSync(ordersFilePath)) {
        try {
            const orders = JSON.parse(fs.readFileSync(ordersFilePath, "utf-8"));
            console.log("✅ Orders Loaded from orders.json:", orders); // Debugging log
            res.json(orders);
        } catch (error) {
            console.error("❌ Error reading orders.json:", error);
            res.status(500).json({ error: "Failed to load orders." });
        }
    } else {
        console.log("⚠️ No orders.json file found.");
        res.json([]); // Return an empty array if no orders exist
    }
});

app.listen(3000, () => console.log("✅ Server running on port 3000"));
