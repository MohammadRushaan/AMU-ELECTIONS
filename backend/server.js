const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

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
        status VARCHAR(64) DEFAULT 'Registered & Scheduled',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    console.log('Database initialized: grievances table ready.');
  } catch (err) {
    console.error('Error initializing database:', err.message);
  }
}
initDB();

app.get('/', (req, res) => {
  res.send('ZHCET AMUSU 2026 Grievance Tracking API is live.');
});

// GET: Live aggregated metrics for the public count cards
app.get('/api/grievances/stats', async (req, res) => {
  try {
    const totalRes = await pool.query('SELECT COUNT(*) FROM grievances');
    const resolvedRes = await pool.query("SELECT COUNT(*) FROM grievances WHERE status ILIKE '%Resolved%' OR status ILIKE '%Redressed%'");
    const activeRes = await pool.query("SELECT COUNT(*) FROM grievances WHERE status NOT ILIKE '%Resolved%' AND status NOT ILIKE '%Redressed%'");

    res.status(200).json({
      total: parseInt(totalRes.rows[0].count, 10),
      resolved: parseInt(resolvedRes.rows[0].count, 10),
      active: parseInt(activeRes.rows[0].count, 10)
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// GET: Public docket (strictly limits to the 5 most recent records)
app.get('/api/grievances', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT ticket_id, stream, branch, hall, category, description, status, created_at FROM grievances ORDER BY created_at DESC LIMIT 5'
    );
    res.status(200).json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Database read failure' });
  }
});

// GET: Admin feed (fetches ALL grievances with contact info for candidate team)
app.get('/api/grievances/admin-all', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM grievances ORDER BY created_at DESC'
    );
    res.status(200).json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Database read failure' });
  }
});

// POST: Register new issue from voter
app.post('/api/grievances', async (req, res) => {
  try {
    const { stream, branch, hall, category, description, contact } = req.body;

    if (!stream || !branch || !hall || !category || !description) {
      return res.status(400).json({ error: 'All primary fields are required.' });
    }

    let prefix = 'ZHCET';
    if (stream.includes('Polytechnic')) prefix = 'POLY';
    else if (stream.includes('BArch')) prefix = 'BARCH';
    else if (stream.includes('Evening')) prefix = 'BEEVE';

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
    res.status(500).json({ error: 'Database insert failure' });
  }
});

// PATCH: Candidate updates status (e.g., Tabled in Court, Resolved)
app.patch('/api/grievances/:ticket_id', async (req, res) => {
  try {
    const { ticket_id } = req.params;
    const { status } = req.body;

    const updateQuery = `
      UPDATE grievances SET status = $1 WHERE ticket_id = $2 RETURNING *;
    `;
    const { rows } = await pool.query(updateQuery, [status, ticket_id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found.' });
    }
    res.status(200).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Update failure' });
  }
});

// DELETE: Remove a grievance permanently from PostgreSQL
app.delete('/api/grievances/:ticket_id', async (req, res) => {
  try {
    const { ticket_id } = req.params;
    const deleteRes = await pool.query('DELETE FROM grievances WHERE ticket_id = $1 RETURNING *;', [ticket_id]);
    
    if (deleteRes.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found.' });
    }
    res.status(200).json({ message: 'Grievance deleted successfully', deleted: deleteRes.rows[0] });
  } catch (err) {
    console.error('DELETE error:', err.message);
    res.status(500).json({ error: 'Database delete failure' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`API active on port ${PORT}`));