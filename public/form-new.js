// Template gallery for a new form. It also answers the question the old page
// left unanswered: where does this form go? A form either stands alone with
// its own link, or becomes the extra questions on one event's RSVP form.
//
// Arriving from an event (/forms/new?event=<id>) preselects that event.

const params = new URLSearchParams(window.location.search);
const FROM_EVENT = params.get('event');

let templates = [];
let events = [];

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function selectedEventId() {
  return document.getElementById('attach-event').value || null;
}

function selectedEvent() {
  return events.find((e) => e.id === selectedEventId()) || null;
}

function cardFor(t) {
  const shown = t.questions.slice(0, 4);
  const more = t.questions.length - shown.length;
  const suited = selectedEventId() && t.kind === 'rsvp';
  return `
    <article class="template-card${t.id === 'blank' ? ' is-blank' : ''}${suited ? ' is-suggested' : ''}">
      <div class="template-card-top">
        ${suited ? '<span class="template-flag">Made for RSVPs</span>' : ''}
        <h3>${escapeHtml(t.name)}</h3>
        <p>${escapeHtml(t.description)}</p>
      </div>
      <ul class="template-card-questions" aria-label="Questions in this template">
        ${shown.map((q) => `<li>${escapeHtml(q)}</li>`).join('')}
        ${more > 0 ? `<li class="more">+ ${more} more</li>` : ''}
      </ul>
      <button type="button" class="btn ${t.id === 'blank' ? 'btn-ghost' : 'btn-primary'} btn-small" data-template="${escapeHtml(t.id)}">${
        t.id === 'blank' ? 'Start blank' : 'Use this template'
      }</button>
    </article>`;
}

// The page says, in words, exactly what the next click will do.
function renderContext() {
  const event = selectedEvent();
  const crumb = document.getElementById('new-form-crumb');
  const hint = document.getElementById('attach-hint');

  if (event) {
    crumb.innerHTML = `<a href="/events">My events</a><span aria-hidden="true">›</span><a href="/host/${encodeURIComponent(
      event.id
    )}/settings">${escapeHtml(event.name)}</a><span aria-hidden="true">›</span><span aria-current="page">RSVP questions</span>`;
    document.getElementById('new-form-kicker').textContent = 'RSVP questions';
    document.getElementById('new-form-title').textContent = `Ask more on ${event.name}`;
    document.getElementById('new-form-lede').textContent =
      "These questions are added to that invitation's RSVP form, under name, email and headcount. Only guests who are coming are asked them, and answers land in your guest list.";
    hint.textContent = `Asked on the RSVP form for "${event.name}". A template's own name and email questions are dropped, since the RSVP already asks for those.`;
  } else {
    crumb.innerHTML = `<a href="/forms">Forms</a><span aria-hidden="true">›</span><span aria-current="page">New form</span>`;
    document.getElementById('new-form-kicker').textContent = 'New form';
    document.getElementById('new-form-title').textContent = 'Start with a template';
    document.getElementById('new-form-lede').textContent =
      'Every template is a complete form you can publish as-is — or change every question, option and word.';
    hint.textContent =
      "Standalone forms get their own page and link. Pick an event instead to ask these questions on its RSVP form.";
  }
  renderGallery();
}

function renderGallery() {
  // With an event chosen, the RSVP-shaped template leads; the others still work.
  const ordered = selectedEventId()
    ? [...templates.filter((t) => t.kind === 'rsvp'), ...templates.filter((t) => t.kind !== 'rsvp')]
    : templates.filter((t) => t.kind === 'standalone');
  document.getElementById('template-gallery').innerHTML = ordered.map(cardFor).join('');
}

async function create(templateId, button) {
  const errorBox = document.getElementById('new-form-error');
  errorBox.style.display = 'none';
  button.disabled = true;
  const original = button.textContent;
  button.textContent = 'Creating…';
  try {
    const eventId = selectedEventId();
    const res = await fetch('/api/forms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templateId, ...(eventId ? { eventId } : {}) }),
    });
    if (res.status === 401) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
      return;
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not create the form.');
    if (data.existing) {
      window.RSVPfor?.toast('That event already has RSVP questions — opening them.', { kind: 'info' });
    }
    window.location.href = `/forms/${encodeURIComponent(data.id)}`;
  } catch (err) {
    errorBox.textContent = err.message;
    errorBox.style.display = 'block';
    button.disabled = false;
    button.textContent = original;
  }
}

(async function load() {
  const gallery = document.getElementById('template-gallery');
  try {
    const [t, e] = await Promise.all([
      fetch('/api/form-templates').then((r) => r.json()),
      // Used only to offer the choice; a failure here still leaves a usable page.
      fetch('/api/events').then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ]);
    templates = t;
    events = Array.isArray(e) ? e : [];
  } catch (err) {
    gallery.innerHTML = '<div class="empty-note">Couldn\'t load templates. Refresh to try again.</div>';
    return;
  }

  const select = document.getElementById('attach-event');
  if (events.length) {
    const group = document.createElement('optgroup');
    group.label = "Ask on an event's RSVP form";
    events.forEach((ev) => {
      const opt = document.createElement('option');
      opt.value = ev.id;
      opt.textContent = ev.name;
      group.appendChild(opt);
    });
    select.appendChild(group);
    if (FROM_EVENT && events.some((ev) => ev.id === FROM_EVENT)) select.value = FROM_EVENT;
  } else {
    // Nothing to attach to yet; don't offer an empty choice.
    document.getElementById('attach-card').hidden = true;
  }

  select.addEventListener('change', renderContext);
  renderContext();
})();

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-template]');
  if (btn) create(btn.dataset.template, btn);
});
