require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

async function testDatabase() {
    try {
        const client = await pool.connect();
        console.log("✅ Connected to PostgreSQL successfully!");
        const result = await client.query("SELECT NOW()");
        console.log("🕒 Current Time in DB:", result.rows[0].now);
        client.release();
    } catch (error) {
        console.error("❌ Database connection failed:", error);
    }
}

testDatabase();
