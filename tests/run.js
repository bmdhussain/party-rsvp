#!/usr/bin/env node
// Runs the test suites against a throwaway local database.
//
//   docker run -d --rm --name rsvpfor-test -e POSTGRES_PASSWORD=test \
//     -e POSTGRES_DB=rsvptest -p 55432:5432 postgres:16-alpine
//   DATABASE_URL=postgres://postgres:test@127.0.0.1:55432/rsvptest PGSSL=disable npm test
//
// It starts the real server itself, so what's tested is the app as it runs.

const { spawn } = require('child_process');
const path = require('path');
const { assertLocalDatabase, makeReporter, pool } = require('./helpers');

const PORT = Number(process.env.TEST_PORT || 5199);
const BASE = `http://127.0.0.1:${PORT}`;
const SUITES = ['smoke', 'ux', 'info'];

assertLocalDatabase();

// A server left running on this port would answer instead of ours, quietly
// testing yesterday's code against today's schema.
async function assertPortFree() {
  try {
    await fetch(`${BASE}/api/auth/providers`, { signal: AbortSignal.timeout(2000) });
  } catch (err) {
    return;
  }
  console.error(`\nSomething is already listening on ${BASE}. Stop it, or set TEST_PORT to a free port.\n`);
  process.exit(2);
}

async function waitForServer(child) {
  for (let i = 0; i < 40; i += 1) {
    try {
      const res = await fetch(`${BASE}/api/auth/providers`);
      if (res.ok) return true;
    } catch (err) {
      // Not up yet.
    }
    if (child.exitCode !== null) return false;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

(async () => {
  await assertPortFree();

  // A clean schema each run, so results never depend on what a previous run left.
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');

  const log = [];
  const child = spawn('node', [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'development', SESSION_SECRET: process.env.SESSION_SECRET || 'test-secret',
      GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'test-secret' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d) => log.push(String(d)));
  child.stderr.on('data', (d) => log.push(String(d)));

  if (!(await waitForServer(child))) {
    console.error('Server failed to start:\n', log.join(''));
    child.kill();
    process.exit(2);
  }

  let failed = 0;
  for (const name of SUITES) {
    const reporter = makeReporter(name);
    try {
      // eslint-disable-next-line global-require, import/no-dynamic-require
      await require(path.join(__dirname, `${name}.js`)).run({ base: BASE, reporter });
    } catch (err) {
      console.error(`\n${name} threw:`, err);
      failed += 1;
    }
    failed += reporter.finish();
  }

  // Anything the server logged that isn't its start-up line or a mail failure
  // (no mail provider in tests) is a problem worth seeing.
  const noise = log
    .join('')
    .split('\n')
    .filter((l) => l.trim() && !/RSVPfor running|promotion email failed|^>|^$/.test(l));
  if (noise.length) {
    console.log('Server log:\n  ' + noise.join('\n  '));
  }

  child.kill();
  // The suites share this pool, so it closes only once they're all done.
  await pool.end();
  console.log(failed ? `\nFAILED — ${failed} check(s) did not pass\n` : '\nAll checks passed\n');
  process.exit(failed ? 1 : 0);
})();
