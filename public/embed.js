// Compact RSVP form built to run inside someone else's page. Deliberately no
// party wall, no FAQ, no navigation — just enough to reply.

const SLUG = window.location.pathname.split('/').filter(Boolean).pop();

function formatWhen(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// The iframe can't resize itself, so tell the host page how tall we are and let
// their snippet adjust. Harmless if nobody's listening.
function reportHeight() {
  const height = document.getElementById('embed-card').offsetHeight;
  try {
    window.parent.postMessage({ type: 'rsvpfor:height', slug: SLUG, height }, '*');
  } catch (err) {
    // Cross-origin parents that reject messages are fine to ignore.
  }
}

async function load() {
  try {
    const res = await fetch(`/api/events/${SLUG}/public`);
    if (!res.ok) throw new Error('not found');
    const event = await res.json();

    document.getElementById('embed-loading').style.display = 'none';
    document.getElementById('embed-content').style.display = 'block';
    document.title = `RSVP: ${event.name}`;

    document.getElementById('embed-name').textContent = event.name;
    document.getElementById('embed-date').textContent = formatWhen(event.event_date);
    document.getElementById('embed-location').textContent = event.location || '';
    document.getElementById('embed-credit').href = event.shareUrl || `/e/${SLUG}`;

    const social = document.getElementById('embed-social');
    const bits = [];
    if (event.goingCount) bits.push(`${event.goingCount} going`);
    if (event.isFull) bits.push('Full — waitlist open');
    else if (event.spotsLeft !== null) bits.push(`${event.spotsLeft} ${event.spotsLeft === 1 ? 'spot' : 'spots'} left`);
    social.textContent = bits.join(' · ');

    reportHeight();
  } catch (err) {
    document.getElementById('embed-loading').style.display = 'none';
    document.getElementById('embed-missing').style.display = 'block';
    reportHeight();
  }
}

document.querySelectorAll('input[name="embed-attending"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    document.getElementById('embed-party-wrap').style.display =
      radio.value === 'no' && radio.checked ? 'none' : 'grid';
    reportHeight();
  });
});

document.getElementById('embed-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorBox = document.getElementById('embed-error');
  const submit = document.getElementById('embed-submit');
  errorBox.style.display = 'none';
  submit.disabled = true;
  submit.textContent = 'Sending…';

  const payload = {
    name: document.getElementById('embed-guest-name').value,
    email: document.getElementById('embed-email').value,
    attending: document.querySelector('input[name="embed-attending"]:checked').value,
    adults: document.getElementById('embed-adults').value,
    kids: document.getElementById('embed-kids').value,
    comment: '',
  };

  try {
    const res = await fetch(`/api/events/${SLUG}/rsvp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Something went wrong.');

    document.getElementById('embed-form').style.display = 'none';
    const done = document.getElementById('embed-done');
    done.style.display = 'flex';
    document.getElementById('embed-done-title').textContent = data.waitlisted
      ? "You're on the waitlist"
      : data.revised
        ? 'Your reply has been updated'
        : "You're in — thank you!";
    document.getElementById('embed-done-note').textContent = data.waitlisted
      ? "We'll email you the moment a spot opens up."
      : '';

    const ticketLink = document.getElementById('embed-ticket-link');
    if (data.ticketUrl && payload.attending === 'yes') ticketLink.href = data.ticketUrl;
    else ticketLink.style.display = 'none';

    reportHeight();
  } catch (err) {
    errorBox.textContent = err.message;
    errorBox.style.display = 'block';
    submit.disabled = false;
    submit.textContent = 'Send RSVP';
    reportHeight();
  }
});

window.addEventListener('resize', reportHeight);
load();
