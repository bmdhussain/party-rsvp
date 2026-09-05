const STORAGE_KEY = 'hostPassword';

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

async function fetchDashboard(password) {
  const res = await fetch('/api/host', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-host-password': password },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Login failed.');
  }
  return res.json();
}

function renderDashboard(data) {
  lastData = data;
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
        <td><span class="pill ${r.attending ? 'badge yes' : 'badge no'}">${r.attending ? '🎉 Yes' : "😢 No"}</span></td>
        <td>${r.attending ? r.adults : '—'}</td>
        <td>${r.attending ? r.kids : '—'}</td>
        <td>${escapeHtml(r.comment || '')}</td>
        <td>${formatWhen(r.createdAt)}</td>
      </tr>`
    )
    .join('');
}

async function login(password) {
  const errorBox = document.getElementById('login-error');
  errorBox.style.display = 'none';
  try {
    const data = await fetchDashboard(password);
    sessionStorage.setItem(STORAGE_KEY, password);
    document.getElementById('login-card').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    renderDashboard(data);
  } catch (err) {
    errorBox.textContent = err.message;
    errorBox.style.display = 'block';
  }
}

function mailto(emails) {
  if (!emails.length) {
    window.alert('No guest emails to send to yet.');
    return;
  }
  const bcc = encodeURIComponent(emails.join(','));
  window.location.href = `mailto:?bcc=${bcc}&subject=${encodeURIComponent('Party update!')}`;
}

document.getElementById('login-btn').addEventListener('click', () => {
  login(document.getElementById('password').value);
});
document.getElementById('password').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') login(document.getElementById('password').value);
});

document.getElementById('refresh-btn').addEventListener('click', async () => {
  const password = sessionStorage.getItem(STORAGE_KEY);
  if (!password) return;
  try {
    renderDashboard(await fetchDashboard(password));
  } catch (err) {
    window.alert(err.message);
  }
});

document.getElementById('logout-btn').addEventListener('click', () => {
  sessionStorage.removeItem(STORAGE_KEY);
  document.getElementById('dashboard').style.display = 'none';
  document.getElementById('login-card').style.display = 'block';
  document.getElementById('password').value = '';
});

document.getElementById('email-attending-btn').addEventListener('click', () => {
  if (!lastData) return;
  mailto(lastData.rsvps.filter((r) => r.attending).map((r) => r.email));
});

document.getElementById('email-all-btn').addEventListener('click', () => {
  if (!lastData) return;
  mailto(lastData.rsvps.map((r) => r.email));
});

// Auto-login if a password is already saved in this browser tab's session.
const savedPassword = sessionStorage.getItem(STORAGE_KEY);
if (savedPassword) {
  login(savedPassword);
}
