// The owner's console. Everything here is gated twice: the route refuses
// anyone whose signed-in email is not in ADMIN_EMAILS, and the page itself is
// only linked for those people. The list lives in the environment, so no
// database write can promote anybody.

const multer = require('multer');
const siteSettings = require('./site-settings');

const LOGO_LIMIT = 512 * 1024;
const LOGO_TYPES = new Set(['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']);

const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LOGO_LIMIT, files: 1 },
});

function registerAdminRoutes(app, { pool, verifySameOrigin }) {
  function requireAdmin(req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'Not logged in.' });
    if (!siteSettings.isAdmin(req.user)) {
      // Same answer as a route that does not exist: an ordinary signed-in user
      // learns nothing about whether there is an admin console here.
      return res.status(404).json({ error: 'Not found.' });
    }
    next();
  }

  app.get('/api/admin/settings', requireAdmin, async (req, res) => {
    const settings = await siteSettings.getSettings(pool);
    res.json({
      settings: {
        theme: settings.theme,
        doodle: settings.doodle,
        hasLogo: Boolean(settings.logo_mime),
        logoUpdatedAt: settings.logo_updated_at || null,
      },
      themes: siteSettings.THEMES,
      doodles: siteSettings.DOODLES.map((d) => ({ id: d.id, label: d.label, note: d.note, svg: d.svg || '' })),
      admins: siteSettings.adminEmails(),
    });
  });

  app.put('/api/admin/settings', requireAdmin, verifySameOrigin, async (req, res) => {
    const patch = {};
    if (req.body.theme !== undefined) {
      if (!siteSettings.themeIds().has(req.body.theme)) {
        return res.status(400).json({ error: 'That theme does not exist.' });
      }
      patch.theme = req.body.theme;
    }
    if (req.body.doodle !== undefined) {
      if (!siteSettings.DOODLES.some((d) => d.id === req.body.doodle)) {
        return res.status(400).json({ error: 'That doodle does not exist.' });
      }
      patch.doodle = req.body.doodle;
    }
    const settings = await siteSettings.saveSettings(pool, patch, req.user.id);
    res.json({ theme: settings.theme, doodle: settings.doodle, hasLogo: Boolean(settings.logo_mime) });
  });

  app.post('/api/admin/logo', requireAdmin, verifySameOrigin, logoUpload.single('logo'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No logo uploaded.' });
    if (!LOGO_TYPES.has(req.file.mimetype)) {
      return res.status(400).json({ error: 'Use a PNG, JPEG, SVG or WebP.' });
    }
    if (req.file.size > LOGO_LIMIT) {
      return res.status(400).json({ error: 'Keep the logo under 512KB.' });
    }
    await siteSettings.saveSettings(pool, { logo: { buffer: req.file.buffer, mime: req.file.mimetype } }, req.user.id);
    res.json({ hasLogo: true });
  });

  app.delete('/api/admin/logo', requireAdmin, verifySameOrigin, async (req, res) => {
    await siteSettings.saveSettings(pool, { logo: null }, req.user.id);
    res.json({ hasLogo: false });
  });

  // A count of what is on the site, so the console says something useful about
  // the state of things rather than only offering switches.
  app.get('/api/admin/overview', requireAdmin, async (req, res) => {
    const { rows } = await pool.query(`
      SELECT
        (SELECT count(*) FROM users)::int AS hosts,
        (SELECT count(*) FROM events)::int AS events,
        (SELECT count(*) FROM events WHERE published_at IS NOT NULL)::int AS published,
        (SELECT count(*) FROM events WHERE visibility = 'public' AND published_at IS NOT NULL)::int AS public_events,
        (SELECT count(*) FROM rsvps)::int AS rsvps,
        (SELECT count(*) FROM forms)::int AS forms,
        (SELECT count(*) FROM form_responses)::int AS responses,
        (SELECT count(*) FROM events WHERE created_at > now() - interval '30 days')::int AS events_30d,
        (SELECT count(*) FROM rsvps WHERE created_at > now() - interval '30 days')::int AS rsvps_30d
    `);
    res.json(rows[0]);
  });

  // The logo is public — it is on every page — but it is served from here so
  // there is one address for it whether it is uploaded or not.
  app.get('/site/logo', async (req, res) => {
    const { rows } = await pool.query('SELECT logo_data, logo_mime FROM site_settings WHERE id = 1');
    const row = rows[0];
    if (!row || !row.logo_data) return res.status(404).end();
    res.set('Content-Type', row.logo_mime || 'image/png');
    res.set('Cache-Control', 'public, max-age=300');
    res.send(row.logo_data);
  });
}

module.exports = { registerAdminRoutes, LOGO_LIMIT, LOGO_TYPES };
