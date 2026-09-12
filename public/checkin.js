// Door check-in. Reads a ticket QR with the camera where the browser supports
// it, and always accepts a typed code as well — cameras get denied, run out of
// light, or simply aren't there on a desktop.

const EVENT_ID = window.location.pathname.split('/').filter(Boolean)[1];

const state = {
  stream: null,
  detector: null,
  scanning: false,
  // A camera parked on one ticket fires continuously; ignore a repeat of the
  // same code for a few seconds so the door doesn't spam the server.
  lastToken: null,
  lastTokenAt: 0,
  busy: false,
  log: [],
};

const REPEAT_COOLDOWN_MS = 4000;

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function ordinal(n) {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th';
  return `${n}${suffix}`;
}

function setHint(message) {
  document.getElementById('scanner-hint').textContent = message || '';
}

function showResult(kind, title, detail) {
  const box = document.getElementById('checkin-result');
  box.className = `checkin-result is-${kind}`;
  box.innerHTML = `<strong>${escapeHtml(title)}</strong>${detail ? `<span>${escapeHtml(detail)}</span>` : ''}`;
  box.style.display = 'block';
}

function renderLog() {
  const list = document.getElementById('checkin-log');
  document.getElementById('log-count').textContent = state.log.length
    ? `${state.log.length} scanned this session`
    : '';
  if (!state.log.length) {
    list.innerHTML = '<div class="empty-note">Nobody scanned yet.</div>';
    return;
  }
  list.innerHTML = state.log
    .map(
      (entry) => `
      <div class="checkin-log-row is-${entry.kind}">
        <span class="log-name">${escapeHtml(entry.name)}</span>
        <span class="log-detail">${escapeHtml(entry.detail)}</span>
        <span class="log-time">${escapeHtml(entry.time)}</span>
      </div>`
    )
    .join('');
}

function addToLog(kind, name, detail) {
  state.log.unshift({
    kind,
    name,
    detail,
    time: new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
  });
  state.log = state.log.slice(0, 25);
  renderLog();
}

async function loadEvent() {
  try {
    const res = await fetch(`/api/events/${EVENT_ID}/host`);
    if (!res.ok) throw new Error('not found');
    const data = await res.json();
    // The event's name and the way back to it live in the workspace header now.
    document.getElementById('checkin-count').textContent = data.totals.checkedInCount;
    document.getElementById('checkin-total').textContent = data.totals.attendingCount;
    if (!data.event.published_at) {
      document.getElementById('checkin-event-name').textContent =
        'This event is still a draft — publish it so guests can reply and get tickets.';
    }
  } catch (err) {
    document.getElementById('checkin-event-name').textContent = "Couldn't load this event. Refresh to try again.";
  }
}

async function submitToken(token, { fromCamera = false } = {}) {
  // A ticket's QR holds the whole ticket URL, so that a guest scanning it with
  // an ordinary camera app lands on their ticket. Here we want the code at the
  // end of it — and this equally accepts a link someone pasted by hand.
  const clean = String(token || '').trim().replace(/^.*\/t\//, '');
  if (!clean || state.busy) return;

  const now = Date.now();
  if (fromCamera && clean === state.lastToken && now - state.lastTokenAt < REPEAT_COOLDOWN_MS) return;
  state.lastToken = clean;
  state.lastTokenAt = now;
  state.busy = true;

  try {
    const res = await fetch(`/api/events/${EVENT_ID}/checkin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: clean }),
    });
    const data = await res.json();

    if (!res.ok) {
      const name = data.guest?.name;
      showResult('error', name ? `${name} can't be checked in` : 'Not checked in', data.error);
      addToLog('error', name || 'Unknown ticket', data.error || 'Rejected');
      return;
    }

    const guest = data.guest;
    const party = `${guest.party} ${guest.party === 1 ? 'person' : 'people'}`;
    // Recognising a regular is the whole point of tracking visits — surface it
    // at the moment the host is face to face with them.
    const regular = guest.visits > 1 ? ` · ${ordinal(guest.visits)} time here` : '';

    if (data.already) {
      const at = new Date(data.checkedInAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
      showResult('repeat', `${guest.name} is already in`, `Checked in at ${at} · ${party}${regular}`);
      addToLog('repeat', guest.name, `Already in since ${at}`);
    } else {
      showResult('success', `${guest.name} is in`, `${party}${regular}`);
      addToLog('success', guest.name, `${party}${regular}`);
      loadEvent();
    }
  } catch (err) {
    showResult('error', 'Could not reach the server', 'Check the connection and try again.');
  } finally {
    state.busy = false;
  }
}

// Prefer the browser's own barcode reader where it exists — it's faster and
// handles poor light better than the JS fallback.
async function makeDetector() {
  if ('BarcodeDetector' in window) {
    try {
      const formats = await window.BarcodeDetector.getSupportedFormats();
      if (formats.includes('qr_code')) {
        return {
          kind: 'native',
          detector: new window.BarcodeDetector({ formats: ['qr_code'] }),
        };
      }
    } catch (err) {
      // Fall through to jsQR.
    }
  }
  if (typeof jsQR !== 'undefined') return { kind: 'jsqr' };
  return null;
}

async function scanFrame() {
  if (!state.scanning) return;
  const video = document.getElementById('scanner-video');

  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    try {
      if (state.detector.kind === 'native') {
        const codes = await state.detector.detector.detect(video);
        if (codes.length) submitToken(codes[0].rawValue, { fromCamera: true });
      } else {
        const canvas = document.getElementById('scanner-canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const found = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' });
        if (found?.data) submitToken(found.data, { fromCamera: true });
      }
    } catch (err) {
      // A single bad frame is normal; keep scanning.
    }
  }

  // ~7 reads a second is plenty for a queue at a door and leaves the phone cool.
  setTimeout(() => requestAnimationFrame(scanFrame), 140);
}

async function startCamera() {
  setHint('Asking for camera access…');
  state.detector = await makeDetector();
  if (!state.detector) {
    setHint("This browser can't read QR codes — use the code box below.");
    return;
  }

  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false,
    });
  } catch (err) {
    setHint(
      err && err.name === 'NotAllowedError'
        ? 'Camera access was blocked — allow it in your browser, or type codes below.'
        : 'No camera available — type codes below instead.'
    );
    return;
  }

  const video = document.getElementById('scanner-video');
  video.srcObject = state.stream;
  await video.play();

  document.getElementById('scanner-stage').classList.add('is-live');
  document.getElementById('scanner-placeholder').style.display = 'none';
  document.getElementById('start-camera').style.display = 'none';
  document.getElementById('stop-camera').style.display = 'inline-flex';
  setHint(state.detector.kind === 'native' ? 'Scanning…' : 'Scanning…');

  state.scanning = true;
  scanFrame();
}

function stopCamera() {
  state.scanning = false;
  if (state.stream) {
    state.stream.getTracks().forEach((track) => track.stop());
    state.stream = null;
  }
  document.getElementById('scanner-stage').classList.remove('is-live');
  document.getElementById('scanner-placeholder').style.display = 'grid';
  document.getElementById('start-camera').style.display = 'inline-flex';
  document.getElementById('stop-camera').style.display = 'none';
  setHint('');
}

document.getElementById('start-camera').addEventListener('click', startCamera);
document.getElementById('stop-camera').addEventListener('click', stopCamera);

document.getElementById('manual-submit').addEventListener('click', () => {
  const input = document.getElementById('manual-token');
  submitToken(input.value);
  input.value = '';
  input.focus();
});

document.getElementById('manual-token').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    document.getElementById('manual-submit').click();
  }
});

// Releasing the camera when the tab is hidden stops the phone cooking in a
// pocket mid-event.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.scanning) stopCamera();
});

loadEvent();
renderLog();
