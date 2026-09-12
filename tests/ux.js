// The flow rules that keep the app understandable: publishing is in the same
// place in both workspaces, every save says which state it saved into, and a
// form can be attached to an event from either direction.

const { signIn, client, hiddenAttr, pool, uuid, slug } = require('./helpers');

// Reads the pixel size out of the file itself, so a template that points at
// artwork of the wrong shape is caught rather than quietly letterboxed.
function imageSize(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) {
    return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
  }
  let i = 2;
  while (i < buf.length - 9) {
    if (buf[i] !== 0xff) { i += 1; continue; }
    const marker = buf[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)];
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return [0, 0];
}

async function run({ base, reporter }) {
  const { check, section } = reporter;
  const cookie = await signIn('ux-host', 'Ux Host');
  const host = client(base, cookie);
  const anon = client(base);

  const evId = uuid();
  await pool.query(
    `INSERT INTO events (id, slug, owner_id, name, event_date, location) VALUES ($1,$2,'ux-host','Draft Do', now() + interval '9 days','Hall')`,
    [evId, slug()]
  );

  section('Publish sits in the same place in both workspaces');
  let html = await host.text(`/host/${evId}`);
  check('a draft event offers Publish in the header', hiddenAttr(html, 'header-publish-btn'), false);
  check('and hides Copy invite link until it is live', hiddenAttr(html, 'copy-link-btn'), true);
  check('that header button runs the same publish action', /id="header-publish-btn"[^>]*data-publish/.test(html), true);

  await pool.query('UPDATE events SET published_at = now() WHERE id = $1', [evId]);
  html = await host.text(`/host/${evId}`);
  check('once live the header swaps to Copy invite link', [hiddenAttr(html, 'header-publish-btn'), hiddenAttr(html, 'copy-link-btn')], [true, false]);

  const form = await host.json('POST', '/api/forms', { templateId: 'feedback' });
  html = await host.text(`/forms/${form.id}`);
  check('a draft form offers Publish on its first screen', hiddenAttr(html, 'header-form-publish'), false);
  check('and hides Copy link until published', hiddenAttr(html, 'header-form-copy'), true);
  check('the control is there on every tab, not just one', hiddenAttr(await host.text(`/forms/${form.id}/responses`), 'header-form-publish'), false);

  await host.json('POST', `/api/forms/${form.id}/publish`, { published: true });
  html = await host.text(`/forms/${form.id}`);
  check('once published the header swaps to Copy link', [hiddenAttr(html, 'header-form-publish'), hiddenAttr(html, 'header-form-copy')], [true, false]);

  const rsvpForm = await host.json('POST', '/api/forms', { eventId: evId });
  html = await host.text(`/forms/${rsvpForm.id}`);
  check('RSVP questions show no publish of their own', hiddenAttr(html, 'header-form-publish'), 'ABSENT');
  check('they link back to their event instead', html.includes(`/host/${evId}/settings`), true);

  section('One confirmation style, shared by every page');
  const site = await anon.text('/site.js');
  check('the toast helper ships to every page', /function toast\(message/.test(site) && site.includes('localizeTimes, toast'), true);
  const hostJs = await anon.text('/host-event.js');
  const formJs = await anon.text('/form-builder.js');
  check('publishing an event says it is live and shareable', hostJs.includes('Published — your event page is live'), true);
  check('publishing a form says the same thing', formJs.includes('Published — your form is live'), true);
  check('unpublishing says the same thing in both', [hostJs, formJs].every((s) => s.includes('Back to draft — only you can see it now.')), true);
  check('saving a draft says so, rather than just "Saved"', hostJs.includes('Saved as draft.') && formJs.includes("'Saved as draft'"), true);
  check('and saving a live one says the change is live', hostJs.includes('Saved — your changes are live.') && formJs.includes("'Saved — changes are live'"), true);

  section('A form can be attached to an event from either direction');
  html = await host.text('/forms/new');
  check('the new-form page asks where the form should live', html.includes('id="attach-event"'), true);
  check('and says what the choice means', html.includes('Where should this form live?'), true);
  const newJs = await anon.text('/form-new.js');
  check('it offers the host’s events', newJs.includes("Ask on an event's RSVP form") && newJs.includes("fetch('/api/events')"), true);
  check('and creates RSVP questions when one is chosen', newJs.includes('eventId ? { eventId } : {}'), true);

  section('RSVP questions are visible from the event overview');
  check('the overview carries the card', (await host.text(`/host/${evId}`)).includes('overview-questions-card'), true);
  check('and it points at the builder', hostJs.includes('overview-questions-link'), true);

  section('Every template in the picker has real artwork behind it');
  const { TEMPLATES } = require('../lib/templates');
  const cards = [];
  for (const t of TEMPLATES) {
    const preview = await fetch(`${base}/templates/${t.file}`);
    const og = await fetch(`${base}/templates/og/${t.file.replace(/\.\w+$/, '.jpg')}`);
    const buf = Buffer.from(await preview.arrayBuffer());
    cards.push({
      id: t.id,
      served: preview.status === 200 && og.status === 200,
      size: imageSize(buf),
      bytes: buf.length,
      // Artwork we drew ourselves needs no credit; anything sourced does.
      original: t.origin === 'original',
      credited: t.origin === 'original' ? !t.sourceName : Boolean(t.sourceName && t.sourceUrl),
    });
  }
  check(`all ${cards.length} are served, preview and preview-card alike`, cards.filter((c) => !c.served).map((c) => c.id), []);
  check('all are the 1200x630 the layouts expect', cards.filter((c) => c.size[0] !== 1200 || c.size[1] !== 630).map((c) => c.id), []);
  // The placeholder art this library started with compressed to 7-8KB, because
  // there was nothing in it but a gradient and a few flat shapes. A scan or a
  // photograph cannot get near that; artwork drawn as flat colour legitimately
  // can, so it is held to a lower floor rather than exempted.
  const thin = cards.filter((c) => c.bytes < (c.original ? 18 : 60) * 1024);
  check('none is placeholder-thin', thin.map((c) => c.id), []);
  check('each sourced piece credits where it came from', cards.filter((c) => !c.credited).map((c) => c.id), []);
}

module.exports = { run };
