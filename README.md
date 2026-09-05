# 🎉 Party RSVP

A quick, festive RSVP website for one event: guests get a link, submit their
name, email, and headcount, and can leave a public comment. Only the host can
see how many adults/kids are coming; email addresses and headcounts stay
private.

Plain HTML/CSS/JS front end + a tiny Node/Express server (needed only to keep
guest counts private and to store RSVPs). No build step, no framework.

## Run it on Replit

1. Import this repo into Replit (Create Repl → Import from GitHub).
2. Open the **Secrets** tab and add:
   - `EVENT_NAME`, `EVENT_DATE`, `EVENT_LOCATION`, `EVENT_DESCRIPTION` — your party details
   - `HOST_PASSWORD` — a password only you (the host) know
3. Click **Run**. Replit installs dependencies and starts the server automatically.
4. Share the web preview URL — that link *is* the RSVP page.
5. Visit `/host.html` on that same URL and log in with your `HOST_PASSWORD` to see headcounts and email your guests.

RSVPs are stored in Replit's built-in database automatically — nothing else to set up.

## Run it anywhere else (Render, Railway, Glitch, or your own machine)

```bash
npm install
cp .env.example .env   # then edit .env with your event details
npm start
```

Without Replit's database available, RSVPs are saved to a local `data/rsvps.json`
file instead — same app, no code changes needed.

## How it works

- `public/index.html` + `app.js` — the guest-facing invite/RSVP page and public comment wall
- `public/host.html` + `host.js` — password-gated dashboard with headcounts and a guest list
- `server.js` — a few small API routes (`/api/event`, `/api/rsvp`, `/api/comments`, `/api/host`)
- `lib/store.js` — saves RSVPs to Replit DB, or a local JSON file if Replit DB isn't available

## Editing your event details

Change the `EVENT_*` values in Replit Secrets (or your `.env` file) — no code
edits needed.
