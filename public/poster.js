// A printable A4/Letter poster with a big QR code linking to the invitation.
const EVENT_ID = window.location.pathname.split('/').filter(Boolean)[1];

function drawQr(url) {
  // Drawn by the server as SVG: it always appears, and stays sharp in print at
  // any paper size.
  document.getElementById('poster-qr').src = `/qr.svg?data=${encodeURIComponent(url)}`;
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
