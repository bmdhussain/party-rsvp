// Site-wide settings the owner can change without a deploy: which theme the
// site wears, which seasonal doodle sits on the logo, and the logo itself.
//
// Every page render needs these, so they are cached in the process and the
// cache is dropped on write. One row, id = 1, because there is one site.

const THEMES = [
  { id: 'default', label: 'Sunrise', note: 'The original — warm cream, plum and coral.' },
  { id: 'dusk', label: 'Dusk', note: 'Dark, for evening events. Indigo and candlelight.' },
  { id: 'garden', label: 'Garden', note: 'Light and green. Daytime, outdoors, informal.' },
];

// Seasonal marks that sit beside the wordmark. Drawn here rather than uploaded
// so they inherit the header's colour and stay crisp at any size.
const DOODLES = [
  { id: 'none', label: 'None', note: 'Just the wordmark.' },
  {
    id: 'christmas',
    label: 'Christmas',
    note: 'A hat on the R.',
    svg: `<path d="M2 15c1-7 5-11 10-11s9 4 10 11z" fill="#d64545"/>
          <path d="M1 15h22a1.6 1.6 0 0 1 0 3.2H1A1.6 1.6 0 0 1 1 15z" fill="#fff"/>
          <circle cx="20.5" cy="4.5" r="3.2" fill="#fff"/>`,
  },
  {
    id: 'ramadan',
    label: 'Ramadan',
    note: 'Crescent and star.',
    svg: `<path d="M16.5 3a9.5 9.5 0 1 0 0 18 7.6 7.6 0 0 1 0-18z" fill="#3f8f7d"/>
          <path d="M19.6 7.4l1.25 2.6 2.85.4-2.07 2 .5 2.83-2.53-1.35-2.54 1.35.5-2.83-2.07-2 2.86-.4z" fill="#e7b55c"/>`,
  },
  {
    id: 'eid',
    label: 'Eid',
    note: 'A hanging lantern.',
    svg: `<path d="M12 1.6v2.2" stroke="#8a6a2f" stroke-width="1.4" stroke-linecap="round"/>
          <path d="M6.6 4.4h10.8v1.9H6.6z" fill="#8a6a2f"/>
          <path d="M8 6.3h8c1.5 2 2.2 4.2 2.2 6.4S17.5 17 16 19H8c-1.5-2-2.2-4.1-2.2-6.3S6.5 8.3 8 6.3z" fill="#e7b55c"/>
          <path d="M10.6 9.2h2.8v6h-2.8z" fill="#fff6e0" opacity=".75"/>
          <path d="M6.6 19h10.8v1.9H6.6z" fill="#8a6a2f"/>`,
  },
  {
    id: 'diwali',
    label: 'Diwali',
    note: 'A lit diya.',
    svg: `<path d="M12 2.6c1.9 2.4 2.9 4.2 2.9 5.7a2.9 2.9 0 1 1-5.8 0c0-1.5 1-3.3 2.9-5.7z" fill="#e7b55c"/>
          <path d="M12 5.4c.9 1.4 1.4 2.4 1.4 3.2a1.4 1.4 0 1 1-2.8 0c0-.8.5-1.8 1.4-3.2z" fill="#fff2cf"/>
          <path d="M3.4 13.6h17.2c0 3.9-3.85 6.8-8.6 6.8s-8.6-2.9-8.6-6.8z" fill="#b4552f"/>
          <path d="M3.4 13.6h17.2a1.5 1.5 0 0 1 0 1.9H3.4a1.5 1.5 0 0 1 0-1.9z" fill="#8e3f22"/>`,
  },
  {
    id: 'hanukkah',
    label: 'Hanukkah',
    note: 'A menorah.',
    svg: `<g stroke="#2f5d9e" stroke-width="1.5" fill="none" stroke-linecap="round">
            <path d="M12 8.4v9.4"/><path d="M4 17.8v-4.2M8 17.8v-5.6M16 17.8v-5.6M20 17.8v-4.2"/>
            <path d="M4 13.6c0-2 1.8-3 4-3M20 13.6c0-2-1.8-3-4-3M8 12.2c0-1.4 1.2-2.2 4-2.2M16 12.2c0-1.4-1.2-2.2-4-2.2"/>
            <path d="M6.4 20.4h11.2"/>
          </g>
          <g fill="#e7b55c">
            <circle cx="4" cy="12.4" r="1.5"/><circle cx="8" cy="11" r="1.5"/><circle cx="12" cy="7.2" r="1.7"/>
            <circle cx="16" cy="11" r="1.5"/><circle cx="20" cy="12.4" r="1.5"/>
          </g>`,
  },
  {
    id: 'lunar-new-year',
    label: 'Lunar New Year',
    note: 'A paper lantern.',
    svg: `<path d="M12 1.8v2.4" stroke="#b4342f" stroke-width="1.4" stroke-linecap="round"/>
          <ellipse cx="12" cy="11.6" rx="7.4" ry="7" fill="#d6453f"/>
          <path d="M9.1 5.4c-1 1.9-1.5 4-1.5 6.2s.5 4.3 1.5 6.2M14.9 5.4c1 1.9 1.5 4 1.5 6.2s-.5 4.3-1.5 6.2" stroke="#a72d28" stroke-width="1" fill="none"/>
          <path d="M6.6 5.8h10.8v1.7H6.6zM6.6 15.7h10.8v1.7H6.6z" fill="#e7b55c"/>
          <path d="M12 18.4v3.6" stroke="#e7b55c" stroke-width="1.4" stroke-linecap="round"/>`,
  },
  {
    id: 'new-year',
    label: 'New Year',
    note: 'A burst of confetti.',
    svg: `<g stroke-linecap="round" stroke-width="2" fill="none">
            <path d="M12 2.4v3.4" stroke="#e7b55c"/><path d="M4.9 5.3l2.4 2.4" stroke="#d66a61"/>
            <path d="M19.1 5.3l-2.4 2.4" stroke="#4b9186"/><path d="M2.6 12.4h3.4" stroke="#4b9186"/>
            <path d="M18 12.4h3.4" stroke="#e7b55c"/>
          </g>
          <circle cx="12" cy="12.6" r="4" fill="#d66a61"/>
          <g fill="#e7b55c"><circle cx="6.6" cy="18.6" r="1.4"/><circle cx="12" cy="20.6" r="1.4"/><circle cx="17.4" cy="18.6" r="1.4"/></g>`,
  },
];

const DEFAULTS = { theme: 'default', doodle: 'none', logo_mime: null, logo_updated_at: null };

let cache = null;

function themeIds() {
  return new Set(THEMES.map((t) => t.id));
}

function registerThemes(extra) {
  for (const t of extra) if (!themeIds().has(t.id)) THEMES.push(t);
}

function findDoodle(id) {
  return DOODLES.find((d) => d.id === id) || DOODLES[0];
}

// A settings read happens on every page render, so it must not be a query every
// time. Any write clears this.
async function getSettings(pool) {
  if (cache) return cache;
  try {
    const { rows } = await pool.query(
      'SELECT theme, doodle, logo_mime, logo_updated_at FROM site_settings WHERE id = 1'
    );
    cache = { ...DEFAULTS, ...(rows[0] || {}) };
  } catch {
    // A missing table must not take the site down; the defaults are a fine site.
    cache = { ...DEFAULTS };
  }
  if (!themeIds().has(cache.theme)) cache.theme = 'default';
  return cache;
}

function clearCache() {
  cache = null;
}

async function saveSettings(pool, patch, userId) {
  const fields = [];
  const values = [];
  for (const key of ['theme', 'doodle']) {
    if (patch[key] !== undefined) {
      fields.push(key);
      values.push(patch[key]);
    }
  }
  if (patch.logo !== undefined) {
    fields.push('logo_data', 'logo_mime', 'logo_updated_at');
    values.push(patch.logo ? patch.logo.buffer : null, patch.logo ? patch.logo.mime : null, new Date());
  }
  if (!fields.length) return getSettings(pool);

  const assignments = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
  const insertCols = ['id', ...fields, 'updated_by'].join(', ');
  const insertVals = ['1', ...fields.map((_, i) => `$${i + 1}`), `$${fields.length + 1}`].join(', ');
  await pool.query(
    `INSERT INTO site_settings (${insertCols}) VALUES (${insertVals})
     ON CONFLICT (id) DO UPDATE SET ${assignments}, updated_by = $${fields.length + 1}, updated_at = now()`,
    [...values, userId || null]
  );
  clearCache();
  return getSettings(pool);
}

// The owner list lives in the environment, not in the database, so an admin
// cannot be created by anything that can write to the database.
function adminEmails() {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function isAdmin(user) {
  if (!user || !user.email) return false;
  return adminEmails().includes(String(user.email).toLowerCase());
}

module.exports = {
  THEMES, DOODLES, DEFAULTS,
  registerThemes, findDoodle, themeIds,
  getSettings, saveSettings, clearCache,
  isAdmin, adminEmails,
};
