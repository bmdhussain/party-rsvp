const EVENT_ID = window.location.pathname.split('/').filter(Boolean).pop();

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatWhen(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

let lastData = null;

async function loadDashboard() {
  try {
    const res = await fetch(`/api/events/${EVENT_ID}/host`);
    if (res.status === 401) {
      window.location.href = '/';
      return;
    }
    if (!res.ok) {
      document.getElementById('not-found').style.display = 'block';
      return;
    }
    const data = await res.json();
    lastData = data;
    render(data);
  } catch (err) {
    document.getElementById('not-found').style.display = 'block';
  }
}

function render(data) {
  document.getElementById('event-title').textContent = data.event.name;
  document.getElementById('dashboard').style.display = 'block';
  document.getElementById('share-link').value = data.event.shareUrl;

  document.getElementById('stat-attending').textContent = data.totals.attendingCount;
  document.getElementById('stat-adults').textContent = data.totals.adults;
  document.getElementById('stat-kids').textContent = data.totals.kids;
  document.getElementById('stat-declined').textContent = data.totals.declinedCount;

  const body = document.getElementById('guest-table-body');
  const empty = document.getElementById('guest-empty');

  if (!data.rsvps.length) {
    body.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  body.innerHTML = data.rsvps
    .map(
      (r) => `
      <tr>
        <td>${escapeHtml(r.name)}</td>
        <td>${escapeHtml(r.email)}</td>
        <td><span class="pill ${r.attending ? 'badge yes' : 'badge no'}">${r.attending ? '🎉 Yes' : '😢 No'}</span></td>
        <td>${r.attending ? r.adults : '—'}</td>
        <td>${r.attending ? r.kids : '—'}</td>
        <td>${escapeHtml(r.comment || '')}</td>
        <td>${formatWhen(r.created_at)}</td>
      </tr>`
    )
    .join('');
}

function mailto(emails) {
  if (!emails.length) {
    window.alert('No guest emails to send to yet.');
    return;
  }
  const bcc = encodeURIComponent([...new Set(emails)].join(','));
  window.location.href = `mailto:?bcc=${bcc}&subject=${encodeURIComponent('Party update!')}`;
}

document.getElementById('refresh-btn').addEventListener('click', loadDashboard);

document.getElementById('copy-link-btn').addEventListener('click', async () => {
  const input = document.getElementById('share-link');
  try {
    await navigator.clipboard.writeText(input.value);
    const btn = document.getElementById('copy-link-btn');
    const original = btn.textContent;
    btn.textContent = '✅ Copied!';
    setTimeout(() => (btn.textContent = original), 1500);
  } catch (err) {
    input.select();
  }
});

document.getElementById('email-attending-btn').addEventListener('click', () => {
  if (!lastData) return;
  mailto(lastData.rsvps.filter((r) => r.attending).map((r) => r.email));
});

document.getElementById('email-all-btn').addEventListener('click', () => {
  if (!lastData) return;
  mailto(lastData.rsvps.map((r) => r.email));
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await fetch('/auth/logout', { method: 'POST' });
  window.location.href = '/';
});

loadDashboard();
