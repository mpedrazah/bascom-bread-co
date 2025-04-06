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
app.use((req, res, next) => {
  console.log(`📥 Incoming request: ${req.method} ${req.url}`);
  next();
});

app.use(cors({
  origin: ["https://www.bascombreadco.com", "https://bascombreadco.up.railway.app"],
  methods: ["GET", "POST"],
  credentials: true
}));

// ✅ Stripe Webhook for Payment Confirmation
// Webhook endpoint for Stripe
app.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  console.log("⚡ Incoming webhook request received.");
  const sig = req.headers["stripe-signature"];

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    console.log("✅ Webhook Event Received:", event.type);
  } catch (err) {
    console.error("❌ Webhook signature verification failed:", err.message);
    console.error("⚠️ Full Headers:", req.headers);
    console.error("⚠️ Raw Body:", req.body.toString());
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Process only successful payments
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    console.log("✅ Payment received! Processing order:", session);

    const email = session.customer_email;
    const metadata = session.metadata;

    const orderData = {
      email,
      pickup_day: metadata.pickup_day,
      items: JSON.parse(metadata.cart).map(item => `${item.name} (x${item.quantity})`).join(", "),
      total_price: parseFloat(metadata.totalAmount).toFixed(2),
      payment_method: metadata.payment_method,
      email_opt_in: metadata.emailOptIn && metadata.emailOptIn === "true"

    };

    try {
      await saveOrderToDatabase(orderData);
      console.log("✅ Order saved successfully to database!");
      await sendOrderConfirmationEmail(orderData.email, orderData.items, orderData.pickup_day, orderData.total_price, orderData.payment_method);
      console.log("✅ Confirmation email sent successfully!");
    } catch (error) {
      console.error("❌ Error processing order:", error);
      return res.status(500).send("Error processing order.");
    }
  }

  res.json({ received: true });
});


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
          pickup_day TEXT,
          items TEXT,
          total_price NUMERIC(10,2),
          payment_method TEXT,
          email_opt_in BOOLEAN DEFAULT FALSE,
          order_date TIMESTAMP DEFAULT NOW()
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
  process.exit(1);
}


// ✅ Call the function to initialize the DB
setupDatabase();


// ✅ Function to Save Orders in PostgreSQL
async function saveOrderToDatabase(order) {
  const query = `
      INSERT INTO orders (email, pickup_day, items, total_price, payment_method, email_opt_in, order_date)
      VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *;
  `;
  const values = [order.email, order.pickup_day, order.items, order.total_price, order.payment_method, order.email_opt_in];

  try {
    const result = await pool.query(query, values);
    console.log("✅ Order saved to PostgreSQL successfully!", result.rows[0]);
    return result.rows[0];
  } catch (err) {
    console.error("❌ Error saving order to PostgreSQL:", err);
    console.error("❌ Query:", query);
    console.error("❌ Values:", values);
    throw err;
  }
}



// ✅ API Endpoint to Save Orders
// ✅ Updated API to Save Order with Google Sheet-based limit
app.post("/save-order", async (req, res) => {
  try {
    const { email, pickup_day, items, total_price, payment_method, email_opt_in, cart } = req.body;
    if (!email || !pickup_day || !items || !total_price || !payment_method || !cart) {
      return res.status(400).json({ success: false, error: "All fields are required!" });
    }

    // ✅ Fetch limit from Google Sheets
    const pickupLimit = await getPickupLimitFromGoogleSheets(pickup_day);
    if (!pickupLimit) {
      return res.status(400).json({ success: false, error: `Pickup day '${pickup_day}' not found in availability.` });
    }

    // ✅ Get total items already ordered for that day
    const itemCountResult = await pool.query(
      `SELECT COALESCE(SUM(quantity), 0) AS total_items
       FROM (
         SELECT pickup_day,
                CAST(regexp_replace(trim(subitem), '[^0-9]', '', 'g') AS INTEGER) AS quantity
         FROM (
           SELECT pickup_day, unnest(string_to_array(items, ',')) AS subitem
           FROM orders
           WHERE pickup_day = $1
         ) AS inner_sub
       ) AS final_count;`,
      [pickup_day]
    );
    

    const itemsAlreadyOrdered = parseInt(itemCountResult.rows[0].total_items || 0);
    const cartItemTotal = cart.reduce((sum, item) => sum + item.quantity, 0);

    const remainingSlots = pickupLimit - itemsAlreadyOrdered;

    if (cartItemTotal > remainingSlots) {
      return res.status(400).json({
        success: false,
        error: `Only ${remainingSlots} pickup slots remain for ${pickup_day}. You have ${cartItemTotal} items in your cart.`
      });
    }

    const emailOptInValue = email_opt_in === true;

    const result = await pool.query(
      `INSERT INTO orders (email, pickup_day, items, total_price, payment_method, email_opt_in, order_date)
       VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *;`,
      [email, pickup_day, items, total_price, payment_method, emailOptInValue]
    );

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
async function sendOrderConfirmationEmail(email, items, pickupDay, totalAmount, paymentMethod) {
  if (!email) {
    console.error("❌ Email is missing. Cannot send confirmation.");
    return;
  }

  const orderDetails = items.split(", ").map(item => `• ${item}`).join("<br>");
  let emailBody;

  if (paymentMethod === "Venmo") {
    emailBody = `
      <p>Thank you for your order!</p>
      <p><strong>You have purchased:</strong></p>
      <p>${orderDetails}</p>
      <p><strong>Pickup Date:</strong> ${pickupDay}*</p>
      <p>*Please pickup your bread within your pickup window. All unclaimed bread will be donated at the end of the day. 
</p>
      <p> You can pickup your order from the porch at 1508 Cooper Dr., Irving, Texas 75061. 
      <p></p>
      <p><strong>Total after Venmo discount:</strong> $${parseFloat(totalAmount).toFixed(2)}</p>
      <p style="color: red; font-weight: bold;">⚠️ Your order will not be fulfilled until payment is received via Venmo. Please complete your payment as soon as possible.</p>
      <br>
      <p>Thank you,</p>
      <p>Margaret</p>
      <br></br>
      
      <strong>Notes about bread storage: </strong> This bread is extremely fresh and free from all preservatives, which means it has a shorter shelf life than grocery store bread. 
<ul>
<li>Bread is best when consumed within 3-5 days.</li>
<li>Store bread in an airtight bag or beeswax bag.</li>
<li>Bread will keep well in the freezer for up to 1 month. </li>
<li>Slice the bread prior to freezing and use a toaster oven to reheat individual slices.</li>
<li>To reheat a whole frozen loaf, spritz with water and place in the oven at 400 for 20 minutes.</li> </ul>

    `;
  } else {
    emailBody = `
      <p>Thank you for your order!</p>
      <p><strong>You have purchased:</strong></p>
      <p>${orderDetails}</p>
      <p><strong>Pickup Date:</strong> ${pickupDay}*</p>
      <p>*Please pickup your bread within your pickup window. All unclaimed bread will be donated at the end of the day. 
</p>
      <p> You can pickup your order from the porch at 1508 Cooper Dr., Irving, Texas 75061. 
      <p></p>
      <br>
      <p>Thank you,</p>
      <p>Margaret</p>
      <br></br>
      
      <strong>Notes about bread storage: </strong> This bread is extremely fresh and free from all preservatives, which means it has a shorter shelf life than grocery store bread. 
<ul>
<li>Bread is best when consumed within 3-5 days.</li>
<li>Store bread in an airtight bag or beeswax bag.</li>
<li>Bread will keep well in the freezer for up to 1 month. </li>
<li>Slice the bread prior to freezing and use a toaster oven to reheat individual slices.</li>
<li>To reheat a whole frozen loaf, spritz with water and place in the oven at 400 for 20 minutes.</li> </ul>

    `;
  }

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email, // ✅ Ensure `email` is valid before sending
    subject: "Your Bascom Bread Order Confirmation",
    html: emailBody,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("✅ Order confirmation email sent to:", email);
  } catch (error) {
    console.error("❌ Error sending email:", error);
    console.error("❌ Mail Options:", mailOptions);
  }
  
}


// ✅ Stripe Checkout API
app.post("/create-checkout-session", async (req, res) => {
  try {
    console.log("🛠 Received Stripe checkout request:", req.body); // ✅ Log incoming request

    const { cart, email, pickup_day, totalAmount, payment_method, emailOptIn } = req.body;

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
      success_url: "https://www.bascombreadco.com/success.html",
      cancel_url: "https://www.bascombreadco.com/cancel.html",
      customer_email: email,
      metadata: {
        cart: JSON.stringify(cart),
        pickup_day,
        totalAmount,
        payment_method,
        emailOptIn: emailOptIn.toString()
      }
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
