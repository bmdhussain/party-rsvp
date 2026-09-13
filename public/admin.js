// The owner's console. Every change here is live for every visitor the moment
// it saves, so each one confirms out loud rather than saving quietly.

const toast = (msg, opts) => window.RSVPfor?.toast(msg, opts);

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str == null ? '' : String(str);
  return d.innerHTML;
}

// If the console decides the sign-in is too old to trust, it answers with where
// to go and prove it again. Follow that rather than showing an error the reader
// can do nothing with.
function reauthIfAsked(data, res) {
  if (res.status === 401 && data && data.reauth) {
    window.location.href = data.reauth;
    return true;
  }
  return false;
}

let state = { settings: {}, themes: [], doodles: [], admins: [] };

const TILES = [
  ['hosts', 'Hosts'],
  ['events', 'Events'],
  ['published', 'Published'],
  ['public_events', 'Public'],
  ['rsvps', 'RSVPs'],
  ['forms', 'Forms'],
  ['responses', 'Form replies'],
  ['events_30d', 'Events, 30 days'],
  ['rsvps_30d', 'RSVPs, 30 days'],
];

async function loadOverview() {
  const box = document.getElementById('admin-tiles');
  try {
    const res = await fetch('/api/admin/overview');
    if (!res.ok) throw new Error();
    const data = await res.json();
    box.innerHTML = TILES.map(
      ([key, label]) =>
        `<div class="stat-tile"><div class="num">${Number(data[key] || 0).toLocaleString()}</div><div class="label">${escapeHtml(label)}</div></div>`
    ).join('');
  } catch {
    box.innerHTML = '<div class="empty-note">Couldn\'t load the counts.</div>';
  }
}

function renderThemes() {
  document.getElementById('theme-grid').innerHTML = state.themes
    .map(
      (t) => `
      <button type="button" class="admin-theme${t.id === state.settings.theme ? ' is-active' : ''}" data-theme="${escapeHtml(t.id)}">
        <span class="admin-theme-swatch" data-swatch="${escapeHtml(t.id)}"></span>
        <span class="admin-theme-name">${escapeHtml(t.label)}</span>
        <span class="admin-theme-note">${escapeHtml(t.note || '')}</span>
        ${t.id === state.settings.theme ? '<span class="admin-chosen">In use</span>' : ''}
      </button>`
    )
    .join('');
}

function renderDoodles() {
  document.getElementById('doodle-grid').innerHTML = state.doodles
    .map(
      (d) => `
      <button type="button" class="admin-doodle${d.id === state.settings.doodle ? ' is-active' : ''}" data-doodle="${escapeHtml(d.id)}">
        <span class="admin-doodle-art">${d.svg ? `<svg viewBox="0 0 24 24" width="34" height="34">${d.svg}</svg>` : '<span class="admin-doodle-none">—</span>'}</span>
        <span class="admin-doodle-name">${escapeHtml(d.label)}</span>
        <span class="admin-theme-note">${escapeHtml(d.note || '')}</span>
        ${d.id === state.settings.doodle ? '<span class="admin-chosen">In use</span>' : ''}
      </button>`
    )
    .join('');
}

function renderLogo() {
  const preview = document.getElementById('logo-preview');
  const remove = document.getElementById('logo-remove');
  if (state.settings.hasLogo) {
    const v = state.settings.logoUpdatedAt ? new Date(state.settings.logoUpdatedAt).getTime() : Date.now();
    preview.innerHTML = `<img src="/site/logo?v=${v}" alt="The logo currently in use" />`;
    remove.hidden = false;
  } else {
    preview.innerHTML = '<span class="empty-note">Using the wordmark</span>';
    remove.hidden = true;
  }
}

function renderAdmins() {
  const list = document.getElementById('admin-admins');
  list.innerHTML = state.admins.length
    ? state.admins.map((e) => `<li>${escapeHtml(e)}</li>`).join('')
    : '<li class="empty-note">ADMIN_EMAILS is empty, so nobody can reach this screen — including you, once your session ends.</li>';
}

async function load() {
  const res = await fetch('/api/admin/settings');
  const data = await res.json().catch(() => ({}));
  if (reauthIfAsked(data, res)) return;
  if (!res.ok) {
    document.getElementById('theme-grid').innerHTML = '<div class="empty-note">Couldn\'t load settings.</div>';
    return;
  }
  state = { settings: data.settings, themes: data.themes, doodles: data.doodles, admins: data.admins };
  renderThemes();
  renderDoodles();
  renderLogo();
  renderAdmins();
}

async function save(patch, message) {
  const res = await fetch('/api/admin/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const data = await res.json().catch(() => ({}));
  if (reauthIfAsked(data, res)) return;
  if (!res.ok) {
    toast(data.error || 'That did not save.', { kind: 'error' });
    return;
  }
  state.settings = { ...state.settings, ...data };
  renderThemes();
  renderDoodles();
  // The theme is written into the page on the server, so the change is only
  // visible after a reload — say so rather than leaving it looking broken.
  toast(message, { kind: 'success', action: { label: 'Reload', onClick: () => window.location.reload() } });
}

document.addEventListener('click', async (e) => {
  const theme = e.target.closest('[data-theme]');
  if (theme) {
    const id = theme.dataset.theme;
    if (id === state.settings.theme) return;
    await save({ theme: id }, 'Theme changed for the whole site. Reload to see it.');
    return;
  }
  const doodle = e.target.closest('[data-doodle]');
  if (doodle) {
    const id = doodle.dataset.doodle;
    if (id === state.settings.doodle) return;
    await save({ doodle: id }, id === 'none' ? 'Doodle removed. Reload to see it.' : 'Doodle is live. Reload to see it.');
    return;
  }
  if (e.target.id === 'logo-remove') {
    const res = await fetch('/api/admin/logo', { method: 'DELETE' });
    if (!res.ok) return toast('Could not remove the logo.', { kind: 'error' });
    state.settings.hasLogo = false;
    renderLogo();
    toast('Back to the wordmark. Reload to see it.', { kind: 'success', action: { label: 'Reload', onClick: () => window.location.reload() } });
  }
});

document.getElementById('logo-file').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  const error = document.getElementById('logo-error');
  error.style.display = 'none';
  if (!file) return;
  if (file.size > 512 * 1024) {
    error.textContent = 'That file is over 512KB. Try a smaller one.';
    error.style.display = 'block';
    e.target.value = '';
    return;
  }
  const body = new FormData();
  body.append('logo', file);
  const res = await fetch('/api/admin/logo', { method: 'POST', body });
  const data = await res.json().catch(() => ({}));
  e.target.value = '';
  if (!res.ok) {
    error.textContent = data.error || 'That upload did not work.';
    error.style.display = 'block';
    return;
  }
  state.settings.hasLogo = true;
  state.settings.logoUpdatedAt = new Date().toISOString();
  renderLogo();
  toast('Logo is live across the site. Reload to see it.', { kind: 'success', action: { label: 'Reload', onClick: () => window.location.reload() } });
});

loadOverview();
load();
