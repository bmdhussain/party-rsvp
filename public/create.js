// Step 1 of setting up an event. Submitting creates the draft straight away, so
// from here on the host can leave at any point and pick it up again from the
// dashboard — every later step saves as it goes.

const params = new URLSearchParams(window.location.search);

// Arriving from an occasion card on the home page pre-selects the category and
// suggests a name in the right spirit.
const OCCASION_NAMES = {
  birthday: "Alex's 30th Birthday",
  dinner: 'Saturday Supper',
  party: 'Baby Shower for Sam',
  wedding: 'Jamie & Rae Are Getting Married',
  workshop: 'Saturday Pottery Class',
  community: 'Neighbourhood Clean-up',
  music: 'Live at the Yard',
  sports: 'Sunday League Kick-about',
  other: 'Just Because Get-Together',
};

function futureMinimum() {
  const d = new Date(Date.now() + 60 * 1000);
  d.setSeconds(0, 0);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function loadCategories() {
  const select = document.getElementById('category');
  try {
    const categories = await (await fetch('/api/categories')).json();
    select.insertAdjacentHTML(
      'beforeend',
      categories.map((c) => `<option value="${c.id}">${c.label}</option>`).join('')
    );
    const occasion = params.get('occasion');
    if (occasion && categories.some((c) => c.id === occasion)) select.value = occasion;
  } catch (err) {
    // Category is optional; the form works without the list.
  }
}

function showError(message, field) {
  const box = document.getElementById('create-error');
  box.textContent = message;
  box.style.display = 'block';
  if (field) document.getElementById(field).focus();
}

const occasion = params.get('occasion');
if (OCCASION_NAMES[occasion]) document.getElementById('name').placeholder = OCCASION_NAMES[occasion];

const dateInput = document.getElementById('date');
dateInput.min = futureMinimum();

document.getElementById('create-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  document.getElementById('create-error').style.display = 'none';

  const name = document.getElementById('name').value.trim();
  const date = dateInput.value;
  if (!name) return showError('Give your event a name.', 'name');
  if (!date) return showError('Pick a date and time.', 'date');
  if (new Date(date).getTime() <= Date.now()) return showError('Choose a date and time in the future.', 'date');

  const submit = document.getElementById('create-submit');
  submit.disabled = true;
  submit.textContent = 'Saving…';

  try {
    const res = await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        date,
        location: document.getElementById('location').value,
        description: document.getElementById('description').value,
        category: document.getElementById('category').value,
      }),
    });
    const data = await res.json();
    if (res.status === 401) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
      return;
    }
    if (!res.ok) throw new Error(data.error || 'Could not create the event.');
    window.location.href = `/host/${encodeURIComponent(data.id)}/design`;
  } catch (err) {
    showError(err.message);
    submit.disabled = false;
    submit.textContent = 'Save and choose a look →';
  }
});

loadCategories();
document.getElementById('name').focus();
