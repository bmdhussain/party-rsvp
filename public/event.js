const SLUG = window.location.pathname.split('/').filter(Boolean).pop();

function formatEventDate(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

async function loadEvent() {
  try {
    const res = await fetch(`/api/events/${SLUG}/public`);
    if (!res.ok) throw new Error('not found');
    const event = await res.json();
    document.title = `RSVP: ${event.name}`;

    const dateText = formatEventDate(event.event_date);

    if (event.imageUrl) {
      document.getElementById('plain-hero-wrap').style.display = 'none';
      document.getElementById('banner-wrap').style.display = 'block';
      document.getElementById('banner-img').src = event.imageUrl;
      document.getElementById('banner-name').textContent = event.name;
      document.getElementById('banner-date').textContent = dateText ? `📅 ${dateText}` : '';
      document.getElementById('banner-location').textContent = event.location ? `📍 ${event.location}` : '';
      document.getElementById('banner-desc').textContent = event.description || '';
    } else {
      document.getElementById('event-name').textContent = event.name;
      document.getElementById('event-desc').textContent = event.description || '';
      document.getElementById('event-date').textContent = dateText ? `📅 ${dateText}` : '';
      if (event.location) {
        document.getElementById('event-location').textContent = `📍 ${event.location}`;
      }
    }

    if (event.inviteOnly) {
      document.getElementById('invite-only-note').style.display = 'block';
    }
  } catch (err) {
    document.getElementById('event-name').textContent = 'Event not found';
    document.getElementById('rsvp-card').style.display = 'none';
  }
}

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function loadComments() {
  const list = document.getElementById('comments-list');
  try {
    const res = await fetch(`/api/events/${SLUG}/comments`);
    const comments = await res.json();
    if (!comments.length) {
      list.innerHTML = '<div class="empty-note">No messages yet — be the first to say hi!</div>';
      return;
    }
    list.innerHTML = comments
      .map(
        (c) => `
        <div class="comment-item">
          <span class="who">${escapeHtml(c.name)}</span>
          <span class="badge ${c.attending ? 'yes' : 'no'}">${c.attending ? '🎉 Attending' : "Can't make it"}</span>
          <div class="text">${escapeHtml(c.comment)}</div>
          <div class="when">${timeAgo(c.created_at)}</div>
        </div>`
      )
      .join('');
  } catch (err) {
    list.innerHTML = '<div class="empty-note">Couldn\'t load messages.</div>';
  }
}

function fireConfetti() {
  if (typeof confetti === 'function') {
    confetti({ particleCount: 140, spread: 90, origin: { y: 0.6 } });
  }
}

function setupAttendingToggle() {
  const guestFields = document.getElementById('guest-count-fields');
  document.querySelectorAll('input[name="attending"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      guestFields.style.display = radio.value === 'no' && radio.checked ? 'none' : 'block';
    });
  });
}

function setupForm() {
  const form = document.getElementById('rsvp-form');
  const errorBox = document.getElementById('form-error');
  const submitBtn = document.getElementById('submit-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.style.display = 'none';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';

    const formData = new FormData(form);
    const payload = {
      name: formData.get('name'),
      email: formData.get('email'),
      attending: formData.get('attending'),
      adults: formData.get('adults'),
      kids: formData.get('kids'),
      comment: formData.get('comment'),
    };

    try {
      const res = await fetch(`/api/events/${SLUG}/rsvp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Something went wrong.');
      }
      form.style.display = 'none';
      document.getElementById('success-box').style.display = 'block';
      fireConfetti();
      loadComments();
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.style.display = 'block';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send RSVP';
    }
  });
}

function setupCopyLink() {
  document.getElementById('copy-link-btn').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      const btn = document.getElementById('copy-link-btn');
      const original = btn.textContent;
      btn.textContent = '✅ Link copied!';
      setTimeout(() => (btn.textContent = original), 2000);
    } catch (err) {
      window.prompt('Copy this link to share:', window.location.href);
    }
  });
}

loadEvent();
loadComments();
setupAttendingToggle();
setupForm();
setupCopyLink();
