// The paths that matter most, end to end through the real HTTP API: an event
// from draft to published, replies and capacity, tickets and the door, custom
// forms, and the access rules that keep one host out of another's data.

const { signIn, client, pool, uuid, slug } = require('./helpers');

async function run({ base, reporter }) {
  const { check, section } = reporter;
  const anon = client(base);
  const host = client(base, await signIn('host-a', 'Ada Host'));
  const other = client(base, await signIn('host-b', 'Bo Host'));

  // ---------------------------------------------------------------- Pages
  section('Public pages answer');
  for (const p of ['/', '/explore', '/login']) {
    check(`${p} renders`, await anon.status('GET', p), 200);
  }
  check('an unknown page is a 404', await anon.status('GET', '/nope'), 404);
  check('the app is kept out of search results', (await anon.text('/robots.txt')).includes('Disallow: /dashboard'), true);

  section('Host pages need a sign-in');
  for (const p of ['/dashboard', '/events', '/forms', '/settings']) {
    check(`${p} redirects a signed-out visitor`, await anon.status('GET', p), 302);
  }
  check('the API says 401 rather than redirecting', await anon.status('GET', '/api/events'), 401);

  // ---------------------------------------------------------------- Events
  section('An event from draft to published');
  const created = await host.json('POST', '/api/events', {
    name: 'Summer Supper',
    date: new Date(Date.now() + 12 * 86400000).toISOString().slice(0, 16),
    location: 'The Barn',
    description: 'Long tables, short speeches.',
  });
  check('creating returns an id and a link', Boolean(created.id && created.slug), true);
  let hostView = await host.json('GET', `/api/events/${created.id}/host`);
  check('it starts as a draft', Boolean(hostView.event.published_at), false);
  check('guests see "coming soon" until then', (await anon.json('GET', `/api/events/${created.slug}/public`)).draft, true);
  check('and cannot reply yet', await anon.status('POST', `/api/events/${created.slug}/rsvp`, { name: 'Too Early', email: 'early@t.dev', attending: 'yes', adults: 1, kids: 0 }), 403);

  await host.json('POST', `/api/events/${created.id}/template`, { templateId: 'garden-party' });
  check('publishing works once it has a look', (await host.json('POST', `/api/events/${created.id}/publish`, { published: true })).ok, true);
  check('the invitation is now public', (await anon.json('GET', `/api/events/${created.slug}/public`)).name, 'Summer Supper');

  section('Replies, capacity and the waitlist');
  const rsvp = (body) => anon.json('POST', `/api/events/${created.slug}/rsvp`, body);
  let reply = await rsvp({ name: 'Ria', email: 'ria@t.dev', attending: 'yes', adults: 2, kids: 0 });
  check('a guest can reply', [reply.ok, reply.status], [true, 'confirmed']);
  check('and gets a ticket link', /\/t\/[0-9a-f]{32}$/.test(reply.ticketUrl), true);
  const ticketToken = reply.ticketUrl.split('/t/')[1];

  reply = await rsvp({ name: 'Ria', email: 'RIA@t.dev', attending: 'yes', adults: 1, kids: 0 });
  check('replying again revises rather than duplicating', reply.revised, true);
  check('so the guest list holds one row for them', (await host.json('GET', `/api/events/${created.id}/host`)).rsvps.filter((r) => r.email.toLowerCase() === 'ria@t.dev').length, 1);

  await host.json('PATCH', `/api/events/${created.id}`, { name: 'Summer Supper', date: new Date(Date.now() + 12 * 86400000).toISOString().slice(0, 16), capacity: '1' });
  reply = await rsvp({ name: 'Late', email: 'late@t.dev', attending: 'yes', adults: 1, kids: 0 });
  check('a full event waitlists rather than refuses', [reply.ok, reply.status], [true, 'waitlist']);
  await rsvp({ name: 'Ria', email: 'ria@t.dev', attending: 'no' });
  hostView = await host.json('GET', `/api/events/${created.id}/host`);
  check('giving up a spot promotes the queue', hostView.rsvps.find((r) => r.email === 'late@t.dev').status, 'confirmed');
  check('the host sees coming and declined counts', [hostView.totals.attendingCount, hostView.totals.declinedCount], [1, 1]);

  section('Tickets and the door');
  const ticket = await anon.json('GET', `/api/tickets/${ticketToken}`);
  check('a guest can open their ticket', ticket.guestName, 'Ria');
  check('a made-up ticket is a 404', await anon.status('GET', `/api/tickets/${'0'.repeat(32)}`), 404);
  const lateToken = (await pool.query(`SELECT ticket_token FROM rsvps WHERE email = 'late@t.dev'`)).rows[0].ticket_token;
  let scan = await host.json('POST', `/api/events/${created.id}/checkin`, { token: lateToken });
  check('the door admits a confirmed guest', [scan.ok, scan.already], [true, false]);
  scan = await host.json('POST', `/api/events/${created.id}/checkin`, { token: lateToken });
  check('a second scan reports the first time instead of erroring', scan.already, true);
  check("a ticket from another event is refused", await host.status('POST', `/api/events/${uuid()}/checkin`, { token: lateToken }), 404);

  section('Calendar and export');
  const ics = await anon.text(`/api/events/${created.slug}/calendar.ics`);
  check('the calendar file is a valid event', ics.startsWith('BEGIN:VCALENDAR') && ics.includes('SUMMARY:Summer Supper'), true);
  const csv = await host.text(`/api/events/${created.id}/guests.csv`);
  check('the guest export has a header row', csv.includes('Name,Email,Status'), true);

  // ---------------------------------------------------------------- Forms
  section('A custom form, start to finish');
  check('templates are offered', (await anon.json('GET', '/api/form-templates')).length, 8);
  const form = await host.json('POST', '/api/forms', { templateId: 'feedback' });
  let formData = await host.json('GET', `/api/forms/${form.id}`);
  check('it starts as a draft', formData.status, 'draft');
  check("a draft isn't public", await anon.status('GET', `/api/f/${formData.slug}`), 404);

  await host.json('POST', `/api/forms/${form.id}/publish`, { published: true });
  formData = await host.json('GET', `/api/forms/${form.id}`);
  check('publishing opens it', formData.status, 'open');
  const rating = formData.fields.find((f) => f.type === 'rating').id;
  const emailQ = formData.fields.find((f) => f.type === 'email').id;

  check('an answer outside the scale is refused', await anon.status('POST', `/api/f/${formData.slug}/responses`, { answers: { [rating]: 9 } }), 400);
  check('a valid response is accepted', (await anon.json('POST', `/api/f/${formData.slug}/responses`, { answers: { [rating]: 5, [emailQ]: 'ria@t.dev' } })).ok, true);
  check('a bot filling the hidden field is told it worked', await anon.status('POST', `/api/f/${formData.slug}/responses`, { answers: { [rating]: 1 }, website: 'spam' }), 200);
  check('but nothing is stored for it', (await host.json('GET', `/api/forms/${form.id}/responses`)).responses.length, 1);

  await host.json('PUT', `/api/forms/${form.id}`, { settings: { onePerEmail: true } });
  check('one response per email is enforced', await anon.status('POST', `/api/f/${formData.slug}/responses`, { answers: { [rating]: 3, [emailQ]: 'RIA@t.dev' } }), 409);
  await host.json('PUT', `/api/forms/${form.id}`, { settings: { responseLimit: 1 } });
  check('a reached limit closes the form', (await anon.json('GET', `/api/f/${formData.slug}`)).closed, true);

  section('RSVP questions on an invitation');
  const rsvpForm = await host.json('POST', '/api/forms', { eventId: created.id, templateId: 'rsvp-extras' });
  check('a second request opens the same set', (await host.json('POST', '/api/forms', { eventId: created.id })).existing, true);
  const diet = { id: 'q_diet000000', type: 'checkboxes', label: 'Dietary needs', options: ['Vegan', 'None'], required: true };
  await host.json('PUT', `/api/forms/${rsvpForm.id}`, { fields: [diet] });
  check('the invitation carries them', (await anon.json('GET', `/api/events/${created.slug}/public`)).rsvpQuestions.length, 1);
  check('a required question is enforced', await anon.status('POST', `/api/events/${created.slug}/rsvp`, { name: 'Nia', email: 'nia@t.dev', attending: 'yes', adults: 1, kids: 0, answers: {} }), 400);
  await anon.json('POST', `/api/events/${created.slug}/rsvp`, { name: 'Nia', email: 'nia@t.dev', attending: 'yes', adults: 1, kids: 0, answers: { q_diet000000: ['Vegan'] } });
  hostView = await host.json('GET', `/api/events/${created.id}/host`);
  check('answers reach the guest list', hostView.rsvps.find((r) => r.email === 'nia@t.dev').form_answers, { q_diet000000: ['Vegan'] });

  // ---------------------------------------------------------------- Access
  section('One host cannot reach another host’s data');
  for (const [method, p] of [['GET', `/api/events/${created.id}/host`], ['PATCH', `/api/events/${created.id}`], ['GET', `/api/events/${created.id}/guests.csv`],
    ['GET', `/api/forms/${form.id}`], ['PUT', `/api/forms/${form.id}`], ['GET', `/api/forms/${form.id}/responses`], ['DELETE', `/api/forms/${form.id}`]]) {
    const body = method === 'PATCH' ? { name: 'Stolen', date: new Date(Date.now() + 86400000).toISOString().slice(0, 16) } : method === 'PUT' ? {} : undefined;
    check(`${method} ${p.replace(created.id, ':event').replace(form.id, ':form')} is a 404`, await other.status(method, p, body), 404);
  }

  section('QR codes are drawn by the server');
  const qr = await anon.raw('GET', `/qr.svg?data=${encodeURIComponent('https://rsvpfor.com/t/abc123')}`);
  const svg = await qr.text();
  check('it returns an SVG image', [qr.status, qr.headers.get('content-type')], [200, 'image/svg+xml; charset=utf-8']);
  check('with an actual pattern in it', svg.startsWith('<svg') && svg.includes('<path d="M'), true);
  check('and caches hard, since the same text always draws the same code', qr.headers.get('cache-control').includes('immutable'), true);
  check('no text is echoed back into the image', svg.includes('rsvpfor.com'), false);
  check('asking for nothing is refused', await anon.status('GET', '/qr.svg'), 400);
  check('an absurdly long value is refused', await anon.status('GET', `/qr.svg?data=${'x'.repeat(900)}`), 400);
  const dl = await anon.raw('GET', '/qr.svg?data=hello&download=1&name=my%20form');
  check('the download link offers a file', dl.headers.get('content-disposition'), 'attachment; filename="my-form.svg"');
  check('no page still loads the broken QR library', (await anon.text(`/t/${ticketToken}`)).includes('qrcode@1.5.3'), false);
  check('the ticket page points at the server-drawn code', (await anon.text('/ticket.js')).includes('/qr.svg?data='), true);
  // The ticket's code holds the whole URL so a guest's own camera opens it;
  // the door scanner has to take the token off the end.
  check('the door scanner reads the token out of a scanned URL', (await anon.text('/checkin.js')).includes(String.raw`replace(/^.*\/t\//, '')`), true);

  section('Hostile input stays inert');
  const evil = await host.json('POST', '/api/forms', { templateId: 'blank', title: '</title><script>alert(1)</script>' });
  await host.json('POST', `/api/forms/${evil.id}/publish`, { published: true });
  const evilSlug = (await host.json('GET', `/api/forms/${evil.id}`)).slug;
  check('a hostile title cannot inject a script', (await anon.text(`/f/${evilSlug}`)).includes('<script>alert(1)</script>'), false);
  await pool.query(`UPDATE rsvps SET name = '=HYPERLINK(1)' WHERE email = 'nia@t.dev'`);
  check('a formula in the export is neutralised', (await host.text(`/api/events/${created.id}/guests.csv`)).includes(`"'=HYPERLINK(1)"`), true);
}

module.exports = { run };
