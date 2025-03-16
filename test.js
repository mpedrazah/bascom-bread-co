require("dotenv").config();
const { Pool } = require("pg");

// ✅ Set up database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Required for Railway
});

async function testDatabase() {
  try {
    const client = await pool.connect();
    console.log("✅ Connected to PostgreSQL!");

    // ✅ Check if table exists
    const tableCheck = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';"
    );
    console.log("📌 Tables in database:", tableCheck.rows);

    // ✅ Fetch orders
    const result = await client.query("SELECT * FROM orders ORDER BY pickup_day DESC;");
    console.log("📦 Orders in database:", result.rows);

    client.release();
  } catch (err) {
    console.error("❌ Database connection failed:", err);
  }
}

testDatabase();

async function insertTestOrder() {
    try {
      const query = `
        INSERT INTO orders (email, pickup_day, items, total_price, payment_method)
        VALUES ('test@example.com', '2025-03-18', 'Sourdough Bread (x2)', 10.99, 'Venmo');
      `;
  
      await pool.query(query);
      console.log("✅ Test order inserted successfully!");
  
      // Check orders again
      const ordersResult = await pool.query("SELECT * FROM orders;");
      console.log("📦 Orders after insertion:", ordersResult.rows);
    } catch (error) {
      console.error("❌ Failed to insert test order:", error);
    }
  }
  
  insertTestOrder();
  