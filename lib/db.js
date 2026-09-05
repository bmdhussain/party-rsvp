const { Pool } = require('pg');

function resolveSsl() {
  if (process.env.PGSSL === 'disable') return false;
  if (process.env.PGSSL === 'require') return { rejectUnauthorized: false };
  const url = process.env.DATABASE_URL || '';
  if (/sslmode=require/.test(url) || process.env.NODE_ENV === 'production') {
    return { rejectUnauthorized: false };
  }
  return false;
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: resolveSsl(),
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT,
      avatar_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS events (
      id UUID PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      event_date TIMESTAMPTZ,
      location TEXT,
      description TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS rsvps (
      id UUID PRIMARY KEY,
      event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      attending BOOLEAN NOT NULL,
      adults INT NOT NULL DEFAULT 0,
      kids INT NOT NULL DEFAULT 0,
      comment TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_events_owner ON events(owner_id);
    CREATE INDEX IF NOT EXISTS idx_rsvps_event ON rsvps(event_id);
  `);
}

module.exports = { pool, init };
