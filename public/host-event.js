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

function toLocalInputValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function renderImagePreview(imageUrl) {
  const img = document.getElementById('image-preview');
  const empty = document.getElementById('image-empty');
  if (imageUrl) {
    img.src = `${imageUrl}?t=${Date.now()}`;
    img.style.display = 'block';
    empty.style.display = 'none';
  } else {
    img.style.display = 'none';
    empty.style.display = 'block';
  }
}

function render(data) {
  document.getElementById('event-title').textContent = data.event.name;
  document.getElementById('dashboard').style.display = 'block';
  document.getElementById('share-link').value = data.event.shareUrl;

  document.getElementById('edit-name').value = data.event.name;
  document.getElementById('edit-date').value = toLocalInputValue(data.event.event_date);
  document.getElementById('edit-location').value = data.event.location || '';
  document.getElementById('edit-description').value = data.event.description || '';

  renderImagePreview(data.event.imageUrl);

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

async function loadTemplates() {
  const grid = document.getElementById('template-grid');
  try {
    const res = await fetch('/api/templates');
    const templates = await res.json();
    grid.innerHTML = templates
      .map(
        (t) => `
        <button type="button" class="template-thumb" data-id="${escapeHtml(t.id)}" title="${escapeHtml(t.label)}">
          <img src="${escapeHtml(t.previewUrl)}" alt="${escapeHtml(t.label)}" />
          <span>${escapeHtml(t.label)}</span>
        </button>`
      )
      .join('');

    grid.querySelectorAll('.template-thumb').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const res = await fetch(`/api/events/${EVENT_ID}/template`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ templateId: btn.dataset.id }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Could not set template.');
          loadDashboard();
        } catch (err) {
          document.getElementById('image-error').textContent = err.message;
          document.getElementById('image-error').style.display = 'block';
        }
      });
    });
  } catch (err) {
    grid.innerHTML = '<div class="empty-note">Couldn\'t load templates.</div>';
  }
}

document.getElementById('image-upload').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const errorBox = document.getElementById('image-error');
  errorBox.style.display = 'none';

  const formData = new FormData();
  formData.append('image', file);

  try {
    const res = await fetch(`/api/events/${EVENT_ID}/image`, { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed.');
    loadDashboard();
  } catch (err) {
    errorBox.textContent = err.message;
    errorBox.style.display = 'block';
  } finally {
    e.target.value = '';
  }
});

document.getElementById('edit-event-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorBox = document.getElementById('edit-error');
  errorBox.style.display = 'none';

  const payload = {
    name: document.getElementById('edit-name').value,
    date: document.getElementById('edit-date').value,
    location: document.getElementById('edit-location').value,
    description: document.getElementById('edit-description').value,
  };

  try {
    const res = await fetch(`/api/events/${EVENT_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not save changes.');
    loadDashboard();
  } catch (err) {
    errorBox.textContent = err.message;
    errorBox.style.display = 'block';
  }
});

document.getElementById('notify-guests-btn').addEventListener('click', () => {
  if (!lastData) return;
  const emails = [...new Set(lastData.rsvps.map((r) => r.email))];
  if (!emails.length) {
    window.alert('No guests to notify yet.');
    return;
  }
  const bcc = encodeURIComponent(emails.join(','));
  const subject = encodeURIComponent(`Update: ${lastData.event.name}`);
  const body = encodeURIComponent(
    `Hi! The details for ${lastData.event.name} have been updated.\n\nCheck the latest info here: ${lastData.event.shareUrl}`
  );
  window.location.href = `mailto:?bcc=${bcc}&subject=${subject}&body=${body}`;
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await fetch('/auth/logout', { method: 'POST' });
  window.location.href = '/';
});

loadDashboard();
loadTemplates();
