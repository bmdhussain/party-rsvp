// The URL is /@handle, so the handle is the last segment with its @ stripped.
const HANDLE = decodeURIComponent(window.location.pathname.split('/').filter(Boolean).pop() || '').replace(/^@/, '');

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function initials(name) {
  return String(name || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

function formatWhen(iso) {
  if (!iso) return 'Date to be confirmed';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function cardFor(event) {
  const going = event.going ? `<span class="browse-going">${event.going} went</span>` : '';
  return `
    <article class="browse-card">
      <a class="browse-card-art" href="/e/${encodeURIComponent(event.slug)}">
        ${event.imageUrl ? `<img src="${escapeHtml(event.imageUrl)}" alt="" loading="lazy" />` : '<span class="browse-card-empty">✦</span>'}
      </a>
      <div class="browse-card-body">
        <div class="browse-card-when">${escapeHtml(formatWhen(event.event_date))}</div>
        <h3><a href="/e/${encodeURIComponent(event.slug)}">${escapeHtml(event.name)}</a></h3>
        ${event.location ? `<div class="browse-card-where">${escapeHtml(event.location)}</div>` : ''}
        <div class="browse-card-foot">${going}</div>
      </div>
    </article>`;
}

async function load() {
  try {
    const res = await fetch(`/api/hosts/${encodeURIComponent(HANDLE)}`);
    if (!res.ok) throw new Error('not found');
    const data = await res.json();

    document.getElementById('profile-loading').style.display = 'none';
    document.getElementById('profile-body').style.display = 'block';
    document.title = `${data.host.name} on RSVPfor`;

    const avatar = document.getElementById('profile-avatar');
    if (data.host.avatarUrl) {
      const img = document.createElement('img');
      img.src = data.host.avatarUrl;
      img.alt = '';
      // A dead avatar URL from an old OAuth login shouldn't leave a broken image.
      img.onerror = () => {
        avatar.textContent = initials(data.host.name);
      };
      avatar.appendChild(img);
    } else {
      avatar.textContent = initials(data.host.name);
    }

    document.getElementById('profile-name').textContent = data.host.name;
    document.getElementById('profile-handle').textContent = `@${data.host.handle}`;

    const bio = document.getElementById('profile-bio');
    if (data.host.bio) bio.textContent = data.host.bio;
    else bio.style.display = 'none';

    const since = data.host.hostingSince ? new Date(data.host.hostingSince) : null;
    const totalGuests = [...data.upcoming, ...data.past].reduce((sum, e) => sum + (e.going || 0), 0);
    document.getElementById('profile-stats').innerHTML = [
      data.past.length ? `<span><strong>${data.past.length}</strong> ${data.past.length === 1 ? 'event' : 'events'} hosted</span>` : '',
      totalGuests ? `<span><strong>${totalGuests}</strong> guests welcomed</span>` : '',
      since && !Number.isNaN(since.getTime())
        ? `<span>Hosting since <strong>${since.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</strong></span>`
        : '',
    ]
      .filter(Boolean)
      .join('');

    const upcomingList = document.getElementById('upcoming-list');
    document.getElementById('upcoming-count').textContent = data.upcoming.length || '';
    upcomingList.innerHTML = data.upcoming.length
      ? data.upcoming.map(cardFor).join('')
      : '<div class="empty-note">Nothing on the calendar right now — check back.</div>';

    if (data.past.length) {
      document.getElementById('past-section').style.display = 'block';
      document.getElementById('past-count').textContent = data.past.length;
      document.getElementById('past-list').innerHTML = data.past.map(cardFor).join('');
    }
  } catch (err) {
    document.getElementById('profile-loading').style.display = 'none';
    document.getElementById('profile-missing').style.display = 'block';
  }
}

load();
