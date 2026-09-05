require('dotenv').config();
const express = require('express');
const path = require('path');
const { getRsvps, saveRsvps } = require('./lib/store');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST_PASSWORD = process.env.HOST_PASSWORD || 'party123';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function checkHostPassword(req, res, next) {
  if (req.headers['x-host-password'] !== HOST_PASSWORD) {
    return res.status(401).json({ error: 'Incorrect password.' });
  }
  next();
}

app.get('/api/event', (req, res) => {
  res.json({
    name: process.env.EVENT_NAME || "Alex's Birthday Bash",
    date: process.env.EVENT_DATE || '2026-10-10T18:00:00',
    location: process.env.EVENT_LOCATION || '123 Party Lane, Funtown',
    description:
      process.env.EVENT_DESCRIPTION ||
      'Come celebrate with cake, music, and good vibes!',
  });
});

app.get('/api/comments', async (req, res) => {
  const rsvps = await getRsvps();
  const comments = rsvps
    .filter((r) => r.comment)
    .map((r) => ({
      name: r.name,
      attending: r.attending,
      comment: r.comment,
      createdAt: r.createdAt,
    }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(comments);
});

app.post('/api/rsvp', async (req, res) => {
  const { name, email, attending, adults, kids, comment } = req.body || {};

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Name is required.' });
  }
  if (
    !email ||
    typeof email !== 'string' ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  ) {
    return res.status(400).json({ error: 'A valid email is required.' });
  }

  const isAttending = attending === 'yes';
  const adultsCount = isAttending ? Math.max(0, parseInt(adults, 10) || 0) : 0;
  const kidsCount = isAttending ? Math.max(0, parseInt(kids, 10) || 0) : 0;

  if (isAttending && adultsCount + kidsCount < 1) {
    return res.status(400).json({ error: 'Please include at least one guest.' });
  }

  const rsvps = await getRsvps();
  rsvps.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    name: name.trim().slice(0, 100),
    email: email.trim().slice(0, 200),
    attending: isAttending,
    adults: adultsCount,
    kids: kidsCount,
    comment: (comment || '').trim().slice(0, 500),
    createdAt: new Date().toISOString(),
  });
  await saveRsvps(rsvps);

  res.json({ ok: true });
});

app.post('/api/host', checkHostPassword, async (req, res) => {
  const rsvps = await getRsvps();
  const totals = rsvps.reduce(
    (acc, r) => {
      if (r.attending) {
        acc.adults += r.adults;
        acc.kids += r.kids;
        acc.attendingCount += 1;
      } else {
        acc.declinedCount += 1;
      }
      return acc;
    },
    { adults: 0, kids: 0, attendingCount: 0, declinedCount: 0 }
  );

  res.json({
    rsvps: [...rsvps].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    totals,
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🎉 Party RSVP site running at http://localhost:${PORT}`);
});
