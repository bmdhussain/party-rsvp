// The host's home screen. Its main job is to answer "what should I do next?"
// in one card, then show what's coming up and what changed while they were away.

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function formatWhen(iso) {
  if (!iso) return 'No date yet';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'No date yet';
  return d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function timeAgo(iso) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'yesterday' : `${days}d ago`;
}

function daysUntil(iso) {
  // Events published before dates were required can still have none.
  if (!iso || Number.isNaN(new Date(iso).getTime())) return 'coming up';
  const ms = new Date(iso).getTime() - Date.now();
  const days = Math.ceil(ms / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

function greeting(name) {
  const hour = new Date().getHours();
  const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const first = String(name || '').split(' ')[0];
  return first ? `${part}, ${first}.` : `${part}.`;
}

function statusPill(e) {
  if (e.phase === 'draft') return '<span class="status-pill is-draft">Draft</span>';
  if (e.phase === 'past') return '<span class="status-pill is-past">Past</span>';
  return '<span class="status-pill is-live">Live</span>';
}

function progressBar(setup) {
  const pct = Math.round((setup.done / setup.total) * 100);
  return `<div class="setup-progress" role="progressbar" aria-valuemin="0" aria-valuemax="${setup.total}" aria-valuenow="${setup.done}" aria-label="Setup progress"><i style="width:${pct}%"></i></div>`;
}

// Picks the single most useful thing to do next, in priority order: finish a
// draft, get the first reply on a live event, get ready for the next event,
// host a past one again, or create the first one.
function renderResume(events) {
  const card = document.getElementById('resume-card');
  const drafts = events.filter((e) => e.phase === 'draft');
  const upcoming = events
    .filter((e) => e.phase === 'upcoming')
    .sort((a, b) => new Date(a.event_date) - new Date(b.event_date));
  const past = events.filter((e) => e.phase === 'past');
  let html = '';

  if (drafts.length) {
    const e = drafts[0];
    html = `
      <div class="resume-copy">
        <span class="section-kicker">Pick up where you left off</span>
        <h2>Finish setting up “${escapeHtml(e.name)}”</h2>
        <p>Next: <strong>${escapeHtml(e.setup.next?.label || 'Review')}</strong> — ${escapeHtml(e.setup.next?.hint || '')}</p>
        ${progressBar(e.setup)}
        <small>${e.setup.done} of ${e.setup.total} steps done${drafts.length > 1 ? ` · ${drafts.length - 1} more ${drafts.length === 2 ? 'draft' : 'drafts'}` : ''}</small>
      </div>
      <a class="btn btn-primary" href="${escapeHtml(e.setup.next?.href || `/host/${e.id}`)}">Continue →</a>`;
  } else if (upcoming.length && upcoming[0].rsvp_count === 0) {
    const e = upcoming[0];
    html = `
      <div class="resume-copy">
        <span class="section-kicker">Your invitation is live</span>
        <h2>Get the first reply for “${escapeHtml(e.name)}”</h2>
        <p>It's ${escapeHtml(daysUntil(e.event_date))}. Send the link on WhatsApp or by email — the first yes is the hardest.</p>
      </div>
      <a class="btn btn-primary" href="/host/${encodeURIComponent(e.id)}/share">Share it →</a>`;
  } else if (upcoming.length) {
    const e = upcoming[0];
    html = `
      <div class="resume-copy">
        <span class="section-kicker">Next up · ${escapeHtml(daysUntil(e.event_date))}</span>
        <h2>${escapeHtml(e.name)}</h2>
        <p><strong>${e.going}</strong> ${e.going === 1 ? 'person is' : 'people are'} coming · ${e.rsvp_count} ${e.rsvp_count === 1 ? 'reply' : 'replies'} so far</p>
      </div>
      <div class="resume-actions"><a class="btn btn-ghost" href="/host/${encodeURIComponent(e.id)}/checkin">Door check-in</a><a class="btn btn-primary" href="/host/${encodeURIComponent(e.id)}/guests">See guests →</a></div>`;
  } else if (past.length) {
    const e = past[0];
    html = `
      <div class="resume-copy">
        <span class="section-kicker">That was a good one</span>
        <h2>Host “${escapeHtml(e.name)}” again?</h2>
        <p>Copy the look, details and FAQ into a new draft — just pick a new date.</p>
      </div>
      <button class="btn btn-primary" type="button" data-duplicate="${escapeHtml(e.id)}">Host it again →</button>`;
  } else {
    html = `
      <div class="resume-copy">
        <span class="section-kicker">Let's get started</span>
        <h2>Create your first invitation</h2>
        <p>Add the basics, pick a look, publish. Most hosts are done in under five minutes — and it saves as you go.</p>
      </div>
      <a class="btn btn-primary" href="/events/new">Create an event →</a>`;
  }

  card.innerHTML = html;
  card.hidden = false;
}

function renderUpcoming(events) {
  const list = document.getElementById('dash-upcoming-list');
  // Drafts and upcoming events, soonest first; drafts without a date last.
  const items = events
    .filter((e) => e.phase !== 'past')
    .sort((a, b) => {
      if (!a.event_date) return 1;
      if (!b.event_date) return -1;
      return new Date(a.event_date) - new Date(b.event_date);
    })
    .slice(0, 5);

  if (!items.length) {
    list.innerHTML = '<div class="empty-note">Nothing coming up. <a href="/events/new">Create an event</a>.</div>';
    return;
  }

  list.innerHTML = items
    .map(
      (e) => `
      <a class="dash-row" href="${escapeHtml(e.phase === 'draft' && e.setup.next ? e.setup.next.href : `/host/${e.id}`)}">
        <span class="dash-row-main"><strong>${escapeHtml(e.name)}</strong><small>${escapeHtml(formatWhen(e.event_date))}</small></span>
        <span class="dash-row-side">${statusPill(e)}${
          e.phase === 'draft'
            ? `<small>${e.setup.done}/${e.setup.total} steps</small>`
            : `<small>${e.going} going</small>`
        }</span>
      </a>`
    )
    .join('');
}

const STATUS_WORDS = { confirmed: 'is coming to', waitlist: 'joined the waitlist for', declined: "can't make" };

async function renderActivity() {
  const list = document.getElementById('dash-activity');
  try {
    const rows = await (await fetch('/api/me/activity')).json();
    if (!rows.length) {
      list.innerHTML = '<div class="empty-note">Replies from your guests will show up here.</div>';
      return;
    }
    list.innerHTML = rows
      .map(
        (r) => `
        <a class="dash-row activity-row is-${escapeHtml(r.status)}" href="/host/${encodeURIComponent(r.event_id)}/guests">
          <span class="dash-row-main"><strong>${escapeHtml(r.name)}</strong> <span>${STATUS_WORDS[r.status] || 'replied to'}</span> <strong>${escapeHtml(r.event_name)}</strong>${
            r.status === 'confirmed' && r.adults + r.kids > 1 ? ` <small>(party of ${r.adults + r.kids})</small>` : ''
          }</span>
          <span class="dash-row-side"><small>${escapeHtml(timeAgo(r.created_at))}</small></span>
        </a>`
      )
      .join('');
  } catch (err) {
    list.innerHTML = '<div class="empty-note">Couldn\'t load recent replies.</div>';
  }
}

async function renderProfileShortcut() {
  try {
    const profile = await (await fetch('/api/me/profile')).json();
    const link = document.getElementById('shortcut-profile');
    const note = document.getElementById('shortcut-profile-note');
    if (profile.handle && profile.publicProfile) {
      link.href = `/@${encodeURIComponent(profile.handle)}`;
      note.textContent = `Live at /@${profile.handle}`;
    } else if (profile.handle) {
      note.textContent = 'Set up — switch it on in Settings';
    }
  } catch (err) {
    // The shortcut still points at Settings, which is fine.
  }
}

async function load() {
  try {
    const [meRes, eventsRes] = await Promise.all([fetch('/api/me'), fetch('/api/events')]);
    if (eventsRes.status === 401) {
      window.location.href = '/login?next=/dashboard';
      return;
    }
    const me = await meRes.json();
    const events = await eventsRes.json();

    document.getElementById('dash-greeting').textContent = greeting(me.user?.name);
    const upcoming = events.filter((e) => e.phase === 'upcoming');
    const drafts = events.filter((e) => e.phase === 'draft');
    const going = upcoming.reduce((sum, e) => sum + e.going, 0);
    const bits = [];
    if (upcoming.length) bits.push(`${upcoming.length} upcoming`);
    if (drafts.length) bits.push(`${drafts.length} ${drafts.length === 1 ? 'draft' : 'drafts'}`);
    if (going) bits.push(`${going} ${going === 1 ? 'guest' : 'guests'} coming`);
    document.getElementById('dash-summary').textContent = bits.length
      ? bits.join(' · ')
      : "You haven't created any events yet.";

    renderResume(events);
    renderUpcoming(events);
  } catch (err) {
    document.getElementById('dash-upcoming-list').innerHTML = '<div class="empty-note">Couldn\'t load your events.</div>';
  }
}

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-duplicate]');
  if (!btn) return;
  btn.disabled = true;
  btn.textContent = 'Copying…';
  try {
    const res = await fetch(`/api/events/${encodeURIComponent(btn.dataset.duplicate)}/duplicate`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not copy this event.');
    // Straight to Settings: the copy has no date yet, and that's the one thing it needs.
    window.location.href = `/host/${encodeURIComponent(data.id)}/settings`;
  } catch (err) {
    btn.disabled = false;
    btn.textContent = err.message;
  }
});

load();
renderActivity();
renderProfileShortcut();
