function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatWhen(iso) {
  if (!iso) return 'Date TBD';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'Date TBD' : d.toLocaleString();
}

async function loadMe() {
  const res = await fetch('/api/me');
  const data = await res.json();
  if (!data.user) {
    window.location.href = '/';
    return;
  }
  const info = document.getElementById('user-info');
  info.innerHTML = `
    ${data.user.avatarUrl ? `<img class="avatar" src="${escapeHtml(data.user.avatarUrl)}" alt="" />` : ''}
    <span>${escapeHtml(data.user.name)}</span>
  `;
}

async function loadEvents() {
  const list = document.getElementById('events-list');
  try {
    const res = await fetch('/api/events');
    const events = await res.json();
    if (!events.length) {
      list.innerHTML = '<div class="empty-note">No events yet — create your first one below!</div>';
      return;
    }
    list.innerHTML = events
      .map(
        (e) => `
        <div class="event-card">
          ${e.imageUrl ? `<img src="${escapeHtml(e.imageUrl)}" alt="" style="width:100%; aspect-ratio:1200/630; object-fit:cover; border-radius:10px; margin-bottom:10px;" />` : ''}
          <h3>${escapeHtml(e.name)}</h3>
          <div class="meta" style="color:var(--muted); font-size:13px;">${formatWhen(e.event_date)}${e.location ? ` · ${escapeHtml(e.location)}` : ''}</div>
          <div class="link-row">
            <input type="text" readonly value="${escapeHtml(e.shareUrl)}" onclick="this.select()" />
            <button class="btn btn-ghost btn-small copy-btn" data-url="${escapeHtml(e.shareUrl)}">Copy link</button>
            <a class="btn btn-ghost btn-small" href="/host/${e.id}">📊 Dashboard</a>
          </div>
        </div>`
      )
      .join('');

    list.querySelectorAll('.copy-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(btn.dataset.url);
          const original = btn.textContent;
          btn.textContent = '✅ Copied!';
          setTimeout(() => (btn.textContent = original), 1500);
        } catch (err) {
          window.prompt('Copy this link:', btn.dataset.url);
        }
      });
    });
  } catch (err) {
    list.innerHTML = '<div class="empty-note">Couldn\'t load your events.</div>';
  }
}

function setupNewEventForm() {
  const form = document.getElementById('new-event-form');
  const toggleBtn = document.getElementById('new-event-btn');
  const cancelBtn = document.getElementById('cancel-new-event');
  const errorBox = document.getElementById('create-error');

  toggleBtn.addEventListener('click', () => {
    form.style.display = 'block';
    toggleBtn.style.display = 'none';
  });
  cancelBtn.addEventListener('click', () => {
    form.style.display = 'none';
    toggleBtn.style.display = 'inline-block';
    form.reset();
    errorBox.style.display = 'none';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.style.display = 'none';

    const payload = {
      name: document.getElementById('name').value,
      date: document.getElementById('date').value,
      location: document.getElementById('location').value,
      description: document.getElementById('description').value,
    };

    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong.');

      form.reset();
      form.style.display = 'none';
      toggleBtn.style.display = 'inline-block';
      loadEvents();
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.style.display = 'block';
    }
  });
}

document.getElementById('logout-btn').addEventListener('click', async () => {
  await fetch('/auth/logout', { method: 'POST' });
  window.location.href = '/';
});

loadMe();
loadEvents();
setupNewEventForm();
