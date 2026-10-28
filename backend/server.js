const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// PostgreSQL Connection Pool
// Render injects DATABASE_URL automatically in production
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Self-initializing table schema
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS grievances (
        id SERIAL PRIMARY KEY,
        ticket_id VARCHAR(32) UNIQUE NOT NULL,
        stream VARCHAR(64) NOT NULL,
        branch VARCHAR(64) NOT NULL,
        hall VARCHAR(64) NOT NULL,
        category VARCHAR(64) NOT NULL,
        description TEXT NOT NULL,
        contact VARCHAR(64),
        status VARCHAR(64) DEFAULT 'Scheduled for Court Action',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    console.log('Database initialized: grievances table ready.');
  } catch (err) {
    console.error('Error initializing database table:', err.message);
  }
}
initDB();

// Health Check Endpoint
app.get('/', (req, res) => {
  res.send('ZHCET AMUSU 2026 Grievance Tracking API is live.');
});

// GET: Fetch latest 25 grievances for the live docket table
app.get('/api/grievances', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT ticket_id, stream, branch, hall, category, description, status, created_at FROM grievances ORDER BY created_at DESC LIMIT 25'
    );
    res.status(200).json(rows);
  } catch (err) {
    console.error('GET /api/grievances error:', err.message);
    res.status(500).json({ error: 'Database read failure' });
  }
});

// POST: Register a new grievance & return generated Ticket ID
app.post('/api/grievances', async (req, res) => {
  try {
    const { stream, branch, hall, category, description, contact } = req.body;

    if (!stream || !branch || !hall || !category || !description) {
      return res.status(400).json({ error: 'All primary fields are required.' });
    }

    // Determine prefix based on student stream
    let prefix = 'ZHCET';
    if (stream.includes('Polytechnic')) prefix = 'POLY';
    else if (stream.includes('BArch')) prefix = 'BARCH';
    else if (stream.includes('Evening')) prefix = 'BEEVE';

    // Generate unique sequential ticket ID
    const countRes = await pool.query('SELECT COUNT(*) FROM grievances');
    const seq = String(parseInt(countRes.rows[0].count, 10) + 1).padStart(4, '0');
    const ticket_id = `${prefix}-2026-T${seq}`;

    const insertQuery = `
      INSERT INTO grievances (ticket_id, stream, branch, hall, category, description, contact, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'Scheduled for Court Action')
      RETURNING *;
    `;
    const values = [ticket_id, stream, branch, hall, category, description, contact || null];
    const { rows } = await pool.query(insertQuery, values);

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /api/grievances error:', err.message);
    res.status(500).json({ error: 'Database insert failure' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`ZHCET Grievance API server running on port ${PORT}`);
});