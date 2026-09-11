// Explore is rendered on the server — filters are plain links and a GET form,
// so the page works and is crawlable with no JavaScript at all. This only adds
// the conveniences: "Show more", and applying the date filter on change.

const PAGE_SIZE = 24;
const results = document.getElementById('browse-results');
const moreBtn = document.getElementById('browse-more-btn');

let state = {};
try {
  state = JSON.parse(results.dataset.state || '{}');
} catch (err) {
  state = {};
}
let offset = state.count || 0;

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

// Mirrors the server's card markup so appended cards look identical.
function cardFor(e) {
  const going = e.going ? `<span class="browse-going">${e.going} going</span>` : '';
  const spots = e.isFull
    ? '<span class="browse-badge is-full">Full · waitlist open</span>'
    : e.spotsLeft !== null
      ? `<span class="browse-badge">${e.spotsLeft} ${e.spotsLeft === 1 ? 'spot' : 'spots'} left</span>`
      : '';
  const host = e.hostHandle
    ? `<a class="browse-host" href="/@${encodeURIComponent(e.hostHandle)}">by ${escapeHtml(e.hostName)}</a>`
    : '';
  const when = new Date(e.event_date).toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
  return `<article class="browse-card">
      <a class="browse-card-art" href="/e/${encodeURIComponent(e.slug)}" tabindex="-1" aria-hidden="true">${
        e.imageUrl ? `<img src="${escapeHtml(e.imageUrl)}" alt="" loading="lazy" />` : '<span class="browse-card-empty">✦</span>'
      }</a>
      <div class="browse-card-body">
        <div class="browse-card-when">${escapeHtml(when)}</div>
        <h3><a href="/e/${encodeURIComponent(e.slug)}">${escapeHtml(e.name)}</a></h3>
        ${e.location ? `<div class="browse-card-where">${escapeHtml(e.location)}</div>` : ''}
        <div class="browse-card-foot">${host}${going}${spots}</div>
      </div>
    </article>`;
}

// A full first page suggests there's more; a short one means we've seen it all.
if (moreBtn) moreBtn.hidden = offset < PAGE_SIZE;

moreBtn?.addEventListener('click', async () => {
  moreBtn.disabled = true;
  moreBtn.textContent = 'Loading…';
  const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
  ['q', 'where', 'when', 'category'].forEach((key) => state[key] && params.set(key, state[key]));
  try {
    const events = await (await fetch(`/api/browse?${params}`)).json();
    results.insertAdjacentHTML('beforeend', events.map(cardFor).join(''));
    offset += events.length;
    moreBtn.hidden = events.length < PAGE_SIZE;
  } catch (err) {
    moreBtn.textContent = 'Couldn’t load more — try again';
    moreBtn.disabled = false;
    return;
  }
  moreBtn.disabled = false;
  moreBtn.textContent = 'Show more';
});

// Picking a date range is a complete decision — apply it without a second click.
document.getElementById('explore-when')?.addEventListener('change', (e) => e.target.form.submit());
