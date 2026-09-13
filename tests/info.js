// The standing site information: contact, terms, privacy and the site index.
//
// Most of these check the pages are reachable and linked. The last two are the
// ones worth having: the privacy page makes two factual claims about the code —
// that there are no third-party trackers, and how the session cookie behaves —
// and these fail if the code stops matching the page.

const { client } = require('./helpers');
const { INFO_PAGES } = require('../lib/info-pages');

const TRACKERS = [
  'google-analytics.com', 'googletagmanager.com', 'gtag(', 'connect.facebook.net',
  'fbq(', 'plausible.io', 'matomo', 'hotjar', 'segment.com', 'mixpanel',
  'clarity.ms', 'doubleclick.net',
];

async function run({ base, reporter }) {
  const { check, section } = reporter;
  const anon = client(base);

  section('Every standing page is reachable and indexable');
  for (const info of INFO_PAGES) {
    const res = await fetch(`${base}/${info.slug}`);
    const html = await res.text();
    check(`/${info.slug} is served`, res.status, 200);
    check(`/${info.slug} says what it is`, html.includes(`<h1>${info.title}</h1>`), true);
    check(`/${info.slug} is left open to crawlers`, /name="robots" content="index,follow"/.test(html), true);
  }

  section('They are reachable from anywhere on the site');
  const home = await anon.text('/');
  for (const info of INFO_PAGES) {
    check(`the footer links to /${info.slug}`, home.includes(`href="/${info.slug}"`), true);
  }

  section('And search engines are told about them');
  const xml = await anon.text('/sitemap.xml');
  for (const info of INFO_PAGES) {
    check(`sitemap.xml lists /${info.slug}`, xml.includes(`/${info.slug}</loc>`), true);
  }
  const robots = await anon.text('/robots.txt');
  check('robots.txt blocks none of them', INFO_PAGES.filter((p) => robots.includes(`Disallow: /${p.slug}`)).map((p) => p.slug), []);

  section('The privacy page still describes the code it was written against');
  // "There are no advertising or analytics trackers on this site."
  const pages = ['/', '/explore', '/login', '/privacy'];
  const found = [];
  for (const p of pages) {
    const html = await anon.text(p);
    for (const t of TRACKERS) if (html.includes(t)) found.push(`${p}:${t}`);
  }
  check('no third-party tracker is served on any public page', found, []);

  // "That's the list." Every outside service the code actually calls has to be
  // named on the page, or the page is wrong.
  const privacyHtml = await anon.text('/privacy');
  const NAMED = ['Google', 'Brevo', 'Open-Meteo', 'BigDataCloud'];
  check('every third party the code calls is named', NAMED.filter((n) => !privacyHtml.includes(n)), []);

  // "One cookie ... can't be read by JavaScript, is only sent to this site, is
  // sent over HTTPS in production, and expires after 30 days." The helper
  // fabricates a session row rather than going through Google, so there is no
  // live Set-Cookie to read; the configuration the server runs on is the thing
  // that has to keep matching the page.
  const serverSrc = require('fs').readFileSync(require('path').join(__dirname, '..', 'server.js'), 'utf8');
  const cookieCfg = serverSrc.slice(serverSrc.indexOf('cookie: {'), serverSrc.indexOf('cookie: {') + 240);
  check('the session cookie is still httpOnly', /httpOnly:\s*true/.test(cookieCfg), true);
  check('still same-site', /sameSite:\s*'lax'/.test(cookieCfg), true);
  check('still HTTPS-only in production', /secure:\s*IS_PRODUCTION/.test(cookieCfg), true);
  check('still 30 days, as the page says', /maxAge:\s*30 \* 24 \* 60 \* 60 \* 1000/.test(cookieCfg), true);
  const privacy = await anon.text('/privacy');
  check('and the page still says 30 days', privacy.includes('30 days'), true);
}

module.exports = { run };
