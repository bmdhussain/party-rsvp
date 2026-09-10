const EVENT_ID = window.location.pathname.split('/').filter(Boolean).pop();

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatWhen(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

let lastData = null;
let selectedTemplate = null;
let selectedTint = 'warm';
let allTemplates = [];
let activeTemplateFilter = 'all';
let currentInvites = [];
let activeStudioStage = 'choose';
const EDITOR_WIDTH = 1200;
const EDITOR_HEIGHT = 630;
const editorState = {
  backgroundImage: null,
  layers: [],
  selectedId: null,
  dragging: null,
};
let editorLoadSequence = 0;

const studioStageOrder = ['choose', 'personalize', 'share'];

function setStudioStage(stage, { scroll = false } = {}) {
  const nextStage = studioStageOrder.includes(stage) ? stage : 'choose';
  activeStudioStage = nextStage;
  const currentIndex = studioStageOrder.indexOf(nextStage);

  document.querySelectorAll('[data-studio-stage]').forEach((step) => {
    const stepIndex = studioStageOrder.indexOf(step.dataset.studioStage);
    const isActive = step.dataset.studioStage === nextStage;
    step.classList.toggle('active', isActive);
    step.classList.toggle('completed', stepIndex < currentIndex);
    step.setAttribute('aria-current', isActive ? 'step' : 'false');
  });

  const shareBadge = document.getElementById('share-ready-badge');
  const shareNote = document.getElementById('share-panel-note');
  const hasSavedInvitation = Boolean(lastData?.event?.imageUrl);
  if (shareBadge) {
    shareBadge.textContent = hasSavedInvitation ? 'Ready to share' : 'Not saved yet';
    shareBadge.classList.toggle('is-ready', hasSavedInvitation);
  }
  if (shareNote) {
    shareNote.textContent = hasSavedInvitation
      ? 'Your guest page is live. Share the link whenever you are ready.'
      : 'Choose a look and save your invitation to unlock sharing.';
  }

  if (!scroll) return;
  const targetId = nextStage === 'choose' ? 'lookbook-section' : nextStage === 'personalize' ? 'template-customizer' : 'share-panel';
  const target = document.getElementById(targetId);
  if (!target) return;
  if (nextStage === 'personalize' && !editorState.backgroundImage) {
    setStudioStage('choose', { scroll: true });
    return;
  }
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

document.querySelectorAll('[data-studio-stage]').forEach((step) => {
  step.addEventListener('click', () => {
    const stage = step.dataset.studioStage;
    if (stage === 'share' && !lastData?.event?.imageUrl) {
      setStudioStage('choose', { scroll: true });
      return;
    }
    setStudioStage(stage, { scroll: true });
  });
});

const layerControlIds = {
  title: 'layer-title',
  date: 'layer-date',
  time: 'layer-time',
  location: 'layer-location',
};

function formatLayerDate(iso) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

function formatLayerTime(iso) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function makeDefaultLayers(event) {
  return [
    { id: 'title', text: event.name || 'Your event', x: 600, y: 168, size: 68, weight: 700, family: 'Fraunces', visible: true },
    { id: 'date', text: formatLayerDate(event.event_date), x: 600, y: 278, size: 30, weight: 700, family: 'DM Sans', visible: true },
    { id: 'time', text: formatLayerTime(event.event_date), x: 600, y: 326, size: 25, weight: 600, family: 'DM Sans', visible: true },
    { id: 'location', text: event.location || 'Add a location', x: 600, y: 390, size: 27, weight: 600, family: 'DM Sans', visible: Boolean(event.location) },
  ].map((layer) => ({ ...layer, color: '#2f2238' }));
}

function syncLayerControls() {
  editorState.layers.forEach((layer) => {
    const input = document.getElementById(layerControlIds[layer.id]);
    const toggle = document.querySelector(`[data-layer-toggle="${layer.id}"]`);
    if (input) input.value = layer.text;
    if (toggle) toggle.checked = layer.visible;
  });
}

function resetEditorLayers() {
  if (!lastData) return;
  editorState.layers = makeDefaultLayers(lastData.event);
  editorState.selectedId = 'title';
  document.getElementById('layer-style').value = 'editorial';
  document.getElementById('layer-color').value = '#2f2238';
  syncLayerControls();
  drawEditor();
}

function setEditorStatus(state, message) {
  const status = document.getElementById('editor-status');
  if (!status) return;
  status.dataset.state = state;
  const label = status.querySelector('span');
  if (label) label.textContent = message;
}

function setEditorBusy(isBusy) {
  const panel = document.getElementById('template-customizer');
  if (!panel) return;
  panel.classList.toggle('is-loading', isBusy);
  panel.setAttribute('aria-busy', String(isBusy));
  const badge = document.getElementById('editor-ready-badge');
  if (badge) badge.textContent = isBusy ? 'Working…' : 'Ready to edit';
  panel.querySelectorAll('input, select, button').forEach((control) => {
    control.disabled = isBusy;
  });
}

function showEditorPanel(visible) {
  const panel = document.getElementById('template-customizer');
  if (!panel) return;
  panel.style.display = visible ? 'block' : 'none';
}

function drawImageContain(ctx, image) {
  const scale = Math.min(EDITOR_WIDTH / image.naturalWidth, EDITOR_HEIGHT / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  ctx.drawImage(image, (EDITOR_WIDTH - width) / 2, (EDITOR_HEIGHT - height) / 2, width, height);
}

function layerBounds(ctx, layer) {
  ctx.font = `${layer.weight} ${layer.size}px "${layer.family}", sans-serif`;
  const maxWidth = EDITOR_WIDTH - 120;
  const width = Math.min(ctx.measureText(layer.text || ' ').width, maxWidth);
  return { left: layer.x - width / 2 - 16, top: layer.y - layer.size / 2 - 12, width: width + 32, height: layer.size + 24 };
}

function drawEditor() {
  const canvas = document.getElementById('image-editor-canvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, EDITOR_WIDTH, EDITOR_HEIGHT);
  if (!editorState.backgroundImage) return;

  ctx.fillStyle = '#f7f1e9';
  ctx.fillRect(0, 0, EDITOR_WIDTH, EDITOR_HEIGHT);
  drawImageContain(ctx, editorState.backgroundImage);
  const tint = { warm: 'rgba(238,128,88,.13)', bright: 'rgba(255,245,204,.1)', cool: 'rgba(47,116,153,.15)' }[selectedTint];
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, EDITOR_WIDTH, EDITOR_HEIGHT);

  editorState.layers.filter((layer) => layer.visible && layer.text.trim()).forEach((layer) => {
    let size = layer.size;
    ctx.font = `${layer.weight} ${size}px "${layer.family}", sans-serif`;
    while (size > 16 && ctx.measureText(layer.text).width > EDITOR_WIDTH - 120) {
      size -= 2;
      ctx.font = `${layer.weight} ${size}px "${layer.family}", sans-serif`;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = layer.color;
    const rgb = layer.color.match(/[a-f\d]{2}/gi)?.map((value) => parseInt(value, 16)) || [255, 255, 255];
    const isLightText = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000 > 150;
    ctx.shadowColor = isLightText ? 'rgba(0,0,0,.55)' : 'rgba(255,255,255,.75)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 4;
    ctx.fillText(layer.text, layer.x, layer.y);
    ctx.shadowColor = 'transparent';

    if (editorState.selectedId === layer.id) {
      const bounds = layerBounds(ctx, { ...layer, size });
      ctx.strokeStyle = 'rgba(255,255,255,.9)';
      ctx.lineWidth = 2;
      ctx.setLineDash([9, 7]);
      ctx.strokeRect(bounds.left, bounds.top, bounds.width, bounds.height);
      ctx.setLineDash([]);
    }
  });
}

function loadEditorBackground(imageUrl, { resetLayers = false } = {}) {
  const canvas = document.getElementById('image-editor-canvas');
  const empty = document.getElementById('image-empty');
  const loadSequence = ++editorLoadSequence;
  if (!imageUrl) {
    editorState.backgroundImage = null;
    editorState.layers = [];
    editorState.selectedId = null;
    canvas.style.display = 'none';
    empty.style.display = 'grid';
    showEditorPanel(false);
    setEditorBusy(false);
    setEditorStatus('empty', 'Select a look to start');
    return Promise.resolve();
  }

  const image = new Image();
  image.crossOrigin = 'anonymous';
  return new Promise((resolve, reject) => {
    image.onload = () => {
      if (loadSequence !== editorLoadSequence) {
        resolve(false);
        return;
      }
      editorState.backgroundImage = image;
      if (resetLayers) resetEditorLayers();
      canvas.style.display = 'block';
      empty.style.display = 'none';
      drawEditor();
      setEditorStatus('ready', 'Ready to edit');
      setEditorBusy(false);
      resolve();
    };
    image.onerror = () => {
      if (loadSequence !== editorLoadSequence) {
        resolve(false);
        return;
      }
      editorState.backgroundImage = null;
      canvas.style.display = 'none';
      empty.style.display = 'grid';
      showEditorPanel(false);
      setEditorBusy(false);
      setEditorStatus('error', 'Could not load this artwork');
      reject(new Error('Could not load this artwork.'));
    };
    image.src = imageUrl;
  });
}

async function loadDashboard() {
  try {
    const res = await fetch(`/api/events/${EVENT_ID}/host`);
    if (res.status === 401) {
      window.location.href = '/';
      return;
    }
    if (!res.ok) {
      document.getElementById('not-found').style.display = 'block';
      return;
    }
    const data = await res.json();
    lastData = data;
    render(data);
  } catch (err) {
    document.getElementById('not-found').style.display = 'block';
  }
}

function toLocalInputValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function futureDateTimeMinimum() {
  const date = new Date(Date.now() + 60 * 1000);
  date.setSeconds(0, 0);
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function render(data) {
  document.getElementById('event-title').textContent = data.event.name;
  document.getElementById('dashboard').style.display = 'block';
  document.getElementById('share-link').value = data.event.shareUrl;
  const previewLink = document.getElementById('public-preview-link');
  previewLink.href = data.event.shareUrl;
  const shareOpenButton = document.getElementById('share-open-btn');
  if (shareOpenButton) shareOpenButton.href = data.event.shareUrl;

  document.getElementById('edit-name').value = data.event.name;
  const editDate = document.getElementById('edit-date');
  editDate.min = futureDateTimeMinimum();
  editDate.value = toLocalInputValue(data.event.event_date);
  document.getElementById('edit-location').value = data.event.location || '';
  document.getElementById('edit-description').value = data.event.description || '';
  document.getElementById('edit-capacity').value =
    data.event.capacity === null || data.event.capacity === undefined ? '' : data.event.capacity;
  renderCapacityHint(data);
  setStudioStage(data.event.imageUrl ? 'share' : 'choose');

  editorState.layers = [];
  editorState.selectedId = null;
  showEditorPanel(false);
  setEditorBusy(true);
  setEditorStatus(data.event.imageUrl ? 'loading' : 'empty', data.event.imageUrl ? 'Loading your invitation…' : 'Select a look to start');
  loadEditorBackground(data.event.imageUrl ? `${data.event.imageUrl}?t=${Date.now()}` : null, { resetLayers: true }).then((loaded) => {
    if (loaded !== false && editorState.backgroundImage) showEditorPanel(true);
  }).catch(() => {
    document.getElementById('image-editor-canvas').style.display = 'none';
    document.getElementById('image-empty').style.display = 'grid';
    showEditorPanel(false);
  });

  const mode = data.event.invite_mode || 'open';
  document.querySelector(`input[name="invite-mode"][value="${mode}"]`).checked = true;
  document.getElementById('invite-list-section').style.display = mode === 'restricted' ? 'block' : 'none';
  if (mode === 'restricted') loadInvites();

  document.getElementById('stat-attending').textContent = data.totals.attendingCount;
  document.getElementById('stat-adults').textContent = data.totals.adults;
  document.getElementById('stat-kids').textContent = data.totals.kids;
  document.getElementById('stat-declined').textContent = data.totals.declinedCount;

  // The waitlist tile only earns its space once someone is actually on it.
  const waitlistTile = document.getElementById('stat-waitlist-tile');
  if (waitlistTile) {
    waitlistTile.style.display = data.totals.waitlistCount ? 'block' : 'none';
    document.getElementById('stat-waitlist').textContent = data.totals.waitlistCount;
  }
  const emailWaitlistBtn = document.getElementById('email-waitlist-btn');
  if (emailWaitlistBtn) {
    emailWaitlistBtn.style.display = data.totals.waitlistCount ? 'inline-flex' : 'none';
  }

  const body = document.getElementById('guest-table-body');
  const empty = document.getElementById('guest-empty');

  if (!data.rsvps.length) {
    body.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  body.innerHTML = data.rsvps
    .map((r) => {
      const badge = guestBadge(r);
      return `
      <tr class="${badge.rowClass}">
        <td>${escapeHtml(r.name)}</td>
        <td>${escapeHtml(r.email)}</td>
        <td><span class="pill badge ${badge.cls}">${badge.label}</span></td>
        <td>${badge.saidYes ? r.adults : '—'}</td>
        <td>${badge.saidYes ? r.kids : '—'}</td>
        <td>${escapeHtml(r.comment || '')}</td>
        <td>${formatWhen(r.created_at)}</td>
      </tr>`;
    })
    .join('');
}

// Waitlisted guests said yes but haven't got a spot — the host needs to see
// that distinction at a glance, not a bare "Yes".
function guestBadge(rsvp) {
  const status = rsvp.status || (rsvp.attending ? 'confirmed' : 'declined');
  if (status === 'waitlist') {
    return { cls: 'waiting', label: 'Waitlist', saidYes: true, rowClass: 'is-waitlisted' };
  }
  if (status === 'confirmed') {
    return { cls: 'yes', label: 'Coming', saidYes: true, rowClass: '' };
  }
  return { cls: 'no', label: 'No', saidYes: false, rowClass: '' };
}

// Spells out what the cap means right now, so the host isn't left doing the
// "is 12 of 20 taken good?" arithmetic themselves.
function renderCapacityHint(data) {
  const hint = document.getElementById('capacity-hint');
  if (!hint) return;
  const capacity = data.event.capacity;
  if (capacity === null || capacity === undefined) {
    hint.textContent = 'No limit — everyone who replies yes gets a spot.';
    hint.className = 'hint';
    return;
  }
  const taken = data.totals.adults + data.totals.kids;
  const left = Math.max(0, capacity - taken);
  const waiting = data.totals.waitlistCount;
  hint.className = left === 0 ? 'hint is-full' : 'hint';
  hint.textContent = left
    ? `${taken} of ${capacity} spots taken — ${left} left.` +
      (waiting ? ` ${waiting} waiting; raise the limit to let them in.` : '')
    : `Full: ${taken} of ${capacity} spots taken.` +
      (waiting
        ? ` ${waiting} ${waiting === 1 ? 'guest is' : 'guests are'} on the waitlist — raise the limit to let them in.`
        : '');
}

function setEmailStatus(message, type = 'success') {
  const status = document.getElementById('email-status');
  if (!status) return;
  status.textContent = message;
  status.className = `email-status ${type}`;
  status.style.display = 'block';
}

async function composeGuestEmail({ recipientMode, subject, intro, button }) {
  if (!lastData?.event?.shareUrl) {
    setEmailStatus('The event link is not ready yet. Refresh and try again.', 'error');
    return;
  }

  const originalLabel = button?.textContent || 'Send email';
  if (button) {
    button.disabled = true;
    button.textContent = 'Sending…';
  }
  setEmailStatus('Sending through Brevo…', 'pending');

  try {
    const res = await fetch(`/api/events/${EVENT_ID}/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipientMode, subject, intro }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Brevo could not send this email.');
    const summary = data.failed
      ? `Sent to ${data.sent} guests; ${data.failed} could not be sent.`
      : `Sent to ${data.sent} guest${data.sent === 1 ? '' : 's'} through Brevo.`;
    setEmailStatus(summary, data.failed ? 'warning' : 'success');
  } catch (err) {
    setEmailStatus(err.message, 'error');
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  }
}

document.getElementById('refresh-btn').addEventListener('click', loadDashboard);

document.getElementById('copy-link-btn').addEventListener('click', async () => {
  const input = document.getElementById('share-link');
  try {
    await navigator.clipboard.writeText(input.value);
    const btn = document.getElementById('copy-link-btn');
    const original = btn.textContent;
    btn.textContent = '✅ Copied!';
    setTimeout(() => (btn.textContent = original), 1500);
  } catch (err) {
    input.select();
  }
});

document.getElementById('email-attending-btn').addEventListener('click', () => {
  composeGuestEmail({
    recipientMode: 'attending',
    subject: `You're on the guest list — ${lastData.event.name}`,
    intro: `Hi! We’re excited to see you at ${lastData.event.name}. Here’s the invitation with the latest details:`,
    button: document.getElementById('email-attending-btn'),
  });
});

document.getElementById('email-waitlist-btn').addEventListener('click', () => {
  composeGuestEmail({
    recipientMode: 'waitlist',
    subject: `You're on the waitlist — ${lastData.event.name}`,
    intro: `Hi! ${lastData.event.name} is full at the moment and you're on the waitlist. We'll be in touch the moment a spot opens up:`,
    button: document.getElementById('email-waitlist-btn'),
  });
});

document.getElementById('email-all-btn').addEventListener('click', () => {
  composeGuestEmail({
    recipientMode: 'all_rsvps',
    subject: `A note about ${lastData.event.name}`,
    intro: `Hi! Here’s a quick note about ${lastData.event.name}, along with the invitation and event details:`,
    button: document.getElementById('email-all-btn'),
  });
});

async function loadTemplates() {
  const grid = document.getElementById('template-grid');
  try {
    const res = await fetch('/api/templates');
    allTemplates = await res.json();
    const count = document.getElementById('template-count');
    if (count) count.textContent = `${allTemplates.length} looks`;
    renderTemplateGrid();
  } catch (err) {
    grid.innerHTML = '<div class="empty-note">Couldn\'t load templates.</div>';
  }
}

function templateCategory(template) {
  if (template.category) return template.category;
  const id = `${template.id} ${template.label}`.toLowerCase();
  if (/(corporate|citrus|holiday|new year)/.test(id)) return 'statement';
  if (/(housewarming|baby|sunlit|celebration)/.test(id)) return 'gathering';
  return 'celebration';
}

function renderTemplateGrid() {
  const grid = document.getElementById('template-grid');
  const query = (document.getElementById('template-search')?.value || '').trim().toLowerCase();
  const templates = allTemplates.filter((template) => {
    const matchesFilter = activeTemplateFilter === 'all' || templateCategory(template) === activeTemplateFilter;
    const matchesSearch = !query || `${template.label} ${template.id}`.toLowerCase().includes(query);
    return matchesFilter && matchesSearch;
  });
  if (!templates.length) {
    grid.innerHTML = '<div class="empty-note">No looks match that search yet.</div>';
    return;
  }
  grid.innerHTML = templates
      .map(
        (t) => `
        <button type="button" class="template-thumb" data-id="${escapeHtml(t.id)}" title="${escapeHtml(t.label)} · Public domain artwork" data-category="${templateCategory(t)}">
          <img src="${escapeHtml(t.previewUrl)}" alt="${escapeHtml(t.label)}" />
          <span>${escapeHtml(t.label)}</span>
        </button>`
      )
      .join('');

    grid.querySelectorAll('.template-thumb').forEach((btn) => {
      btn.addEventListener('click', async () => {
        selectedTemplate = templates.find((template) => template.id === btn.dataset.id);
        setStudioStage('personalize');
        const errorBox = document.getElementById('image-error');
        errorBox.style.display = 'none';
        grid.querySelectorAll('.template-thumb').forEach((item) => item.classList.toggle('selected', item === btn));
        const sourceNote = document.getElementById('template-source-note');
        if (sourceNote && selectedTemplate.sourceUrl) {
          sourceNote.innerHTML = `Artwork: <a href="${escapeHtml(selectedTemplate.sourceUrl)}" target="_blank" rel="noopener">${escapeHtml(selectedTemplate.sourceName || 'FreeSVG.org · Public Domain')}</a>.`;
        }
        showEditorPanel(false);
        setEditorBusy(true);
        setEditorStatus('loading', 'Loading this look…');
        selectedTint = 'warm';
        document.querySelectorAll('.tint-btn').forEach((item) => item.classList.toggle('selected', item.dataset.tint === selectedTint));
        try {
          await loadEditorBackground(selectedTemplate.previewUrl, { resetLayers: true });
          showEditorPanel(true);
        } catch {
          setStudioStage('choose');
          errorBox.textContent = 'Could not load this background.';
          errorBox.style.display = 'block';
          return;
        }
        document.getElementById('template-customizer').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    });
}

async function useOriginalTemplate() {
  const errorBox = document.getElementById('image-error');
  if (!selectedTemplate) return;
  errorBox.style.display = 'none';
  try {
    const res = await fetch(`/api/events/${EVENT_ID}/template`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templateId: selectedTemplate.id }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not set template.');
    await loadDashboard();
    setStudioStage('share', { scroll: true });
  } catch (err) {
    errorBox.textContent = err.message;
    errorBox.style.display = 'block';
  }
}

async function saveCustomizedTemplate() {
  const errorBox = document.getElementById('image-error');
  if (!editorState.backgroundImage) return;
  errorBox.style.display = 'none';
  setEditorBusy(true);
  setEditorStatus('saving', 'Saving your invitation…');
  try {
    const canvas = document.getElementById('image-editor-canvas');
    const selectedId = editorState.selectedId;
    editorState.selectedId = null;
    drawEditor();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', .9));
    editorState.selectedId = selectedId;
    drawEditor();
    if (!blob) throw new Error('Could not render this invitation.');
    const fileName = selectedTemplate?.id || 'custom-invitation';
    const formData = new FormData(); formData.append('image', blob, `${fileName}-${selectedTint}.jpg`);
    const res = await fetch(`/api/events/${EVENT_ID}/image`, { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not save this variation.');
    editorState.layers = [];
    editorState.selectedId = null;
    await loadDashboard();
    setStudioStage('share', { scroll: true });
  } catch (err) {
    errorBox.textContent = err.message;
    errorBox.style.display = 'block';
    setEditorBusy(false);
    setEditorStatus('error', 'Save failed — try again');
  }
}

document.getElementById('image-upload').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const errorBox = document.getElementById('image-error');
  errorBox.style.display = 'none';
  showEditorPanel(false);
  setEditorBusy(true);
  setEditorStatus('loading', 'Uploading your artwork…');

  const formData = new FormData();
  formData.append('image', file);

  try {
    const res = await fetch(`/api/events/${EVENT_ID}/image`, { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed.');
    selectedTemplate = null;
    selectedTint = 'warm';
    setStudioStage('personalize');
    document.querySelectorAll('.template-thumb').forEach((item) => item.classList.remove('selected'));
    document.querySelectorAll('.tint-btn').forEach((item) => item.classList.toggle('selected', item.dataset.tint === selectedTint));
    const localUrl = URL.createObjectURL(file);
    await loadEditorBackground(localUrl, { resetLayers: true });
    showEditorPanel(true);
    document.getElementById('template-customizer').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    setTimeout(() => URL.revokeObjectURL(localUrl), 30000);
  } catch (err) {
    setStudioStage('choose');
    errorBox.textContent = err.message;
    errorBox.style.display = 'block';
    setEditorBusy(false);
    setEditorStatus('error', 'Upload failed — try again');
  } finally {
    e.target.value = '';
  }
});

Object.entries(layerControlIds).forEach(([layerId, inputId]) => {
  document.getElementById(inputId).addEventListener('input', (event) => {
    const layer = editorState.layers.find((item) => item.id === layerId);
    if (!layer) return;
    layer.text = event.target.value;
    editorState.selectedId = layerId;
    drawEditor();
  });
});

document.querySelectorAll('[data-layer-toggle]').forEach((toggle) => {
  toggle.addEventListener('change', () => {
    const layer = editorState.layers.find((item) => item.id === toggle.dataset.layerToggle);
    if (!layer) return;
    layer.visible = toggle.checked;
    if (layer.visible) editorState.selectedId = layer.id;
    drawEditor();
  });
});

document.getElementById('layer-style').addEventListener('change', (event) => {
  const preset = event.target.value;
  editorState.layers.forEach((layer) => {
    if (preset === 'modern') {
      layer.family = 'DM Sans';
      layer.weight = layer.id === 'title' ? 700 : 600;
    } else if (preset === 'playful') {
      layer.family = 'Fraunces';
      layer.weight = 700;
    } else {
      layer.family = layer.id === 'title' ? 'Fraunces' : 'DM Sans';
      layer.weight = layer.id === 'title' ? 700 : 600;
    }
  });
  drawEditor();
});

document.getElementById('layer-color').addEventListener('input', (event) => {
  editorState.layers.forEach((layer) => {
    layer.color = event.target.value;
  });
  drawEditor();
});

document.getElementById('reset-layers').addEventListener('click', resetEditorLayers);

const editorCanvas = document.getElementById('image-editor-canvas');

function canvasPoint(event) {
  const rect = editorCanvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (EDITOR_WIDTH / rect.width),
    y: (event.clientY - rect.top) * (EDITOR_HEIGHT / rect.height),
  };
}

editorCanvas.addEventListener('pointerdown', (event) => {
  if (!editorState.backgroundImage) return;
  const point = canvasPoint(event);
  const ctx = editorCanvas.getContext('2d');
  const layer = [...editorState.layers].reverse().find((item) => {
    if (!item.visible || !item.text.trim()) return false;
    const bounds = layerBounds(ctx, item);
    return point.x >= bounds.left && point.x <= bounds.left + bounds.width &&
      point.y >= bounds.top && point.y <= bounds.top + bounds.height;
  });
  editorState.selectedId = layer?.id || null;
  if (layer) {
    editorState.dragging = { id: layer.id, offsetX: point.x - layer.x, offsetY: point.y - layer.y };
    editorCanvas.setPointerCapture(event.pointerId);
    editorCanvas.style.cursor = 'grabbing';
  }
  drawEditor();
});

editorCanvas.addEventListener('pointermove', (event) => {
  if (!editorState.dragging) return;
  const point = canvasPoint(event);
  const layer = editorState.layers.find((item) => item.id === editorState.dragging.id);
  if (!layer) return;
  layer.x = Math.max(55, Math.min(EDITOR_WIDTH - 55, point.x - editorState.dragging.offsetX));
  layer.y = Math.max(35, Math.min(EDITOR_HEIGHT - 35, point.y - editorState.dragging.offsetY));
  drawEditor();
});

function stopDragging() {
  editorState.dragging = null;
  editorCanvas.style.cursor = 'grab';
}

editorCanvas.addEventListener('pointerup', stopDragging);
editorCanvas.addEventListener('pointercancel', stopDragging);

document.querySelectorAll('.tint-btn').forEach((button) => {
  button.addEventListener('click', () => {
    selectedTint = button.dataset.tint;
    document.querySelectorAll('.tint-btn').forEach((item) => item.classList.toggle('selected', item === button));
    drawEditor();
  });
});
document.querySelectorAll('.filter-chip').forEach((button) => {
  button.addEventListener('click', () => {
    activeTemplateFilter = button.dataset.filter;
    document.querySelectorAll('.filter-chip').forEach((item) => item.classList.toggle('active', item === button));
    renderTemplateGrid();
  });
});
document.getElementById('template-search').addEventListener('input', renderTemplateGrid);
document.getElementById('use-original-template').addEventListener('click', useOriginalTemplate);
document.getElementById('save-custom-template').addEventListener('click', saveCustomizedTemplate);

async function copyInvitationLink(button) {
  const input = document.getElementById('share-link');
  if (!input.value) return;
  try {
    await navigator.clipboard.writeText(input.value);
    const original = button.textContent;
    button.textContent = 'Copied!';
    setTimeout(() => (button.textContent = original), 1500);
  } catch (err) {
    input.select();
  }
}

document.getElementById('share-copy-btn').addEventListener('click', (event) => copyInvitationLink(event.currentTarget));

document.getElementById('edit-event-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorBox = document.getElementById('edit-error');
  errorBox.style.display = 'none';
  const dateValue = document.getElementById('edit-date').value;
  if (!dateValue || new Date(dateValue).getTime() <= Date.now()) {
    errorBox.textContent = 'Choose a date and time in the future.';
    errorBox.style.display = 'block';
    document.getElementById('edit-date').focus();
    return;
  }

  const capacityValue = document.getElementById('edit-capacity').value.trim();
  const payload = {
    name: document.getElementById('edit-name').value,
    date: dateValue,
    location: document.getElementById('edit-location').value,
    description: document.getElementById('edit-description').value,
    // Empty means unlimited; the server reads '' as "clear the cap".
    capacity: capacityValue,
  };

  try {
    const res = await fetch(`/api/events/${EVENT_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not save changes.');
    if (data.promoted) {
      setEmailStatus(
        `Saved. ${data.promoted} ${data.promoted === 1 ? 'guest was' : 'guests were'} moved off the waitlist and emailed.`
      );
    }
    loadDashboard();
  } catch (err) {
    errorBox.textContent = err.message;
    errorBox.style.display = 'block';
  }
});

document.getElementById('notify-guests-btn').addEventListener('click', () => {
  if (!lastData) return;
  composeGuestEmail({
    recipientMode: 'all_rsvps',
    subject: `Updated details — ${lastData.event.name}`,
    intro: `Hi! The details for ${lastData.event.name} have been updated. Please use this invitation for the latest information:`,
    button: document.getElementById('notify-guests-btn'),
  });
});

async function loadInvites() {
  const body = document.getElementById('invite-table-body');
  const empty = document.getElementById('invite-empty');
  try {
    const res = await fetch(`/api/events/${EVENT_ID}/invites`);
    const invites = await res.json();
    currentInvites = Array.isArray(invites) ? invites : [];
    if (!invites.length) {
      body.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';
    body.innerHTML = invites
      .map(
        (i) => `
        <tr>
          <td>${escapeHtml(i.email)}</td>
          <td><span class="pill ${i.responded ? 'badge yes' : 'badge no'}">${i.responded ? '✅ Responded' : '⏳ Pending'}</span></td>
          <td><button type="button" class="btn btn-ghost btn-small remove-invite-btn" data-email="${escapeHtml(i.email)}">Remove</button></td>
        </tr>`
      )
      .join('');

    body.querySelectorAll('.remove-invite-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await fetch(`/api/events/${EVENT_ID}/invites/${encodeURIComponent(btn.dataset.email)}`, {
          method: 'DELETE',
        });
        loadInvites();
      });
    });
  } catch (err) {
    body.innerHTML = '';
    empty.textContent = "Couldn't load the guest list.";
    empty.style.display = 'block';
  }
}

document.getElementById('email-invites-btn').addEventListener('click', () => {
  if (!lastData) return;
  composeGuestEmail({
    recipientMode: 'restricted',
    subject: `You're invited — ${lastData.event.name}`,
    intro: `Hi! You’re invited to ${lastData.event.name}. We’d love to have you there — please RSVP on the event page:`,
    button: document.getElementById('email-invites-btn'),
  });
});

document.querySelectorAll('input[name="invite-mode"]').forEach((radio) => {
  radio.addEventListener('change', async () => {
    document.getElementById('invite-list-section').style.display =
      radio.value === 'restricted' && radio.checked ? 'block' : 'none';
    try {
      await fetch(`/api/events/${EVENT_ID}/invite-mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: radio.value }),
      });
      if (radio.value === 'restricted') loadInvites();
    } catch (err) {
      // Non-fatal — the toggle stays visually selected; a refresh will show the real state.
    }
  });
});

document.getElementById('add-invites-btn').addEventListener('click', async () => {
  const textarea = document.getElementById('invite-emails');
  const errorBox = document.getElementById('invite-error');
  errorBox.style.display = 'none';

  const emails = textarea.value
    .split(/[,\n;]+/)
    .map((e) => e.trim())
    .filter(Boolean);

  if (!emails.length) return;

  try {
    const res = await fetch(`/api/events/${EVENT_ID}/invites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emails }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not add emails.');
    textarea.value = '';
    loadInvites();
  } catch (err) {
    errorBox.textContent = err.message;
    errorBox.style.display = 'block';
  }
});

// --- FAQ editor ---
//
// The whole list is saved as a block rather than row by row: the host is
// writing a short Q&A set, and a Save button matching the rest of the studio
// beats an autosave-per-keystroke design here.

function faqRow(question = '', answer = '') {
  const row = document.createElement('div');
  row.className = 'faq-editor-row';
  row.innerHTML = `
    <input type="text" class="faq-q" maxlength="200" placeholder="Is there parking?" />
    <textarea class="faq-a" maxlength="1000" placeholder="Yes — free street parking right outside."></textarea>
    <button type="button" class="btn btn-ghost btn-small faq-remove" aria-label="Remove this question">Remove</button>`;
  row.querySelector('.faq-q').value = question;
  row.querySelector('.faq-a').value = answer;
  row.querySelector('.faq-remove').addEventListener('click', () => {
    row.remove();
    ensureBlankFaqRow();
  });
  return row;
}

// Always leaves one empty pair at the bottom so there's somewhere to type
// without hunting for an "add" button first.
function ensureBlankFaqRow() {
  const list = document.getElementById('faq-editor-list');
  if (!list) return;
  const rows = [...list.querySelectorAll('.faq-editor-row')];
  const lastRow = rows[rows.length - 1];
  const lastIsBlank =
    lastRow &&
    !lastRow.querySelector('.faq-q').value.trim() &&
    !lastRow.querySelector('.faq-a').value.trim();
  if (!lastIsBlank) list.appendChild(faqRow());
}

async function loadFaqs() {
  const list = document.getElementById('faq-editor-list');
  if (!list) return;
  try {
    const res = await fetch(`/api/events/${EVENT_ID}/faqs`);
    if (!res.ok) throw new Error('could not load');
    const faqs = await res.json();
    list.innerHTML = '';
    faqs.forEach((f) => list.appendChild(faqRow(f.question, f.answer)));
    ensureBlankFaqRow();
  } catch (err) {
    list.innerHTML = '';
    ensureBlankFaqRow();
  }
}

async function saveFaqs(button) {
  const list = document.getElementById('faq-editor-list');
  const statusEl = document.getElementById('faq-status');
  const faqs = [...list.querySelectorAll('.faq-editor-row')].map((row) => ({
    question: row.querySelector('.faq-q').value,
    answer: row.querySelector('.faq-a').value,
  }));

  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Saving…';
  try {
    const res = await fetch(`/api/events/${EVENT_ID}/faqs`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ faqs }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not save the FAQ.');
    statusEl.textContent = data.count
      ? `Saved — ${data.count} ${data.count === 1 ? 'question' : 'questions'} on the guest page.`
      : 'Saved — no questions, so the section stays hidden from guests.';
    statusEl.className = 'faq-status success';
    loadFaqs();
  } catch (err) {
    statusEl.textContent = err.message;
    statusEl.className = 'faq-status error';
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

document.getElementById('add-faq-btn').addEventListener('click', () => {
  document.getElementById('faq-editor-list').appendChild(faqRow());
});

document.getElementById('save-faq-btn').addEventListener('click', (e) => saveFaqs(e.currentTarget));

document.getElementById('logout-btn').addEventListener('click', async () => {
  await fetch('/auth/logout', { method: 'POST' });
  window.location.href = '/';
});

loadDashboard();
loadTemplates();
loadFaqs();
