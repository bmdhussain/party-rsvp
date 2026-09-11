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

const WHEN_OPTIONS = [
  { id: '', label: 'Any time' },
  { id: 'today', label: 'Today' },
  { id: 'weekend', label: 'This weekend' },
  { id: 'week', label: 'Next 7 days' },
  { id: 'month', label: 'Next 30 days' },
];

// Date windows, in the server's clock (UTC). "This weekend" runs from Saturday
// 00:00 to Monday 00:00 of the current ISO week, so on a Sunday it still
// covers the rest of today.
const WHEN_SQL = {
  today: `e.event_date < date_trunc('day', now()) + interval '1 day'`,
  weekend: `e.event_date >= date_trunc('week', now()) + interval '5 days'
            AND e.event_date < date_trunc('week', now()) + interval '7 days'`,
  week: `e.event_date < now() + interval '7 days'`,
  month: `e.event_date < now() + interval '30 days'`,
};

function likeParam(text) {
  return `%${text.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
}

// Builds the browse query. Three rules are non-negotiable and enforced here
// rather than left to callers: only published events, only 'public' ones, and
// only ones that haven't happened yet.
function buildBrowseQuery({ q, category, when, where: place, limit = 24, offset = 0 } = {}) {
  const where = [
    'e.published_at IS NOT NULL',
    `e.visibility = 'public'`,
    'e.event_date IS NOT NULL',
    'e.event_date > now()',
  ];
  const params = [];

  const term = typeof q === 'string' ? q.trim().slice(0, 80) : '';
  if (term) {
    params.push(likeParam(term));
    const p = `$${params.length}`;
    where.push(`(e.name ILIKE ${p} OR e.location ILIKE ${p} OR e.description ILIKE ${p})`);
  }

  const placeTerm = typeof place === 'string' ? place.trim().slice(0, 80) : '';
  if (placeTerm) {
    params.push(likeParam(placeTerm));
    where.push(`e.location ILIKE $${params.length}`);
  }

  if (typeof when === 'string' && WHEN_SQL[when]) where.push(WHEN_SQL[when]);

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
           u.name AS host_name,
           CASE WHEN u.public_profile THEN u.handle END AS host_handle,
           COALESCE(SUM(CASE WHEN r.status = 'confirmed' THEN r.adults + r.kids END), 0)::int AS going
    FROM events e
    JOIN users u ON u.id = e.owner_id
    LEFT JOIN rsvps r ON r.event_id = e.id
    WHERE ${where.join(' AND ')}
    GROUP BY e.id, e.slug, e.name, e.event_date, e.location, e.category, e.capacity,
             e.image_data, e.template_id, u.name, u.handle, u.public_profile
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

function categoryLabel(id) {
  return CATEGORIES.find((c) => c.id === id)?.label || null;
}

module.exports = {
  CATEGORIES,
  WHEN_OPTIONS,
  categoryLabel,
  normalizeVisibility,
  normalizeCategory,
  normalizeHandle,
  buildBrowseQuery,
  RESERVED_HANDLES,
};
