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

// Hides everything that only makes sense for a live invitation.
function showUnavailable({ comingSoon }) {
  ['rsvp-card', 'share-row', 'capacity-strip'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  const wall = document.querySelector('.party-wall');
  if (wall) wall.style.display = 'none';
  if (comingSoon) {
    document.getElementById('coming-soon').hidden = false;
    document.getElementById('event-name').textContent = 'Invitation coming soon';
  } else {
    document.getElementById('event-name').textContent = 'Invitation not found';
  }
}

let extrasLoaded = false;

// Other upcoming public events from the same host — the thing that turns one
// party into a reason to come back.
async function loadMoreFromHost(event) {
  try {
    const more = await (await fetch(`/api/events/${SLUG}/more`)).json();
    if (!more.length) return;
    const section = document.getElementById('more-from-host');
    const link = document.getElementById('more-from-host-link');
    if (event.host) {
      document.getElementById('more-from-host-title').textContent = `More from ${event.host.name}`;
      link.href = `/@${encodeURIComponent(event.host.handle)}`;
    } else {
      link.hidden = true;
    }
    document.getElementById('more-from-host-list').innerHTML = more
      .map(
        (e) => `
        <article class="browse-card">
          <a class="browse-card-art" href="/e/${encodeURIComponent(e.slug)}" tabindex="-1" aria-hidden="true">${
            e.imageUrl ? `<img src="${escapeHtml(e.imageUrl)}" alt="" loading="lazy" />` : '<span class="browse-card-empty">✦</span>'
          }</a>
          <div class="browse-card-body">
            <div class="browse-card-when">${escapeHtml(formatEventDate(e.event_date))}</div>
            <h3><a href="/e/${encodeURIComponent(e.slug)}">${escapeHtml(e.name)}</a></h3>
            ${e.location ? `<div class="browse-card-where">${escapeHtml(e.location)}</div>` : ''}
          </div>
        </article>`
      )
      .join('');
    section.hidden = false;
  } catch (err) {
    // Purely a bonus; the invitation stands on its own without it.
  }
}

async function loadEvent() {
  try {
    const res = await fetch(`/api/events/${SLUG}/public`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showUnavailable({ comingSoon: Boolean(body.draft) });
      return;
    }
    const event = await res.json();
    document.title = `RSVP: ${event.name}`;

    if (event.draft && event.isHost) {
      document.getElementById('draft-preview-banner').hidden = false;
      document.getElementById('draft-manage-link').href = `/host/${encodeURIComponent(event.eventId)}`;
    }

    // The host is only named when they've chosen to have a public page.
    const hostLine = document.getElementById('host-line');
    if (event.host) {
      hostLine.innerHTML = `Hosted by <a href="/@${encodeURIComponent(event.host.handle)}">${escapeHtml(event.host.name)}</a>`;
      hostLine.hidden = false;
    }

    const shareText = `You're invited: ${event.name}${event.event_date ? ` — ${formatEventDate(event.event_date)}` : ''}. RSVP here: ${event.shareUrl || window.location.href}`;
    document.getElementById('whatsapp-btn').href = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

    if (!extrasLoaded) {
      extrasLoaded = true;
      if (!event.draft) loadMoreFromHost(event);
    }

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

    renderCapacity(event);
    renderFaqs(event.faqs);
    renderRsvpQuestions(event);

    const calendarUrl = `/api/events/${SLUG}/calendar.ics`;
    document.getElementById('add-calendar-btn').href = calendarUrl;
    document.getElementById('success-calendar-btn').href = calendarUrl;
    // Without a date there's no calendar entry to make.
    if (!event.event_date) document.getElementById('add-calendar-btn').style.display = 'none';

    if (event.inviteOnly) {
      document.getElementById('invite-only-note').style.display = 'block';
    }

    // A draft can't take replies, even from the host previewing it.
    if (event.draft) {
      const form = document.getElementById('rsvp-form');
      if (form) {
        form.querySelectorAll('input, textarea, button').forEach((el) => {
          el.disabled = true;
        });
      }
      const err = document.getElementById('form-error');
      err.textContent = 'Replies open once you publish this invitation.';
      err.style.display = 'block';
    }
  } catch (err) {
    showUnavailable({ comingSoon: false });
  }
}

// A capped event shows how much room is left; an uncapped one shows nothing at
// all, so events that don't care about numbers stay uncluttered.
function renderCapacity(event) {
  const strip = document.getElementById('capacity-strip');
  if (!strip) return;
  if (event.capacity === null || event.capacity === undefined) {
    strip.style.display = 'none';
    return;
  }

  const left = event.spotsLeft;
  const taken = event.capacity - left;
  const pct = event.capacity > 0 ? Math.min(100, Math.round((taken / event.capacity) * 100)) : 100;
  strip.style.display = 'flex';
  strip.classList.toggle('is-full', Boolean(event.isFull));
  strip.innerHTML = event.isFull
    ? `<div class="capacity-copy"><strong>This event is full</strong>
         <small>You can still reply — you'll join the waitlist, and we'll email you if a spot frees up.</small></div>
       <div class="capacity-meter" role="img" aria-label="Full"><i style="width:100%"></i></div>`
    : `<div class="capacity-copy"><strong>${left} ${left === 1 ? 'spot' : 'spots'} left</strong>
         <small>${taken} of ${event.capacity} taken</small></div>
       <div class="capacity-meter" role="img" aria-label="${pct}% full"><i style="width:${pct}%"></i></div>`;
}

function renderFaqs(faqs) {
  const section = document.getElementById('faq-section');
  if (!section) return;
  if (!Array.isArray(faqs) || !faqs.length) {
    section.style.display = 'none';
    return;
  }
  section.style.display = 'block';
  document.getElementById('faq-list').innerHTML = faqs
    .map(
      (f) => `
      <details class="faq-item">
        <summary>${escapeHtml(f.question)}</summary>
        <div class="faq-answer">${escapeHtml(f.answer)}</div>
      </details>`
    )
    .join('');
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

// A waitlisted guest said yes but hasn't got a spot, so the wall mustn't show
// them as coming. Falls back to the old boolean for replies made before
// statuses existed.
function wallState(comment) {
  const status = comment.status || (comment.attending ? 'confirmed' : 'declined');
  if (status === 'confirmed') return { key: 'confirmed', cls: 'is-coming', badge: 'yes', label: 'Coming' };
  if (status === 'waitlist') {
    return { key: 'waitlist', cls: 'is-waiting', badge: 'waiting', label: 'On the waitlist' };
  }
  return { key: 'declined', cls: 'is-away', badge: 'no', label: 'Sending love' };
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

    const byState = (state) => comments.filter((c) => wallState(c).key === state);
    const coming = byState('confirmed').length;
    const waiting = byState('waitlist').length;
    const away = byState('declined').length;

    document.getElementById('wall-response-count').innerHTML =
      `<strong>${comments.length}</strong><span>${comments.length === 1 ? 'note' : 'notes'}</span>`;
    document.getElementById('wall-coming-count').textContent = coming;
    document.getElementById('wall-away-count').textContent = away;
    const waitingTile = document.getElementById('wall-waiting-item');
    if (waitingTile) {
      waitingTile.style.display = waiting ? 'flex' : 'none';
      document.getElementById('wall-waiting-count').textContent = waiting;
    }
    document.getElementById('wall-summary').style.display = 'flex';

    const orderedComments = [...byState('confirmed'), ...byState('waitlist'), ...byState('declined')];
    list.innerHTML = orderedComments
      .map((c, index) => {
        const state = wallState(c);
        return `
        <article class="comment-item ${state.cls}" style="--card-index:${index % 5}">
          <div class="comment-topline">
            <span class="comment-avatar" aria-hidden="true">${escapeHtml(initials(c.name))}</span>
            <span class="comment-person"><strong>${escapeHtml(c.name)}</strong><small>${timeAgo(c.created_at)}</small></span>
            <span class="wall-status ${state.badge}"><i></i>${state.label}</span>
          </div>
          <blockquote>${escapeHtml(c.comment)}</blockquote>
        </article>`;
      })
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

function isAttendingSelected() {
  return document.querySelector('input[name="attending"]:checked')?.value !== 'no';
}

// The host's extra questions only apply to guests who are coming. Hidden
// questions are also disabled: a hidden but required input would otherwise
// make the browser refuse to submit "can't make it", with nothing on screen
// explaining why.
function syncRsvpQuestions() {
  const box = document.getElementById('rsvp-questions');
  if (!box || !box.dataset.hasQuestions) return;
  const show = isAttendingSelected();
  box.hidden = !show;
  box.querySelectorAll('input, textarea, select').forEach((el) => {
    el.disabled = !show;
  });
}

let rsvpQuestions = [];

function renderRsvpQuestions(event) {
  const box = document.getElementById('rsvp-questions');
  const questions = Array.isArray(event.rsvpQuestions) ? event.rsvpQuestions : [];
  // Rendered once: loadEvent runs again after replying, and re-rendering would
  // wipe anything typed.
  if (!box || box.dataset.rendered || !questions.length) return;
  rsvpQuestions = questions;
  window.RSVPforForm.render(box, questions, { prefix: 'rq' });
  box.dataset.rendered = '1';
  box.dataset.hasQuestions = '1';
  syncRsvpQuestions();
}

function setupAttendingToggle() {
  const guestFields = document.getElementById('guest-count-fields');
  document.querySelectorAll('input[name="attending"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      guestFields.style.display = radio.value === 'no' && radio.checked ? 'none' : 'block';
      syncRsvpQuestions();
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

    // The host's extra questions, for guests who are coming. Required choice
    // questions can't use the browser's own check, so catch them here; the
    // server checks everything again regardless.
    const questionsBox = document.getElementById('rsvp-questions');
    if (rsvpQuestions.length && payload.attending === 'yes') {
      payload.answers = window.RSVPforForm.collect(questionsBox);
      const missing = {};
      rsvpQuestions.forEach((q) => {
        if (q.required && q.type !== 'section' && payload.answers[q.id] === undefined) missing[q.id] = 'This question is required.';
      });
      if (Object.keys(missing).length) {
        window.RSVPforForm.showErrors(questionsBox, missing);
        errorBox.textContent = 'Please answer the required questions.';
        errorBox.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Send RSVP';
        return;
      }
      window.RSVPforForm.clearErrors(questionsBox);
    }

    try {
      const res = await fetch(`/api/events/${SLUG}/rsvp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.fieldErrors) window.RSVPforForm.showErrors(questionsBox, data.fieldErrors);
        throw new Error(data.error || 'Something went wrong.');
      }
      form.style.display = 'none';
      const box = document.getElementById('success-box');
      box.style.display = 'block';

      if (data.waitlisted) {
        // No confetti for a waitlist placing — it would promise something the
        // guest hasn't actually got yet.
        box.classList.add('is-waitlist');
        document.getElementById('success-emoji').textContent = '⏳';
        document.getElementById('success-text').textContent = "You're on the waitlist";
        document.getElementById('success-note').textContent =
          "The event is full right now. You're in the queue, and we'll email you the moment a spot opens up.";
      } else {
        fireConfetti();
        document.getElementById('success-text').textContent = data.revised
          ? 'Your reply has been updated.'
          : 'Thanks! Your RSVP is in.';
        document.getElementById('success-note').textContent = '';
      }

      // A ticket is only worth offering to someone who's actually coming —
      // including the waitlist, whose ticket activates if they get promoted.
      if (data.ticketUrl && payload.attending === 'yes') {
        document.getElementById('success-ticket-btn').href = data.ticketUrl;
        document.getElementById('success-actions').style.display = 'flex';
      }

      loadComments();
      loadEvent();
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
