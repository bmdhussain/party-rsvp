const PAGE_SIZE = 24;

const state = { q: '', category: '', offset: 0, loading: false, exhausted: false };

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatWhen(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

async function loadCategories() {
  const wrap = document.getElementById('browse-categories');
  let categories = [];
  try {
    categories = await (await fetch('/api/categories')).json();
  } catch (err) {
    return;
  }
  const chips = [{ id: '', label: 'Everything' }, ...categories];
  wrap.innerHTML = chips
    .map(
      (c) =>
        `<button class="filter-chip${c.id === '' ? ' active' : ''}" type="button" data-category="${escapeHtml(c.id)}">${escapeHtml(c.label)}</button>`
    )
    .join('');

  wrap.querySelectorAll('.filter-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      wrap.querySelectorAll('.filter-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      state.category = chip.dataset.category;
      reload();
    });
  });
}

function cardFor(event) {
  const spots =
    event.isFull
      ? '<span class="browse-badge is-full">Full</span>'
      : event.spotsLeft !== null
        ? `<span class="browse-badge">${event.spotsLeft} ${event.spotsLeft === 1 ? 'spot' : 'spots'} left</span>`
        : '';
  const going = event.going ? `<span class="browse-going">${event.going} going</span>` : '';
  const host = event.hostHandle
    ? `<a class="browse-host" href="/@${encodeURIComponent(event.hostHandle)}">by ${escapeHtml(event.hostName)}</a>`
    : `<span class="browse-host">by ${escapeHtml(event.hostName)}</span>`;

  return `
    <article class="browse-card">
      <a class="browse-card-art" href="/e/${encodeURIComponent(event.slug)}">
        ${event.imageUrl ? `<img src="${escapeHtml(event.imageUrl)}" alt="" loading="lazy" />` : '<span class="browse-card-empty">✦</span>'}
      </a>
      <div class="browse-card-body">
        <div class="browse-card-when">${escapeHtml(formatWhen(event.event_date))}</div>
        <h3><a href="/e/${encodeURIComponent(event.slug)}">${escapeHtml(event.name)}</a></h3>
        ${event.location ? `<div class="browse-card-where">${escapeHtml(event.location)}</div>` : ''}
        <div class="browse-card-foot">${host}${going}${spots}</div>
      </div>
    </article>`;
}

async function load({ append = false } = {}) {
  if (state.loading) return;
  state.loading = true;
  const results = document.getElementById('browse-results');
  const moreBtn = document.getElementById('browse-more-btn');

  const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(state.offset) });
  if (state.q) params.set('q', state.q);
  if (state.category) params.set('category', state.category);

  try {
    const events = await (await fetch(`/api/browse?${params}`)).json();
    if (!append) results.innerHTML = '';

    if (!events.length && !append) {
      results.innerHTML =
        '<div class="empty-note">Nothing public matches that yet. Try a different search, or clear the filters.</div>';
      moreBtn.style.display = 'none';
      return;
    }

    results.insertAdjacentHTML('beforeend', events.map(cardFor).join(''));
    state.exhausted = events.length < PAGE_SIZE;
    moreBtn.style.display = state.exhausted ? 'none' : 'inline-flex';
  } catch (err) {
    if (!append) results.innerHTML = '<div class="empty-note">Couldn\'t load events just now.</div>';
  } finally {
    state.loading = false;
  }
}

function reload() {
  state.offset = 0;
  state.exhausted = false;
  load();
}

// Waits for a pause in typing rather than firing a query per keystroke.
let searchTimer = null;
document.getElementById('browse-search').addEventListener('input', (e) => {
  state.q = e.target.value;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(reload, 250);
});

document.getElementById('browse-more-btn').addEventListener('click', () => {
  state.offset += PAGE_SIZE;
  load({ append: true });
});

loadCategories();
load();
