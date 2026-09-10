const { Pool } = require('pg');

function resolveSsl() {
  if (process.env.PGSSL === 'disable') return false;
  if (process.env.PGSSL === 'require') return { rejectUnauthorized: false };

  const url = process.env.DATABASE_URL || '';
  if (/[?&]sslmode=/i.test(url)) {
    // The connection string already specifies how to negotiate SSL (this is
    // how Replit's own managed Postgres, Neon, and Supabase URLs work) —
    // forcing our own `ssl` object here conflicts with that and breaks the
    // connection, so let pg parse it from the URL instead.
    return undefined;
  }

  // No sslmode in the URL and not explicitly disabled: assume a managed
  // Postgres provider that still requires SSL even though its URL doesn't
  // say so. Local/dev databases (no sslmode, NODE_ENV !== production) skip this.
  return process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false;
}

const ssl = resolveSsl();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ...(ssl !== undefined ? { ssl } : {}),
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

    ALTER TABLE events ADD COLUMN IF NOT EXISTS image_data BYTEA;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS image_mime TEXT;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS template_id TEXT;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS invite_mode TEXT NOT NULL DEFAULT 'open';

    CREATE TABLE IF NOT EXISTS event_invites (
      event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (event_id, email)
    );

    -- Capacity: NULL means unlimited, which is what every existing event stays.
    ALTER TABLE events ADD COLUMN IF NOT EXISTS capacity INT;

    -- 'confirmed' | 'waitlist' | 'declined'. The older attending boolean is
    -- kept in sync alongside it so nothing that still reads it breaks, but
    -- status is the source of truth: an attending guest can be waitlisted.
    ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'confirmed';

    CREATE TABLE IF NOT EXISTS event_faqs (
      id UUID PRIMARY KEY,
      event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_event_faqs_event ON event_faqs(event_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_rsvps_event_status ON rsvps(event_id, status);
  `);

  // One-time, idempotent: rows that predate `status` all defaulted to
  // 'confirmed', but the ones that had declined should say so. Only ever
  // touches rows whose boolean and status disagree, so re-running is a no-op.
  await pool.query(
    `UPDATE rsvps SET status = 'declined' WHERE attending = false AND status = 'confirmed'`
  );
}

module.exports = { pool, init };
