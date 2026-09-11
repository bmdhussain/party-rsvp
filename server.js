require('dotenv').config();
const crypto = require('crypto');
const path = require('path');
const express = require('express');
const session = require('express-session');
const pgSessionFactory = require('connect-pg-simple');
const rateLimit = require('express-rate-limit');
const multer = require('multer');

const { pool, init } = require('./lib/db');
const { passport, providers } = require('./lib/auth');
const { TEMPLATES, findTemplate } = require('./lib/templates');
const { parseCapacity, confirmedHeadcount, promoteFromWaitlist } = require('./lib/capacity');
const { buildEventIcs, icsFilename } = require('./lib/ics');
const {
  CATEGORIES,
  normalizeVisibility,
  normalizeCategory,
  normalizeHandle,
  buildBrowseQuery,
} = require('./lib/discovery');
const { toCsv, csvFilename } = require('./lib/csv');
const { setupProgress, publishBlocker } = require('./lib/setup');
const { registerPages } = require('./lib/pages');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      return cb(new Error('Only JPEG, PNG, or WebP images are allowed.'));
    }
    cb(null, true);
  },
});

const PORT = process.env.PORT || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const BREVO_SENDER = {
  name: process.env.BREVO_SENDER_NAME || 'RSVPfor',
  email: process.env.BREVO_SENDER_EMAIL || 'organizer@rsvpfor.com',
};
const BREVO_REPLY_TO = process.env.BREVO_REPLY_TO || BREVO_SENDER.email;

if (!process.env.DATABASE_URL) {
  console.error(
    'Missing DATABASE_URL. This app needs a Postgres database — set DATABASE_URL ' +
      '(Replit: enable the Database pane; elsewhere: any free Postgres like Neon/Supabase).'
  );
  process.exit(1);
}

if (IS_PRODUCTION && !process.env.SESSION_SECRET) {
  console.warn(
    'WARNING: SESSION_SECRET is not set. Using an insecure default — set a real ' +
      'SESSION_SECRET before real users log in.'
  );
}

const app = express();
app.set('trust proxy', 1);
app.use(express.json());

// The Replit workspace (*.replit.dev) is a development copy: tell every crawler
// to keep out of it entirely, images and API responses included, so it never
// competes with the real site in search results.
app.use((req, res, next) => {
  if (/\.replit\.dev$/i.test(req.hostname || '')) res.set('X-Robots-Tag', 'noindex, nofollow');
  next();
});

const PgSession = pgSessionFactory(session);
app.use(
  session({
    store: new PgSession({ pool, createTableIfMissing: true }),
    secret: process.env.SESSION_SECRET || 'dev-only-insecure-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: IS_PRODUCTION,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    },
  })
);
app.use(passport.initialize());
app.use(passport.session());

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not logged in.' });
  next();
}

// Only ever redirect back to a path on this site. A `next` value is
// visitor-controlled, so "//evil.example" or "https://…" would otherwise turn
// the login page into an open redirect.
function safeNext(value) {
  if (typeof value !== 'string') return null;
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return null;
  if (value.startsWith('/auth/') || value.startsWith('/login')) return null;
  return value.slice(0, 500);
}

// Sends a signed-out visitor to sign in, then back to exactly where they were
// heading — so "Create event" or a bookmarked event page picks up afterwards.
function requirePageAuth(req, res, next) {
  if (!req.user) return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
  next();
}

// Mitigates CSRF on authenticated, state-changing requests: same-site cookies
// (sameSite: 'lax') already block cross-site form/script submissions from
// carrying the session cookie in modern browsers; this is defense in depth.
function verifySameOrigin(req, res, next) {
  const origin = req.headers.origin || req.headers.referer;
  if (!origin) return next();
  try {
    if (new URL(origin).host !== req.headers.host) {
      return res.status(403).json({ error: 'Invalid request origin.' });
    }
  } catch {
    return res.status(403).json({ error: 'Invalid request origin.' });
  }
  next();
}

const rsvpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many RSVP attempts. Please try again later.' },
});

function makeShareUrl(req, slug) {
  return `${req.protocol}://${req.get('host')}/e/${slug}`;
}

function makeImageUrl(req, slug, hasImage) {
  return hasImage ? `${req.protocol}://${req.get('host')}/api/events/${slug}/image` : null;
}

// 122 bits of randomness, hex, no dashes — short enough to sit in a QR code
// comfortably and unguessable enough to be the only thing protecting a ticket.
function newTicketToken() {
  return crypto.randomUUID().replace(/-/g, '');
}

function escapeEmailHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function sendBrevoEmail({ to, subject, intro, event }) {
  const { ReplitConnectors } = await import('@replit/connectors-sdk');
  const connectors = new ReplitConnectors();
  const response = await connectors.proxy('brevo', '/smtp/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: BREVO_SENDER,
      replyTo: { email: BREVO_REPLY_TO },
      to: [{ email: to.email, name: to.name || undefined }],
      subject,
      textContent: [
        intro,
        '',
        `Event: ${event.name}`,
        event.event_date ? `When: ${new Date(event.event_date).toLocaleString()}` : '',
        event.location ? `Where: ${event.location}` : '',
        event.description || '',
        '',
        `Open the event page: ${event.shareUrl}`,
      ].filter(Boolean).join('\n'),
      htmlContent: `
        <div style="margin:0;background:#f5eee8;padding:32px 16px;font-family:Arial,sans-serif;color:#2f2237;">
          <div style="max-width:560px;margin:0 auto;background:#fffaf5;border-radius:22px;padding:36px 30px;box-shadow:0 12px 34px rgba(47,34,55,.12);">
            <div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#a66b43;font-weight:700;">RSVP<span style="text-transform:none;font-style:italic;letter-spacing:0;">for</span></div>
            <h1 style="font-family:Georgia,serif;font-size:34px;line-height:1.05;margin:14px 0 18px;color:#2f2237;">${escapeEmailHtml(event.name)}</h1>
            <p style="font-size:16px;line-height:1.65;margin:0 0 22px;">${escapeEmailHtml(intro)}</p>
            <div style="border-top:1px solid #eadfd7;border-bottom:1px solid #eadfd7;padding:16px 0;margin-bottom:24px;font-size:14px;line-height:1.8;">
              ${event.event_date ? `<div><strong>When:</strong> ${escapeEmailHtml(new Date(event.event_date).toLocaleString())}</div>` : ''}
              ${event.location ? `<div><strong>Where:</strong> ${escapeEmailHtml(event.location)}</div>` : ''}
              ${event.description ? `<div style="margin-top:8px;">${escapeEmailHtml(event.description)}</div>` : ''}
            </div>
            <a href="${escapeEmailHtml(event.shareUrl)}" style="display:inline-block;background:#2f2237;color:#fff;text-decoration:none;border-radius:10px;padding:13px 18px;font-weight:700;">Open invitation</a>
            <p style="font-size:12px;line-height:1.5;color:#76677c;margin:24px 0 0;">You can RSVP, check the latest details, and leave a note on the event page.</p>
          </div>
        </div>`,
    }),
  });

  const rawBody = await response.text();
  let body = {};
  try {
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    body = {};
  }
  if (!response.ok) {
    const providerMessage = body.message || body.code || 'Brevo could not send this email.';
    throw new Error(providerMessage);
  }
  return body;
}

// Fire-and-forget: a promotion must not fail because Brevo is over quota or
// down. Volume here is inherently small (only fires when room actually frees).
function notifyPromoted(promoted, event) {
  for (const guest of promoted) {
    sendBrevoEmail({
      to: { email: guest.email, name: guest.name },
      subject: `A spot opened up — ${event.name}`,
      intro:
        `Good news: a spot just opened up at ${event.name}, and you're off the ` +
        `waitlist. You're confirmed — we'll see you there.`,
      event,
    }).catch((err) => {
      console.error(`Waitlist promotion email failed for ${guest.email}:`, err.message);
    });
  }
}

// --- Auth ---

app.get('/api/auth/providers', (req, res) => res.json(providers));

app.get('/api/me', (req, res) => {
  if (!req.user) return res.json({ user: null });
  const { id, name, email, avatar_url } = req.user;
  res.json({ user: { id, name, email, avatarUrl: avatar_url } });
});

app.post('/auth/logout', (req, res) => {
  req.logout((err) => {
    if (err) return res.status(500).json({ error: 'Logout failed.' });
    res.json({ ok: true });
  });
});

// Remember where the visitor was heading before they leave for the provider.
function rememberNext(req, res, next) {
  const target = safeNext(req.query.next);
  if (target) req.session.returnTo = target;
  next();
}

function finishLogin(req, res) {
  const target = safeNext(req.session.returnTo) || '/dashboard';
  delete req.session.returnTo;
  res.redirect(target);
}

// keepSessionInfo carries returnTo across the session regeneration passport
// does at login (its defence against session fixation), which would
// otherwise wipe it.
if (providers.google) {
  app.get('/auth/google', rememberNext, passport.authenticate('google', { scope: ['profile', 'email'] }));
  app.get(
    '/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/login?failed=1', keepSessionInfo: true }),
    finishLogin
  );
}

if (providers.facebook) {
  app.get('/auth/facebook', rememberNext, passport.authenticate('facebook', { scope: ['email'] }));
  app.get(
    '/auth/facebook/callback',
    passport.authenticate('facebook', { failureRedirect: '/login?failed=1', keepSessionInfo: true }),
    finishLogin
  );
}

// --- Events (host, authenticated) ---

app.get('/api/templates', (req, res) => {
  res.json(
    TEMPLATES.map((t) => ({
      id: t.id,
      label: t.label,
      category: t.category,
      previewUrl: `/templates/${t.file}`,
      sourceName: t.sourceName,
      sourceUrl: t.sourceUrl,
    }))
  );
});

app.get('/api/categories', (req, res) => res.json(CATEGORIES));

// --- Public discovery ---

app.get('/api/browse', async (req, res) => {
  const { sql, params } = buildBrowseQuery({
    q: req.query.q,
    category: req.query.category,
    when: req.query.when,
    where: req.query.where,
    limit: req.query.limit,
    offset: req.query.offset,
  });
  const { rows } = await pool.query(sql, params);
  res.json(
    rows.map((r) => ({
      slug: r.slug,
      name: r.name,
      event_date: r.event_date,
      location: r.location,
      category: r.category,
      going: r.going,
      spotsLeft: r.capacity === null ? null : Math.max(0, r.capacity - r.going),
      isFull: r.capacity !== null && r.going >= r.capacity,
      hostName: r.host_name,
      hostHandle: r.host_handle,
      shareUrl: makeShareUrl(req, r.slug),
      imageUrl: makeImageUrl(req, r.slug, r.has_image),
    }))
  );
});

// A host profile exists publicly only if they claimed a handle AND switched the
// profile on. Their unlisted events never appear here.
app.get('/api/hosts/:handle', async (req, res) => {
  const handle = normalizeHandle(req.params.handle);
  if (!handle) return res.status(404).json({ error: 'Host not found.' });

  const { rows: hostRows } = await pool.query(
    `SELECT id, name, handle, bio, avatar_url, created_at FROM users
     WHERE lower(handle) = $1 AND public_profile = true`,
    [handle]
  );
  if (!hostRows[0]) return res.status(404).json({ error: 'Host not found.' });
  const host = hostRows[0];

  const { rows: events } = await pool.query(
    `SELECT e.slug, e.name, e.event_date, e.location, e.category, e.capacity,
            (e.image_data IS NOT NULL OR e.template_id IS NOT NULL) AS has_image,
            COALESCE(SUM(CASE WHEN r.status = 'confirmed' THEN r.adults + r.kids END), 0)::int AS going
     FROM events e
     LEFT JOIN rsvps r ON r.event_id = e.id
     WHERE e.owner_id = $1 AND e.visibility = 'public' AND e.published_at IS NOT NULL
     GROUP BY e.id, e.slug, e.name, e.event_date, e.location, e.category, e.capacity,
              e.image_data, e.template_id
     ORDER BY e.event_date DESC NULLS LAST`,
    [host.id]
  );

  const now = Date.now();
  const shape = (e) => ({
    slug: e.slug,
    name: e.name,
    event_date: e.event_date,
    location: e.location,
    category: e.category,
    going: e.going,
    shareUrl: makeShareUrl(req, e.slug),
    imageUrl: makeImageUrl(req, e.slug, e.has_image),
  });
  const isUpcoming = (e) => e.event_date && new Date(e.event_date).getTime() > now;

  res.json({
    host: {
      name: host.name,
      handle: host.handle,
      bio: host.bio,
      avatarUrl: host.avatar_url,
      hostingSince: host.created_at,
    },
    upcoming: events.filter(isUpcoming).sort((a, b) => new Date(a.event_date) - new Date(b.event_date)).map(shape),
    past: events.filter((e) => !isUpcoming(e)).map(shape),
  });
});

// --- Host's own public profile settings ---

app.get('/api/me/profile', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT name, handle, bio, public_profile, avatar_url FROM users WHERE id = $1',
    [req.user.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found.' });
  res.json({
    name: rows[0].name,
    handle: rows[0].handle,
    bio: rows[0].bio,
    publicProfile: rows[0].public_profile,
    avatarUrl: rows[0].avatar_url,
    profileUrl: rows[0].handle ? `${req.protocol}://${req.get('host')}/@${rows[0].handle}` : null,
  });
});

app.put('/api/me/profile', requireAuth, verifySameOrigin, async (req, res) => {
  const body = req.body || {};
  const wantsPublic = body.publicProfile === true;

  let handle = null;
  if (typeof body.handle === 'string' && body.handle.trim()) {
    handle = normalizeHandle(body.handle);
    if (!handle) {
      return res.status(400).json({
        error:
          'Handles are 3–30 characters, lowercase letters, numbers and underscores only, and a few common words are reserved.',
      });
    }
  }

  // A profile with no handle has no URL to live at, so it can't be public.
  if (wantsPublic && !handle) {
    return res.status(400).json({ error: 'Choose a handle before making your profile public.' });
  }

  try {
    const { rows } = await pool.query(
      `UPDATE users SET handle = $1, bio = $2, public_profile = $3 WHERE id = $4
       RETURNING handle, bio, public_profile`,
      [handle, typeof body.bio === 'string' ? body.bio.trim().slice(0, 600) : null, wantsPublic, req.user.id]
    );
    res.json({
      ok: true,
      handle: rows[0].handle,
      bio: rows[0].bio,
      publicProfile: rows[0].public_profile,
      profileUrl: rows[0].handle ? `${req.protocol}://${req.get('host')}/@${rows[0].handle}` : null,
    });
  } catch (err) {
    // The unique index on lower(handle) is what actually guarantees uniqueness;
    // checking first would still race.
    if (err.code === '23505') {
      return res.status(409).json({ error: 'That handle is already taken.' });
    }
    throw err;
  }
});

// The host's events with everything the dashboard and event list need to show
// progress and state without a second round trip per card.
async function listHostEvents(req, ownerId) {
  const { rows } = await pool.query(
    `SELECT e.id, e.slug, e.name, e.event_date, e.location, e.created_at, e.published_at,
            e.visibility, e.capacity,
            (e.image_data IS NOT NULL OR e.template_id IS NOT NULL) AS has_image,
            count(r.id)::int AS rsvp_count,
            COALESCE(SUM(CASE WHEN r.status = 'confirmed' THEN r.adults + r.kids END), 0)::int AS going
     FROM events e
     LEFT JOIN rsvps r ON r.event_id = e.id
     WHERE e.owner_id = $1
     GROUP BY e.id
     ORDER BY e.created_at DESC`,
    [ownerId]
  );
  const now = Date.now();
  return rows.map((r) => ({
    ...r,
    // One word for where the event is in its life, so the list can group it.
    phase: !r.published_at
      ? 'draft'
      : r.event_date && new Date(r.event_date).getTime() < now
        ? 'past'
        : 'upcoming',
    setup: setupProgress(r),
    shareUrl: makeShareUrl(req, r.slug),
    imageUrl: makeImageUrl(req, r.slug, r.has_image),
  }));
}

app.get('/api/events', requireAuth, async (req, res) => {
  res.json(await listHostEvents(req, req.user.id));
});

// New events start as drafts: the invitation isn't reachable by guests until
// the host publishes it.
app.post('/api/events', requireAuth, verifySameOrigin, async (req, res) => {
  const { name, date, location, description, category } = req.body || {};
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Event name is required.' });
  }

  const id = crypto.randomUUID();
  const slug = crypto.randomBytes(6).toString('base64url');
  const eventDate = date ? new Date(date) : null;

  await pool.query(
    `INSERT INTO events (id, slug, owner_id, name, event_date, location, description, category)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      slug,
      req.user.id,
      name.trim().slice(0, 150),
      eventDate && !Number.isNaN(eventDate.getTime()) ? eventDate : null,
      (location || '').trim().slice(0, 300),
      (description || '').trim().slice(0, 1000),
      normalizeCategory(category),
    ]
  );

  res.json({ id, slug, shareUrl: makeShareUrl(req, slug) });
});

app.post('/api/events/:eventId/publish', requireAuth, verifySameOrigin, async (req, res) => {
  const publish = req.body?.published !== false;
  const { rows } = await pool.query(
    'SELECT id, name, event_date, published_at FROM events WHERE id = $1 AND owner_id = $2',
    [req.params.eventId, req.user.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Event not found.' });

  if (publish) {
    const blocker = publishBlocker(rows[0]);
    if (blocker) return res.status(400).json({ error: blocker });
  }

  // Re-publishing keeps the original publish time rather than bumping it.
  const { rows: updated } = await pool.query(
    `UPDATE events SET published_at = CASE WHEN $1 THEN COALESCE(published_at, now()) ELSE NULL END
     WHERE id = $2 RETURNING published_at`,
    [publish, req.params.eventId]
  );
  res.json({ ok: true, published: Boolean(updated[0].published_at), publishedAt: updated[0].published_at });
});

// "Host it again": a fresh draft with everything carried over except the
// date (which the host must pick) and the guests. FAQ entries come too, since
// "is there parking?" rarely changes between one year's party and the next.
app.post('/api/events/:eventId/duplicate', requireAuth, verifySameOrigin, async (req, res) => {
  const newId = crypto.randomUUID();
  const newSlug = crypto.randomBytes(6).toString('base64url');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rowCount } = await client.query(
      `INSERT INTO events (id, slug, owner_id, name, event_date, location, description,
                           image_data, image_mime, og_image_data, template_id, invite_mode,
                           capacity, visibility, category, published_at)
       SELECT $1, $2, owner_id, name, NULL, location, description,
              image_data, image_mime, og_image_data, template_id, invite_mode,
              capacity, visibility, category, NULL
       FROM events WHERE id = $3 AND owner_id = $4`,
      [newId, newSlug, req.params.eventId, req.user.id]
    );
    if (!rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Event not found.' });
    }
    await client.query(
      `INSERT INTO event_faqs (id, event_id, question, answer, sort_order)
       SELECT gen_random_uuid(), $1, question, answer, sort_order FROM event_faqs WHERE event_id = $2`,
      [newId, req.params.eventId]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Duplicating event failed:', err);
    return res.status(500).json({ error: 'Could not copy this event.' });
  } finally {
    client.release();
  }
  res.json({ ok: true, id: newId, slug: newSlug });
});

// Recent replies across all the host's events — the "something happened while
// you were away" feed that brings them back to the dashboard.
app.get('/api/me/activity', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT r.name, r.status, r.adults, r.kids, r.created_at, e.id AS event_id, e.name AS event_name
     FROM rsvps r JOIN events e ON e.id = r.event_id
     WHERE e.owner_id = $1
     ORDER BY r.created_at DESC
     LIMIT 8`,
    [req.user.id]
  );
  res.json(rows);
});

app.patch('/api/events/:eventId', requireAuth, verifySameOrigin, async (req, res) => {
  const { name, date, location, description } = req.body || {};
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Event name is required.' });
  }
  const eventDate = date ? new Date(date) : null;
  // An absent `capacity` key leaves the limit alone; an empty one clears it
  // back to unlimited.
  const body = req.body || {};
  const hasCapacity = Object.prototype.hasOwnProperty.call(body, 'capacity');
  const hasVisibility = Object.prototype.hasOwnProperty.call(body, 'visibility');
  const hasCategory = Object.prototype.hasOwnProperty.call(body, 'category');

  const { rows } = await pool.query(
    `UPDATE events SET name = $1, event_date = $2, location = $3, description = $4,
                       capacity = CASE WHEN $5 THEN $6::int ELSE capacity END,
                       visibility = CASE WHEN $7 THEN $8::text ELSE visibility END,
                       category = CASE WHEN $9 THEN $10::text ELSE category END
     WHERE id = $11 AND owner_id = $12
     RETURNING id, slug, name, event_date, location, description, capacity, visibility, category`,
    [
      name.trim().slice(0, 150),
      eventDate && !Number.isNaN(eventDate.getTime()) ? eventDate : null,
      (location || '').trim().slice(0, 300),
      (description || '').trim().slice(0, 1000),
      hasCapacity,
      hasCapacity ? parseCapacity(body.capacity) : null,
      hasVisibility,
      hasVisibility ? normalizeVisibility(body.visibility) : null,
      hasCategory,
      hasCategory ? normalizeCategory(body.category) : null,
      req.params.eventId,
      req.user.id,
    ]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Event not found.' });

  // Raising (or removing) the limit is the other way room appears. Safe to run
  // unconditionally — it's a no-op when the waitlist is empty or still can't fit.
  let promotedCount = 0;
  if (hasCapacity) {
    try {
      const promoted = await promoteFromWaitlist(rows[0].id);
      promotedCount = promoted.length;
      if (promoted.length) {
        notifyPromoted(promoted, { ...rows[0], shareUrl: makeShareUrl(req, rows[0].slug) });
      }
    } catch (err) {
      console.error('Waitlist promotion failed after capacity change:', err);
    }
  }

  res.json({ ok: true, shareUrl: makeShareUrl(req, rows[0].slug), promoted: promotedCount });
});

app.post(
  '/api/events/:eventId/image',
  requireAuth,
  verifySameOrigin,
  upload.single('image'),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No image uploaded.' });

    // A new image makes any existing preview copy stale, so it's cleared here;
    // the studio uploads a fresh one straight after saving.
    const { rowCount } = await pool.query(
      `UPDATE events SET image_data = $1, image_mime = $2, template_id = NULL, og_image_data = NULL
       WHERE id = $3 AND owner_id = $4`,
      [req.file.buffer, req.file.mimetype, req.params.eventId, req.user.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Event not found.' });
    res.json({ ok: true });
  }
);

// The small link-preview copy. Capped well under the main upload limit: if the
// browser can't get it this small, a preview isn't worth sending.
const ogUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 450 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'image/jpeg') return cb(new Error('Preview images must be JPEG.'));
    cb(null, true);
  },
});

app.post(
  '/api/events/:eventId/og-image',
  requireAuth,
  verifySameOrigin,
  ogUpload.single('image'),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No image uploaded.' });
    const { rowCount } = await pool.query(
      'UPDATE events SET og_image_data = $1 WHERE id = $2 AND owner_id = $3',
      [req.file.buffer, req.params.eventId, req.user.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Event not found.' });
    res.json({ ok: true });
  }
);

app.post('/api/events/:eventId/template', requireAuth, verifySameOrigin, async (req, res) => {
  const template = findTemplate(req.body?.templateId);
  if (!template) return res.status(400).json({ error: 'Unknown template.' });

  const { rowCount } = await pool.query(
    `UPDATE events SET template_id = $1, image_data = NULL, image_mime = NULL, og_image_data = NULL
     WHERE id = $2 AND owner_id = $3`,
    [template.id, req.params.eventId, req.user.id]
  );
  if (!rowCount) return res.status(404).json({ error: 'Event not found.' });
  res.json({ ok: true });
});

app.delete('/api/events/:eventId', requireAuth, verifySameOrigin, async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM events WHERE id = $1 AND owner_id = $2', [
    req.params.eventId,
    req.user.id,
  ]);
  if (!rowCount) return res.status(404).json({ error: 'Event not found.' });
  res.json({ ok: true });
});

app.get('/api/events/:eventId/host', requireAuth, async (req, res) => {
  const { rows: eventRows } = await pool.query(
    `SELECT id, slug, owner_id, name, event_date, location, description, created_at, invite_mode,
            capacity, visibility, category, published_at,
            (image_data IS NOT NULL OR template_id IS NOT NULL) AS has_image,
            (SELECT count(*)::int FROM event_faqs f WHERE f.event_id = events.id) AS faq_count
     FROM events WHERE id = $1 AND owner_id = $2`,
    [req.params.eventId, req.user.id]
  );
  if (!eventRows[0]) return res.status(404).json({ error: 'Event not found.' });

  // Waitlisted guests read oldest-first (that's the promotion order); everyone
  // else reads newest-first, as the host list always has.
  const { rows: rsvps } = await pool.query(
    `SELECT r.*, c.checked_in_at FROM rsvps r
     LEFT JOIN checkins c ON c.rsvp_id = r.id
     WHERE r.event_id = $1
     ORDER BY CASE WHEN r.status = 'waitlist' THEN 0 ELSE 1 END,
              CASE WHEN r.status = 'waitlist' THEN r.created_at END ASC,
              r.created_at DESC`,
    [req.params.eventId]
  );

  const totals = rsvps.reduce(
    (acc, r) => {
      if (r.status === 'confirmed') {
        acc.adults += r.adults;
        acc.kids += r.kids;
        acc.attendingCount += 1;
        if (r.checked_in_at) {
          acc.checkedInCount += 1;
          acc.checkedInHeads += r.adults + r.kids;
        }
      } else if (r.status === 'waitlist') {
        acc.waitlistCount += 1;
        acc.waitlistHeads += r.adults + r.kids;
      } else {
        acc.declinedCount += 1;
      }
      return acc;
    },
    {
      adults: 0,
      kids: 0,
      attendingCount: 0,
      declinedCount: 0,
      waitlistCount: 0,
      waitlistHeads: 0,
      checkedInCount: 0,
      checkedInHeads: 0,
    }
  );

  const capacity = eventRows[0].capacity;
  res.json({
    event: {
      ...eventRows[0],
      shareUrl: makeShareUrl(req, eventRows[0].slug),
      imageUrl: makeImageUrl(req, eventRows[0].slug, eventRows[0].has_image),
      spotsLeft: capacity === null ? null : Math.max(0, capacity - (totals.adults + totals.kids)),
    },
    setup: setupProgress({ ...eventRows[0], rsvp_count: rsvps.length }),
    publishBlocker: publishBlocker(eventRows[0]),
    rsvps,
    totals,
  });
});

app.post('/api/events/:eventId/email', requireAuth, verifySameOrigin, async (req, res) => {
  const recipientMode = req.body?.recipientMode;
  const recipientQueries = {
    all_rsvps: {
      sql: `SELECT lower(email) AS email, max(name) AS name
            FROM rsvps WHERE event_id = $1 GROUP BY lower(email) LIMIT 500`,
      label: 'RSVP guests',
    },
    attending: {
      // Confirmed only — a waitlisted guest still has `attending` true but
      // hasn't got a spot, so they shouldn't get "see you there" mail.
      sql: `SELECT lower(email) AS email, max(name) AS name
            FROM rsvps WHERE event_id = $1 AND status = 'confirmed'
            GROUP BY lower(email) LIMIT 500`,
      label: 'attending guests',
    },
    waitlist: {
      sql: `SELECT lower(email) AS email, max(name) AS name
            FROM rsvps WHERE event_id = $1 AND status = 'waitlist'
            GROUP BY lower(email) LIMIT 500`,
      label: 'waitlisted guests',
    },
    restricted: {
      sql: `SELECT i.email, max(r.name) AS name
            FROM event_invites i
            LEFT JOIN rsvps r ON r.event_id = i.event_id AND lower(r.email) = i.email
            WHERE i.event_id = $1 GROUP BY i.email LIMIT 500`,
      label: 'the guest list',
    },
  };
  const recipientQuery = recipientQueries[recipientMode];
  if (!recipientQuery) return res.status(400).json({ error: 'Invalid recipient group.' });

  const { rows: eventRows } = await pool.query(
    `SELECT id, slug, name, event_date, location, description
     FROM events WHERE id = $1 AND owner_id = $2`,
    [req.params.eventId, req.user.id]
  );
  if (!eventRows[0]) return res.status(404).json({ error: 'Event not found.' });

  const { rows: recipients } = await pool.query(recipientQuery.sql, [req.params.eventId]);
  if (!recipients.length) {
    return res.status(400).json({ error: `There are no ${recipientQuery.label} to email yet.` });
  }

  const event = {
    ...eventRows[0],
    shareUrl: makeShareUrl(req, eventRows[0].slug),
  };
  const subject =
    typeof req.body?.subject === 'string' && req.body.subject.trim()
      ? req.body.subject.trim().slice(0, 180)
      : `You're invited — ${event.name}`;
  const intro =
    typeof req.body?.intro === 'string' && req.body.intro.trim()
      ? req.body.intro.trim().slice(0, 1000)
      : `You're invited to ${event.name}. We would love to have you there.`;

  const results = [];
  for (let index = 0; index < recipients.length; index += 20) {
    const batch = recipients.slice(index, index + 20);
    results.push(
      ...(await Promise.allSettled(
        batch.map((recipient) =>
          sendBrevoEmail({ to: recipient, subject, intro, event })
        )
      ))
    );
  }

  const sent = results.filter((result) => result.status === 'fulfilled').length;
  const failed = results.length - sent;
  const firstFailure = results.find((result) => result.status === 'rejected');
  const status = failed ? (sent ? 207 : 502) : 200;
  res.status(status).json({
    ok: sent > 0,
    sent,
    failed,
    ...(firstFailure ? { error: firstFailure.reason?.message || 'Some emails could not be sent.' } : {}),
  });
});

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

app.post('/api/events/:eventId/invite-mode', requireAuth, verifySameOrigin, async (req, res) => {
  const mode = req.body?.mode;
  if (mode !== 'open' && mode !== 'restricted') {
    return res.status(400).json({ error: 'Invalid invite mode.' });
  }
  const { rowCount } = await pool.query(
    'UPDATE events SET invite_mode = $1 WHERE id = $2 AND owner_id = $3',
    [mode, req.params.eventId, req.user.id]
  );
  if (!rowCount) return res.status(404).json({ error: 'Event not found.' });
  res.json({ ok: true });
});

app.get('/api/events/:eventId/invites', requireAuth, async (req, res) => {
  const { rows: eventRows } = await pool.query(
    'SELECT id FROM events WHERE id = $1 AND owner_id = $2',
    [req.params.eventId, req.user.id]
  );
  if (!eventRows[0]) return res.status(404).json({ error: 'Event not found.' });

  const { rows } = await pool.query(
    `SELECT i.email, i.created_at,
            EXISTS (
              SELECT 1 FROM rsvps r WHERE r.event_id = i.event_id AND lower(r.email) = i.email
            ) AS responded
     FROM event_invites i
     WHERE i.event_id = $1
     ORDER BY i.created_at DESC`,
    [req.params.eventId]
  );
  res.json(rows);
});

app.post('/api/events/:eventId/invites', requireAuth, verifySameOrigin, async (req, res) => {
  const { rows: eventRows } = await pool.query(
    'SELECT id FROM events WHERE id = $1 AND owner_id = $2',
    [req.params.eventId, req.user.id]
  );
  if (!eventRows[0]) return res.status(404).json({ error: 'Event not found.' });

  const rawEmails = Array.isArray(req.body?.emails) ? req.body.emails : [];
  const emails = [...new Set(rawEmails.map(normalizeEmail))].filter(
    (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
  );
  if (!emails.length) {
    return res.status(400).json({ error: 'No valid email addresses found.' });
  }

  for (const email of emails.slice(0, 500)) {
    await pool.query(
      `INSERT INTO event_invites (event_id, email) VALUES ($1, $2)
       ON CONFLICT (event_id, email) DO NOTHING`,
      [req.params.eventId, email]
    );
  }
  res.json({ ok: true, added: emails.length });
});

app.delete('/api/events/:eventId/invites/:email', requireAuth, verifySameOrigin, async (req, res) => {
  const { rows: eventRows } = await pool.query(
    'SELECT id FROM events WHERE id = $1 AND owner_id = $2',
    [req.params.eventId, req.user.id]
  );
  if (!eventRows[0]) return res.status(404).json({ error: 'Event not found.' });

  await pool.query('DELETE FROM event_invites WHERE event_id = $1 AND email = $2', [
    req.params.eventId,
    normalizeEmail(req.params.email),
  ]);
  res.json({ ok: true });
});

// --- FAQ (host) ---

app.get('/api/events/:eventId/faqs', requireAuth, async (req, res) => {
  const { rows: eventRows } = await pool.query(
    'SELECT id FROM events WHERE id = $1 AND owner_id = $2',
    [req.params.eventId, req.user.id]
  );
  if (!eventRows[0]) return res.status(404).json({ error: 'Event not found.' });

  const { rows } = await pool.query(
    `SELECT question, answer FROM event_faqs
     WHERE event_id = $1 ORDER BY sort_order ASC, created_at ASC`,
    [req.params.eventId]
  );
  res.json(rows);
});

// Replaces the whole list in one transaction. The host edits the FAQ as a block
// in the studio, so per-row CRUD would only add round trips and reordering bugs.
app.put('/api/events/:eventId/faqs', requireAuth, verifySameOrigin, async (req, res) => {
  const incoming = Array.isArray(req.body?.faqs) ? req.body.faqs : null;
  if (!incoming) return res.status(400).json({ error: 'Expected a list of FAQs.' });

  // Half-filled rows are dropped rather than rejected — the editor always has a
  // blank pair at the bottom for the host to type into.
  const cleaned = incoming
    .map((f) => ({
      question: typeof f?.question === 'string' ? f.question.trim().slice(0, 200) : '',
      answer: typeof f?.answer === 'string' ? f.answer.trim().slice(0, 1000) : '',
    }))
    .filter((f) => f.question && f.answer)
    .slice(0, 30);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: eventRows } = await client.query(
      'SELECT id FROM events WHERE id = $1 AND owner_id = $2',
      [req.params.eventId, req.user.id]
    );
    if (!eventRows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Event not found.' });
    }

    await client.query('DELETE FROM event_faqs WHERE event_id = $1', [req.params.eventId]);
    for (const [index, faq] of cleaned.entries()) {
      await client.query(
        `INSERT INTO event_faqs (id, event_id, question, answer, sort_order)
         VALUES ($1, $2, $3, $4, $5)`,
        [crypto.randomUUID(), req.params.eventId, faq.question, faq.answer, index]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Saving FAQs failed:', err);
    return res.status(500).json({ error: 'Could not save the FAQ.' });
  } finally {
    client.release();
  }

  res.json({ ok: true, count: cleaned.length });
});

// --- Analytics & export (host) ---

app.get('/api/events/:eventId/analytics', requireAuth, async (req, res) => {
  const { rows: eventRows } = await pool.query(
    'SELECT id, capacity, event_date FROM events WHERE id = $1 AND owner_id = $2',
    [req.params.eventId, req.user.id]
  );
  if (!eventRows[0]) return res.status(404).json({ error: 'Event not found.' });
  const event = eventRows[0];

  const { rows: trend } = await pool.query(
    `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
            count(*)::int AS replies,
            count(*) FILTER (WHERE status = 'confirmed')::int AS confirmed
     FROM rsvps WHERE event_id = $1
     GROUP BY 1 ORDER BY 1 ASC`,
    [req.params.eventId]
  );

  const { rows: summaryRows } = await pool.query(
    `SELECT
       count(*) FILTER (WHERE status = 'confirmed')::int AS confirmed_replies,
       count(*) FILTER (WHERE status = 'waitlist')::int AS waitlisted,
       count(*) FILTER (WHERE status = 'declined')::int AS declined,
       COALESCE(SUM(CASE WHEN status = 'confirmed' THEN adults + kids END), 0)::int AS confirmed_heads
     FROM rsvps WHERE event_id = $1`,
    [req.params.eventId]
  );
  const summary = summaryRows[0];

  const { rows: checkinRows } = await pool.query(
    `SELECT count(*)::int AS checked_in,
            COALESCE(SUM(r.adults + r.kids), 0)::int AS checked_in_heads
     FROM checkins c JOIN rsvps r ON r.id = c.rsvp_id
     WHERE c.event_id = $1`,
    [req.params.eventId]
  );
  const checkins = checkinRows[0];

  const replies = summary.confirmed_replies + summary.waitlisted + summary.declined;
  res.json({
    trend,
    summary: {
      replies,
      confirmedReplies: summary.confirmed_replies,
      waitlisted: summary.waitlisted,
      declined: summary.declined,
      confirmedHeads: summary.confirmed_heads,
      // Of the people who replied at all, how many said yes.
      acceptanceRate: replies ? Math.round((summary.confirmed_replies / replies) * 100) : null,
    },
    capacity: {
      limit: event.capacity,
      taken: summary.confirmed_heads,
      spotsLeft: event.capacity === null ? null : Math.max(0, event.capacity - summary.confirmed_heads),
      fillRate:
        event.capacity ? Math.min(100, Math.round((summary.confirmed_heads / event.capacity) * 100)) : null,
    },
    checkIn: {
      guests: checkins.checked_in,
      heads: checkins.checked_in_heads,
      // Turnout: of the heads that were confirmed, how many actually arrived.
      rate: summary.confirmed_heads
        ? Math.round((checkins.checked_in_heads / summary.confirmed_heads) * 100)
        : null,
    },
  });
});

app.get('/api/events/:eventId/guests.csv', requireAuth, async (req, res) => {
  const { rows: eventRows } = await pool.query(
    'SELECT id, name FROM events WHERE id = $1 AND owner_id = $2',
    [req.params.eventId, req.user.id]
  );
  if (!eventRows[0]) return res.status(404).json({ error: 'Event not found.' });

  const { rows } = await pool.query(
    `SELECT r.name, r.email, r.status, r.adults, r.kids, r.comment, r.created_at,
            c.checked_in_at
     FROM rsvps r LEFT JOIN checkins c ON c.rsvp_id = r.id
     WHERE r.event_id = $1
     ORDER BY r.created_at ASC`,
    [req.params.eventId]
  );

  const iso = (v) => (v ? new Date(v).toISOString() : '');
  const csv = toCsv(
    [
      { label: 'Name', value: (r) => r.name },
      { label: 'Email', value: (r) => r.email },
      { label: 'Status', value: (r) => r.status },
      { label: 'Adults', value: (r) => (r.status === 'declined' ? '' : r.adults) },
      { label: 'Kids', value: (r) => (r.status === 'declined' ? '' : r.kids) },
      { label: 'Party size', value: (r) => (r.status === 'declined' ? '' : r.adults + r.kids) },
      { label: 'Message', value: (r) => r.comment },
      { label: 'Replied at', value: (r) => iso(r.created_at) },
      { label: 'Checked in at', value: (r) => iso(r.checked_in_at) },
    ],
    rows
  );

  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="${csvFilename(eventRows[0].name, 'guests')}"`);
  res.send(csv);
});

// --- Door check-in (host) ---

app.post('/api/events/:eventId/checkin', requireAuth, verifySameOrigin, async (req, res) => {
  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  if (!token) return res.status(400).json({ error: 'No ticket was scanned.' });

  const { rows: eventRows } = await pool.query(
    'SELECT id, owner_id, name FROM events WHERE id = $1 AND owner_id = $2',
    [req.params.eventId, req.user.id]
  );
  if (!eventRows[0]) return res.status(404).json({ error: 'Event not found.' });

  // Scoped to this event, so a valid ticket for a different party is rejected
  // rather than quietly admitting someone.
  const { rows: rsvpRows } = await pool.query(
    `SELECT r.id, r.name, r.email, r.status, r.adults, r.kids, c.checked_in_at
     FROM rsvps r
     LEFT JOIN checkins c ON c.rsvp_id = r.id
     WHERE r.ticket_token = $1 AND r.event_id = $2`,
    [token, req.params.eventId]
  );
  const guest = rsvpRows[0];
  if (!guest) {
    return res.status(404).json({ error: "That ticket isn't for this event." });
  }
  if (guest.status === 'declined') {
    return res.status(409).json({ error: `${guest.name} replied that they couldn't make it.`, guest: { name: guest.name } });
  }
  if (guest.status === 'waitlist') {
    return res.status(409).json({
      error: `${guest.name} is still on the waitlist — raise the guest limit to let them in.`,
      guest: { name: guest.name },
    });
  }

  // How many of this host's events this guest has been confirmed at, including
  // this one — the number that makes a regular feel recognised at the door.
  const { rows: visitRows } = await pool.query(
    `SELECT count(DISTINCT r.event_id)::int AS visits
     FROM rsvps r JOIN events e ON e.id = r.event_id
     WHERE e.owner_id = $1 AND lower(r.email) = $2 AND r.status = 'confirmed'`,
    [req.user.id, normalizeEmail(guest.email)]
  );

  const payload = {
    guest: {
      name: guest.name,
      party: guest.adults + guest.kids,
      adults: guest.adults,
      kids: guest.kids,
      visits: visitRows[0].visits,
    },
  };

  // A second scan is a normal thing to happen at a busy door, so report the
  // original time rather than treating it as an error.
  if (guest.checked_in_at) {
    return res.json({ ...payload, ok: true, already: true, checkedInAt: guest.checked_in_at });
  }

  const { rows: inserted } = await pool.query(
    `INSERT INTO checkins (rsvp_id, event_id, checked_in_by) VALUES ($1, $2, $3)
     ON CONFLICT (rsvp_id) DO NOTHING
     RETURNING checked_in_at`,
    [guest.id, req.params.eventId, req.user.id]
  );

  // Lost the race with another scanner on the door — still a success.
  if (!inserted[0]) {
    const { rows: existing } = await pool.query(
      'SELECT checked_in_at FROM checkins WHERE rsvp_id = $1',
      [guest.id]
    );
    return res.json({ ...payload, ok: true, already: true, checkedInAt: existing[0]?.checked_in_at });
  }

  res.json({ ...payload, ok: true, already: false, checkedInAt: inserted[0].checked_in_at });
});

app.post('/api/events/:eventId/checkin/undo', requireAuth, verifySameOrigin, async (req, res) => {
  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  const { rows: eventRows } = await pool.query(
    'SELECT id FROM events WHERE id = $1 AND owner_id = $2',
    [req.params.eventId, req.user.id]
  );
  if (!eventRows[0]) return res.status(404).json({ error: 'Event not found.' });

  const { rowCount } = await pool.query(
    `DELETE FROM checkins WHERE event_id = $1 AND rsvp_id = (
       SELECT id FROM rsvps WHERE ticket_token = $2 AND event_id = $1
     )`,
    [req.params.eventId, token]
  );
  res.json({ ok: true, undone: rowCount > 0 });
});

// --- Public event + RSVP (no auth — anyone with the link) ---

// A draft is visible only to its host, who is previewing it. Everyone else is
// told it isn't published yet — which reveals nothing, since the slug is
// random and they already hold the link.
function canView(event, req) {
  return Boolean(event.published_at) || Boolean(req.user && req.user.id === event.owner_id);
}

const NOT_PUBLISHED = { error: "This invitation isn't published yet.", draft: true };

app.get('/api/events/:slug/public', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT e.id, e.slug, e.owner_id, e.name, e.event_date, e.location, e.description, e.invite_mode,
            e.capacity, e.published_at, e.visibility,
            (e.image_data IS NOT NULL OR e.template_id IS NOT NULL) AS has_image,
            u.name AS host_name, u.handle AS host_handle, u.public_profile AS host_public
     FROM events e JOIN users u ON u.id = e.owner_id
     WHERE e.slug = $1`,
    [req.params.slug]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Event not found.' });
  if (!canView(rows[0], req)) return res.status(404).json(NOT_PUBLISHED);
  const {
    id, owner_id, has_image, invite_mode, capacity, published_at, visibility,
    host_name, host_handle, host_public, ...event
  } = rows[0];

  const taken = await confirmedHeadcount(pool, id);
  const { rows: faqs } = await pool.query(
    `SELECT question, answer FROM event_faqs
     WHERE event_id = $1 ORDER BY sort_order ASC, created_at ASC`,
    [id]
  );

  res.json({
    ...event,
    inviteOnly: invite_mode === 'restricted',
    imageUrl: makeImageUrl(req, req.params.slug, has_image),
    shareUrl: makeShareUrl(req, req.params.slug),
    capacity,
    goingCount: taken,
    spotsLeft: capacity === null ? null : Math.max(0, capacity - taken),
    isFull: capacity !== null && taken >= capacity,
    faqs,
    draft: !published_at,
    isHost: Boolean(req.user && req.user.id === owner_id),
    // Only the host gets the internal ID — it's what links their preview back
    // to the event's workspace.
    ...(req.user && req.user.id === owner_id ? { eventId: id } : {}),
    // The host is only named when they've chosen a public profile; otherwise
    // an invitation says nothing about who sent it beyond what they wrote.
    host: host_public && host_handle ? { name: host_name, handle: host_handle } : null,
  });
});

// Other upcoming public events by the same host, for the bottom of an event
// page. Only ever public, published events — never the host's unlisted ones.
app.get('/api/events/:slug/more', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT o.slug, o.name, o.event_date, o.location,
            (o.image_data IS NOT NULL OR o.template_id IS NOT NULL) AS has_image
     FROM events e
     JOIN events o ON o.owner_id = e.owner_id AND o.id <> e.id
     WHERE e.slug = $1 AND o.published_at IS NOT NULL AND o.visibility = 'public'
       AND o.event_date > now()
     ORDER BY o.event_date ASC
     LIMIT 3`,
    [req.params.slug]
  );
  res.json(
    rows.map((r) => ({
      slug: r.slug,
      name: r.name,
      event_date: r.event_date,
      location: r.location,
      shareUrl: makeShareUrl(req, r.slug),
      imageUrl: makeImageUrl(req, r.slug, r.has_image),
    }))
  );
});

app.get('/api/events/:slug/image', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT image_data, image_mime, template_id, published_at, owner_id FROM events WHERE slug = $1',
    [req.params.slug]
  );
  const event = rows[0];
  if (!event || !canView(event, req)) return res.status(404).end();

  if (event.image_data) {
    res.set('Content-Type', event.image_mime || 'application/octet-stream');
    res.set('Cache-Control', 'public, max-age=3600');
    return res.send(event.image_data);
  }
  if (event.template_id) {
    const template = findTemplate(event.template_id);
    if (template) return res.redirect(`/templates/${template.file}`);
  }
  res.status(404).end();
});

app.get('/api/events/:slug/calendar.ics', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, slug, name, event_date, location, description, published_at, owner_id
     FROM events WHERE slug = $1`,
    [req.params.slug]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Event not found.' });
  if (!canView(rows[0], req)) return res.status(404).json(NOT_PUBLISHED);

  const ics = buildEventIcs({
    event: rows[0],
    url: makeShareUrl(req, rows[0].slug),
    // Stable per event, so re-adding updates the existing entry in the guest's
    // calendar instead of creating a duplicate.
    uid: `${rows[0].id}@rsvpfor`,
  });
  if (!ics) {
    return res.status(400).json({ error: "This event doesn't have a date set yet." });
  }

  res.set('Content-Type', 'text/calendar; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="${icsFilename(rows[0].name)}"`);
  res.send(ics);
});

// --- Guest ticket ---
//
// The token is the only credential, so this is deliberately narrow: it returns
// the guest's own reply and the event's public details, never the guest list.

app.get('/api/tickets/:token', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT r.id, r.name, r.email, r.status, r.adults, r.kids, r.ticket_token,
            e.slug, e.name AS event_name, e.event_date, e.location, e.description,
            (e.image_data IS NOT NULL OR e.template_id IS NOT NULL) AS has_image,
            c.checked_in_at
     FROM rsvps r
     JOIN events e ON e.id = r.event_id
     LEFT JOIN checkins c ON c.rsvp_id = r.id
     WHERE r.ticket_token = $1`,
    [req.params.token]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Ticket not found.' });
  const t = rows[0];

  res.json({
    guestName: t.name,
    status: t.status,
    adults: t.adults,
    kids: t.kids,
    party: t.adults + t.kids,
    checkedInAt: t.checked_in_at,
    token: t.ticket_token,
    event: {
      name: t.event_name,
      event_date: t.event_date,
      location: t.location,
      description: t.description,
      shareUrl: makeShareUrl(req, t.slug),
      imageUrl: makeImageUrl(req, t.slug, t.has_image),
      calendarUrl: `${req.protocol}://${req.get('host')}/api/events/${t.slug}/calendar.ics`,
    },
  });
});

app.get('/api/events/:slug/comments', async (req, res) => {
  const { rows: eventRows } = await pool.query(
    'SELECT id, published_at, owner_id FROM events WHERE slug = $1',
    [req.params.slug]
  );
  if (!eventRows[0]) return res.status(404).json({ error: 'Event not found.' });
  if (!canView(eventRows[0], req)) return res.status(404).json(NOT_PUBLISHED);

  const { rows } = await pool.query(
    `SELECT name, attending, status, comment, created_at FROM rsvps
     WHERE event_id = $1 AND comment IS NOT NULL AND comment <> ''
     ORDER BY created_at DESC`,
    [eventRows[0].id]
  );
  res.json(rows);
});

app.post('/api/events/:slug/rsvp', rsvpLimiter, async (req, res) => {
  const { name, email, attending, adults, kids, comment } = req.body || {};

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Name is required.' });
  }
  if (
    !email ||
    typeof email !== 'string' ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  ) {
    return res.status(400).json({ error: 'A valid email is required.' });
  }

  const isAttending = attending === 'yes';
  const adultsCount = isAttending ? Math.max(0, parseInt(adults, 10) || 0) : 0;
  const kidsCount = isAttending ? Math.max(0, parseInt(kids, 10) || 0) : 0;

  if (isAttending && adultsCount + kidsCount < 1) {
    return res.status(400).json({ error: 'Please include at least one guest.' });
  }

  const client = await pool.connect();
  let result;
  try {
    await client.query('BEGIN');

    // FOR UPDATE serialises RSVPs for this event, so two guests arriving at the
    // same moment can't both be told they got the last spot.
    const { rows: eventRows } = await client.query(
      `SELECT id, slug, name, event_date, location, description, invite_mode, capacity, published_at
       FROM events WHERE slug = $1 FOR UPDATE`,
      [req.params.slug]
    );
    if (!eventRows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Event not found.' });
    }
    const event = eventRows[0];
    // Refused even for the host: a reply to a draft would be a guest nobody
    // can see yet, attached to details that may still change.
    if (!event.published_at) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: "This invitation isn't published yet, so it can't take replies." });
    }

    if (event.invite_mode === 'restricted') {
      const { rows: inviteRows } = await client.query(
        'SELECT 1 FROM event_invites WHERE event_id = $1 AND email = $2',
        [event.id, normalizeEmail(email)]
      );
      if (!inviteRows[0]) {
        await client.query('ROLLBACK');
        return res.status(403).json({
          error: "This event is invite-only and this email isn't on the guest list. Please check with the host.",
        });
      }
    }

    // One reply per email address: replying again revises the earlier reply
    // rather than stacking a second row, which would double-count headcount
    // against the capacity limit.
    const { rows: existingRows } = await client.query(
      `SELECT id, status, ticket_token FROM rsvps
       WHERE event_id = $1 AND lower(email) = $2
       ORDER BY created_at ASC LIMIT 1`,
      [event.id, normalizeEmail(email)]
    );
    const existing = existingRows[0] || null;
    // A revised reply keeps its original ticket, so a guest who already saved or
    // screenshotted theirs doesn't find it dead at the door.
    const ticketToken = existing?.ticket_token || newTicketToken();

    let status;
    if (!isAttending) {
      status = 'declined';
    } else if (event.capacity === null) {
      status = 'confirmed';
    } else {
      // Exclude this guest's own current row: someone already confirmed keeps
      // their spot when they edit their reply, and is only waitlisted if they
      // now need more room than the event has left.
      const taken = await confirmedHeadcount(client, event.id, existing ? existing.id : null);
      status = adultsCount + kidsCount <= event.capacity - taken ? 'confirmed' : 'waitlist';
    }

    // Coming back after declining means asking for a spot now, so the queue
    // position reflects this reply rather than the original one.
    const resetQueueTime = existing !== null && existing.status === 'declined' && isAttending;

    if (existing) {
      await client.query(
        `UPDATE rsvps SET name = $1, email = $2, attending = $3, adults = $4, kids = $5,
                          comment = $6, status = $7, ticket_token = $8,
                          created_at = CASE WHEN $9 THEN now() ELSE created_at END
         WHERE id = $10`,
        [
          name.trim().slice(0, 100),
          email.trim().slice(0, 200),
          isAttending,
          adultsCount,
          kidsCount,
          (comment || '').trim().slice(0, 500),
          status,
          ticketToken,
          resetQueueTime,
          existing.id,
        ]
      );
    } else {
      await client.query(
        `INSERT INTO rsvps (id, event_id, name, email, attending, adults, kids, comment, status, ticket_token)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          crypto.randomUUID(),
          event.id,
          name.trim().slice(0, 100),
          email.trim().slice(0, 200),
          isAttending,
          adultsCount,
          kidsCount,
          (comment || '').trim().slice(0, 500),
          status,
          ticketToken,
        ]
      );
    }

    await client.query('COMMIT');
    result = {
      status,
      event,
      ticketToken,
      // Giving up a confirmed spot is what makes room for the waitlist.
      freedSpace: existing !== null && existing.status === 'confirmed' && status !== 'confirmed',
      revised: existing !== null,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('RSVP failed:', err);
    return res.status(500).json({ error: 'Could not save your RSVP. Please try again.' });
  } finally {
    client.release();
  }

  if (result.freedSpace) {
    try {
      const promoted = await promoteFromWaitlist(result.event.id);
      if (promoted.length) {
        notifyPromoted(promoted, {
          ...result.event,
          shareUrl: makeShareUrl(req, result.event.slug),
        });
      }
    } catch (err) {
      // The guest's own RSVP is already saved; a promotion failure here is the
      // host's problem to retry, not a reason to fail this response.
      console.error('Waitlist promotion failed:', err);
    }
  }

  res.json({
    ok: true,
    status: result.status,
    waitlisted: result.status === 'waitlist',
    revised: result.revised,
    ticketUrl: `${req.protocol}://${req.get('host')}/t/${result.ticketToken}`,
  });
});

// --- Pages ---

registerPages(app, { pool, requirePageAuth, safeNext, makeShareUrl, makeImageUrl, findTemplate });

// Page templates are only ever served through the routes above, which fill
// them in. Served raw they'd show placeholder comments and skip the auth check.
app.use((req, res, next) => {
  if (/\.html?$/i.test(req.path)) return res.status(404).end();
  next();
});

app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// Catches multer errors (bad file type, file too large) from anywhere above.
app.use((err, req, res, next) => {
  if (err) {
    return res.status(400).json({ error: err.message || 'Request failed.' });
  }
  next();
});

init()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🎉 RSVPfor running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
