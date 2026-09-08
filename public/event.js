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
      const bannerImg = document.getElementById('banner-img');
      const bannerWrap = document.getElementById('banner-wrap');
      const plainHeroWrap = document.getElementById('plain-hero-wrap');
      const showPlainHero = () => {
        bannerWrap.style.display = 'none';
        plainHeroWrap.style.display = 'block';
        document.getElementById('event-name').textContent = event.name;
        document.getElementById('event-desc').textContent = event.description || '';
        document.getElementById('event-date').textContent = dateText;
        if (event.location) document.getElementById('event-location').textContent = event.location;
      };
      bannerImg.alt = `Invitation artwork for ${event.name}`;
      bannerImg.onerror = showPlainHero;
      bannerImg.src = event.imageUrl;
      document.getElementById('banner-name').textContent = event.name;
      document.getElementById('banner-date').textContent = dateText || '';
      document.getElementById('banner-location').textContent = event.location || '';
      document.getElementById('banner-desc').textContent = event.description || '';
    } else {
      document.getElementById('event-name').textContent = event.name;
      document.getElementById('event-desc').textContent = event.description || '';
      document.getElementById('event-date').textContent = dateText;
      if (event.location) {
        document.getElementById('event-location').textContent = event.location;
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

function initials(name) {
  return String(name || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

async function loadComments() {
  const list = document.getElementById('comments-list');
  try {
    const res = await fetch(`/api/events/${SLUG}/comments`);
    const comments = await res.json();
    if (!comments.length) {
      document.getElementById('wall-response-count').innerHTML = '<strong>0</strong><span>notes</span>';
      document.getElementById('wall-summary').style.display = 'none';
      list.innerHTML = '<div class="wall-empty"><span>✦</span><strong>Be the first voice on the wall.</strong><p>Leave a note with your RSVP and get the party started.</p></div>';
      return;
    }

    const coming = comments.filter((comment) => comment.attending).length;
    const away = comments.length - coming;
    document.getElementById('wall-response-count').innerHTML =
      `<strong>${comments.length}</strong><span>${comments.length === 1 ? 'note' : 'notes'}</span>`;
    document.getElementById('wall-coming-count').textContent = coming;
    document.getElementById('wall-away-count').textContent = away;
    document.getElementById('wall-summary').style.display = 'flex';

    const orderedComments = [
      ...comments.filter((comment) => comment.attending),
      ...comments.filter((comment) => !comment.attending),
    ];
    list.innerHTML = orderedComments
      .map(
        (c, index) => `
        <article class="comment-item ${c.attending ? 'is-coming' : 'is-away'}" style="--card-index:${index % 5}">
          <div class="comment-topline">
            <span class="comment-avatar" aria-hidden="true">${escapeHtml(initials(c.name))}</span>
            <span class="comment-person"><strong>${escapeHtml(c.name)}</strong><small>${timeAgo(c.created_at)}</small></span>
            <span class="wall-status ${c.attending ? 'yes' : 'no'}"><i></i>${c.attending ? 'Coming' : 'Sending love'}</span>
          </div>
          <blockquote>${escapeHtml(c.comment)}</blockquote>
        </article>`
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
