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
      const { cart, email, pickupDay, emailOptIn, discountCode } = req.body;

      // ✅ If user opted in, save email
      if (emailOptIn) {
          await saveEmailSubscriber(email);
      }

      // ✅ Continue with order processing...
      const totalQuantity = cart.reduce((sum, item) => sum + item.quantity, 0);
      const { available, remaining } = await checkRemainingSlots(pickupDay);

      if (!available || totalQuantity > remaining) {
          return res.status(400).json({ error: `No available slots. Remaining slots: ${remaining}` });
      }

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
          success_url: "https://safe-feline-evident.ngrok-free.app/success.html",
          cancel_url: "https://safe-feline-evident.ngrok-free.app/cancel.html",
          customer_email: email,
          metadata: { cart: JSON.stringify(cart), pickupDay, emailOptIn, discountCode },
      });

      // ✅ Save Order
      const newOrder = { email, pickupDay, cart, date: new Date().toISOString(), emailOptIn, discountCode };
      saveOrder(newOrder);

      // ✅ Update booked slots
      await updateBookedSlots(pickupDay, totalQuantity);

      // ✅ Send confirmation email if opted-in
      if (emailOptIn) {
          await sendOrderConfirmationEmail(email, cart, pickupDay);
      }

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
