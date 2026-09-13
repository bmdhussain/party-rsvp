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

    -- Phase 2: every reply gets an unguessable token, which is both the guest's
    -- ticket URL and, from phase 3, what the door scanner reads.
    ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS ticket_token TEXT;

    -- Phase 3: one row per guest who actually turned up. Separate from rsvps so
    -- a re-scan is an obvious no-op rather than an overwrite.
    CREATE TABLE IF NOT EXISTS checkins (
      rsvp_id UUID PRIMARY KEY REFERENCES rsvps(id) ON DELETE CASCADE,
      event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      checked_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      checked_in_by TEXT REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_checkins_event ON checkins(event_id);

    -- Phase 4: 'unlisted' keeps today's behaviour — link-only, invisible to
    -- browse. Going public is opt-in, per event, and never retroactive.
    ALTER TABLE events ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'unlisted';
    ALTER TABLE events ADD COLUMN IF NOT EXISTS category TEXT;

    -- Phase 5: a host has no public presence until they claim a handle.
    ALTER TABLE users ADD COLUMN IF NOT EXISTS handle TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS public_profile BOOLEAN NOT NULL DEFAULT false;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_handle ON users(lower(handle)) WHERE handle IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_events_browse ON events(visibility, event_date);

    -- Drafts: NULL means not yet published. The column is added with a
    -- default so every event that already exists is filled in as published
    -- and nobody's live invitation disappears; the default is then dropped so
    -- events created from now on start as drafts. On a re-run the ADD is a
    -- no-op and the DROP DEFAULT is harmless, so existing drafts stay drafts.
    ALTER TABLE events ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ DEFAULT now();
    ALTER TABLE events ALTER COLUMN published_at DROP DEFAULT;

    -- A small JPEG copy of the invitation for link previews. WhatsApp and
    -- others quietly drop preview images much over a few hundred KB, and the
    -- full artwork can be several MB.
    ALTER TABLE events ADD COLUMN IF NOT EXISTS og_image_data BYTEA;

    -- Custom forms. 'standalone' forms have their own public link; an 'rsvp'
    -- form holds extra questions asked on one event's RSVP form (at most one
    -- per event), and goes wherever that event goes.
    CREATE TABLE IF NOT EXISTS forms (
      id UUID PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      event_id UUID REFERENCES events(id) ON DELETE CASCADE,
      kind TEXT NOT NULL DEFAULT 'standalone',
      title TEXT NOT NULL,
      description TEXT,
      fields JSONB NOT NULL DEFAULT '[]'::jsonb,
      settings JSONB NOT NULL DEFAULT '{}'::jsonb,
      template_id TEXT,
      published_at TIMESTAMPTZ,
      closed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_forms_owner ON forms(owner_id, updated_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_forms_rsvp_event ON forms(event_id) WHERE kind = 'rsvp';

    -- Answers are keyed by question id, so they survive the host reordering or
    -- renaming questions. An RSVP's answers link to that RSVP, one set each.
    -- Where the event is, as coordinates, so the weather for it can be looked
    -- up. Separate from the location column, which is free text a host writes
    -- for guests ("at Maya's place") and which no geocoder can resolve.
    ALTER TABLE events ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS place_label TEXT;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS place_timezone TEXT;

    -- Site-wide settings the owner changes from /admin. One row, id = 1.
    -- Deliberately not where admin rights live: those come from the
    -- ADMIN_EMAILS environment variable, so writing to this table cannot
    -- make anyone an administrator.
    CREATE TABLE IF NOT EXISTS site_settings (
      id INT PRIMARY KEY DEFAULT 1,
      theme TEXT NOT NULL DEFAULT 'default',
      doodle TEXT NOT NULL DEFAULT 'none',
      logo_data BYTEA,
      logo_mime TEXT,
      logo_updated_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      CONSTRAINT site_settings_single_row CHECK (id = 1)
    );

    CREATE TABLE IF NOT EXISTS form_responses (
      id UUID PRIMARY KEY,
      form_id UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
      rsvp_id UUID REFERENCES rsvps(id) ON DELETE CASCADE,
      respondent_email TEXT,
      answers JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_form_responses_form ON form_responses(form_id, created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_form_responses_rsvp ON form_responses(rsvp_id) WHERE rsvp_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_form_responses_email ON form_responses(form_id, lower(respondent_email));
  `);

  // One-time, idempotent: rows that predate `status` all defaulted to
  // 'confirmed', but the ones that had declined should say so. Only ever
  // touches rows whose boolean and status disagree, so re-running is a no-op.
  await pool.query(
    `UPDATE rsvps SET status = 'declined' WHERE attending = false AND status = 'confirmed'`
  );

  // Backfill tickets for replies made before tokens existed. gen_random_uuid()
  // is core Postgres from 13 on, so this needs no extension.
  await pool.query(
    `UPDATE rsvps SET ticket_token = replace(gen_random_uuid()::text, '-', '')
     WHERE ticket_token IS NULL`
  );

  // Added after the backfill so it can't trip over the pre-existing NULLs.
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_rsvps_ticket ON rsvps(ticket_token)
     WHERE ticket_token IS NOT NULL`
  );
}

module.exports = { pool, init };
