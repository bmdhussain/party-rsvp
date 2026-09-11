// Renders form questions and reads the answers back. Shared by the public form
// page, the event RSVP form (for the host's extra questions) and the builder's
// live preview, so a question looks and behaves the same everywhere.
//
// Every piece of host- or guest-written text goes through escapeHtml.
(function () {
  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  const INPUT_TYPES = { short: 'text', email: 'email', phone: 'tel', number: 'number', date: 'date', time: 'time' };
  const PLACEHOLDERS = {
    short: 'Your answer',
    email: 'name@example.com',
    phone: '+1 555 010 0000',
    number: '0',
    paragraph: 'Your answer',
  };

  function questionHtml(field, prefix, disabled) {
    const id = `${prefix}-${field.id}`;
    const req = field.required ? '<span class="fq-req" aria-hidden="true">*</span>' : '';
    const help = field.help ? `<div class="fq-help" id="${id}-help">${escapeHtml(field.help)}</div>` : '';
    const describedBy = [field.help ? `${id}-help` : '', `${id}-error`].filter(Boolean).join(' ');
    const common = `${field.required ? 'required aria-required="true"' : ''} aria-describedby="${describedBy}" ${disabled ? 'disabled' : ''}`;
    const error = `<div class="fq-error" id="${id}-error" role="alert"></div>`;

    if (field.type === 'section') {
      return `<div class="fq fq-section" data-field-id="${escapeHtml(field.id)}" data-type="section">
          <h3>${escapeHtml(field.label)}</h3>${field.help ? `<p>${escapeHtml(field.help)}</p>` : ''}
        </div>`;
    }

    // Choice-style questions are a group of inputs, so they get a fieldset and
    // legend rather than a single label — that's what screen readers expect.
    const group = (inputs, extraClass = '') => `
      <fieldset class="fq fq-group ${extraClass}" data-field-id="${escapeHtml(field.id)}" data-type="${field.type}" aria-describedby="${describedBy}">
        <legend class="fq-label">${escapeHtml(field.label)}${req}</legend>
        ${help}
        <div class="fq-options">${inputs}</div>
        ${error}
      </fieldset>`;

    if (field.type === 'choice' || field.type === 'checkboxes') {
      const inputType = field.type === 'choice' ? 'radio' : 'checkbox';
      const inputs = field.options
        .map(
          (opt, i) => `<label class="fq-option"><input type="${inputType}" name="${id}" value="${escapeHtml(opt)}" id="${id}-${i}" ${
            disabled ? 'disabled' : ''
          } /><span>${escapeHtml(opt)}</span></label>`
        )
        .join('');
      return group(inputs);
    }
    if (field.type === 'yesno') {
      const inputs = ['yes', 'no']
        .map(
          (v) => `<label class="fq-pill"><input type="radio" name="${id}" value="${v}" ${disabled ? 'disabled' : ''} /><span>${
            v === 'yes' ? 'Yes' : 'No'
          }</span></label>`
        )
        .join('');
      return group(inputs, 'fq-pills');
    }
    if (field.type === 'rating') {
      const inputs = [1, 2, 3, 4, 5]
        .map(
          (n) => `<label class="fq-pill fq-rating"><input type="radio" name="${id}" value="${n}" ${
            disabled ? 'disabled' : ''
          } aria-label="${n} out of 5" /><span>${n}</span></label>`
        )
        .join('');
      return group(`${inputs}<span class="fq-rating-scale"><small>Poor</small><small>Excellent</small></span>`, 'fq-pills');
    }

    let control;
    if (field.type === 'paragraph') {
      control = `<textarea id="${id}" name="${id}" rows="4" maxlength="5000" placeholder="${PLACEHOLDERS.paragraph}" ${common}></textarea>`;
    } else if (field.type === 'dropdown') {
      control = `<select id="${id}" name="${id}" ${common}><option value="">Choose…</option>${field.options
        .map((opt) => `<option value="${escapeHtml(opt)}">${escapeHtml(opt)}</option>`)
        .join('')}</select>`;
    } else {
      const type = INPUT_TYPES[field.type] || 'text';
      const extra =
        field.type === 'number' ? 'step="any" inputmode="decimal"' : field.type === 'short' ? 'maxlength="300"' : '';
      const auto = field.type === 'email' ? 'autocomplete="email"' : field.type === 'phone' ? 'autocomplete="tel"' : '';
      control = `<input type="${type}" id="${id}" name="${id}" ${extra} ${auto} placeholder="${
        PLACEHOLDERS[field.type] || ''
      }" ${common} />`;
    }

    return `<div class="fq" data-field-id="${escapeHtml(field.id)}" data-type="${field.type}">
        <label class="fq-label" for="${id}">${escapeHtml(field.label)}${req}</label>
        ${help}
        ${control}
        ${error}
      </div>`;
  }

  function render(container, fields, { prefix = 'fq', disabled = false } = {}) {
    container.innerHTML = (fields || []).map((f) => questionHtml(f, prefix, disabled)).join('');
  }

  // Reads the answers out of the rendered questions, keyed by question id —
  // the shape the server validates.
  function collect(container) {
    const answers = {};
    container.querySelectorAll('[data-field-id]').forEach((el) => {
      const id = el.dataset.fieldId;
      const type = el.dataset.type;
      if (type === 'section') return;
      if (type === 'checkboxes') {
        const picked = [...el.querySelectorAll('input:checked')].map((i) => i.value);
        if (picked.length) answers[id] = picked;
      } else if (type === 'choice' || type === 'yesno' || type === 'rating') {
        const picked = el.querySelector('input:checked');
        if (picked) answers[id] = picked.value;
      } else {
        const control = el.querySelector('input, textarea, select');
        if (control && control.value.trim()) answers[id] = control.value.trim();
      }
    });
    return answers;
  }

  function clearErrors(container) {
    container.querySelectorAll('.fq.has-error').forEach((el) => el.classList.remove('has-error'));
    container.querySelectorAll('.fq-error').forEach((el) => {
      el.textContent = '';
    });
    container.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
  }

  // Marks each question the server rejected and moves focus to the first, so
  // keyboard and screen-reader users land right on the problem.
  function showErrors(container, fieldErrors) {
    clearErrors(container);
    let first = null;
    Object.entries(fieldErrors || {}).forEach(([id, message]) => {
      const el = container.querySelector(`[data-field-id="${CSS.escape(id)}"]`);
      if (!el) return;
      el.classList.add('has-error');
      const box = el.querySelector('.fq-error');
      if (box) box.textContent = message;
      const control = el.querySelector('input, textarea, select');
      if (control) control.setAttribute('aria-invalid', 'true');
      if (!first) first = control || el;
    });
    if (first) {
      first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      first.focus({ preventScroll: true });
    }
    return Boolean(first);
  }

  window.RSVPforForm = { render, collect, showErrors, clearErrors, escapeHtml };
})();
