// The form builder. Questions are edited as cards (Google Forms style) with a
// live preview beside them, and every change saves itself a moment after the
// host stops typing. Tabs have real URLs, like the event workspace.

const FORM_ID = window.location.pathname.split('/').filter(Boolean)[1];
const PAGE = document.querySelector('[data-form-kind]');
const KIND = PAGE?.dataset.formKind === 'rsvp' ? 'rsvp' : 'standalone';
const TABS = KIND === 'rsvp' ? ['questions', 'responses'] : ['questions', 'responses', 'share', 'settings'];
const Form = window.RSVPforForm;
const $ = (id) => document.getElementById(id);
const esc = Form.escapeHtml;

const TYPES = [
  ['short', 'Short answer'],
  ['paragraph', 'Paragraph'],
  ['choice', 'Multiple choice'],
  ['checkboxes', 'Checkboxes'],
  ['dropdown', 'Dropdown'],
  ['email', 'Email'],
  ['phone', 'Phone number'],
  ['number', 'Number'],
  ['date', 'Date'],
  ['time', 'Time'],
  ['yesno', 'Yes / No'],
  ['rating', 'Rating (1–5)'],
  ['section', 'Section heading'],
];
const OPTION_TYPES = new Set(['choice', 'checkboxes', 'dropdown']);
const ANSWER_HINT = {
  short: 'Short answer text',
  paragraph: 'Long answer text',
  email: 'Email address',
  phone: 'Phone number',
  number: 'A number',
  date: 'Day, month, year',
  time: 'Time of day',
  yesno: 'Yes or No',
  rating: '1 to 5',
};

let form = null;
let fields = [];

// ------------------------------------------------------------------ Tabs

function tabUrl(tab) {
  return tab === 'questions' ? `/forms/${FORM_ID}` : `/forms/${FORM_ID}/${tab}`;
}

function tabFromPath() {
  const seg = window.location.pathname.split('/').filter(Boolean)[2];
  return TABS.includes(seg) ? seg : 'questions';
}

function showTab(tab, { push = false } = {}) {
  const target = TABS.includes(tab) ? tab : 'questions';
  document.querySelectorAll('[data-tab-panel]').forEach((p) => {
    p.hidden = p.dataset.tabPanel !== target || !form;
  });
  document.querySelectorAll('.workspace-tab[data-tab]').forEach((link) => {
    const active = link.dataset.tab === target;
    link.classList.toggle('is-active', active);
    if (active) {
      link.setAttribute('aria-current', 'page');
      const strip = link.parentElement;
      if (strip && strip.scrollWidth > strip.clientWidth) {
        strip.scrollLeft += link.getBoundingClientRect().left - strip.getBoundingClientRect().left - (strip.clientWidth - link.offsetWidth) / 2;
      }
    } else link.removeAttribute('aria-current');
  });
  if (push && window.location.pathname !== tabUrl(target)) window.history.pushState({}, '', tabUrl(target));
  if (target === 'responses' && form) loadResponses();
  if (target === 'share' && form) renderShare();
}

document.addEventListener('click', (e) => {
  const link = e.target.closest('.workspace-tab[data-tab]');
  if (!link || e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
  e.preventDefault();
  showTab(link.dataset.tab, { push: true });
});
window.addEventListener('popstate', () => showTab(tabFromPath()));

// ------------------------------------------------------------------ Saving

const saveState = { timer: null, inFlight: false, again: false, dirty: false };

function setSaveState(text, cls = '') {
  const pill = $('form-status-pill');
  let el = $('save-state');
  if (!el) {
    el = document.createElement('span');
    el.id = 'save-state';
    el.className = 'save-state';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    pill?.parentElement?.appendChild(el);
  }
  el.textContent = text;
  el.className = `save-state ${cls}`;
}

// The server rejects the whole save if any question is incomplete, so check
// first and say which one — rather than silently failing while someone types.
function incompleteReason() {
  for (let i = 0; i < fields.length; i += 1) {
    const f = fields[i];
    if (!f.label.trim()) return `Question ${i + 1} needs a title before it can save.`;
    if (OPTION_TYPES.has(f.type) && !f.options.some((o) => o.trim())) {
      return `"${f.label}" needs at least one option before it can save.`;
    }
  }
  if (!$('form-title-input').value.trim()) return 'Give the form a title before it can save.';
  return null;
}

function scheduleSave() {
  saveState.dirty = true;
  clearTimeout(saveState.timer);
  const reason = incompleteReason();
  if (reason) {
    setSaveState(reason, 'is-warning');
    return;
  }
  setSaveState('Unsaved changes…', 'is-pending');
  saveState.timer = setTimeout(save, 700);
}

async function save() {
  if (saveState.inFlight) {
    saveState.again = true;
    return;
  }
  if (incompleteReason()) return;
  saveState.inFlight = true;
  setSaveState('Saving…', 'is-pending');
  try {
    const res = await fetch(`/api/forms/${FORM_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: $('form-title-input').value,
        description: $('form-description-input').value,
        fields: fields.map((f) => ({ ...f, options: OPTION_TYPES.has(f.type) ? f.options.filter((o) => o.trim()) : undefined })),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not save.');
    form = data;
    saveState.dirty = false;
    setSaveState('All changes saved', 'is-saved');
    const heading = $('form-title-heading');
    if (heading && KIND === 'standalone') heading.textContent = data.title;
  } catch (err) {
    setSaveState(`Not saved — ${err.message}`, 'is-error');
  } finally {
    saveState.inFlight = false;
    if (saveState.again) {
      saveState.again = false;
      save();
    }
  }
}

window.addEventListener('beforeunload', (e) => {
  if (saveState.dirty) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// ------------------------------------------------------------------ Questions editor

function newId() {
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  return `q_${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

function makeField(type = 'short') {
  const f = { id: newId(), type, label: type === 'section' ? 'New section' : 'Untitled question', help: '' };
  if (type !== 'section') f.required = false;
  if (OPTION_TYPES.has(type)) f.options = ['Option 1', 'Option 2'];
  return f;
}

function optionMarker(type, i) {
  if (type === 'choice') return '<span class="q-marker" aria-hidden="true">○</span>';
  if (type === 'checkboxes') return '<span class="q-marker" aria-hidden="true">☐</span>';
  return `<span class="q-marker" aria-hidden="true">${i + 1}.</span>`;
}

function cardHtml(f, i) {
  const typeOptions = TYPES.map(([v, l]) => `<option value="${v}"${v === f.type ? ' selected' : ''}>${l}</option>`).join('');
  const options = OPTION_TYPES.has(f.type)
    ? `<div class="q-options">
        ${f.options
          .map(
            (o, oi) => `<div class="q-option-row">${optionMarker(f.type, oi)}<input type="text" class="q-option" data-opt="${oi}" value="${esc(o)}" maxlength="200" aria-label="Option ${oi + 1}" /><button type="button" class="q-icon-btn" data-action="remove-option" data-opt="${oi}" aria-label="Remove option ${oi + 1}" ${
              f.options.length <= 1 ? 'disabled' : ''
            }>×</button></div>`
          )
          .join('')}
        <button type="button" class="q-add-option" data-action="add-option">+ Add option</button>
      </div>`
    : f.type === 'section'
      ? ''
      : `<div class="q-answer-hint">${esc(ANSWER_HINT[f.type] || '')}</div>`;

  return `
    <article class="q-card${f.type === 'section' ? ' is-section' : ''}" data-index="${i}">
      <div class="q-card-top">
        <label class="sr-only" for="q-label-${i}">Question ${i + 1} title</label>
        <input type="text" id="q-label-${i}" class="q-label" value="${esc(f.label)}" maxlength="300" placeholder="${
          f.type === 'section' ? 'Section title' : 'Question'
        }" />
        <label class="sr-only" for="q-type-${i}">Question ${i + 1} type</label>
        <select id="q-type-${i}" class="q-type">${typeOptions}</select>
      </div>
      <input type="text" class="q-help" value="${esc(f.help || '')}" maxlength="500" placeholder="${
        f.type === 'section' ? 'Description (optional)' : 'Help text (optional)'
      }" aria-label="Question ${i + 1} help text" />
      ${options}
      <div class="q-card-foot">
        <div class="q-tools">
          <button type="button" class="q-icon-btn" data-action="up" aria-label="Move question ${i + 1} up" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" class="q-icon-btn" data-action="down" aria-label="Move question ${i + 1} down" ${i === fields.length - 1 ? 'disabled' : ''}>↓</button>
          <button type="button" class="q-text-btn" data-action="duplicate">Duplicate</button>
          <button type="button" class="q-text-btn is-danger" data-action="delete">Delete</button>
        </div>
        ${
          f.type === 'section'
            ? ''
            : `<label class="q-required"><input type="checkbox" class="q-required-input" ${f.required ? 'checked' : ''} /><span>Required</span></label>`
        }
      </div>
    </article>`;
}

function renderEditor(focus) {
  const list = $('question-list');
  list.innerHTML = fields.length
    ? fields.map(cardHtml).join('')
    : '<div class="empty-state"><strong>No questions yet.</strong><p>Add your first question below.</p></div>';
  renderPreview();
  if (focus) {
    const card = list.querySelector(`[data-index="${focus.index}"]`);
    const target = focus.option !== undefined ? card?.querySelector(`[data-opt="${focus.option}"].q-option`) : card?.querySelector('.q-label');
    if (target) {
      target.focus();
      if (focus.select && target.select) target.select();
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }
}

function renderPreview() {
  $('preview-title').textContent = KIND === 'rsvp' ? 'Extra RSVP questions' : $('form-title-input').value || 'Untitled form';
  $('preview-description').textContent = KIND === 'rsvp' ? '' : $('form-description-input').value;
  const valid = fields.filter((f) => f.label.trim()).map((f) => ({ ...f, options: (f.options || []).filter((o) => o.trim()) }));
  Form.render($('preview-questions'), valid, { prefix: 'pv', disabled: true });
}

// Typing edits state in place without rebuilding the cards, so the cursor
// never jumps; only structural changes rebuild.
$('question-list').addEventListener('input', (e) => {
  const card = e.target.closest('.q-card');
  if (!card) return;
  const f = fields[Number(card.dataset.index)];
  if (e.target.classList.contains('q-label')) f.label = e.target.value;
  else if (e.target.classList.contains('q-help')) f.help = e.target.value;
  else if (e.target.classList.contains('q-option')) f.options[Number(e.target.dataset.opt)] = e.target.value;
  else return;
  renderPreview();
  scheduleSave();
});

$('question-list').addEventListener('change', (e) => {
  const card = e.target.closest('.q-card');
  if (!card) return;
  const i = Number(card.dataset.index);
  const f = fields[i];
  if (e.target.classList.contains('q-type')) {
    const type = e.target.value;
    f.type = type;
    if (OPTION_TYPES.has(type) && !(f.options && f.options.length)) f.options = ['Option 1', 'Option 2'];
    if (!OPTION_TYPES.has(type)) delete f.options;
    if (type === 'section') delete f.required;
    else if (f.required === undefined) f.required = false;
    renderEditor();
    scheduleSave();
  } else if (e.target.classList.contains('q-required-input')) {
    f.required = e.target.checked;
    renderPreview();
    scheduleSave();
  }
});

$('question-list').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const card = btn.closest('.q-card');
  const i = Number(card.dataset.index);
  const f = fields[i];
  switch (btn.dataset.action) {
    case 'up':
      [fields[i - 1], fields[i]] = [fields[i], fields[i - 1]];
      renderEditor({ index: i - 1 });
      break;
    case 'down':
      [fields[i + 1], fields[i]] = [fields[i], fields[i + 1]];
      renderEditor({ index: i + 1 });
      break;
    case 'duplicate':
      fields.splice(i + 1, 0, { ...JSON.parse(JSON.stringify(f)), id: newId() });
      renderEditor({ index: i + 1, select: true });
      break;
    case 'delete':
      if (
        form?.responseCount &&
        !window.confirm("Delete this question? Answers people have already given to it will no longer be shown or included in exports.")
      ) {
        return;
      }
      fields.splice(i, 1);
      renderEditor({ index: Math.min(i, fields.length - 1) });
      break;
    case 'add-option':
      f.options.push(`Option ${f.options.length + 1}`);
      renderEditor({ index: i, option: f.options.length - 1, select: true });
      break;
    case 'remove-option':
      f.options.splice(Number(btn.dataset.opt), 1);
      renderEditor({ index: i });
      break;
    default:
      return;
  }
  scheduleSave();
});

// Enter in an option box adds the next option — the fastest way to type a list.
$('question-list').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || !e.target.classList.contains('q-option')) return;
  e.preventDefault();
  const card = e.target.closest('.q-card');
  const i = Number(card.dataset.index);
  const at = Number(e.target.dataset.opt) + 1;
  fields[i].options.splice(at, 0, '');
  renderEditor({ index: i, option: at });
  scheduleSave();
});

$('add-question-btn').addEventListener('click', () => {
  fields.push(makeField('short'));
  renderEditor({ index: fields.length - 1, select: true });
  scheduleSave();
});
$('add-section-btn').addEventListener('click', () => {
  fields.push(makeField('section'));
  renderEditor({ index: fields.length - 1, select: true });
  scheduleSave();
});
['form-title-input', 'form-description-input'].forEach((id) =>
  $(id).addEventListener('input', () => {
    renderPreview();
    scheduleSave();
  })
);

// ------------------------------------------------------------------ Responses

let responsesData = null;
let responsesView = 'summary';

function answerText(value) {
  if (value === undefined || value === null || value === '') return '';
  if (Array.isArray(value)) return value.join(', ');
  if (value === 'yes') return 'Yes';
  if (value === 'no') return 'No';
  return String(value);
}

function summaryCard(s) {
  let body = '';
  if (s.counts) {
    const total = s.counts.reduce((a, c) => a + c.count, 0) || 1;
    body = `<div class="sum-bars">${s.counts
      .map((c) => {
        const pct = Math.round((c.count / total) * 100);
        const label = s.type === 'yesno' ? (c.option === 'yes' ? 'Yes' : 'No') : c.option;
        return `<div class="sum-bar"><span class="sum-bar-label">${esc(label)}</span><span class="sum-bar-track"><i style="width:${pct}%"></i></span><span class="sum-bar-value">${c.count}</span></div>`;
      })
      .join('')}</div>`;
    if (s.average !== undefined && s.average !== null) body = `<div class="sum-big">${s.average}<small> / 5 average</small></div>${body}`;
  } else if (s.type === 'number') {
    body = s.average === null ? '' : `<div class="sum-big">${s.average}<small> average</small></div><p class="sum-note">Lowest ${s.min} · highest ${s.max}</p>`;
  } else {
    body = s.recent && s.recent.length
      ? `<ul class="sum-recent">${s.recent.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>`
      : '';
  }
  return `<article class="sum-card"><h3>${esc(s.label)}</h3><p class="sum-count">${s.answered} ${s.answered === 1 ? 'answer' : 'answers'}</p>${
    body || '<p class="sum-note">No answers yet.</p>'
  }</article>`;
}

function renderResponses() {
  const d = responsesData;
  const n = d.responses.length;
  $('responses-heading').textContent = `${n} ${n === 1 ? 'response' : 'responses'}`;
  $('responses-subtitle').textContent = KIND === 'rsvp' ? 'Answers guests gave when they RSVPed.' : n ? `Latest ${new Date(d.responses[0].createdAt).toLocaleString()}` : '';
  $('export-responses').href = `/api/forms/${FORM_ID}/responses.csv`;
  $('responses-empty').hidden = n > 0;
  $('responses-empty-hint').textContent =
    KIND === 'rsvp' ? 'Answers appear here as guests RSVP.' : form.status === 'draft' ? 'Publish the form, then share it to start collecting responses.' : 'Share the form to start collecting responses.';
  $('responses-summary').hidden = !n || responsesView !== 'summary';
  $('responses-individual').hidden = !n || responsesView !== 'individual';
  if (!n) return;

  $('responses-summary').innerHTML = d.summary.map(summaryCard).join('');

  const questions = d.form.fields.filter((f) => f.type !== 'section');
  $('responses-thead').innerHTML = `<tr><th>Submitted</th>${KIND === 'rsvp' ? '<th>Guest</th><th>RSVP</th>' : ''}${questions
    .map((q) => `<th>${esc(q.label)}</th>`)
    .join('')}<th></th></tr>`;
  $('responses-tbody').innerHTML = d.responses
    .map(
      (r) => `<tr>
        <td>${esc(new Date(r.createdAt).toLocaleString())}</td>
        ${KIND === 'rsvp' ? `<td>${esc(r.guest ? r.guest.name : '')}<br><small>${esc(r.guest ? r.guest.email : '')}</small></td><td>${esc(r.guest ? r.guest.status : '')}</td>` : ''}
        ${questions.map((q) => `<td>${esc(answerText(r.answers?.[q.id]))}</td>`).join('')}
        <td>${KIND === 'rsvp' ? '' : `<button type="button" class="q-text-btn is-danger" data-delete-response="${esc(r.id)}">Delete</button>`}</td>
      </tr>`
    )
    .join('');
}

async function loadResponses() {
  try {
    const res = await fetch(`/api/forms/${FORM_ID}/responses`);
    if (!res.ok) throw new Error('load failed');
    responsesData = await res.json();
    renderResponses();
  } catch (err) {
    $('responses-summary').innerHTML = '<div class="empty-note">Couldn\'t load responses. Refresh to try again.</div>';
  }
}

$('responses-view').addEventListener('click', (e) => {
  const link = e.target.closest('[data-view]');
  if (!link) return;
  e.preventDefault();
  responsesView = link.dataset.view;
  document.querySelectorAll('#responses-view [data-view]').forEach((a) => {
    const active = a === link;
    a.classList.toggle('is-active', active);
    if (active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  if (responsesData) renderResponses();
});

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-delete-response]');
  if (!btn || !window.confirm('Delete this response? This can’t be undone.')) return;
  const res = await fetch(`/api/forms/${FORM_ID}/responses/${encodeURIComponent(btn.dataset.deleteResponse)}`, { method: 'DELETE' });
  if (res.ok) loadResponses();
});

// ------------------------------------------------------------------ Share & settings

function renderShare() {
  if (KIND !== 'standalone') return;
  const url = form.shareUrl;
  $('form-share-url').value = url;
  $('form-share-draft').hidden = form.status !== 'draft';
  const text = `${form.title} — please fill this in: ${url}`;
  $('form-whatsapp').href = `https://wa.me/?text=${encodeURIComponent(text)}`;
  $('form-email').href = `mailto:?subject=${encodeURIComponent(form.title)}&body=${encodeURIComponent(text)}`;
  let waited = 0;
  (function draw() {
    if (typeof QRCode !== 'undefined' && QRCode.toCanvas) {
      QRCode.toCanvas($('form-qr'), url, { width: 200, margin: 1, color: { dark: '#37243d', light: '#ffffff' } }, () => {
        $('form-qr-download').href = $('form-qr').toDataURL('image/png');
      });
      return;
    }
    waited += 100;
    if (waited < 5000) setTimeout(draw, 100);
  })();
}

function renderStatus() {
  if (KIND !== 'standalone') return;
  const s = form.status;
  const title = { draft: 'Draft', open: 'Open', closed: 'Closed' }[s];
  $('form-status-title').textContent = title;
  $('form-status-copy').textContent =
    s === 'draft'
      ? "Only you can see this form. Publish it when it's ready — you can keep editing afterwards."
      : s === 'open'
        ? 'Anyone with the link can fill it in.'
        : 'The form is published but not taking responses — it was closed, reached its limit, or passed its deadline.';
  $('form-publish-btn').hidden = s !== 'draft';
  $('form-unpublish-btn').hidden = s === 'draft';
  $('form-close-btn').hidden = s === 'draft';
  $('form-close-btn').textContent = form.closedAt ? 'Accept responses again' : 'Stop accepting responses';

  const pill = $('form-status-pill');
  if (pill) {
    pill.textContent = title;
    pill.className = `status-pill ${s === 'open' ? 'is-live' : s === 'closed' ? 'is-past' : 'is-draft'}`;
  }

  const st = form.settings || {};
  $('set-confirmation').value = st.confirmationMessage || '';
  $('set-one-per-email').checked = Boolean(st.onePerEmail);
  const hasEmail = fields.some((f) => f.type === 'email');
  $('set-one-per-email').disabled = !hasEmail;
  $('set-one-per-email-hint').textContent = hasEmail
    ? "Uses the form's email question to spot repeat submissions."
    : 'Add an Email question to use this.';
  $('set-limit').value = st.responseLimit || '';
  $('set-closes').value = st.closesAt ? toLocalInput(st.closesAt) : '';
}

function toLocalInput(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function refreshForm() {
  const res = await fetch(`/api/forms/${FORM_ID}`);
  if (res.ok) {
    form = await res.json();
    renderStatus();
    renderShare();
  }
}

async function post(path, body) {
  const res = await fetch(`/api/forms/${FORM_ID}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

function statusError(message) {
  const box = $('form-status-error');
  box.textContent = message;
  box.style.display = message ? 'block' : 'none';
}

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-form-publish]');
  if (!btn) return;
  statusError('');
  // Publish whatever's on screen, not an older save.
  if (saveState.dirty) await save();
  try {
    btn.disabled = true;
    await post('/publish', { published: true });
    await refreshForm();
    showTab('share', { push: true });
  } catch (err) {
    statusError(err.message);
  } finally {
    btn.disabled = false;
  }
});

$('form-unpublish-btn')?.addEventListener('click', async () => {
  if (!window.confirm('Unpublish? The link will show "this form isn\'t open yet" until you publish again.')) return;
  try {
    await post('/publish', { published: false });
    await refreshForm();
  } catch (err) {
    statusError(err.message);
  }
});

$('form-close-btn')?.addEventListener('click', async () => {
  try {
    await post('/close', { closed: !form.closedAt });
    await refreshForm();
  } catch (err) {
    statusError(err.message);
  }
});

$('form-settings')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const status = $('settings-status');
  const closes = $('set-closes').value;
  try {
    const res = await fetch(`/api/forms/${FORM_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        settings: {
          confirmationMessage: $('set-confirmation').value,
          onePerEmail: $('set-one-per-email').checked,
          responseLimit: $('set-limit').value,
          closesAt: closes ? new Date(closes).toISOString() : null,
        },
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not save.');
    form = data;
    renderStatus();
    status.textContent = 'Saved.';
    status.className = 'save-status success';
  } catch (err) {
    status.textContent = err.message;
    status.className = 'save-status';
  }
});

$('form-copy-link')?.addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  try {
    await navigator.clipboard.writeText($('form-share-url').value);
    btn.textContent = 'Copied!';
  } catch (err) {
    $('form-share-url').select();
    btn.textContent = 'Press ⌘/Ctrl+C';
  }
  setTimeout(() => (btn.textContent = 'Copy link'), 1800);
});

$('form-duplicate-btn')?.addEventListener('click', async () => {
  try {
    const data = await post('/duplicate');
    window.location.href = `/forms/${encodeURIComponent(data.id)}`;
  } catch (err) {
    const box = $('form-manage-error');
    box.textContent = err.message;
    box.style.display = 'block';
  }
});

$('form-delete-btn')?.addEventListener('click', async () => {
  const n = form.responseCount;
  const typed = window.prompt(
    `This permanently deletes "${form.title}"${n ? ` and ${n} ${n === 1 ? 'response' : 'responses'}` : ''}.\n\nType DELETE to confirm.`
  );
  if (typed !== 'DELETE') return;
  const res = await fetch(`/api/forms/${FORM_ID}`, { method: 'DELETE' });
  if (res.ok) {
    saveState.dirty = false;
    window.location.href = '/forms';
  }
});

// ------------------------------------------------------------------ Load

(async function load() {
  try {
    const res = await fetch(`/api/forms/${FORM_ID}`);
    if (res.status === 401) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
      return;
    }
    if (!res.ok) throw new Error('not found');
    form = await res.json();
  } catch (err) {
    $('builder-loading').hidden = true;
    $('builder-error').hidden = false;
    return;
  }
  fields = JSON.parse(JSON.stringify(form.fields || []));
  $('builder-loading').hidden = true;
  $('form-title-input').value = form.title;
  $('form-description-input').value = form.description || '';
  if (KIND === 'rsvp') {
    $('form-title-input').hidden = true;
    $('form-description-input').hidden = true;
    $('builder-rsvp-note').hidden = false;
  }
  if (form.responseCount) {
    const notice = $('builder-responses-notice');
    notice.textContent = `This form already has ${form.responseCount} ${form.responseCount === 1 ? 'response' : 'responses'}. Editing questions won't change answers already given.`;
    notice.hidden = false;
  }
  renderEditor();
  renderStatus();
  setSaveState('All changes saved', 'is-saved');
  showTab(document.querySelector('[data-initial-tab]')?.dataset.initialTab || tabFromPath());
})();
