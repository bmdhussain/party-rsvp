// All of a host's events, grouped by where they are in their life. The active
// filter lives in the URL (?show=draft), so the browser's back button and a
// shared link both reopen the same view.

const FILTERS = ['all', 'draft', 'upcoming', 'past'];
let allEvents = [];

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function formatWhen(iso) {
  if (!iso) return 'No date yet';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'No date yet';
  return d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function currentFilter() {
  const show = new URLSearchParams(window.location.search).get('show');
  return FILTERS.includes(show) ? show : 'all';
}

function cardFor(e) {
  const pill =
    e.phase === 'draft'
      ? '<span class="status-pill is-draft">Draft</span>'
      : e.phase === 'past'
        ? '<span class="status-pill is-past">Past</span>'
        : '<span class="status-pill is-live">Live</span>';
  const openHref = e.phase === 'draft' && e.setup.next ? e.setup.next.href : `/host/${e.id}`;
  const pct = Math.round((e.setup.done / e.setup.total) * 100);

  const detail =
    e.phase === 'draft'
      ? `<div class="setup-progress" aria-hidden="true"><i style="width:${pct}%"></i></div>
         <small class="card-note">${e.setup.done} of ${e.setup.total} steps · Next: ${escapeHtml(e.setup.next?.label || 'Review')}</small>`
      : `<small class="card-note">${e.going} going · ${e.rsvp_count} ${e.rsvp_count === 1 ? 'reply' : 'replies'}${
          e.visibility === 'public' ? ' · Listed publicly' : ''
        }</small>`;

  const actions = [
    `<a class="btn btn-primary btn-small" href="${escapeHtml(openHref)}">${e.phase === 'draft' ? 'Continue' : 'Open'}</a>`,
    e.phase === 'upcoming' ? `<a class="btn btn-ghost btn-small" href="/host/${encodeURIComponent(e.id)}/share">Share</a>` : '',
    `<button class="btn btn-ghost btn-small" type="button" data-duplicate="${escapeHtml(e.id)}">${
      e.phase === 'past' ? 'Host it again' : 'Duplicate'
    }</button>`,
  ].join('');

  return `
    <article class="event-card">
      <a class="event-card-art" href="${escapeHtml(openHref)}">
        ${
          e.imageUrl
            ? `<img src="${escapeHtml(e.imageUrl)}" alt="" loading="lazy" />`
            : '<div class="event-art-placeholder"><span>✦</span><small>No look chosen yet</small></div>'
        }
      </a>
      <div class="event-card-content">
        <div class="event-card-topline">${pill}<span class="event-date">${escapeHtml(formatWhen(e.event_date))}</span></div>
        <h3><a class="event-card-title" href="${escapeHtml(openHref)}">${escapeHtml(e.name)}</a></h3>
        ${e.location ? `<div class="meta">${escapeHtml(e.location)}</div>` : ''}
        ${detail}
        <div class="event-card-actions">${actions}</div>
      </div>
    </article>`;
}

function render() {
  const filter = currentFilter();
  document.querySelectorAll('#event-filters [data-filter]').forEach((link) => {
    const active = link.dataset.filter === filter;
    link.classList.toggle('is-active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  FILTERS.forEach((f) => {
    const n = f === 'all' ? allEvents.length : allEvents.filter((e) => e.phase === f).length;
    const el = document.querySelector(`[data-count="${f}"]`);
    if (el) el.textContent = n ? String(n) : '';
  });

  const list = document.getElementById('events-list');
  const shown = filter === 'all' ? allEvents : allEvents.filter((e) => e.phase === filter);

  if (!allEvents.length) {
    list.innerHTML = `
      <div class="empty-collection">
        <span class="empty-art">✦</span>
        <h3>No events yet</h3>
        <p>Your first invitation takes about five minutes. It saves as you go.</p>
        <a class="btn btn-primary" href="/events/new">Create an event</a>
      </div>`;
    return;
  }
  if (!shown.length) {
    const words = { draft: 'drafts', upcoming: 'upcoming events', past: 'past events' };
    list.innerHTML = `<div class="empty-note">No ${words[filter]}. <a href="/events">Show all events</a>.</div>`;
    return;
  }
  list.innerHTML = shown.map(cardFor).join('');
}

// Filter links switch in place but keep the URL in step, so back/forward and
// reloading all work.
document.getElementById('event-filters').addEventListener('click', (e) => {
  const link = e.target.closest('[data-filter]');
  if (!link) return;
  e.preventDefault();
  window.history.pushState({}, '', link.getAttribute('href'));
  render();
});
window.addEventListener('popstate', render);

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-duplicate]');
  if (!btn) return;
  btn.disabled = true;
  btn.textContent = 'Copying…';
  try {
    const res = await fetch(`/api/events/${encodeURIComponent(btn.dataset.duplicate)}/duplicate`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not copy this event.');
    window.location.href = `/host/${encodeURIComponent(data.id)}/settings`;
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Try again';
  }
});

(async function load() {
  try {
    const res = await fetch('/api/events');
    if (res.status === 401) {
      window.location.href = '/login?next=/events';
      return;
    }
    allEvents = await res.json();
    render();
  } catch (err) {
    document.getElementById('events-list').innerHTML = '<div class="empty-note">Couldn\'t load your events.</div>';
  }
})();
