// /host/:eventId[/:tab] — the ID is always the second segment. (Taking the last
// segment would read "guests" as the event ID once tabs have their own URLs.)
const EVENT_ID = window.location.pathname.split('/').filter(Boolean)[1];
const TAB_KEYS = ['overview', 'design', 'guests', 'share', 'settings'];

function tabFromPath() {
  const segment = window.location.pathname.split('/').filter(Boolean)[2];
  return TAB_KEYS.includes(segment) ? segment : 'overview';
}

function tabUrl(tab) {
  return tab === 'overview' ? `/host/${EVENT_ID}` : `/host/${EVENT_ID}/${tab}`;
}

// Tabs switch in place, but every tab has a real URL: pushState keeps the
// address bar honest, so back/forward, reload and bookmarks all land on the
// same tab.
function showTab(tab, { push = false } = {}) {
  const target = TAB_KEYS.includes(tab) ? tab : 'overview';
  document.querySelectorAll('[data-tab-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.tabPanel !== target;
  });
  document.querySelectorAll('.workspace-tab[data-tab]').forEach((link) => {
    const active = link.dataset.tab === target;
    link.classList.toggle('is-active', active);
    if (active) {
      link.setAttribute('aria-current', 'page');
      // On a phone the tab strip scrolls sideways; bring the current tab into
      // view so it's clear where you are. Setting scrollLeft (rather than
      // scrollIntoView) never moves the page itself.
      const strip = link.parentElement;
      if (strip && strip.scrollWidth > strip.clientWidth) {
        const offset = link.getBoundingClientRect().left - strip.getBoundingClientRect().left;
        strip.scrollLeft += offset - (strip.clientWidth - link.offsetWidth) / 2;
      }
    } else {
      link.removeAttribute('aria-current');
    }
  });
  if (push && window.location.pathname !== tabUrl(target)) {
    window.history.pushState({ tab: target }, '', tabUrl(target));
  }
  // The invitation canvas measures itself; it needs a redraw once visible.
  if (target === 'design' && typeof drawEditor === 'function' && editorState.backgroundImage) drawEditor();
}

document.addEventListener('click', (e) => {
  const tabLink = e.target.closest('.workspace-tab[data-tab], [data-goto]');
  if (!tabLink) return;
  // Let modified clicks (new tab, new window) behave like normal links.
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
  e.preventDefault();
  showTab(tabLink.dataset.tab || tabLink.dataset.goto, { push: true });
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

window.addEventListener('popstate', () => showTab(tabFromPath()));

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
  const isLive = Boolean(lastData?.event?.published_at);
  if (shareBadge) {
    shareBadge.textContent = hasSavedInvitation ? 'Saved' : 'Not saved yet';
    shareBadge.classList.toggle('is-ready', hasSavedInvitation);
  }
  if (shareNote) {
    shareNote.textContent = !hasSavedInvitation
      ? 'Choose a look and save your invitation to carry on.'
      : isLive
        ? 'Your invitation is live. Changes you save here show up for guests straight away.'
        : 'Saved. The event page is still a private draft — publish it when you are ready.';
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
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
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

// --- Overview, setup and status ---

function renderStatus(data) {
  const live = Boolean(data.event.published_at);
  const pill = document.getElementById('event-status-pill');
  if (pill) {
    pill.textContent = live ? 'Live' : 'Draft';
    pill.className = `status-pill ${live ? 'is-live' : 'is-draft'}`;
  }

  // Publish card on the overview.
  document.getElementById('publish-title').textContent = live ? 'Live' : 'Draft';
  document.getElementById('publish-copy').textContent = live
    ? 'Anyone with the link can open your event page and reply. You can keep editing — changes show up straight away.'
    : data.publishBlocker
      ? `Only you can see this draft. ${data.publishBlocker}`
      : 'Only you can see this event page. Publish it when it looks right — you can keep editing afterwards.';
  // The status card explains what draft means; the buttons that act on it are
  // the header (always there) and the next-step card (the guided path), so it
  // doesn't repeat a third Publish of its own.

  // The same control in the workspace header, so publishing is one click away
  // from whichever tab the host is on — not hidden inside a tab.
  const headerPublish = document.getElementById('header-publish-btn');
  const headerCopy = document.getElementById('copy-link-btn');
  const headerPreview = document.getElementById('header-preview-link');
  if (headerPublish) {
    headerPublish.hidden = live;
    headerPublish.disabled = Boolean(data.publishBlocker);
    headerPublish.title = data.publishBlocker || '';
  }
  if (headerCopy) headerCopy.hidden = !live;
  if (headerPreview) headerPreview.textContent = live ? 'View guest page ↗' : 'Preview ↗';

  document.getElementById('share-draft-notice').hidden = live;
  document.getElementById('unpublish-row').hidden = !live;
}

function renderSetup(data) {
  const { setup } = data;
  const live = Boolean(data.event.published_at);

  // The banner follows the host across tabs while the event is still a draft.
  const banner = document.getElementById('setup-banner');
  banner.hidden = live || !setup.next;
  if (!banner.hidden) {
    document.getElementById('setup-banner-title').textContent = `Setup · ${setup.done} of ${setup.total} done`;
    document.getElementById('setup-banner-next').textContent = `Next: ${setup.next.label}`;
    document.getElementById('setup-banner-bar').style.width = `${Math.round((setup.done / setup.total) * 100)}%`;
    const btn = document.getElementById('setup-banner-btn');
    btn.href = setup.next.href;
    btn.dataset.goto = tabOf(setup.next.href);
  }

  document.getElementById('setup-count').textContent = `${setup.done} of ${setup.total}`;
  document.getElementById('setup-checklist').innerHTML = setup.steps
    .map(
      (s) => `
      <li class="${s.done ? 'is-done' : setup.next && s.id === setup.next.id ? 'is-next' : ''}">
        <span class="check" aria-hidden="true">${s.done ? '✓' : ''}</span>
        <span class="check-copy"><strong>${escapeHtml(s.label)}</strong><small>${escapeHtml(s.hint)}</small></span>
        ${s.done ? '<span class="check-state">Done</span>' : `<a class="btn btn-ghost btn-small" href="${escapeHtml(s.href)}" data-goto="${tabOf(s.href)}">${s.id === 'publish' ? 'Review' : 'Go'}</a>`}
      </li>`
    )
    .join('');

  // The single most useful next thing, big and obvious.
  const next = document.getElementById('overview-next');
  if (!setup.next) {
    next.innerHTML = `
      <span class="section-kicker">All set</span>
      <h2>Your event page is live.</h2>
      <p>${data.totals.attendingCount} ${data.totals.attendingCount === 1 ? 'guest is' : 'guests are'} coming. Keep sharing, or open the door scanner on the day.</p>
      <div class="next-actions"><a class="btn btn-primary" href="${tabUrl('guests')}" data-goto="guests">See guests</a><a class="btn btn-ghost" href="/host/${EVENT_ID}/checkin">Door check-in</a></div>`;
  } else if (setup.next.id === 'publish') {
    next.innerHTML = `
      <span class="section-kicker">Next step</span>
      <h2>Ready to go live?</h2>
      <p>${escapeHtml(data.publishBlocker || 'Everything essential is in place. Publishing makes the link work for guests — you can keep editing afterwards.')}</p>
      <div class="next-actions"><button class="btn btn-primary" type="button" data-publish ${data.publishBlocker ? 'disabled' : ''}>Publish event</button><a class="btn btn-ghost" href="${escapeHtml(data.event.shareUrl)}" target="_blank" rel="noopener">Preview first ↗</a></div>`;
  } else {
    next.innerHTML = `
      <span class="section-kicker">Next step</span>
      <h2>${escapeHtml(setup.next.label)}</h2>
      <p>${escapeHtml(setup.next.hint)}</p>
      <div class="next-actions"><a class="btn btn-primary" href="${escapeHtml(setup.next.href)}" data-goto="${tabOf(setup.next.href)}">${
        setup.next.id === 'share' ? 'Share it' : 'Continue'
      } →</a></div>`;
  }

  // Where the design tab's last step points.
  const designNext = document.getElementById('design-next-link');
  const after = setup.steps.find((s) => !s.done && s.id !== 'look');
  designNext.href = after ? after.href : tabUrl('share');
  designNext.dataset.goto = tabOf(designNext.href);
  designNext.textContent = after ? `Next: ${after.label} →` : 'Share it →';
}

function tabOf(href) {
  const segment = String(href).split('/').filter(Boolean)[2];
  return TAB_KEYS.includes(segment) ? segment : 'overview';
}

function renderOverviewStats(data) {
  const t = data.totals;
  const tiles = [
    { num: t.attendingCount, label: 'Coming' },
    { num: t.adults + t.kids, label: 'Heads' },
    t.waitlistCount ? { num: t.waitlistCount, label: 'Waitlist' } : null,
    { num: t.declinedCount, label: 'Declined' },
  ].filter(Boolean);
  document.getElementById('overview-stats').innerHTML = tiles
    .map((x) => `<div class="stat-tile"><div class="num">${x.num}</div><div class="label">${x.label}</div></div>`)
    .join('');
}

function renderShareTab(data) {
  const url = data.event.shareUrl;
  const when = data.event.event_date
    ? new Date(data.event.event_date).toLocaleString(undefined, { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : '';
  const message = `You're invited: ${data.event.name}${when ? ` — ${when}` : ''}. RSVP here: ${url}`;

  document.getElementById('share-url-display').value = url;
  document.getElementById('whatsapp-share-btn').href = `https://wa.me/?text=${encodeURIComponent(message)}`;
  document.getElementById('email-share-btn').href =
    `mailto:?subject=${encodeURIComponent(`You're invited: ${data.event.name}`)}&body=${encodeURIComponent(message)}`;
  document.getElementById('poster-link').href = `/host/${EVENT_ID}/poster`;
  document.getElementById('calendar-link').href = `/api/events/${encodeURIComponent(data.event.slug)}/calendar.ics`;

  const native = document.getElementById('native-share-btn');
  native.hidden = !navigator.share;
  native.onclick = () => navigator.share({ title: data.event.name, text: `You're invited: ${data.event.name}`, url }).catch(() => {});
}

async function setPublished(published) {
  const errorBox = document.getElementById('publish-error');
  errorBox.style.display = 'none';
  try {
    const res = await fetch(`/api/events/${EVENT_ID}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ published }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not change the status.');
    await loadDashboard();
    if (published) {
      window.RSVPfor?.toast('Published — your event page is live and ready to share.', {
        action: {
          label: 'Copy link',
          onClick: (btn) => {
            navigator.clipboard
              .writeText(lastData.event.shareUrl)
              .then(() => {
                btn.textContent = 'Copied!';
              })
              .catch(() => window.prompt('Copy this link:', lastData.event.shareUrl));
          },
        },
      });
      // Straight from publishing to sharing is the natural next move.
      showTab('share', { push: true });
    } else {
      window.RSVPfor?.toast('Back to draft — only you can see it now.', { kind: 'info' });
    }
  } catch (err) {
    errorBox.textContent = err.message;
    errorBox.style.display = 'block';
    const manage = document.getElementById('manage-error');
    manage.textContent = err.message;
    manage.style.display = 'block';
  }
}

function render(data) {
  document.getElementById('event-title').textContent = data.event.name;
  document.getElementById('dashboard').style.display = 'block';
  document.getElementById('share-link').value = data.event.shareUrl;
  renderStatus(data);
  renderSetup(data);
  renderOverviewStats(data);
  renderShareTab(data);
  renderRsvpQuestionsCard(data);
  renderGuestTableHead(data);
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

  document.getElementById('export-csv-btn').href = `/api/events/${EVENT_ID}/guests.csv`;
  renderDiscovery(data.event);
  renderEmbedSnippet(data.event);
  loadAnalytics();

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

  const questions = data.rsvpForm ? data.rsvpForm.questions : [];
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
        ${questions.map((q) => `<td>${escapeHtml(answerText(r.form_answers?.[q.id]))}</td>`).join('')}
        <td>${formatWhen(r.created_at)}</td>
      </tr>`;
    })
    .join('');
}

function answerText(value) {
  if (value === undefined || value === null || value === '') return '';
  if (Array.isArray(value)) return value.join(', ');
  if (value === 'yes') return 'Yes';
  if (value === 'no') return 'No';
  return String(value);
}

// The host's RSVP questions become extra guest-list columns, between the
// message and the reply time.
function renderGuestTableHead(data) {
  const questions = data.rsvpForm ? data.rsvpForm.questions : [];
  document.getElementById('guest-table-head').innerHTML = `<tr><th>Name</th><th>Email</th><th>Status</th><th>Adults</th><th>Kids</th><th>Message</th>${questions
    .map((q) => `<th>${escapeHtml(q.label)}</th>`)
    .join('')}<th>Replied</th></tr>`;
}

function renderRsvpQuestionsCard(data) {
  const summary = document.getElementById('rsvp-questions-summary');
  const actions = document.getElementById('rsvp-questions-actions');
  const rf = data.rsvpForm;

  // The same thing, surfaced on the Overview where hosts actually look — the
  // Settings card alone was too far down to find.
  const overviewTitle = document.getElementById('overview-questions-title');
  const overviewCopy = document.getElementById('overview-questions-copy');
  const overviewLink = document.getElementById('overview-questions-link');
  if (overviewTitle && overviewCopy && overviewLink) {
    const count = rf ? rf.questions.length : 0;
    overviewTitle.textContent = count ? `${count} extra ${count === 1 ? 'question' : 'questions'}` : 'Ask guests more';
    overviewCopy.textContent = count
      ? 'Asked on your RSVP form, of guests who are coming. Answers appear in your guest list.'
      : 'Dietary needs, plus-one names, anything else — asked on your RSVP form.';
    overviewLink.textContent = count ? 'Edit questions' : 'Add questions';
    overviewLink.href = rf ? `/forms/${encodeURIComponent(rf.id)}` : `/forms/new?event=${encodeURIComponent(EVENT_ID)}`;
  }
  if (!rf) {
    summary.innerHTML = '<p class="rsvp-questions-empty">No extra questions yet — guests just give their name, email and headcount.</p>';
    actions.innerHTML = `<a class="btn btn-primary btn-small" href="/forms/new?event=${encodeURIComponent(EVENT_ID)}">Add RSVP questions</a>`;
    return;
  }
  summary.innerHTML = rf.questions.length
    ? `<ol class="rsvp-questions-list">${rf.questions.map((q) => `<li>${escapeHtml(q.label)}${q.required ? ' <span class="fq-req">*</span>' : ''}</li>`).join('')}</ol>`
    : '<p class="rsvp-questions-empty">The question set is empty — add a question to start asking.</p>';
  actions.innerHTML = `<a class="btn btn-primary btn-small" href="/forms/${encodeURIComponent(rf.id)}">Edit questions</a><a class="btn btn-ghost btn-small" href="/forms/${encodeURIComponent(rf.id)}/responses">See answers</a>`;
}

// Waitlisted guests said yes but haven't got a spot — the host needs to see
// that distinction at a glance, not a bare "Yes".
function guestBadge(rsvp) {
  const status = rsvp.status || (rsvp.attending ? 'confirmed' : 'declined');
  if (status === 'waitlist') {
    return { cls: 'waiting', label: 'Waitlist', saidYes: true, rowClass: 'is-waitlisted' };
  }
  if (status === 'confirmed') {
    // Once someone's through the door that's the more useful fact about them.
    if (rsvp.checked_in_at) {
      return { cls: 'arrived', label: 'Arrived', saidYes: true, rowClass: 'is-arrived' };
    }
    return { cls: 'yes', label: 'Coming', saidYes: true, rowClass: '' };
  }
  return { cls: 'no', label: 'No', saidYes: false, rowClass: '' };
}

// --- Discovery: visibility and category ---

let categoriesLoaded = false;

async function loadCategoryOptions() {
  if (categoriesLoaded) return;
  try {
    const categories = await (await fetch('/api/categories')).json();
    const select = document.getElementById('edit-category');
    const current = select.value;
    select.innerHTML =
      '<option value="">Choose one…</option>' +
      categories.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.label)}</option>`).join('');
    select.value = current;
    categoriesLoaded = true;
  } catch (err) {
    // Leaving the select with just its placeholder is survivable.
  }
}

async function renderDiscovery(event) {
  const visibility = event.visibility || 'unlisted';
  const radio = document.querySelector(`input[name="visibility"][value="${visibility}"]`);
  if (radio) radio.checked = true;
  document.getElementById('category-row').style.display = visibility === 'public' ? 'block' : 'none';

  await loadCategoryOptions();
  document.getElementById('edit-category').value = event.category || '';
  setDiscoveryStatus(
    visibility === 'public'
      ? 'Listed on the browse page for anyone to find.'
      : 'Only people with the link can see this event.'
  );
}

function setDiscoveryStatus(message, type = '') {
  const el = document.getElementById('discovery-status');
  el.textContent = message;
  el.className = `discovery-status ${type}`;
}

// Visibility and category save on change rather than waiting for the details
// form — they're switches, and a switch that needs a separate Save is a trap.
async function saveDiscovery(patch) {
  try {
    const res = await fetch(`/api/events/${EVENT_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: document.getElementById('edit-name').value,
        date: document.getElementById('edit-date').value,
        location: document.getElementById('edit-location').value,
        description: document.getElementById('edit-description').value,
        ...patch,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not save.');
    return true;
  } catch (err) {
    setDiscoveryStatus(err.message, 'error');
    return false;
  }
}

// --- Analytics ---

async function loadAnalytics() {
  try {
    const res = await fetch(`/api/events/${EVENT_ID}/analytics`);
    if (!res.ok) throw new Error('unavailable');
    const a = await res.json();

    const tiles = [
      { num: a.summary.replies, label: 'Replies' },
      a.summary.acceptanceRate !== null ? { num: `${a.summary.acceptanceRate}%`, label: 'Said yes' } : null,
      a.capacity.fillRate !== null ? { num: `${a.capacity.fillRate}%`, label: 'Capacity filled' } : null,
      a.checkIn.rate !== null && a.checkIn.guests ? { num: `${a.checkIn.rate}%`, label: 'Turned up' } : null,
      a.checkIn.guests ? { num: a.checkIn.guests, label: 'Checked in' } : null,
    ].filter(Boolean);

    document.getElementById('analytics-tiles').innerHTML = tiles
      .map((t) => `<div class="stat-tile"><div class="num">${escapeHtml(String(t.num))}</div><div class="label">${escapeHtml(t.label)}</div></div>`)
      .join('');

    renderTrend(a.trend);
  } catch (err) {
    document.getElementById('analytics-tiles').innerHTML =
      '<div class="empty-note">Numbers will appear once guests start replying.</div>';
  }
}

// A plain CSS bar chart — a charting library would be a lot of weight for one
// small graph, and this scales fine to the handful of days an invite runs for.
function renderTrend(trend) {
  const chart = document.getElementById('trend-chart');
  const range = document.getElementById('trend-range');
  if (!trend.length) {
    chart.innerHTML = '<div class="empty-note">No replies yet.</div>';
    range.textContent = '';
    return;
  }

  const peak = Math.max(...trend.map((d) => d.replies), 1);
  range.textContent =
    trend.length === 1
      ? new Date(`${trend[0].day}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      : `${new Date(`${trend[0].day}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${new Date(`${trend[trend.length - 1].day}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;

  chart.innerHTML = trend
    .map((d) => {
      const label = new Date(`${d.day}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      const height = Math.round((d.replies / peak) * 100);
      return `
        <div class="trend-bar" title="${escapeHtml(label)}: ${d.replies} ${d.replies === 1 ? 'reply' : 'replies'}, ${d.confirmed} confirmed">
          <div class="trend-bar-track"><i style="height:${height}%"></i></div>
          <span class="trend-bar-label">${escapeHtml(label)}</span>
        </div>`;
    })
    .join('');
}

// --- Embed ---

function renderEmbedSnippet(event) {
  const origin = window.location.origin;
  const url = `${origin}/embed/${encodeURIComponent(event.slug)}`;
  const snippet = `<iframe src="${url}" title="RSVP to ${event.name}" width="100%" height="520" style="border:0;max-width:460px;" loading="lazy"></iframe>`;
  document.getElementById('embed-snippet').value = snippet;
  document.getElementById('preview-embed-btn').href = url;
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

document.getElementById('copy-link-btn')?.addEventListener('click', async () => {
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
          sourceNote.innerHTML = `Artwork: <a href="${escapeHtml(selectedTemplate.sourceUrl)}" target="_blank" rel="noopener">${escapeHtml(selectedTemplate.sourceName || 'Public domain')}</a>.`;
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
    // A second, smaller copy for link previews: WhatsApp and friends quietly
    // drop preview images much over a few hundred KB.
    const previewBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', .72));
    editorState.selectedId = selectedId;
    drawEditor();
    if (!blob) throw new Error('Could not render this invitation.');
    const fileName = selectedTemplate?.id || 'custom-invitation';
    const formData = new FormData(); formData.append('image', blob, `${fileName}-${selectedTint}.jpg`);
    const res = await fetch(`/api/events/${EVENT_ID}/image`, { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not save this variation.');
    // Must follow the main upload, which clears any older preview copy. A
    // failure here only costs the link preview, so it never blocks the save.
    if (previewBlob) {
      const previewForm = new FormData();
      previewForm.append('image', previewBlob, 'preview.jpg');
      await fetch(`/api/events/${EVENT_ID}/og-image`, { method: 'POST', body: previewForm }).catch(() => {});
    }
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
    // Confirm where the host is looking — the Settings tab — not over on Guests.
    const live = Boolean(lastData?.event?.published_at);
    const saved = live ? 'Saved — your changes are live.' : 'Saved as draft.';
    const status = document.getElementById('details-status');
    status.textContent = data.promoted
      ? `Saved. ${data.promoted} ${data.promoted === 1 ? 'guest was' : 'guests were'} moved off the waitlist and emailed.`
      : saved;
    status.className = 'save-status success';
    const shown = status.textContent;
    setTimeout(() => {
      if (status.textContent === shown) status.textContent = '';
    }, 3000);
    window.RSVPfor?.toast(
      data.promoted
        ? `${saved} ${data.promoted} ${data.promoted === 1 ? 'guest was' : 'guests were'} moved off the waitlist and emailed.`
        : saved
    );
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

document.querySelectorAll('input[name="visibility"]').forEach((radio) => {
  radio.addEventListener('change', async () => {
    if (!radio.checked) return;
    const isPublic = radio.value === 'public';
    document.getElementById('category-row').style.display = isPublic ? 'block' : 'none';
    setDiscoveryStatus('Saving…');
    const ok = await saveDiscovery({ visibility: radio.value });
    if (ok) {
      setDiscoveryStatus(
        isPublic
          ? 'Now listed on the browse page for anyone to find.'
          : 'Back to link-only — removed from the browse page.',
        'success'
      );
    }
  });
});

document.getElementById('edit-category').addEventListener('change', async (e) => {
  setDiscoveryStatus('Saving…');
  const ok = await saveDiscovery({ category: e.target.value });
  if (ok) setDiscoveryStatus(e.target.value ? 'Category saved.' : 'Category cleared.', 'success');
});

document.getElementById('copy-embed-btn').addEventListener('click', async (e) => {
  const button = e.currentTarget;
  const snippet = document.getElementById('embed-snippet').value;
  const original = button.textContent;
  try {
    await navigator.clipboard.writeText(snippet);
    button.textContent = '✅ Copied!';
  } catch (err) {
    // Clipboard access can be refused; selecting the text is the next best thing.
    document.getElementById('embed-snippet').select();
    button.textContent = 'Press ⌘/Ctrl+C';
  }
  setTimeout(() => (button.textContent = original), 2200);
});

// --- Publishing and managing the event ---

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-publish], #publish-btn');
  if (!btn || btn.disabled) return;
  btn.disabled = true;
  setPublished(true).finally(() => {
    btn.disabled = false;
  });
});

document.getElementById('unpublish-btn').addEventListener('click', async () => {
  const guests = lastData?.rsvps?.length || 0;
  const warning = guests
    ? `Unpublish? ${guests} ${guests === 1 ? 'guest has' : 'guests have'} already replied — they'll see "coming soon" if they open the link.`
    : 'Unpublish? Anyone opening the link will see "coming soon" until you publish again.';
  if (!window.confirm(warning)) return;
  await setPublished(false);
});

document.getElementById('duplicate-btn').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  btn.textContent = 'Copying…';
  try {
    const res = await fetch(`/api/events/${EVENT_ID}/duplicate`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not copy this event.');
    // The copy has no date yet, and that's the first thing it needs.
    window.location.href = `/host/${encodeURIComponent(data.id)}/settings`;
  } catch (err) {
    const box = document.getElementById('manage-error');
    box.textContent = err.message;
    box.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Duplicate';
  }
});

document.getElementById('delete-event-btn').addEventListener('click', async () => {
  const name = lastData?.event?.name || 'this event';
  const guests = lastData?.rsvps?.length || 0;
  const typed = window.prompt(
    `This permanently deletes "${name}"${guests ? ` and ${guests} ${guests === 1 ? 'reply' : 'replies'}` : ''}. It can't be undone.\n\nType DELETE to confirm.`
  );
  if (typed !== 'DELETE') return;
  try {
    const res = await fetch(`/api/events/${EVENT_ID}`, { method: 'DELETE' });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not delete the event.');
    window.location.href = '/events';
  } catch (err) {
    const box = document.getElementById('manage-error');
    box.textContent = err.message;
    box.style.display = 'block';
  }
});

document.getElementById('share-tab-copy-btn').addEventListener('click', async (e) => {
  const button = e.currentTarget;
  const input = document.getElementById('share-url-display');
  try {
    await navigator.clipboard.writeText(input.value);
    button.textContent = 'Copied!';
  } catch (err) {
    input.select();
    button.textContent = 'Press ⌘/Ctrl+C';
  }
  setTimeout(() => (button.textContent = 'Copy link'), 1800);
});

// Give "go to tab" links a real address, so opening them in a new tab works.
document.querySelectorAll('[data-goto]').forEach((link) => {
  if (link.tagName === 'A') link.href = tabUrl(link.dataset.goto);
});

showTab(document.querySelector('[data-initial-tab]')?.dataset.initialTab || tabFromPath());
loadDashboard();
loadTemplates();
loadFaqs();

// --- Weather: attaching a town to the event -------------------------------
// The free-text location is for guests ("at Maya's place") and no geocoder can
// resolve it, so the forecast needs a town chosen deliberately. Same picker as
// the create form.
(function placePicker() {
  const root = document.getElementById('place-search');
  if (!root || !window.RSVPfor || !window.RSVPfor.mountPlacePicker) return;
  const error = document.getElementById('place-error');

  async function save(body, message, kind) {
    error.style.display = 'none';
    const res = await fetch(`/api/events/${EVENT_ID}/place`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      error.textContent = data.error || 'That did not save.';
      error.style.display = 'block';
      return;
    }
    window.RSVPfor?.toast(message, { kind });
  }

  fetch(`/api/events/${EVENT_ID}/host`)
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      const ev = data ? data.event || data : null;
      window.RSVPfor.mountPlacePicker(root, {
        initial: ev && ev.place_label ? { label: ev.place_label } : null,
        onPick: (place) => save(place, 'Weather will show on your event page.', 'success'),
        onClear: () => save({ label: null }, 'Weather removed from your event page.', 'info'),
      });
    })
    .catch(() => {});
})();
