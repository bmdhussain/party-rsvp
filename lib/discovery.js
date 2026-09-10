// Public discovery: browsing, categories and per-event visibility.
//
// Visibility is the privacy hinge of the whole feature. 'unlisted' is the
// default and means exactly what every event does today — reachable by link,
// invisible to browse. Nothing becomes public without the host choosing it, and
// nothing is made public retroactively.

const CATEGORIES = [
  { id: 'birthday', label: 'Birthdays' },
  { id: 'wedding', label: 'Weddings' },
  { id: 'party', label: 'Parties' },
  { id: 'dinner', label: 'Dinners' },
  { id: 'community', label: 'Community' },
  { id: 'music', label: 'Music' },
  { id: 'sports', label: 'Sports' },
  { id: 'workshop', label: 'Workshops' },
  { id: 'other', label: 'Something else' },
];

const CATEGORY_IDS = new Set(CATEGORIES.map((c) => c.id));

function normalizeVisibility(value) {
  return value === 'public' ? 'public' : 'unlisted';
}

function normalizeCategory(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return CATEGORY_IDS.has(trimmed) ? trimmed : null;
}

// Builds the browse query. Two rules are non-negotiable and enforced here
// rather than left to callers: only 'public' events, and only ones that haven't
// happened yet.
function buildBrowseQuery({ q, category, limit = 24, offset = 0 } = {}) {
  const where = [`e.visibility = 'public'`, 'e.event_date IS NOT NULL', 'e.event_date > now()'];
  const params = [];

  const term = typeof q === 'string' ? q.trim().slice(0, 80) : '';
  if (term) {
    params.push(`%${term.replace(/[%_\\]/g, (m) => `\\${m}`)}%`);
    const p = `$${params.length}`;
    where.push(`(e.name ILIKE ${p} OR e.location ILIKE ${p} OR e.description ILIKE ${p})`);
  }

  const cat = normalizeCategory(category);
  if (cat) {
    params.push(cat);
    where.push(`e.category = $${params.length}`);
  }

  params.push(Math.min(Math.max(parseInt(limit, 10) || 24, 1), 48));
  const limitParam = `$${params.length}`;
  params.push(Math.max(parseInt(offset, 10) || 0, 0));
  const offsetParam = `$${params.length}`;

  const sql = `
    SELECT e.slug, e.name, e.event_date, e.location, e.category, e.capacity,
           (e.image_data IS NOT NULL OR e.template_id IS NOT NULL) AS has_image,
           u.name AS host_name, u.handle AS host_handle,
           COALESCE(SUM(CASE WHEN r.status = 'confirmed' THEN r.adults + r.kids END), 0)::int AS going
    FROM events e
    JOIN users u ON u.id = e.owner_id
    LEFT JOIN rsvps r ON r.event_id = e.id
    WHERE ${where.join(' AND ')}
    GROUP BY e.id, e.slug, e.name, e.event_date, e.location, e.category, e.capacity,
             e.image_data, e.template_id, u.name, u.handle
    ORDER BY e.event_date ASC
    LIMIT ${limitParam} OFFSET ${offsetParam}`;

  return { sql, params };
}

// Handles are the public identity of a host, so they live in URL space and have
// to be predictable: lowercase, no punctuation beyond an underscore, and long
// enough not to collide by accident.
const RESERVED_HANDLES = new Set([
  'admin', 'api', 'auth', 'browse', 'dashboard', 'e', 'embed', 'event', 'events',
  'faq', 'help', 'host', 'login', 'logout', 'me', 'new', 'public', 'rsvp',
  'settings', 'signup', 'static', 'support', 't', 'templates', 'ticket', 'www',
]);

function normalizeHandle(value) {
  if (typeof value !== 'string') return null;
  const handle = value.trim().replace(/^@/, '').toLowerCase();
  if (!/^[a-z0-9_]{3,30}$/.test(handle)) return null;
  if (RESERVED_HANDLES.has(handle)) return null;
  return handle;
}

module.exports = {
  CATEGORIES,
  normalizeVisibility,
  normalizeCategory,
  normalizeHandle,
  buildBrowseQuery,
  RESERVED_HANDLES,
};
