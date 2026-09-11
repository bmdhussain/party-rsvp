// Template gallery. With ?event=<id> it's adding RSVP questions to that event,
// so it offers the RSVP templates first and returns to the event afterwards.

const params = new URLSearchParams(window.location.search);
const EVENT_ID = params.get('event');

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function cardFor(t) {
  const shown = t.questions.slice(0, 4);
  const more = t.questions.length - shown.length;
  return `
    <article class="template-card${t.id === 'blank' ? ' is-blank' : ''}">
      <div class="template-card-top">
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

async function create(templateId, button) {
  const errorBox = document.getElementById('new-form-error');
  errorBox.style.display = 'none';
  button.disabled = true;
  const original = button.textContent;
  button.textContent = 'Creating…';
  try {
    const res = await fetch('/api/forms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templateId, ...(EVENT_ID ? { eventId: EVENT_ID } : {}) }),
    });
    const data = await res.json();
    if (res.status === 401) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
      return;
    }
    if (!res.ok) throw new Error(data.error || 'Could not create the form.');
    window.location.href = `/forms/${encodeURIComponent(data.id)}`;
  } catch (err) {
    errorBox.textContent = err.message;
    errorBox.style.display = 'block';
    button.disabled = false;
    button.textContent = original;
  }
}

(async function load() {
  if (EVENT_ID) {
    document.getElementById('new-form-crumb').innerHTML =
      `<a href="/events">My events</a><span aria-hidden="true">›</span><a href="/host/${encodeURIComponent(EVENT_ID)}/settings">Event</a><span aria-hidden="true">›</span><span aria-current="page">RSVP questions</span>`;
    document.getElementById('new-form-kicker').textContent = 'RSVP questions';
    document.getElementById('new-form-title').textContent = 'Ask your guests a little more';
    document.getElementById('new-form-lede').textContent =
      "These questions appear on your invitation's RSVP form, right under name and email. Guests who can't come aren't asked them.";
  }

  const gallery = document.getElementById('template-gallery');
  try {
    const templates = await (await fetch('/api/form-templates')).json();
    // For RSVP questions, lead with the RSVP template; the rest still work and
    // lose their duplicate name/email questions automatically.
    const ordered = EVENT_ID
      ? [...templates.filter((t) => t.kind === 'rsvp'), ...templates.filter((t) => t.id === 'blank')]
      : templates.filter((t) => t.kind === 'standalone');
    gallery.innerHTML = ordered.map(cardFor).join('');
  } catch (err) {
    gallery.innerHTML = '<div class="empty-note">Couldn\'t load templates. Refresh to try again.</div>';
  }
})();

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-template]');
  if (btn) create(btn.dataset.template, btn);
});
