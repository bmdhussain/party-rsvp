// Contact, terms, privacy and the human site index.
//
// The privacy page describes what this codebase actually does, not what a
// template says a site usually does: the tables in lib/db.js, the Google
// sign-in in lib/auth.js, the Brevo call in server.js, and the session cookie
// settings. If any of those change, this page has to change with them.

const CONTACT_EMAIL = process.env.CONTACT_EMAIL || process.env.BREVO_SENDER_EMAIL || 'organizer@rsvpfor.com';

// Changing these is a deliberate act: the date is what tells a reader whether
// the terms they agreed to are the ones on the page.
const TERMS_UPDATED = '12 September 2026';
const PRIVACY_UPDATED = '13 September 2026';

const mailto = `<a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>`;

const CONTACT = {
  slug: 'contact',
  title: 'Contact',
  eyebrow: 'Contact',
  navLabel: 'Contact',
  lede: 'One address, read by a person. Here is what to put in it so you get a useful reply.',
  body: `
    <p>Email ${mailto}.</p>

    <h2>If you are a guest</h2>
    <p>We can't change an RSVP for you, and we can't tell you anything about an
      event you weren't invited to. Both of those belong to the host — your
      invitation came from them, and the reply button on it still works if you
      need to change your answer.</p>
    <p>What we can do is remove your details. If you replied to an invitation
      and want your name, email and answers deleted, write to us and say which
      event it was. See <a href="/privacy">Privacy</a> for what that removes.</p>

    <h2>If you are a host</h2>
    <p>Tell us the event's link, what you expected to happen, and what happened
      instead. If it's about email not arriving, say which address it was going
      to and roughly when you sent it.</p>

    <h2>Deleting your account</h2>
    <p>There is no button for this yet. Email us from the address you signed in
      with and we'll delete the account and everything attached to it —
      your events, their guest lists and their form responses.</p>

    <h2>Reporting an event</h2>
    <p>If a public event on this site is a scam, is impersonating someone, or is
      being used to harass, send us the link. We would rather look at ten that
      turn out to be fine than miss one that isn't.</p>

    <h2>Security</h2>
    <p>If you have found a vulnerability, write to the same address with
      "security" in the subject line. Please give us a chance to fix it before
      you publish it, and please don't test against other people's events or
      guest data — if you need an account to test against, ask and we'll set
      one up.</p>
  `,
};

const TERMS = {
  slug: 'terms',
  title: 'Terms of use',
  eyebrow: 'Terms',
  navLabel: 'Terms',
  lede: 'What you can expect from RSVPfor, and what we expect from you.',
  updated: `Last updated ${TERMS_UPDATED}.`,
  body: `
    <p>RSVPfor lets you make an invitation or event page, share it, and collect
      replies. Using the site means accepting what follows. If you don't accept
      it, don't use the site.</p>

    <h2>Accounts</h2>
    <p>Hosting an event needs an account, which you create by signing in with
      Google. Replying to an invitation doesn't — guests never need an account.</p>
    <p>You are responsible for what happens under your account. One person, one
      account; don't share your sign-in with someone you wouldn't trust with
      your guest list.</p>

    <h2>Your content</h2>
    <p>The events you write, the images you upload and the questions you ask
      stay yours. We don't claim ownership of them. You give us permission to
      store them and to show them to the people you share them with — which is
      simply what it takes to run the site.</p>
    <p>You need the right to use what you upload. If you put someone else's
      photograph on an invitation, that's between you and them.</p>

    <h2>What you may not do</h2>
    <ul>
      <li>Use RSVPfor to send bulk unsolicited email. The invite list is for
        people who are expecting to hear from you.</li>
      <li>Impersonate a person, business or organisation.</li>
      <li>Collect information from your guests that you don't need, or use it
        for something other than the event you collected it for.</li>
      <li>Publish anything illegal, or anything that harasses or endangers
        someone.</li>
      <li>Scrape the site, or try to reach events, guest lists or accounts that
        aren't yours.</li>
    </ul>

    <h2>Public events</h2>
    <p>An event is private until you choose otherwise. If you make one public it
      can appear in Explore, on your host profile and in search results, and we
      may show it on the home page. You can make it private again, but anything
      already indexed by a search engine is out of our hands.</p>

    <h2>Guest lists</h2>
    <p>When someone replies to your invitation, you get their name, email and
      whatever else you asked. You are responsible for that list. Use it for the
      event and nothing else, and delete it when you no longer need it. In many
      countries this is not just courtesy — it is the law, and the obligation is
      yours, not ours.</p>

    <h2>What we don't promise</h2>
    <p>This is a service that can go down. We don't guarantee it will be
      available, that email will arrive, or that nothing will ever be lost. Keep
      your own copy of anything you can't afford to lose — the guest list
      exports to CSV for exactly this reason.</p>
    <p>To the extent the law allows, the site is provided as it is, and we are
      not liable for losses arising from using it. Nothing here removes rights
      you have that cannot be removed by agreement.</p>

    <h2>Ending it</h2>
    <p>You can stop using RSVPfor whenever you like, and ask us to delete your
      account (see <a href="/contact">Contact</a>). We may suspend an account
      that breaks these terms, and will say why unless doing so would help
      somebody cause harm.</p>

    <h2>Changes</h2>
    <p>If we change these terms we'll change the date at the bottom of this page.
      If a change materially affects hosts, we'll email the address on the
      account rather than rely on you noticing.</p>
  `,
};

const PRIVACY = {
  slug: 'privacy',
  title: 'Privacy',
  eyebrow: 'Privacy',
  navLabel: 'Privacy',
  lede: 'What RSVPfor stores, who it goes to, and how to get rid of it. Written against the code, not from a template.',
  updated: `Last updated ${PRIVACY_UPDATED}.`,
  body: `
    <div class="info-note">
      <p><strong>The short version.</strong> There are no advertising or
        analytics trackers on this site. Nothing you do here is sold, and
        nothing is shared with anyone except the host whose invitation you
        replied to, and the two services it takes to sign hosts in and send
        email.</p>
    </div>

    <h2>If you replied to an invitation</h2>
    <p>You don't need an account, and we don't create one for you. What we store
      is what you typed on the form:</p>
    <ul>
      <li>Your name and email address.</li>
      <li>Whether you're coming, and how many people you're bringing.</li>
      <li>Any note you left, and your answers to whatever extra questions the
        host added.</li>
      <li>A random ticket code, so your ticket page has an address only you have.</li>
      <li>If the host scans you in on the day, the time you arrived and which
        organiser scanned you.</li>
    </ul>
    <p>The host of that event can see all of it, and can export it. That is the
      point of an RSVP. Other hosts cannot see it, and it isn't shown on any
      public page.</p>

    <h2>If you host events</h2>
    <p>Signing in with Google gives us your name, email address and profile
      picture from your Google account. We don't receive your password and we
      can't see anything else in your Google account.</p>
    <p>We also store what you create: your events, their descriptions and
      images, the questions you ask, any email addresses you add to an invite
      list, and — if you turn on a public profile — the handle and bio you
      choose, which are then visible to anyone.</p>
    <p>If you attach a town to an event so its page can show the weather, we
      store that town's name and coordinates. It is the town you picked, not
      the street address you wrote for your guests.</p>
    <p>There is a button that fills that in from where you actually are. It only
      runs when you tap it, and your browser asks you first — we cannot reach
      your location without you agreeing. We never work out where anyone is from
      their network address, and nothing at all is looked up for a guest opening
      an invitation.</p>

    <h2>Cookies</h2>
    <p>One cookie, to keep hosts signed in. It holds a session identifier and
      nothing else, can't be read by JavaScript, is only sent to this site, is
      sent over HTTPS in production, and expires after 30 days. Signing out
      clears it.</p>
    <p>There are no advertising, analytics or social-media cookies, because
      there are no such trackers on the site. The visitor numbers a host sees on
      their event are counted from RSVPs already in our own database.</p>

    <h2>Who else sees any of it</h2>
    <dl>
      <dt>Google</dt>
      <dd>Signs hosts in. Guests never touch it.</dd>
      <dt>Brevo</dt>
      <dd>Sends email. It receives the recipient's address and the contents of
        that message — nothing more, and only when a host actually sends
        something.</dd>
      <dt>Open-Meteo</dt>
      <dd>Provides the weather shown on an event page. It receives the
        coordinates of the town a host chose for that event, and the date —
        never anything about a guest, and nothing at all unless a host has set a
        place.</dd>
      <dt>BigDataCloud</dt>
      <dd>Turns coordinates back into a town name, and only when a host taps
        "use my exact location" and their browser asks them to agree. It
        receives those coordinates and nothing else. If nobody taps it, nothing
        is ever sent.</dd>
      <dt>Our hosting and database provider</dt>
      <dd>Stores the data so the site can run.</dd>
    </dl>
    <p>That's the list. We don't sell personal information, and we don't share
      it for advertising.</p>

    <h2>How long it's kept</h2>
    <p>Until it's deleted. An event and its guest list stay while the event
      does; when a host deletes an event, its RSVPs, check-ins and form
      responses go with it, immediately and for good. Deleting an account
      removes everything attached to it the same way.</p>
    <p>We should be plain about the gap here: there is no automatic clear-out of
      old events. If you hosted something two years ago and never deleted it,
      the guest list is still there.</p>

    <h2>Getting your data, or getting rid of it</h2>
    <p>Hosts can export any guest list as a CSV from the event's guest page, and
      can delete an event, a form or a single response at any time.</p>
    <p>Guests: email ${mailto} naming the event, and we'll delete your reply and
      anything attached to it. You can also ask what we hold about you, or ask
      us to correct it.</p>
    <p>Account deletion isn't self-serve yet. Email us from the address you
      signed in with and we'll do it.</p>

    <h2>Children</h2>
    <p>RSVPfor isn't meant for children to sign up to as hosts. A guest count
      can include children without naming them, and we'd encourage hosts not to
      ask for more about a child than the event actually needs.</p>

    <h2>Security</h2>
    <p>Traffic is encrypted in transit. Sessions are stored server-side; the
      cookie in your browser is only a key to them. Guest lists are readable
      only by the host who owns the event, checked on every request rather than
      hidden in the interface.</p>
    <p>No service is immune. If we ever have a breach affecting your data, we'll
      tell you what happened and what to do about it rather than wait to be
      asked.</p>

    <h2>Changes</h2>
    <p>Changes show up as a new date at the bottom of this page. If a change
      matters to hosts, we'll email them.</p>

    <h2>Asking us about any of this</h2>
    <p>Write to ${mailto}. A real person reads it.</p>
  `,
};

const SITEMAP = {
  slug: 'sitemap',
  title: 'Site map',
  eyebrow: 'Site map',
  navLabel: 'Site map',
  lede: 'Everything on RSVPfor, on one page.',
  body: `
    <div class="info-index">
      <section>
        <h2>Start here</h2>
        <ul>
          <li><a href="/">Home</a></li>
          <li><a href="/explore">Explore public events</a></li>
          <li><a href="/events/new">Create an event</a></li>
          <li><a href="/login">Host sign in</a></li>
        </ul>
      </section>
      <section>
        <h2>Hosting</h2>
        <ul>
          <li><a href="/dashboard">Dashboard</a></li>
          <li><a href="/events">My events</a></li>
          <li><a href="/forms">Forms</a></li>
          <li><a href="/settings">Settings</a></li>
        </ul>
      </section>
      <section>
        <h2>About this site</h2>
        <ul>
          <li><a href="/contact">Contact</a></li>
          <li><a href="/terms">Terms of use</a></li>
          <li><a href="/privacy">Privacy</a></li>
        </ul>
      </section>
    </div>

    <p>The hosting pages ask you to sign in. Everything under Start here is open
      to anyone.</p>

    <h2>For search engines</h2>
    <p>Every public event, category and host profile is listed in
      <a href="/sitemap.xml">sitemap.xml</a>, which is generated from the
      database rather than written by hand. <a href="/robots.txt">robots.txt</a>
      says which parts of the site crawlers should leave alone — the host
      workspace, the API and guests' ticket links among them.</p>
  `,
};

const INFO_PAGES = [SITEMAP, CONTACT, TERMS, PRIVACY];

function findInfoPage(slug) {
  return INFO_PAGES.find((p) => p.slug === slug);
}

module.exports = { INFO_PAGES, findInfoPage, CONTACT_EMAIL };
