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

function requirePageAuth(req, res, next) {
  if (!req.user) return res.redirect('/');
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

if (providers.google) {
  app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
  app.get(
    '/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/?login=failed' }),
    (req, res) => res.redirect('/dashboard')
  );
}

if (providers.facebook) {
  app.get('/auth/facebook', passport.authenticate('facebook', { scope: ['email'] }));
  app.get(
    '/auth/facebook/callback',
    passport.authenticate('facebook', { failureRedirect: '/?login=failed' }),
    (req, res) => res.redirect('/dashboard')
  );
}

// --- Events (host, authenticated) ---

app.get('/api/templates', (req, res) => {
  res.json(TEMPLATES.map((t) => ({ id: t.id, label: t.label, previewUrl: `/templates/${t.file}` })));
});

app.get('/api/events', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, slug, name, event_date, location, created_at,
            (image_data IS NOT NULL OR template_id IS NOT NULL) AS has_image
     FROM events WHERE owner_id = $1 ORDER BY created_at DESC`,
    [req.user.id]
  );
  res.json(
    rows.map((r) => ({
      ...r,
      shareUrl: makeShareUrl(req, r.slug),
      imageUrl: makeImageUrl(req, r.slug, r.has_image),
    }))
  );
});

app.post('/api/events', requireAuth, verifySameOrigin, async (req, res) => {
  const { name, date, location, description } = req.body || {};
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Event name is required.' });
  }

  const id = crypto.randomUUID();
  const slug = crypto.randomBytes(6).toString('base64url');
  const eventDate = date ? new Date(date) : null;

  await pool.query(
    `INSERT INTO events (id, slug, owner_id, name, event_date, location, description)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      id,
      slug,
      req.user.id,
      name.trim().slice(0, 150),
      eventDate && !Number.isNaN(eventDate.getTime()) ? eventDate : null,
      (location || '').trim().slice(0, 300),
      (description || '').trim().slice(0, 1000),
    ]
  );

  res.json({ id, slug, shareUrl: makeShareUrl(req, slug) });
});

app.patch('/api/events/:eventId', requireAuth, verifySameOrigin, async (req, res) => {
  const { name, date, location, description } = req.body || {};
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Event name is required.' });
  }
  const eventDate = date ? new Date(date) : null;

  const { rows } = await pool.query(
    `UPDATE events SET name = $1, event_date = $2, location = $3, description = $4
     WHERE id = $5 AND owner_id = $6
     RETURNING id, slug`,
    [
      name.trim().slice(0, 150),
      eventDate && !Number.isNaN(eventDate.getTime()) ? eventDate : null,
      (location || '').trim().slice(0, 300),
      (description || '').trim().slice(0, 1000),
      req.params.eventId,
      req.user.id,
    ]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Event not found.' });
  res.json({ ok: true, shareUrl: makeShareUrl(req, rows[0].slug) });
});

app.post(
  '/api/events/:eventId/image',
  requireAuth,
  verifySameOrigin,
  upload.single('image'),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No image uploaded.' });

    const { rowCount } = await pool.query(
      `UPDATE events SET image_data = $1, image_mime = $2, template_id = NULL
       WHERE id = $3 AND owner_id = $4`,
      [req.file.buffer, req.file.mimetype, req.params.eventId, req.user.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Event not found.' });
    res.json({ ok: true });
  }
);

app.post('/api/events/:eventId/template', requireAuth, verifySameOrigin, async (req, res) => {
  const template = findTemplate(req.body?.templateId);
  if (!template) return res.status(400).json({ error: 'Unknown template.' });

  const { rowCount } = await pool.query(
    `UPDATE events SET template_id = $1, image_data = NULL, image_mime = NULL
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
    `SELECT id, slug, owner_id, name, event_date, location, description, created_at,
            (image_data IS NOT NULL OR template_id IS NOT NULL) AS has_image
     FROM events WHERE id = $1 AND owner_id = $2`,
    [req.params.eventId, req.user.id]
  );
  if (!eventRows[0]) return res.status(404).json({ error: 'Event not found.' });

  const { rows: rsvps } = await pool.query(
    'SELECT * FROM rsvps WHERE event_id = $1 ORDER BY created_at DESC',
    [req.params.eventId]
  );

  const totals = rsvps.reduce(
    (acc, r) => {
      if (r.attending) {
        acc.adults += r.adults;
        acc.kids += r.kids;
        acc.attendingCount += 1;
      } else {
        acc.declinedCount += 1;
      }
      return acc;
    },
    { adults: 0, kids: 0, attendingCount: 0, declinedCount: 0 }
  );

  res.json({
    event: {
      ...eventRows[0],
      shareUrl: makeShareUrl(req, eventRows[0].slug),
      imageUrl: makeImageUrl(req, eventRows[0].slug, eventRows[0].has_image),
    },
    rsvps,
    totals,
  });
});

// --- Public event + RSVP (no auth — anyone with the link) ---

app.get('/api/events/:slug/public', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT name, event_date, location, description,
            (image_data IS NOT NULL OR template_id IS NOT NULL) AS has_image
     FROM events WHERE slug = $1`,
    [req.params.slug]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Event not found.' });
  const { has_image, ...event } = rows[0];
  res.json({ ...event, imageUrl: makeImageUrl(req, req.params.slug, has_image) });
});

app.get('/api/events/:slug/image', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT image_data, image_mime, template_id FROM events WHERE slug = $1',
    [req.params.slug]
  );
  const event = rows[0];
  if (!event) return res.status(404).end();

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

app.get('/api/events/:slug/comments', async (req, res) => {
  const { rows: eventRows } = await pool.query('SELECT id FROM events WHERE slug = $1', [
    req.params.slug,
  ]);
  if (!eventRows[0]) return res.status(404).json({ error: 'Event not found.' });

  const { rows } = await pool.query(
    `SELECT name, attending, comment, created_at FROM rsvps
     WHERE event_id = $1 AND comment IS NOT NULL AND comment <> ''
     ORDER BY created_at DESC`,
    [eventRows[0].id]
  );
  res.json(rows);
});

app.post('/api/events/:slug/rsvp', rsvpLimiter, async (req, res) => {
  const { rows: eventRows } = await pool.query('SELECT id FROM events WHERE slug = $1', [
    req.params.slug,
  ]);
  if (!eventRows[0]) return res.status(404).json({ error: 'Event not found.' });

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

  await pool.query(
    `INSERT INTO rsvps (id, event_id, name, email, attending, adults, kids, comment)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      crypto.randomUUID(),
      eventRows[0].id,
      name.trim().slice(0, 100),
      email.trim().slice(0, 200),
      isAttending,
      adultsCount,
      kidsCount,
      (comment || '').trim().slice(0, 500),
    ]
  );

  res.json({ ok: true });
});

// --- Pages ---

app.get('/dashboard', requirePageAuth, (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'))
);
app.get('/host/:eventId', requirePageAuth, (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'host-event.html'))
);
app.get('/e/:slug', (req, res) => res.sendFile(path.join(__dirname, 'public', 'event.html')));

app.use(express.static(path.join(__dirname, 'public')));

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
      console.log(`🎉 Party RSVP running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
