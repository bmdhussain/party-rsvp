// Shared bits for the test suites.
//
// These tests write to and delete from whatever database DATABASE_URL points
// at, so they refuse to run against anything but a local one. Pointing them at
// the Replit development or production database would destroy real data.

const crypto = require('crypto');
const path = require('path');
const signature = require(path.join(__dirname, '..', 'node_modules', 'cookie-signature'));
const { pool } = require('../lib/db');

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|::1|host\.docker\.internal)$/i;

function assertLocalDatabase() {
  const url = process.env.DATABASE_URL || '';
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch (err) {
    host = '';
  }
  if (!LOCAL_HOST.test(host)) {
    console.error(
      `\nRefusing to run: DATABASE_URL points at "${host || 'an unreadable URL'}".\n` +
        'These tests create and delete rows, so they only run against a local database.\n' +
        'Start a throwaway one, for example:\n' +
        '  docker run -d --rm --name rsvpfor-test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=rsvptest -p 55432:5432 postgres:16-alpine\n' +
        '  DATABASE_URL=postgres://postgres:test@127.0.0.1:55432/rsvptest PGSSL=disable npm test\n'
    );
    process.exit(2);
  }
}

function makeReporter(name) {
  const state = { pass: 0, fail: 0 };
  return {
    state,
    section(title) {
      console.log(`\n${title}`);
    },
    check(label, actual, expected) {
      const ok = JSON.stringify(actual) === JSON.stringify(expected);
      if (ok) {
        state.pass += 1;
        console.log(`  ok    ${label}`);
      } else {
        state.fail += 1;
        console.log(`  FAIL  ${label}\n          expected ${JSON.stringify(expected)}\n          actual   ${JSON.stringify(actual)}`);
      }
    },
    finish() {
      console.log(`\n${name}: ${state.pass} passed, ${state.fail} failed\n`);
      return state.fail;
    },
  };
}

// A signed-in browser session, the way a real Google login leaves one.
async function signIn(userId, name = 'Test Host') {
  await pool.query(`CREATE TABLE IF NOT EXISTS "session" ("sid" varchar NOT NULL PRIMARY KEY, "sess" json NOT NULL, "expire" timestamp(6) NOT NULL)`);
  await pool.query(
    `INSERT INTO users (id, provider, name, email) VALUES ($1,'test',$2,$3)
     ON CONFLICT (id) DO UPDATE SET name = $2`,
    [userId, name, `${userId}@test.dev`]
  );
  const sid = crypto.randomBytes(18).toString('hex');
  await pool.query(`INSERT INTO session (sid, sess, expire) VALUES ($1,$2, now() + interval '1 day')`, [
    sid,
    JSON.stringify({
      cookie: { originalMaxAge: 86400000, expires: new Date(Date.now() + 86400000), httpOnly: true, path: '/' },
      passport: { user: userId },
    }),
  ]);
  return `connect.sid=${encodeURIComponent(`s:${signature.sign(sid, process.env.SESSION_SECRET || 'test-secret')}`)}`;
}

function client(base, cookie) {
  const call = (method, path, body) =>
    fetch(`${base}${path}`, {
      method,
      redirect: 'manual',
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  return {
    raw: call,
    get: (p) => call('GET', p),
    json: async (method, p, body) => (await call(method, p, body)).json(),
    text: async (p) => (await call('GET', p)).text(),
    status: async (method, p, body) => (await call(method, p, body)).status,
  };
}

// Whether the element with that id carries the `hidden` attribute.
function hiddenAttr(html, id) {
  const m = html.match(new RegExp(`<[^>]*id="${id}"[^>]*>`));
  if (!m) return 'ABSENT';
  return / hidden(?=[ >])/.test(m[0]);
}

const uuid = () => crypto.randomUUID();
const slug = () => crypto.randomBytes(6).toString('base64url');

module.exports = { assertLocalDatabase, makeReporter, signIn, client, hiddenAttr, pool, uuid, slug };
