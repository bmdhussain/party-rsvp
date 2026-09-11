// The host's forms, filterable by state. The filter lives in the URL
// (?show=open), so back/forward and reloading keep the same view.

const FILTERS = ['all', 'open', 'draft', 'rsvp'];
let allForms = [];

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function when(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function currentFilter() {
  const show = new URLSearchParams(window.location.search).get('show');
  return FILTERS.includes(show) ? show : 'all';
}

function matches(form, filter) {
  if (filter === 'all') return true;
  if (filter === 'rsvp') return form.kind === 'rsvp';
  return form.kind === 'standalone' && form.status === filter;
}

function pill(form) {
  if (form.kind === 'rsvp') return '<span class="status-pill is-rsvp">RSVP questions</span>';
  const map = { open: ['is-live', 'Open'], draft: ['is-draft', 'Draft'], closed: ['is-past', 'Closed'] };
  const [cls, label] = map[form.status] || map.draft;
  return `<span class="status-pill ${cls}">${label}</span>`;
}

function rowFor(form) {
  const base = `/forms/${encodeURIComponent(form.id)}`;
  const sub =
    form.kind === 'rsvp'
      ? `Asked on the RSVP for <strong>${escapeHtml(form.eventName || 'an event')}</strong>`
      : `${form.questionCount} ${form.questionCount === 1 ? 'question' : 'questions'} · updated ${escapeHtml(when(form.updatedAt))}`;
  return `
    <article class="form-row">
      <a class="form-row-main" href="${base}">
        <span class="form-row-icon" aria-hidden="true">${form.kind === 'rsvp' ? '✉' : '☰'}</span>
        <span class="form-row-copy"><strong>${escapeHtml(form.kind === 'rsvp' ? `RSVP questions · ${form.eventName || ''}` : form.title)}</strong><small>${sub}</small></span>
      </a>
      <div class="form-row-side">
        ${pill(form)}
        <a class="form-row-count" href="${base}/responses"><strong>${form.responseCount}</strong> ${
          form.responseCount === 1 ? 'response' : 'responses'
        }</a>
        ${form.kind === 'standalone' && form.status === 'open' ? `<button type="button" class="btn btn-ghost btn-small" data-copy="${escapeHtml(form.shareUrl)}">Copy link</button>` : ''}
      </div>
    </article>`;
}

function render() {
  const filter = currentFilter();
  document.querySelectorAll('#form-filters [data-filter]').forEach((link) => {
    const active = link.dataset.filter === filter;
    link.classList.toggle('is-active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  FILTERS.forEach((f) => {
    const n = allForms.filter((x) => matches(x, f)).length;
    const el = document.querySelector(`[data-count="${f}"]`);
    if (el) el.textContent = n ? String(n) : '';
  });

  const list = document.getElementById('forms-list');
  if (!allForms.length) {
    list.innerHTML = `
      <div class="empty-collection forms-empty">
        <span class="empty-art">☰</span>
        <h3>No forms yet</h3>
        <p>Start from a ready-made template — registration, potluck, volunteers, feedback — and change anything you like.</p>
        <a class="btn btn-primary" href="/forms/new">Create your first form</a>
      </div>`;
    return;
  }
  const shown = allForms.filter((f) => matches(f, filter));
  list.innerHTML = shown.length
    ? shown.map(rowFor).join('')
    : '<div class="empty-note">Nothing here. <a href="/forms">Show all forms</a>.</div>';
}

document.getElementById('form-filters').addEventListener('click', (e) => {
  const link = e.target.closest('[data-filter]');
  if (!link) return;
  e.preventDefault();
  window.history.pushState({}, '', link.getAttribute('href'));
  render();
});
window.addEventListener('popstate', render);

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-copy]');
  if (!btn) return;
  try {
    await navigator.clipboard.writeText(btn.dataset.copy);
    btn.textContent = 'Copied!';
  } catch (err) {
    window.prompt('Copy this link:', btn.dataset.copy);
  }
  setTimeout(() => (btn.textContent = 'Copy link'), 1600);
});

(async function load() {
  try {
    const res = await fetch('/api/forms');
    if (res.status === 401) {
      window.location.href = '/login?next=/forms';
      return;
    }
    allForms = await res.json();
    render();
  } catch (err) {
    document.getElementById('forms-list').innerHTML = '<div class="empty-note">Couldn\'t load your forms.</div>';
  }
})();
