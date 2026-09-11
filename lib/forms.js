// Custom forms: the question types, the starting templates, and validation of
// both a form's design and the answers people submit to it.
//
// A form's questions live in one JSON array on the form. Each question has a
// stable id, so answers stay attached to the right question when the host
// reorders, renames or adds questions later. Choice answers are stored as the
// option's text (as Google Forms does), so a response still reads correctly
// even if that option is later renamed or removed.

const crypto = require('crypto');

const FIELD_TYPES = {
  short: { label: 'Short answer', answer: true },
  paragraph: { label: 'Paragraph', answer: true },
  email: { label: 'Email', answer: true },
  phone: { label: 'Phone number', answer: true },
  number: { label: 'Number', answer: true },
  date: { label: 'Date', answer: true },
  time: { label: 'Time', answer: true },
  choice: { label: 'Multiple choice', answer: true, options: true },
  checkboxes: { label: 'Checkboxes', answer: true, options: true },
  dropdown: { label: 'Dropdown', answer: true, options: true },
  yesno: { label: 'Yes / No', answer: true },
  rating: { label: 'Rating (1–5)', answer: true },
  section: { label: 'Section heading', answer: false },
};

const LIMITS = {
  fields: 60,
  options: 40,
  label: 300,
  help: 500,
  option: 200,
  title: 150,
  description: 2000,
  confirmation: 1000,
  short: 300,
  paragraph: 5000,
  other: 120,
};

function newFieldId() {
  return `q_${crypto.randomBytes(5).toString('hex')}`;
}

const cleanText = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

// Takes whatever the builder sent and returns a safe, normalised question
// list, or throws with a message the host can act on. Unknown properties are
// dropped, lengths are capped, and every question keeps (or gets) a unique id.
function normalizeFields(input) {
  if (!Array.isArray(input)) throw new Error('Questions must be a list.');
  if (input.length > LIMITS.fields) throw new Error(`A form can have at most ${LIMITS.fields} questions.`);

  const seen = new Set();
  return input.map((raw, index) => {
    const type = typeof raw?.type === 'string' && FIELD_TYPES[raw.type] ? raw.type : null;
    if (!type) throw new Error(`Question ${index + 1} has an unknown type.`);

    let id = typeof raw.id === 'string' && /^q_[a-z0-9]{4,20}$/.test(raw.id) ? raw.id : newFieldId();
    if (seen.has(id)) id = newFieldId();
    seen.add(id);

    const label = cleanText(raw.label, LIMITS.label);
    if (!label) throw new Error(`Question ${index + 1} needs a title.`);

    const field = { id, type, label, help: cleanText(raw.help, LIMITS.help) };
    if (FIELD_TYPES[type].answer) field.required = raw.required === true;

    if (FIELD_TYPES[type].options) {
      const options = [];
      for (const opt of Array.isArray(raw.options) ? raw.options : []) {
        const text = cleanText(typeof opt === 'string' ? opt : opt?.label, LIMITS.option);
        // Duplicate option texts would make answers ambiguous.
        if (text && !options.includes(text)) options.push(text);
      }
      if (options.length < 1) throw new Error(`"${label}" needs at least one option.`);
      if (options.length > LIMITS.options) throw new Error(`"${label}" can have at most ${LIMITS.options} options.`);
      field.options = options;
    }
    return field;
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Checks one submission against the form's questions. Returns the cleaned
// answers keyed by question id, and per-question error messages. Answers to
// questions that don't exist (a stale page, or a tampered request) are dropped.
function validateAnswers(fields, input) {
  const answers = {};
  const errors = {};
  const given = input && typeof input === 'object' && !Array.isArray(input) ? input : {};

  for (const field of fields) {
    if (!FIELD_TYPES[field.type]?.answer) continue;
    const raw = given[field.id];
    const blank =
      raw === undefined || raw === null || (typeof raw === 'string' && !raw.trim()) || (Array.isArray(raw) && !raw.length);

    if (blank) {
      if (field.required) errors[field.id] = 'This question is required.';
      continue;
    }

    const text = typeof raw === 'string' ? raw.trim() : '';
    switch (field.type) {
      case 'short':
        answers[field.id] = text.slice(0, LIMITS.short);
        break;
      case 'paragraph':
        answers[field.id] = text.slice(0, LIMITS.paragraph);
        break;
      case 'email':
        if (!EMAIL_RE.test(text) || text.length > 200) errors[field.id] = 'Enter a valid email address.';
        else answers[field.id] = text;
        break;
      case 'phone':
        // Loose on purpose: formats vary by country. Digits plus common punctuation.
        if (!/^\+?[0-9 ()./-]{6,25}$/.test(text) || (text.match(/\d/g) || []).length < 6) {
          errors[field.id] = 'Enter a valid phone number.';
        } else answers[field.id] = text;
        break;
      case 'number': {
        const n = Number(text);
        if (!text || !Number.isFinite(n)) errors[field.id] = 'Enter a number.';
        else answers[field.id] = n;
        break;
      }
      case 'date':
        if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(new Date(`${text}T00:00:00Z`).getTime())) {
          errors[field.id] = 'Enter a valid date.';
        } else answers[field.id] = text;
        break;
      case 'time':
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) errors[field.id] = 'Enter a valid time.';
        else answers[field.id] = text;
        break;
      case 'choice':
      case 'dropdown':
        if (!field.options.includes(text)) errors[field.id] = 'Choose one of the options.';
        else answers[field.id] = text;
        break;
      case 'checkboxes': {
        const picked = (Array.isArray(raw) ? raw : [raw]).map((v) => String(v).trim());
        const valid = [...new Set(picked)].filter((v) => field.options.includes(v));
        if (valid.length !== new Set(picked).size) errors[field.id] = 'Choose from the listed options.';
        else answers[field.id] = valid;
        break;
      }
      case 'yesno':
        if (text !== 'yes' && text !== 'no') errors[field.id] = 'Choose yes or no.';
        else answers[field.id] = text;
        break;
      case 'rating': {
        const n = Number(raw);
        if (!Number.isInteger(n) || n < 1 || n > 5) errors[field.id] = 'Choose a rating from 1 to 5.';
        else answers[field.id] = n;
        break;
      }
      default:
        break;
    }
  }
  return { answers, errors, ok: Object.keys(errors).length === 0 };
}

// Form-level settings the host controls. Everything optional.
function normalizeSettings(input) {
  const s = input && typeof input === 'object' ? input : {};
  const limit = parseInt(s.responseLimit, 10);
  const closes = s.closesAt ? new Date(s.closesAt) : null;
  return {
    confirmationMessage: cleanText(s.confirmationMessage, LIMITS.confirmation),
    // Needs an email question to key on; ignored at submit time if there isn't one.
    onePerEmail: s.onePerEmail === true,
    responseLimit: Number.isInteger(limit) && limit > 0 ? Math.min(limit, 100000) : null,
    closesAt: closes && !Number.isNaN(closes.getTime()) ? closes.toISOString() : null,
  };
}

// Whether a published form still takes responses, and if not, why — in words
// a respondent can understand.
function closedReason(form, responseCount) {
  if (form.closed_at) return 'This form is no longer accepting responses.';
  const s = form.settings || {};
  if (s.closesAt && new Date(s.closesAt).getTime() <= Date.now()) return 'This form closed on its deadline.';
  if (s.responseLimit && responseCount >= s.responseLimit) return 'This form has reached its response limit.';
  return null;
}

// Per-question summaries for the Responses tab: counts for choices, averages
// for ratings and numbers, and the latest few written answers.
function summarize(fields, responses) {
  return fields
    .filter((f) => FIELD_TYPES[f.type]?.answer)
    .map((f) => {
      const values = responses.map((r) => r.answers?.[f.id]).filter((v) => v !== undefined && v !== null && v !== '');
      const base = { id: f.id, label: f.label, type: f.type, answered: values.length };

      if (f.type === 'choice' || f.type === 'dropdown' || f.type === 'yesno' || f.type === 'checkboxes') {
        const counts = new Map();
        const known = f.type === 'yesno' ? ['yes', 'no'] : f.options;
        known.forEach((o) => counts.set(o, 0));
        values.flat().forEach((v) => counts.set(v, (counts.get(v) || 0) + 1));
        return { ...base, counts: [...counts].map(([option, count]) => ({ option, count })) };
      }
      if (f.type === 'rating' || f.type === 'number') {
        const nums = values.map(Number).filter(Number.isFinite);
        const avg = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
        const out = { ...base, average: avg === null ? null : Math.round(avg * 10) / 10 };
        if (f.type === 'rating') {
          out.counts = [1, 2, 3, 4, 5].map((n) => ({ option: String(n), count: nums.filter((x) => x === n).length }));
        } else if (nums.length) {
          out.min = Math.min(...nums);
          out.max = Math.max(...nums);
        }
        return out;
      }
      // Written answers: newest first, a handful for the overview.
      return { ...base, recent: values.slice(0, 5).map(String) };
    });
}

// The first email question, if any — used to enforce one response per email.
function emailField(fields) {
  return fields.find((f) => f.type === 'email') || null;
}

module.exports = {
  FIELD_TYPES,
  LIMITS,
  normalizeFields,
  normalizeSettings,
  validateAnswers,
  closedReason,
  summarize,
  emailField,
  newFieldId,
};
