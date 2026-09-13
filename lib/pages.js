// Every HTML page the site serves, assembled on the server with the shared
// header, footer and SEO tags. The page scripts in public/ still do the
// interactive work; this makes sure the first response is complete enough for
// crawlers and link-preview fetchers, and that every page links to the rest.

const fs = require('fs');
const path = require('path');
const {
  escapeHtml,
  renderHead,
  renderPage,
  siteHeader,
  siteFooter,
  workspaceHeader,
  formHeader,
  localTime,
  baseUrl,
  isDevHost,
  truncate,
  DEFAULT_DESCRIPTION,
} = require('./render');
const { CATEGORIES, WHEN_OPTIONS, categoryLabel, normalizeCategory, normalizeHandle, buildBrowseQuery } = require('./discovery');
const { closedReason } = require('./forms');
const { svgFor } = require('./qr');
const { INFO_PAGES, findInfoPage } = require('./info-pages');
const { isAdmin } = require('./site-settings');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const APP_ROBOTS = 'noindex,nofollow';
const WORKSPACE_TABS = new Set(['design', 'guests', 'share', 'settings']);

function registerPages(app, { pool, requirePageAuth, safeNext, makeShareUrl, makeImageUrl, findTemplate }) {
  const page = (req, res, file, opts = {}) =>
    renderPage(res, file, {
      header: opts.noChrome
        ? ''
        : siteHeader({
            user: req.user,
            active: opts.active,
            settings: req.siteSettings,
            admin: req.isSiteAdmin,
          }),
      footer: opts.noChrome ? '' : siteFooter({ user: req.user, settings: req.siteSettings }),
      theme: req.siteSettings && req.siteSettings.theme,
      ...opts,
    });

  // Event cards used on the home page and Explore. Rendered on the server so
  // the links are crawlable and the page isn't blank until JavaScript runs.
  function eventCard(req, e) {
    const going = e.going ? `<span class="browse-going">${e.going} going</span>` : '';
    const spots =
      e.capacity === null || e.capacity === undefined
        ? ''
        : e.going >= e.capacity
          ? '<span class="browse-badge is-full">Full · waitlist open</span>'
          : `<span class="browse-badge">${e.capacity - e.going} ${e.capacity - e.going === 1 ? 'spot' : 'spots'} left</span>`;
    const host = e.host_handle
      ? `<a class="browse-host" href="/@${escapeHtml(e.host_handle)}">by ${escapeHtml(e.host_name)}</a>`
      : '';
    const img = makeImageUrl(req, e.slug, e.has_image);
    return `<article class="browse-card">
        <a class="browse-card-art" href="/e/${escapeHtml(e.slug)}" tabindex="-1" aria-hidden="true">${
          img ? `<img src="${escapeHtml(img)}" alt="" loading="lazy" />` : '<span class="browse-card-empty">✦</span>'
        }</a>
        <div class="browse-card-body">
          <div class="browse-card-when">${localTime(e.event_date, 'datetime')}</div>
          <h3><a href="/e/${escapeHtml(e.slug)}">${escapeHtml(e.name)}</a></h3>
          ${e.location ? `<div class="browse-card-where">${escapeHtml(e.location)}</div>` : ''}
          <div class="browse-card-foot">${host}${going}${spots}</div>
        </div>
      </article>`;
  }

  // schema.org Event — what makes an event eligible for Google's event
  // listings. Only ever built for published, public events.
  function eventJsonLd(req, e) {
    const base = baseUrl(req);
    const start = new Date(e.event_date);
    return {
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: e.name,
      startDate: start.toISOString(),
      endDate: new Date(start.getTime() + 2 * 60 * 60 * 1000).toISOString(),
      eventStatus: 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      description: truncate(e.description || `${e.name} — RSVP on RSVPfor.`, 300),
      image: [`${base}/og/${e.slug}.jpg`],
      url: `${base}/e/${e.slug}`,
      isAccessibleForFree: true,
      ...(e.location
        ? { location: { '@type': 'Place', name: e.location, address: e.location } }
        : {}),
      ...(e.host_public && e.host_handle
        ? { organizer: { '@type': 'Person', name: e.host_name, url: `${base}/@${e.host_handle}` } }
        : {}),
    };
  }

  // ---------------------------------------------------------------- Home

  app.get('/', async (req, res) => {
    const { sql, params } = buildBrowseQuery({ limit: 6 });
    const { rows } = await pool.query(sql, params);
    const base = baseUrl(req);

    const soon = rows.length
      ? `<section class="happening-section" aria-labelledby="happening-title">
          <div class="section-heading home-section-heading"><div><span class="section-kicker">Open invitations</span><h2 id="happening-title">Happening soon</h2></div><a class="text-link" href="/explore">See everything <span>→</span></a></div>
          <div class="event-collection browse-grid">${rows.map((e) => eventCard(req, e)).join('')}</div>
        </section>`
      : '';

    page(req, res, 'index.html', {
      head: renderHead({
        req,
        title: null,
        description: DEFAULT_DESCRIPTION,
        canonicalPath: '/',
        jsonLd: [
          {
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: 'RSVPfor',
            url: `${base}/`,
            potentialAction: {
              '@type': 'SearchAction',
              target: `${base}/explore?q={search_term_string}`,
              'query-input': 'required name=search_term_string',
            },
          },
          { '@context': 'https://schema.org', '@type': 'Organization', name: 'RSVPfor', url: `${base}/` },
        ],
      }),
      active: 'home',
      slots: {
        'happening-soon': soon,
        // Signed-in visitors see a way into their dashboard instead of sign-in buttons.
        'home-cta-state': req.user ? 'is-signed-in' : 'is-signed-out',
      },
    });
  });

  // ---------------------------------------------------------------- Login

  app.get('/login', (req, res) => {
    const next = safeNext(req.query.next);
    if (req.user) return res.redirect(next || '/dashboard');
    page(req, res, 'login.html', {
      head: renderHead({ req, title: 'Sign in', canonicalPath: '/login', robots: APP_ROBOTS }),
      active: 'login',
      slots: {
        // Carried through to the provider buttons so sign-in lands back here.
        'next-query': next ? `?next=${encodeURIComponent(next)}` : '',
        'login-failed': req.query.failed ? 'is-failed' : '',
      },
    });
  });

  // ---------------------------------------------------------------- Explore

  // /browse was the old address; keep it working and point search engines at
  // the new one.
  app.get('/browse', (req, res) => {
    const qs = new URLSearchParams(req.query).toString();
    res.redirect(301, `/explore${qs ? `?${qs}` : ''}`);
  });

  async function explore(req, res) {
    const pathCategory = req.params.category ? normalizeCategory(req.params.category) : null;
    if (req.params.category && !pathCategory) return notFound(req, res);

    // ?category=music is folded into the path form so each category has exactly
    // one address.
    const queryCategory = normalizeCategory(req.query.category);
    if (!pathCategory && queryCategory) {
      const rest = new URLSearchParams(req.query);
      rest.delete('category');
      const qs = rest.toString();
      return res.redirect(301, `/explore/${queryCategory}${qs ? `?${qs}` : ''}`);
    }

    const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 80) : '';
    const where = typeof req.query.where === 'string' ? req.query.where.slice(0, 80) : '';
    const when = WHEN_OPTIONS.some((o) => o.id === req.query.when) ? req.query.when : '';

    const { sql, params } = buildBrowseQuery({ q, where, when, category: pathCategory, limit: 24 });
    const { rows } = await pool.query(sql, params);

    const label = pathCategory ? categoryLabel(pathCategory) : null;
    const keep = (extra) => {
      const p = new URLSearchParams();
      if (q) p.set('q', q);
      if (where) p.set('where', where);
      if (when) p.set('when', when);
      Object.entries(extra || {}).forEach(([k, v]) => (v ? p.set(k, v) : p.delete(k)));
      const s = p.toString();
      return s ? `?${s}` : '';
    };

    const chips = [{ id: '', label: 'Everything' }, ...CATEGORIES]
      .map((c) => {
        const href = c.id ? `/explore/${c.id}${keep()}` : `/explore${keep()}`;
        const active = (c.id || null) === pathCategory;
        return `<a class="filter-chip${active ? ' active' : ''}" href="${escapeHtml(href)}"${
          active ? ' aria-current="page"' : ''
        }>${escapeHtml(c.label)}</a>`;
      })
      .join('');

    const whenOptions = WHEN_OPTIONS.map(
      (o) => `<option value="${o.id}"${o.id === when ? ' selected' : ''}>${escapeHtml(o.label)}</option>`
    ).join('');

    const filtered = Boolean(q || where || when);
    const results = rows.length
      ? rows.map((e) => eventCard(req, e)).join('')
      : `<div class="empty-state"><strong>Nothing matches yet.</strong><p>${
          filtered || pathCategory
            ? 'Try a wider date range or a different search.'
            : 'No public events are coming up right now — be the first.'
        }</p><div class="empty-state-actions">${
          filtered || pathCategory ? '<a class="btn btn-ghost btn-small" href="/explore">Clear filters</a>' : ''
        }<a class="btn btn-primary btn-small" href="/events/new">Host an event</a></div></div>`;

    const base = baseUrl(req);
    const title = label ? `${label} events` : 'Explore events';
    page(req, res, 'explore.html', {
      head: renderHead({
        req,
        title,
        description: label
          ? `Upcoming ${label.toLowerCase()} you can RSVP to on RSVPfor.`
          : 'Browse upcoming public events — birthdays, dinners, community meetups and more — and RSVP in seconds.',
        canonicalPath: pathCategory ? `/explore/${pathCategory}` : '/explore',
        // Search-result permutations are thin, duplicate pages: let crawlers
        // follow the links but keep the permutations themselves out of the index.
        robots: filtered ? 'noindex,follow' : 'index,follow',
        jsonLd: rows.length
          ? {
              '@context': 'https://schema.org',
              '@type': 'ItemList',
              itemListElement: rows.map((e, i) => ({
                '@type': 'ListItem',
                position: i + 1,
                url: `${base}/e/${e.slug}`,
                name: e.name,
              })),
            }
          : null,
      }),
      active: 'explore',
      slots: {
        'explore-title': escapeHtml(label ? `${label}` : 'Find something worth turning up to.'),
        'explore-chips': chips,
        'explore-when': whenOptions,
        'explore-q': escapeHtml(q),
        'explore-where': escapeHtml(where),
        'explore-action': escapeHtml(pathCategory ? `/explore/${pathCategory}` : '/explore'),
        'explore-results': results,
        'explore-state': escapeHtml(
          JSON.stringify({ q, where, when, category: pathCategory || '', count: rows.length })
        ),
      },
    });
  }

  app.get('/explore', explore);
  app.get('/explore/:category', explore);

  // ---------------------------------------------------------------- Event page

  async function loadPublicEvent(slug) {
    const { rows } = await pool.query(
      `SELECT e.id, e.slug, e.owner_id, e.name, e.event_date, e.location, e.description,
              e.visibility, e.published_at,
              u.name AS host_name, u.handle AS host_handle, u.public_profile AS host_public
       FROM events e JOIN users u ON u.id = e.owner_id WHERE e.slug = $1`,
      [slug]
    );
    return rows[0] || null;
  }

  app.get('/e/:slug', async (req, res) => {
    const e = await loadPublicEvent(req.params.slug);
    const isHost = Boolean(e && req.user && req.user.id === e.owner_id);

    if (!e) {
      return page(req, res, 'event.html', {
        status: 404,
        head: renderHead({ req, title: 'Invitation not found', robots: APP_ROBOTS }),
        slots: { 'event-name': 'Invitation not found' },
      });
    }

    // A draft seen by anyone but its host: say so, and give crawlers and
    // preview fetchers nothing — no name, no date, no picture.
    if (!e.published_at && !isHost) {
      return page(req, res, 'event.html', {
        head: renderHead({
          req,
          title: 'Invitation coming soon',
          description: "This invitation isn't published yet. Check back soon.",
          robots: APP_ROBOTS,
        }),
        slots: { 'event-name': 'Invitation coming soon' },
      });
    }

    const isPublic = e.visibility === 'public' && e.published_at;
    const when = e.event_date
      ? new Date(e.event_date).toLocaleString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          timeZone: 'UTC',
        })
      : '';
    const description =
      e.description ||
      [when && `${when} (UTC)`, e.location].filter(Boolean).join(' · ') ||
      "You're invited — RSVP on RSVPfor.";

    page(req, res, 'event.html', {
      head: renderHead({
        req,
        title: e.name,
        description,
        canonicalPath: `/e/${e.slug}`,
        image: `/og/${e.slug}.jpg`,
        imageAlt: `Invitation for ${e.name}`,
        // Unlisted invitations are private by intent: full link previews so
        // they look right in WhatsApp, but never in search results.
        robots: isPublic ? 'index,follow' : APP_ROBOTS,
        jsonLd: isPublic && e.event_date ? eventJsonLd(req, e) : null,
      }),
      slots: { 'event-name': escapeHtml(e.name) },
    });
  });

  // Link-preview image. A dedicated small JPEG when the studio made one; the
  // template's pre-shrunk copy for untouched templates; the site default
  // otherwise. Drafts get no preview at all.
  app.get('/og/:slug.jpg', async (req, res) => {
    const { rows } = await pool.query(
      `SELECT og_image_data, image_data, image_mime, template_id, published_at
       FROM events WHERE slug = $1`,
      [req.params.slug]
    );
    const e = rows[0];
    const sendDefault = () =>
      res.set('Cache-Control', 'public, max-age=86400').sendFile(path.join(PUBLIC_DIR, 'og-default.jpg'));
    if (!e || !e.published_at) return sendDefault();

    res.set('Cache-Control', 'public, max-age=3600');
    if (e.og_image_data) return res.type('image/jpeg').send(e.og_image_data);
    // An uploaded original is used only if it's small enough to survive the
    // preview fetchers' size limits.
    if (e.image_data && e.image_data.length <= 600 * 1024) {
      return res.type(e.image_mime || 'image/jpeg').send(e.image_data);
    }
    if (!e.image_data && e.template_id) {
      const template = findTemplate(e.template_id);
      if (template) {
        const og = path.join(PUBLIC_DIR, 'templates', 'og', template.file.replace(/\.\w+$/, '.jpg'));
        if (fs.existsSync(og)) return res.sendFile(og);
      }
    }
    return sendDefault();
  });

  // ---------------------------------------------------------------- Host profile

  app.get('/@:handle', async (req, res) => {
    const handle = normalizeHandle(req.params.handle);
    const { rows } = handle
      ? await pool.query(
          'SELECT name, handle, bio FROM users WHERE lower(handle) = $1 AND public_profile = true',
          [handle]
        )
      : { rows: [] };
    const host = rows[0];
    if (!host) return notFound(req, res);

    const base = baseUrl(req);
    page(req, res, 'profile.html', {
      head: renderHead({
        req,
        title: `${host.name} (@${host.handle})`,
        description: host.bio || `Upcoming events hosted by ${host.name} on RSVPfor.`,
        canonicalPath: `/@${host.handle}`,
        type: 'profile',
        jsonLd: {
          '@context': 'https://schema.org',
          '@type': 'ProfilePage',
          mainEntity: { '@type': 'Person', name: host.name, alternateName: `@${host.handle}`, url: `${base}/@${host.handle}` },
        },
      }),
    });
  });

  // ---------------------------------------------------------------- Guest-only pages

  app.get('/t/:token', (req, res) =>
    page(req, res, 'ticket.html', { head: renderHead({ req, title: 'Your ticket', robots: APP_ROBOTS }) })
  );

  // The whole point of the embed is to run inside someone else's page, so this
  // one route opts into being framed anywhere. Nothing else on the site does.
  app.get('/embed/:slug', (req, res) => {
    res.set('Content-Security-Policy', 'frame-ancestors *');
    page(req, res, 'embed.html', { noChrome: true, head: renderHead({ req, title: 'RSVP', robots: APP_ROBOTS }) });
  });

  // ---------------------------------------------------------------- Host app

  const appPage = (file, title, active) => (req, res) =>
    page(req, res, file, { head: renderHead({ req, title, robots: APP_ROBOTS }), active });

  app.get('/dashboard', requirePageAuth, appPage('dashboard.html', 'Dashboard', 'dashboard'));
  app.get('/events', requirePageAuth, appPage('events.html', 'My events', 'events'));
  app.get('/events/new', requirePageAuth, appPage('create.html', 'Create an event', 'events'));
  app.get('/settings', requirePageAuth, appPage('settings.html', 'Settings', 'settings'));

  async function ownedEvent(req) {
    const { rows } = await pool.query(
      'SELECT id, slug, name, event_date, published_at FROM events WHERE id::text = $1 AND owner_id = $2',
      [req.params.eventId, req.user.id]
    );
    return rows[0] || null;
  }

  app.get('/host/:eventId/checkin', requirePageAuth, async (req, res) => {
    const event = await ownedEvent(req);
    if (!event) return notFound(req, res);
    page(req, res, 'checkin.html', {
      head: renderHead({ req, title: `Check-in · ${event.name}`, robots: APP_ROBOTS }),
      active: 'events',
      workspace: workspaceHeader({ event, active: 'checkin', actions: false }),
    });
  });

  app.get('/host/:eventId/poster', requirePageAuth, async (req, res) => {
    const event = await ownedEvent(req);
    if (!event) return notFound(req, res);
    page(req, res, 'poster.html', {
      noChrome: true,
      head: renderHead({ req, title: `Poster · ${event.name}`, robots: APP_ROBOTS }),
    });
  });

  async function workspace(req, res) {
    const tab = req.params.tab || 'overview';
    if (req.params.tab && !WORKSPACE_TABS.has(tab)) return notFound(req, res);
    const event = await ownedEvent(req);
    if (!event) return notFound(req, res);
    page(req, res, 'host-event.html', {
      head: renderHead({ req, title: event.name, robots: APP_ROBOTS }),
      active: 'events',
      workspace: workspaceHeader({ event, active: tab }),
      slots: { 'initial-tab': tab },
    });
  }

  app.get('/host/:eventId', requirePageAuth, workspace);
  app.get('/host/:eventId/:tab', requirePageAuth, workspace);

  // ---------------------------------------------------------------- Forms

  app.get('/forms', requirePageAuth, appPage('forms.html', 'Forms', 'forms'));
  app.get('/forms/new', requirePageAuth, appPage('form-new.html', 'New form', 'forms'));

  const FORM_TABS = new Set(['responses', 'share', 'settings']);

  async function formBuilder(req, res) {
    const tab = req.params.tab || 'questions';
    if (req.params.tab && !FORM_TABS.has(tab)) return notFound(req, res);
    const { rows } = await pool.query(
      `SELECT f.*, e.name AS event_name, e.published_at AS event_published_at,
              (SELECT count(*) FROM form_responses r WHERE r.form_id = f.id)::int AS response_count
       FROM forms f LEFT JOIN events e ON e.id = f.event_id
       WHERE f.id::text = $1 AND f.owner_id = $2`,
      [req.params.formId, req.user.id]
    );
    const form = rows[0];
    if (!form) return notFound(req, res);
    // RSVP questions have no share or settings of their own.
    if (form.kind === 'rsvp' && (tab === 'share' || tab === 'settings')) return notFound(req, res);

    form.status =
      form.kind === 'rsvp'
        ? form.event_published_at ? 'open' : 'draft'
        : !form.published_at
          ? 'draft'
          : closedReason(form, form.response_count)
            ? 'closed'
            : 'open';

    page(req, res, 'form-builder.html', {
      head: renderHead({ req, title: form.kind === 'rsvp' ? 'RSVP questions' : form.title, robots: APP_ROBOTS }),
      active: form.kind === 'rsvp' ? 'events' : 'forms',
      workspace: formHeader({ form, active: tab }),
      slots: { 'initial-tab': tab, 'form-kind': form.kind },
    });
  }

  app.get('/forms/:formId', requirePageAuth, formBuilder);
  app.get('/forms/:formId/:tab', requirePageAuth, formBuilder);

  // The public page people fill in. Forms are shared by link and usually
  // private, so they're never indexed; they still get a proper title and
  // preview card for when the link is pasted into a chat.
  app.get('/f/:slug', async (req, res) => {
    const { rows } = await pool.query(
      `SELECT title, description, published_at, owner_id FROM forms WHERE slug = $1 AND kind = 'standalone'`,
      [req.params.slug]
    );
    const form = rows[0];
    const visible = form && (form.published_at || (req.user && req.user.id === form.owner_id));
    page(req, res, 'form-fill.html', {
      status: form ? 200 : 404,
      head: renderHead({
        req,
        title: visible ? form.title : form ? 'Form not open yet' : 'Form not found',
        description: visible ? form.description || `Fill in "${form.title}" on RSVPfor.` : 'This form is not available.',
        robots: APP_ROBOTS,
      }),
      slots: { 'form-title': visible ? escapeHtml(form.title) : form ? 'This form isn’t open yet' : 'Form not found' },
    });
  });

  // ---------------------------------------------------------------- QR codes

  // Drawn here rather than in the browser, so a code always appears: no CDN to
  // be blocked, nothing to fail silently, and crisp at any size in print.
  // Only the finished pattern is ever emitted, never the text, so there's
  // nothing to inject through.
  app.get('/qr.svg', (req, res) => {
    const svg = svgFor(req.query.data, { level: req.query.level });
    if (!svg) return res.status(400).type('text/plain').send('A QR code needs some text to encode.');
    res.set('Content-Type', 'image/svg+xml; charset=utf-8');
    // The same text always draws the same code, so let it cache hard.
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    if (req.query.download) {
      const name = String(req.query.name || 'qr-code').replace(/[^a-z0-9-]+/gi, '-').slice(0, 50) || 'qr-code';
      res.set('Content-Disposition', `attachment; filename="${name}.svg"`);
    }
    res.send(svg);
  });

  // ---------------------------------------------------------------- Crawlers

  // The owner's console. Anyone else gets the ordinary not-found page, so the
  // existence of the console is not something a signed-in stranger can confirm.
  app.get('/admin', requirePageAuth, (req, res) => {
    if (!isAdmin(req.user)) return notFound(req, res);
    page(req, res, 'admin.html', {
      head: renderHead({ req, title: 'Site admin', robots: APP_ROBOTS }),
    });
  });

  // Contact, terms, privacy and the site index. One shell, four bodies.
  for (const info of INFO_PAGES) {
    app.get(`/${info.slug}`, (req, res) => {
      const p = findInfoPage(info.slug);
      page(req, res, 'info.html', {
        head: renderHead({
          req,
          title: p.title,
          description: p.lede,
          canonicalPath: `/${p.slug}`,
          robots: 'index,follow',
        }),
        slots: {
          eyebrow: escapeHtml(p.eyebrow),
          title: escapeHtml(p.title),
          lede: escapeHtml(p.lede),
          body: p.body,
          updated: p.updated ? escapeHtml(p.updated) : '',
        },
      });
    });
  }

  app.get('/robots.txt', (req, res) => {
    const lines = isDevHost(req)
      ? ['User-agent: *', 'Disallow: /']
      : [
          'User-agent: *',
          'Disallow: /host/',
          'Disallow: /dashboard',
          'Disallow: /events',
          'Disallow: /settings',
          'Disallow: /forms',
          'Disallow: /login',
          'Disallow: /api/',
          'Disallow: /auth/',
          'Disallow: /t/',
          'Disallow: /embed/',
          '',
          `Sitemap: ${baseUrl(req)}/sitemap.xml`,
        ];
    res.type('text/plain').send(`${lines.join('\n')}\n`);
  });

  app.get('/sitemap.xml', async (req, res) => {
    const base = baseUrl(req);
    const { rows: events } = await pool.query(
      `SELECT slug, published_at FROM events
       WHERE published_at IS NOT NULL AND visibility = 'public' AND event_date > now()
       ORDER BY event_date ASC LIMIT 5000`
    );
    const { rows: cats } = await pool.query(
      `SELECT DISTINCT category FROM events
       WHERE published_at IS NOT NULL AND visibility = 'public' AND event_date > now() AND category IS NOT NULL`
    );
    // Only hosts with something public to show — an empty profile is a thin page.
    const { rows: hosts } = await pool.query(
      `SELECT DISTINCT u.handle FROM users u JOIN events e ON e.owner_id = u.id
       WHERE u.public_profile = true AND u.handle IS NOT NULL
         AND e.published_at IS NOT NULL AND e.visibility = 'public'`
    );

    const url = (loc, lastmod) =>
      `<url><loc>${escapeHtml(loc)}</loc>${lastmod ? `<lastmod>${new Date(lastmod).toISOString().slice(0, 10)}</lastmod>` : ''}</url>`;
    const body = [
      url(`${base}/`),
      url(`${base}/explore`),
      ...INFO_PAGES.map((p) => url(`${base}/${p.slug}`)),
      ...cats.map((c) => url(`${base}/explore/${c.category}`)),
      ...events.map((e) => url(`${base}/e/${e.slug}`, e.published_at)),
      ...hosts.map((h) => url(`${base}/@${h.handle}`)),
    ].join('\n  ');

    res
      .type('application/xml')
      .send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  ${body}\n</urlset>\n`);
  });

  function notFound(req, res) {
    page(req, res, 'notfound.html', {
      status: 404,
      head: renderHead({ req, title: 'Page not found', robots: APP_ROBOTS }),
    });
  }

  return { notFound };
}

module.exports = { registerPages };
