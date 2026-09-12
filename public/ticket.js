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

// The code is drawn by the server, so it always appears — no library to load
// and nothing to fail quietly. It encodes the ticket's own URL, so a guest
// scanning with an ordinary camera app opens their ticket, while the door
// scanner reads the same code and takes the token from the end of it.
function renderQr(token) {
  const img = document.getElementById('ticket-qr');
  const url = `${window.location.origin}/t/${encodeURIComponent(token)}`;
  img.src = `/qr.svg?data=${encodeURIComponent(url)}`;
  // If even that fails, the printed code underneath still gets them in.
  img.onerror = () => {
    img.style.display = 'none';
    const code = document.createElement('div');
    code.className = 'ticket-qr-fallback';
    code.textContent = token;
    document.getElementById('ticket-qr-wrap').insertBefore(code, document.querySelector('#ticket-qr-wrap small'));
  };
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
