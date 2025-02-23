require("dotenv").config();
const express = require("express");
const cors = require("cors");
console.log("✅ STRIPE_SECRET_KEY:", process.env.STRIPE_SECRET_KEY); // Debugging

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY); // ✅ Ensure API Key is Set
const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");


const app = express();

const corsOptions = {
    origin: "http://localhost:3000", // ✅ ONLY Allow Localhost Now
    methods: "GET,POST",
    allowedHeaders: "Content-Type",
};

app.use(cors(corsOptions)); // ✅ Apply CORS Fix
app.use(express.json());
app.use(express.static("public"));

console.log("✅ STRIPE_SECRET_KEY:", process.env.STRIPE_SECRET_KEY);
// ✅ Nodemailer Setup
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

const ordersFilePath = "orders.json";

function saveOrder(order) {
    let orders = [];
    if (fs.existsSync(ordersFilePath)) {
        orders = JSON.parse(fs.readFileSync(ordersFilePath));
    }
    orders.push(order);
    fs.writeFileSync(ordersFilePath, JSON.stringify(orders, null, 2));
}

app.get("/pickup-slots", async (req, res) => {
  try {
      const slots = await PickupSlot.find();
      res.json(slots);
  } catch (error) {
      console.error("❌ Error fetching pickup slots:", error);
      res.status(500).json({ error: "Failed to load pickup slots." });
  }
});

// ✅ Create Checkout Session
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
            metadata: { cart: JSON.stringify(cart), pickupDay, pickupTime },
        });

        res.json({ url: session.url });
    } catch (error) {
        console.error("❌ Stripe Checkout Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// ✅ Stripe Webhook (Handles Payment Success)
app.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
    let event;

    try {
        event = stripe.webhooks.constructEvent(
            req.body,
            req.headers["stripe-signature"],
            endpointSecret
        );
    } catch (err) {
        console.error("❌ Webhook signature verification failed:", err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        const email = session.customer_email;
        const cart = JSON.parse(session.metadata.cart);
        const pickupDay = session.metadata.pickupDay;
        const pickupTime = session.metadata.pickupTime;

        // ✅ Save order to MongoDB
        const newOrder = new Order({ email, cart, pickupDay, pickupTime });
        await newOrder.save();
        console.log("✅ Order saved to MongoDB");

        // ✅ Send order confirmation email
        const orderSummary = cart.map(item =>
            `- ${item.quantity} x ${item.name}: $${(item.price * item.quantity).toFixed(2)}`
        ).join("\n");

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: "Thank You for Your Order - Bascom Bread",
            text: `Hello,\n\nThank you for your order! Here is your order summary:\n\n${orderSummary}\n\nYour pickup is scheduled for ${pickupDay} at ${pickupTime}.\n\nBest,\nBascom Bread`,
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error("❌ Error sending confirmation email:", error);
            } else {
              console.log("✅ Email Content:", mailOptions);
            }
        });
    }

    res.json({ received: true });
});

// ✅ Fetch Orders for Admin Panel
app.get("/orders", async (req, res) => {
    try {
        const orders = await Order.find().sort({ date: -1 });
        res.json(orders);
    } catch (error) {
        console.error("❌ Error fetching orders:", error);
        res.status(500).json({ error: "Failed to load orders." });
    }
});


// ✅ Serve Success & Cancel Pages
app.get("/success.html", (req, res) => res.sendFile(path.join(__dirname, "public/success.html")));
app.get("/cancel.html", (req, res) => res.sendFile(path.join(__dirname, "public/cancel.html")));

// ✅ Start Server on Railway's Dynamic Port
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
