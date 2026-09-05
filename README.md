# 🎉 Party RSVP

A multi-tenant event RSVP platform. Hosts sign in with **Google** or **Facebook**,
create events, and get a unique link to share. Anyone with that link can RSVP
(name, email, headcount, optional public comment) with no account needed.
Only the host who created an event can see its headcounts, guest emails, and
guest list.

Plain HTML/CSS/JS front end + a small Express/Node backend, backed by
Postgres for real multi-user correctness (concurrent RSVPs are safe — no
lost updates, unlike a flat file or a simple key-value store).

## What you need before this can go live

1. **A Postgres database** — on Replit, open the **Database** pane and enable
   Postgres; it sets `DATABASE_URL` for you automatically. Elsewhere, a free
   Postgres from [neon.tech](https://neon.tech) or [supabase.com](https://supabase.com)
   works fine.
2. **A session secret** — any long random string. Generate one with:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
3. **Google and/or Facebook OAuth credentials** — you only need one provider
   configured for login to work; the site automatically hides the other
   button if its credentials aren't set.

   **Google:**
   1. Go to [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials)
   2. Create an OAuth 2.0 Client ID → Application type: **Web application**
   3. Under **Authorized redirect URIs**, add: `https://YOUR-DOMAIN/auth/google/callback`
   4. Copy the Client ID and Client Secret into `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`

   **Facebook:**
   1. Go to [developers.facebook.com/apps](https://developers.facebook.com/apps) → create an app
   2. Add the **Facebook Login** product
   3. Under Facebook Login settings → **Valid OAuth Redirect URIs**, add: `https://YOUR-DOMAIN/auth/facebook/callback`
   4. Copy the App ID and App Secret into `FACEBOOK_CLIENT_ID` / `FACEBOOK_CLIENT_SECRET`

Set all of the above as Replit **Secrets** (or in a local `.env` — see `.env.example`).

## Run it on Replit

1. Import this repo (Create Repl → Import from GitHub).
2. Enable the **Database** pane (Postgres) — this sets `DATABASE_URL`.
3. Add the other Secrets listed above.
4. Click **Run**, then **Publish** to deploy it live.

## Run it anywhere else

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL, SESSION_SECRET, OAuth credentials
npm start
```

## How it works

- `public/index.html` — landing page with "Continue with Google/Facebook" buttons
- `public/dashboard.html` + `dashboard.js` — logged-in host's event list + "create event"
- `public/event.html` + `event.js` — the public page at `/e/:slug`: event details, RSVP form, public comment wall (never shows headcounts)
- `public/host-event.html` + `host-event.js` — the page at `/host/:eventId`: headcounts, full guest list with emails, "email guests" shortcuts — only reachable by the event's owner
- `server.js` — routes for auth, event CRUD, public RSVP/comments, and the host dashboard API
- `lib/auth.js` — Passport Google/Facebook strategies (each only registered if its credentials are set)
- `lib/db.js` — Postgres connection + schema (auto-created on first run)

## Security notes

- Guest RSVP submissions are rate-limited per IP to reduce spam.
- Sessions are signed, HTTP-only cookies; state-changing host requests are checked against the request's Origin header as defense in depth.
- Event ownership is enforced on every host-only query — one host can never see another host's guest data.
