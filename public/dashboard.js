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

function futureDateTimeMinimum() {
  const date = new Date(Date.now() + 60 * 1000);
  date.setSeconds(0, 0);
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function refreshDateMinimum() {
  document.getElementById('date').min = futureDateTimeMinimum();
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
    const count = document.getElementById('event-count');
    if (count) count.textContent = `${events.length} ${events.length === 1 ? 'invitation' : 'invitations'}`;
    if (!events.length) {
      list.innerHTML = `
        <div class="empty-collection">
          <div class="empty-art">✦</div>
          <h3>Your first invitation is waiting.</h3>
          <p>Start with a name, then make the details feel unmistakably yours.</p>
          <button class="btn btn-primary" type="button" id="empty-create-btn">Create my first invitation</button>
        </div>`;
      document.getElementById('empty-create-btn')?.addEventListener('click', () => {
        document.getElementById('new-event-form').style.display = 'grid';
        document.getElementById('new-event-trigger').style.display = 'none';
        document.getElementById('new-event-btn').style.display = 'none';
        document.getElementById('name').focus();
      });
      return;
    }
    list.innerHTML = events
      .map(
        (e) => `
        <article class="event-card">
          <a class="event-card-art" href="/host/${e.id}">
            ${e.imageUrl ? `<img src="${escapeHtml(e.imageUrl)}" alt="" />` : '<div class="event-art-placeholder"><span>✦</span><small>Choose a look in the studio</small></div>'}
            <span class="event-open-badge">Open studio <span>↗</span></span>
          </a>
          <div class="event-card-content">
            <div class="event-card-topline"><span class="event-status">In the making</span><span class="event-date">${formatWhen(e.event_date)}</span></div>
            <h3>${escapeHtml(e.name)}</h3>
            <div class="meta">${e.location ? escapeHtml(e.location) : 'Location to be decided'}</div>
            <div class="event-card-actions">
              <input type="text" readonly value="${escapeHtml(e.shareUrl)}" onclick="this.select()" aria-label="Invitation link" />
              <button class="btn btn-ghost btn-small copy-btn" data-url="${escapeHtml(e.shareUrl)}">Copy invite link</button>
            </div>
          </div>
        </article>`
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
  const secondaryToggleBtn = document.getElementById('new-event-trigger');
  const cancelBtn = document.getElementById('cancel-new-event');
  const errorBox = document.getElementById('create-error');

  const openForm = () => {
    refreshDateMinimum();
    form.style.display = 'grid';
    toggleBtn.style.display = 'none';
    secondaryToggleBtn.style.display = 'none';
    document.getElementById('name').focus();
  };
  toggleBtn.addEventListener('click', openForm);
  secondaryToggleBtn.addEventListener('click', openForm);
  cancelBtn.addEventListener('click', () => {
    form.style.display = 'none';
    toggleBtn.style.display = 'inline-flex';
    secondaryToggleBtn.style.display = 'inline-flex';
    form.reset();
    errorBox.style.display = 'none';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.style.display = 'none';
    const dateValue = document.getElementById('date').value;
    if (!dateValue || new Date(dateValue).getTime() <= Date.now()) {
      errorBox.textContent = 'Choose a date and time in the future.';
      errorBox.style.display = 'block';
      document.getElementById('date').focus();
      return;
    }

    const payload = {
      name: document.getElementById('name').value,
      date: dateValue,
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
       toggleBtn.style.display = 'inline-flex';
       secondaryToggleBtn.style.display = 'inline-flex';
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
refreshDateMinimum();
setupNewEventForm();
