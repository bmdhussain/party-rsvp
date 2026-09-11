// A printable A4/Letter poster with a big QR code linking to the invitation.
const EVENT_ID = window.location.pathname.split('/').filter(Boolean)[1];

function drawQr(url) {
  const canvas = document.getElementById('poster-qr');
  let waited = 0;
  // The QR library loads with `defer` from a CDN; wait briefly for it.
  (function attempt() {
    if (typeof QRCode !== 'undefined' && QRCode.toCanvas) {
      QRCode.toCanvas(canvas, url, { width: 320, margin: 1, color: { dark: '#2f2237', light: '#ffffff' } });
      return;
    }
    waited += 100;
    if (waited < 5000) setTimeout(attempt, 100);
  })();
}

(async function load() {
  document.getElementById('poster-back').href = `/host/${EVENT_ID}/share`;
  try {
    const res = await fetch(`/api/events/${EVENT_ID}/host`);
    if (!res.ok) throw new Error('not found');
    const { event } = await res.json();
    document.title = `Poster · ${event.name}`;
    document.getElementById('poster-name').textContent = event.name;
    document.getElementById('poster-date').textContent = event.event_date
      ? new Date(event.event_date).toLocaleString(undefined, { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })
      : '';
    document.getElementById('poster-location').textContent = event.location || '';
    document.getElementById('poster-url').textContent = event.shareUrl.replace(/^https?:\/\//, '');
    drawQr(event.shareUrl);
  } catch (err) {
    document.getElementById('poster-name').textContent = "Couldn't load this event.";
  }
})();
