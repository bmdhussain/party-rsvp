// Server-side page assembly. The pages in public/ are plain HTML with a few
// placeholder comments; this fills them in per request with the shared site
// header and footer, the event workspace header, and the SEO/preview tags.
//
// Doing it on the server rather than in the browser matters for two readers
// that never run JavaScript: search-engine crawlers and link-preview fetchers
// (WhatsApp, iMessage, Slack). They only ever see what's in the first response.

const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const SITE_NAME = 'RSVPfor';
const DEFAULT_DESCRIPTION =
  'Invitations for the people you know and public event pages for the ones you haven\'t met yet. Take RSVPs and registrations, and see exactly who is coming.';

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// JSON inside a <script> tag ends at the first "</script>" regardless of JSON
// quoting, so a guest-controlled event name could otherwise break out of it.
function safeJsonForScript(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

function truncate(text, max) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
}

// Re-read a page only when it changes on disk, so edits show up without a
// restart but a busy page isn't read from disk on every request.
const templateCache = new Map();
function loadTemplate(file) {
  const full = path.join(PUBLIC_DIR, file);
  const { mtimeMs } = fs.statSync(full);
  const cached = templateCache.get(full);
  if (cached && cached.mtimeMs === mtimeMs) return cached.html;
  const html = fs.readFileSync(full, 'utf8');
  templateCache.set(full, { mtimeMs, html });
  return html;
}

function baseUrl(req) {
  // PUBLIC_BASE_URL lets production pin canonical URLs to the real domain even
  // when the app is also reachable on its *.replit.app address.
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/+$/, '');
  return `${req.protocol}://${req.get('host')}`;
}

// The Replit workspace serves on *.replit.dev. It's a development copy and
// must never be indexed, or it competes with the real site in search results.
// Deployments and custom domains never use that suffix.
function isDevHost(req) {
  return /\.replit\.dev$/i.test(req.hostname || '');
}

function renderHead({
  req,
  title,
  description = DEFAULT_DESCRIPTION,
  canonicalPath,
  image,
  imageAlt,
  type = 'website',
  robots = 'index,follow',
  jsonLd,
}) {
  const fullTitle = title ? `${title} · ${SITE_NAME}` : `${SITE_NAME} — Invitations, events and RSVPs`;
  const base = baseUrl(req);
  const canonical = canonicalPath ? `${base}${canonicalPath}` : null;
  const imageUrl = image ? (image.startsWith('http') ? image : `${base}${image}`) : `${base}/og-default.jpg`;
  const effectiveRobots = isDevHost(req) ? 'noindex,nofollow' : robots;

  const tags = [
    `<title>${escapeHtml(fullTitle)}</title>`,
    `<meta name="description" content="${escapeHtml(truncate(description, 180))}" />`,
    `<meta name="robots" content="${escapeHtml(effectiveRobots)}" />`,
    canonical ? `<link rel="canonical" href="${escapeHtml(canonical)}" />` : '',
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:type" content="${escapeHtml(type)}" />`,
    `<meta property="og:title" content="${escapeHtml(title || fullTitle)}" />`,
    `<meta property="og:description" content="${escapeHtml(truncate(description, 200))}" />`,
    canonical ? `<meta property="og:url" content="${escapeHtml(canonical)}" />` : '',
    `<meta property="og:image" content="${escapeHtml(imageUrl)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    imageAlt ? `<meta property="og:image:alt" content="${escapeHtml(imageAlt)}" />` : '',
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="theme-color" content="#2f2237" />`,
    `<link rel="icon" href="/favicon.svg" type="image/svg+xml" />`,
    // Last in <head> on purpose: pages put <!--HEAD--> after their own
    // stylesheets, so the shared app styles win where they overlap.
    `<link rel="stylesheet" href="/app.css" />`,
    `<script src="/site.js" defer></script>`,
    ...(Array.isArray(jsonLd) ? jsonLd : jsonLd ? [jsonLd] : []).map(
      (data) => `<script type="application/ld+json">${safeJsonForScript(data)}</script>`
    ),
  ];
  return tags.filter(Boolean).join('\n  ');
}

const BRAND =
  '<a class="brand" href="/" aria-label="RSVPfor home"><span class="brand-mark">R</span><span class="brand-wordmark"><span class="brand-rsvp">RSVP</span><span class="brand-for">for</span></span></a>';

function initials(name) {
  return String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');
}

// One header for the whole site. `active` highlights where the visitor is, so
// there's always an answer to "where am I and how do I get back?".
function siteHeader({ user, active = '' } = {}) {
  const link = (href, label, key) =>
    `<a class="nav-link nav-${key}${active === key ? ' is-active' : ''}" href="${href}"${
      active === key ? ' aria-current="page"' : ''
    }>${label}</a>`;

  const account = user
    ? `<details class="account-menu">
        <summary aria-label="Account menu">${
          user.avatar_url
            ? `<img class="account-avatar" src="${escapeHtml(user.avatar_url)}" alt="" referrerpolicy="no-referrer" />`
            : `<span class="account-avatar account-initials">${escapeHtml(initials(user.name))}</span>`
        }<span class="account-name">${escapeHtml(String(user.name || '').split(' ')[0])}</span></summary>
        <div class="account-menu-panel">
          <div class="account-menu-who"><strong>${escapeHtml(user.name)}</strong>${
            user.email ? `<small>${escapeHtml(user.email)}</small>` : ''
          }</div>
          <a href="/dashboard">Dashboard</a>
          <a href="/events">My events</a>
          <a href="/forms">Forms</a>
          ${user.handle && user.public_profile ? `<a href="/@${escapeHtml(user.handle)}">My public page</a>` : ''}
          <a href="/settings">Settings</a>
          <button type="button" data-logout>Sign out</button>
        </div>
      </details>`
    : link('/login', 'Sign in', 'login');

  return `<header class="site-header app-header">
      ${BRAND}
      <nav class="header-nav primary-nav" aria-label="Main">
        ${link('/explore', 'Explore', 'explore')}
        ${user ? link('/dashboard', 'Dashboard', 'dashboard') + link('/events', 'My events', 'events') + link('/forms', 'Forms', 'forms') : ''}
        <a class="btn btn-primary btn-small nav-cta" href="/events/new" aria-label="Create event"><span>+ Create<span class="nav-cta-extra"> event</span></span></a>
        ${account}
      </nav>
    </header>`;
}

function siteFooter({ user } = {}) {
  return `<footer class="site-footer app-footer">
      <div class="footer-brand"><span class="footer-wordmark"><span class="brand-rsvp">RSVP</span><span class="brand-for">for</span></span><small>Invitations and events worth showing up for.</small></div>
      <nav class="footer-links" aria-label="Footer">
        <a href="/explore">Explore events</a>
        <a href="/events/new">Create an event</a>
        ${user ? '<a href="/dashboard">Dashboard</a><a href="/settings">Settings</a>' : '<a href="/login">Host sign in</a>'}
      </nav>
      <nav class="footer-links footer-legal" aria-label="About this site">
        <a href="/sitemap">Site map</a>
        <a href="/contact">Contact</a>
        <a href="/terms">Terms</a>
        <a href="/privacy">Privacy</a>
      </nav>
      <p class="footer-fine">No advertising or analytics trackers. Your guest list is yours.</p>
    </footer>`;
}

const WORKSPACE_TABS = [
  { key: 'overview', label: 'Overview', path: '' },
  { key: 'design', label: 'Design', path: '/design' },
  { key: 'guests', label: 'Guests', path: '/guests' },
  { key: 'checkin', label: 'Check-in', path: '/checkin' },
  { key: 'share', label: 'Share', path: '/share' },
  { key: 'settings', label: 'Settings', path: '/settings' },
];

// The header for everything to do with one event: a breadcrumb back to the
// list, the event's name and status, and tabs. Every tab has its own URL, so
// the browser's back button and a bookmarked link both land where expected.
// Server-rendered dates are written in UTC with the ISO value alongside;
// site.js rewrites them into the visitor's own timezone on load. Crawlers get
// a correct (if UTC) date either way.
function localTime(iso, style = 'date') {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const opts =
    style === 'datetime'
      ? { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }
      : { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' };
  return `<time datetime="${escapeHtml(date.toISOString())}" data-local="${style}">${escapeHtml(
    date.toLocaleString('en-US', opts)
  )}</time>`;
}

function workspaceHeader({ event, active, actions = true }) {
  const live = Boolean(event.published_at);
  const when = event.event_date ? localTime(event.event_date, 'date') : 'No date yet';
  const tabs = WORKSPACE_TABS.map((t) => {
    const isActive = t.key === active;
    // Check-in is its own page (it holds the camera); everything else switches
    // in place, which the data-tab attribute tells the page script to handle.
    const dataTab = t.key === 'checkin' ? '' : ` data-tab="${t.key}"`;
    return `<a class="workspace-tab${isActive ? ' is-active' : ''}" href="/host/${escapeHtml(event.id)}${t.path}"${dataTab}${
      isActive ? ' aria-current="page"' : ''
    }>${t.label}</a>`;
  }).join('');

  return `<div class="workspace-head">
      <nav class="breadcrumb" aria-label="Breadcrumb"><a href="/events">My events</a><span aria-hidden="true">›</span><span aria-current="page">${escapeHtml(
        event.name
      )}</span></nav>
      <div class="workspace-title-row">
        <div class="workspace-title">
          <h1 id="event-title">${escapeHtml(event.name)}</h1>
          <div class="workspace-meta"><span class="status-pill ${live ? 'is-live' : 'is-draft'}" id="event-status-pill">${
            live ? 'Live' : 'Draft'
          }</span><span>${when}</span></div>
        </div>
        <div class="workspace-actions">
          <a class="btn btn-ghost btn-small" id="header-preview-link" href="/e/${escapeHtml(event.slug)}" target="_blank" rel="noopener">${
            live ? 'View event page ↗' : 'Preview ↗'
          }</a>
          ${
            actions
              ? `<button class="btn btn-primary btn-small" id="header-publish-btn" type="button" data-publish${
                  live ? ' hidden' : ''
                }>Publish event</button><button class="btn btn-primary btn-small" id="copy-link-btn" type="button"${
                  live ? '' : ' hidden'
                }>Copy link</button>`
              : ''
          }
        </div>
      </div>
      <nav class="workspace-tabs" aria-label="Event sections">${tabs}</nav>
    </div>`;
}

// The header for one form: a breadcrumb back to where it lives (the forms list,
// or its event for RSVP questions), its title and status, and tabs with real
// URLs. RSVP questions have no Share or Settings tab — they go live with, and
// are shared through, their event.
function formHeader({ form, active }) {
  const isRsvp = form.kind === 'rsvp';
  const statusLabel = { draft: 'Draft', open: 'Open', closed: 'Closed' }[form.status] || 'Draft';
  const pillClass = form.status === 'open' ? 'is-live' : form.status === 'closed' ? 'is-past' : 'is-draft';
  const tabs = (isRsvp
    ? [['questions', 'Questions', ''], ['responses', 'Answers', '/responses']]
    : [['questions', 'Questions', ''], ['responses', 'Responses', '/responses'], ['share', 'Share', '/share'], ['settings', 'Settings', '/settings']]
  )
    .map(([key, label, suffix]) => {
      const isActive = key === active;
      return `<a class="workspace-tab${isActive ? ' is-active' : ''}" href="/forms/${escapeHtml(form.id)}${suffix}" data-tab="${key}"${
        isActive ? ' aria-current="page"' : ''
      }>${label}</a>`;
    })
    .join('');

  const crumb = isRsvp
    ? `<a href="/events">My events</a><span aria-hidden="true">›</span><a href="/host/${escapeHtml(form.event_id)}/settings">${escapeHtml(
        form.event_name || 'Event'
      )}</a><span aria-hidden="true">›</span><span aria-current="page">RSVP questions</span>`
    : `<a href="/forms">Forms</a><span aria-hidden="true">›</span><span aria-current="page">${escapeHtml(form.title)}</span>`;

  return `<div class="workspace-head form-head">
      <nav class="breadcrumb" aria-label="Breadcrumb">${crumb}</nav>
      <div class="workspace-title-row">
        <div class="workspace-title">
          <h1 id="form-title-heading">${escapeHtml(isRsvp ? `RSVP questions · ${form.event_name || ''}` : form.title)}</h1>
          <div class="workspace-meta"><span class="status-pill ${pillClass}" id="form-status-pill">${
            isRsvp ? (form.status === 'open' ? 'Live with event' : 'Event is a draft') : statusLabel
          }</span><span id="form-response-count">${Number(form.response_count) || 0} ${
            Number(form.response_count) === 1 ? 'response' : 'responses'
          }</span></div>
        </div>
        <div class="workspace-actions">
          ${
            isRsvp
              ? `<a class="btn btn-ghost btn-small" href="/host/${escapeHtml(form.event_id)}/settings">← Back to event</a>`
              : `<a class="btn btn-ghost btn-small" id="header-form-preview" href="/f/${escapeHtml(
                  form.slug
                )}" target="_blank" rel="noopener">${
                  form.status === 'draft' ? 'Preview ↗' : 'Open form ↗'
                }</a><button class="btn btn-primary btn-small" id="header-form-publish" type="button" data-form-publish${
                  form.status === 'draft' ? '' : ' hidden'
                }>Publish form</button><button class="btn btn-primary btn-small" id="header-form-copy" type="button"${
                  form.status === 'draft' ? ' hidden' : ''
                }>Copy link</button>`
          }
        </div>
      </div>
      <nav class="workspace-tabs" aria-label="Form sections">${tabs}</nav>
    </div>`;
}

// Fills a page's placeholders. Anything not supplied is removed, so a page
// never shows a stray comment and a missing slot is simply empty.
function renderPage(res, file, { head = '', header = '', footer = '', workspace = '', slots = {}, status = 200 } = {}) {
  let html = loadTemplate(file)
    .split('<!--HEAD-->')
    .join(head)
    .split('<!--HEADER-->')
    .join(header)
    .split('<!--FOOTER-->')
    .join(footer)
    .split('<!--WORKSPACE-->')
    .join(workspace);
  for (const [name, value] of Object.entries(slots)) {
    html = html.split(`<!--SLOT:${name}-->`).join(value);
  }
  html = html.replace(/<!--SLOT:[a-z0-9_-]+-->/gi, '');
  res.status(status).set('Content-Type', 'text/html; charset=utf-8').send(html);
}

module.exports = {
  escapeHtml,
  safeJsonForScript,
  truncate,
  renderHead,
  renderPage,
  siteHeader,
  siteFooter,
  workspaceHeader,
  formHeader,
  localTime,
  baseUrl,
  isDevHost,
  SITE_NAME,
  DEFAULT_DESCRIPTION,
  WORKSPACE_TABS,
};
