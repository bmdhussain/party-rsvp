// The public form page: loads the form, renders it, validates on submit, and
// shows the host's confirmation message. No account needed.

const SLUG = window.location.pathname.split('/').filter(Boolean)[1];
const $ = (id) => document.getElementById(id);
const Form = window.RSVPforForm;
let formData = null;

function showUnavailable(message) {
  const box = $('form-unavailable');
  box.textContent = message;
  box.hidden = false;
  $('fill-form').hidden = true;
}

async function load() {
  let res;
  try {
    res = await fetch(`/api/f/${encodeURIComponent(SLUG)}`);
  } catch (err) {
    return showUnavailable('Could not load this form. Check your connection and refresh.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return showUnavailable(
      data.draft ? "This form isn't open yet. Check back soon." : "We couldn't find this form. Check you have the whole link."
    );
  }
  formData = data;
  document.title = `${data.title} · RSVPfor`;
  $('form-title').textContent = data.title;
  $('form-description').textContent = data.description || '';
  $('form-description').hidden = !data.description;

  if (data.draft && data.isOwner) {
    $('form-draft-banner').hidden = false;
    $('form-manage-link').href = `/forms/${encodeURIComponent(data.formId)}`;
  }
  if (data.closed) return showUnavailable(data.closedReason);

  Form.render($('form-questions'), data.fields);
  $('form-required-note').hidden = !data.fields.some((f) => f.required);
  $('fill-form').hidden = false;
  // A draft previewed by its host shows everything but can't be submitted.
  if (data.draft) {
    $('form-submit').disabled = true;
    $('form-submit').textContent = 'Submitting opens when published';
  }
}

$('fill-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const summary = $('form-error-summary');
  summary.style.display = 'none';
  Form.clearErrors($('form-questions'));

  // Catch missing required answers before the round trip; the server checks
  // everything again regardless.
  const answers = Form.collect($('form-questions'));
  const missing = {};
  formData.fields.forEach((f) => {
    if (f.required && f.type !== 'section' && answers[f.id] === undefined) missing[f.id] = 'This question is required.';
  });
  if (Object.keys(missing).length) {
    summary.textContent = `Please answer ${Object.keys(missing).length === 1 ? 'the required question' : 'all required questions'}.`;
    summary.style.display = 'block';
    Form.showErrors($('form-questions'), missing);
    return;
  }

  const btn = $('form-submit');
  btn.disabled = true;
  btn.textContent = 'Submitting…';
  try {
    const res = await fetch(`/api/f/${encodeURIComponent(SLUG)}/responses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers, website: $('hp-website').value }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (data.closed) return showUnavailable(data.error);
      summary.textContent = data.error || 'Something went wrong. Please try again.';
      summary.style.display = 'block';
      if (data.fieldErrors) Form.showErrors($('form-questions'), data.fieldErrors);
      else summary.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    $('fill-form').hidden = true;
    $('form-done-message').textContent = data.confirmationMessage || 'The organiser will be in touch if they need anything else.';
    $('form-done').hidden = false;
    $('form-done').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    summary.textContent = 'Could not reach the server. Check your connection and try again.';
    summary.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Submit';
  }
});

$('form-clear').addEventListener('click', () => {
  if (!window.confirm('Clear all your answers?')) return;
  Form.render($('form-questions'), formData.fields);
});

$('form-again').addEventListener('click', () => {
  Form.render($('form-questions'), formData.fields);
  $('form-done').hidden = true;
  $('fill-form').hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

load();
