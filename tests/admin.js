// The owner's console. Most of this suite is the boundary: an ordinary
// signed-in host must not be able to read it, change it, or even confirm it is
// there. The rest checks a setting actually reaches the page a visitor sees.

const { signIn, client, pool, uuid, slug } = require('./helpers');

async function run({ base, reporter }) {
  const { check, section } = reporter;

  // The process under test was started with ADMIN_EMAILS set to this address.
  const ownerCookie = await signIn('admin-owner', 'Site Owner');
  await pool.query(`UPDATE users SET email = 'owner@test.dev' WHERE id = 'admin-owner'`);
  const owner = client(base, ownerCookie);

  const strangerCookie = await signIn('admin-stranger', 'Ordinary Host');
  await pool.query(`UPDATE users SET email = 'stranger@test.dev' WHERE id = 'admin-stranger'`);
  const stranger = client(base, strangerCookie);
  const anon = client(base);

  section('Nobody but the owner gets in');
  check('a signed-out visitor is sent to sign in', (await fetch(`${base}/admin`, { redirect: 'manual' })).status, 302);
  check('an ordinary host gets the not-found page, not a refusal',
    (await fetch(`${base}/admin`, { headers: { cookie: strangerCookie } })).status, 404);
  check('and cannot read the settings', await stranger.status('GET', '/api/admin/settings'), 404);
  check('nor the overview counts', await stranger.status('GET', '/api/admin/overview'), 404);
  check('nor change the theme', await stranger.status('PUT', '/api/admin/settings', { theme: 'default' }), 404);
  check('nor remove the logo', await stranger.status('DELETE', '/api/admin/logo'), 404);
  check('a signed-out request is refused too', await anon.status('GET', '/api/admin/settings'), 401);

  section('The owner gets in');
  check('the console renders', (await fetch(`${base}/admin`, { headers: { cookie: ownerCookie } })).status, 200);
  const settings = await owner.json('GET', '/api/admin/settings');
  check('it lists the themes', settings.themes.length >= 1, true);
  check('it lists the doodles', settings.doodles.some((d) => d.id === 'diwali'), true);
  check('it names who can get in', settings.admins.includes('owner@test.dev'), true);
  const overview = await owner.json('GET', '/api/admin/overview');
  check('the counts come back as numbers', typeof overview.events, 'number');

  section('Only the header offers the console');
  const strangerHome = await stranger.text('/');
  check('an ordinary host is not shown the link', strangerHome.includes('href="/admin"'), false);
  check('the owner is', (await owner.text('/')).includes('href="/admin"'), true);

  section('A setting reaches the page every visitor sees');
  await owner.json('PUT', '/api/admin/settings', { doodle: 'diwali' });
  const withDoodle = await anon.text('/');
  check('the doodle is drawn into the header for signed-out visitors', withDoodle.includes('brand-doodle'), true);
  await owner.json('PUT', '/api/admin/settings', { doodle: 'none' });
  check('and clearing it takes it away again', (await anon.text('/')).includes('brand-doodle'), false);

  section('Bad input is refused rather than stored');
  check('an unknown theme is rejected', await owner.status('PUT', '/api/admin/settings', { theme: 'no-such-theme' }), 400);
  check('an unknown doodle is rejected', await owner.status('PUT', '/api/admin/settings', { doodle: '<script>' }), 400);
  const after = await owner.json('GET', '/api/admin/settings');
  check('and the settings are untouched', [after.settings.theme, after.settings.doodle], ['default', 'none']);

  section('The logo endpoint is honest when there is no logo');
  check('it 404s rather than serving an empty body', (await fetch(`${base}/site/logo`)).status, 404);

  section('Being signed in is not enough to open the console');
  // Google signs someone straight back in if the browser is holding a live
  // session, so a thirty-day cookie would otherwise be the only thing between a
  // borrowed laptop and the whole site.
  const staleCookie = await signIn('admin-owner-stale', 'Site Owner', { authAgeMs: 60 * 60 * 1000 });
  await pool.query(`UPDATE users SET email = 'owner@test.dev' WHERE id = 'admin-owner-stale'`);
  const stale = client(base, staleCookie);
  const stalePage = await fetch(`${base}/admin`, { headers: { cookie: staleCookie }, redirect: 'manual' });
  check('an hour-old sign-in is sent back to the provider', stalePage.status, 302);
  check('and told to prove it again rather than just re-entering', (stalePage.headers.get('location') || '').includes('reauth=1'), true);
  check('the settings API refuses it too', await stale.status('GET', '/api/admin/settings'), 401);
  check('so does a write', await stale.status('PUT', '/api/admin/settings', { theme: 'dusk' }), 401);
  const refusal = await stale.json('GET', '/api/admin/settings');
  check('and it says where to go', refusal.reauth.includes('/auth/google?reauth=1'), true);
  check('a fresh sign-in still gets in', await owner.status('GET', '/api/admin/settings'), 200);
}

module.exports = { run };
