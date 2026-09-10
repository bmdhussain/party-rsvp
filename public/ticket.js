const TOKEN = window.location.pathname.split('/').filter(Boolean).pop();

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

function formatCheckedIn(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, { hour: 'numeric', minute: '2-digit' });
}

// The QR library comes from a CDN with `defer`, so it may not have run yet when
// the ticket data lands. Poll briefly rather than racing it, and fall back to
// showing the code as text if it never arrives — a readable code still gets the
// guest through the door.
function renderQr(text) {
  const canvas = document.getElementById('ticket-qr');
  const wrap = document.getElementById('ticket-qr-wrap');
  let waited = 0;

  const attempt = () => {
    if (typeof QRCode !== 'undefined' && QRCode.toCanvas) {
      QRCode.toCanvas(canvas, text, { width: 190, margin: 1, color: { dark: '#2f2237', light: '#fffdf9' } }, (err) => {
        if (err) showFallback();
      });
      return;
    }
    waited += 100;
    if (waited > 4000) return showFallback();
    setTimeout(attempt, 100);
  };

  const showFallback = () => {
    canvas.style.display = 'none';
    const code = document.createElement('div');
    code.className = 'ticket-qr-fallback';
    code.textContent = TOKEN;
    wrap.insertBefore(code, wrap.querySelector('small'));
  };

  attempt();
}

const STATUS_COPY = {
  confirmed: { label: 'Admit one', banner: null },
  waitlist: {
    label: 'Waitlist',
    banner: "You're on the waitlist for this event. This ticket becomes valid if a spot opens up — we'll email you.",
  },
  declined: {
    label: 'Not attending',
    banner: "You replied that you couldn't make it. If that's changed, RSVP again on the event page.",
  },
};

async function loadTicket() {
  try {
    const res = await fetch(`/api/tickets/${encodeURIComponent(TOKEN)}`);
    if (!res.ok) throw new Error('not found');
    const t = await res.json();

    document.getElementById('ticket-loading').style.display = 'none';
    document.getElementById('ticket-card').style.display = 'block';
    document.title = `Ticket: ${t.event.name}`;

    document.getElementById('ticket-event-name').textContent = t.event.name;
    document.getElementById('ticket-date').textContent = formatEventDate(t.event.event_date);
    document.getElementById('ticket-location').textContent = t.event.location || '';
    document.getElementById('ticket-guest-name').textContent = t.guestName;
    document.getElementById('ticket-party').textContent =
      t.status === 'declined' ? '—' : `${t.party} ${t.party === 1 ? 'person' : 'people'}`;

    const copy = STATUS_COPY[t.status] || STATUS_COPY.confirmed;
    document.getElementById('ticket-status-label').textContent = copy.label;
    document.getElementById('ticket-card').classList.add(`is-${t.status}`);

    const banner = document.getElementById('ticket-banner');
    if (t.checkedInAt) {
      // Once they're through the door, that's the most useful thing the ticket
      // can tell them — it takes precedence over the status note.
      banner.textContent = `Checked in at ${formatCheckedIn(t.checkedInAt)}. You're all set.`;
      banner.className = 'ticket-banner is-checked-in';
      banner.style.display = 'block';
    } else if (copy.banner) {
      banner.textContent = copy.banner;
      banner.className = 'ticket-banner';
      banner.style.display = 'block';
    }

    // A QR code is only meaningful for someone who actually has a spot.
    if (t.status === 'confirmed') {
      renderQr(t.token);
    } else {
      document.getElementById('ticket-qr-wrap').style.display = 'none';
    }

    document.getElementById('ticket-calendar').href = t.event.calendarUrl;
    document.getElementById('ticket-event-link').href = t.event.shareUrl;
  } catch (err) {
    document.getElementById('ticket-loading').style.display = 'none';
    document.getElementById('ticket-missing').style.display = 'block';
  }
}

loadTicket();
