const fs = require('fs');
const path = require('path');

// Uses Replit DB when available (i.e. running on Replit). Falls back to a
// local JSON file otherwise, so the same code also runs on any other host
// or on your own machine during development.
const DATA_FILE = path.join(__dirname, '..', 'data', 'rsvps.json');

let replitDb = null;
if (process.env.REPLIT_DB_URL) {
  const Database = require('@replit/database');
  replitDb = new Database();
}

function ensureLocalFile() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]');
}

async function getRsvps() {
  if (replitDb) {
    const list = await replitDb.get('rsvps');
    return list || [];
  }
  ensureLocalFile();
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

async function saveRsvps(list) {
  if (replitDb) {
    await replitDb.set('rsvps', list);
    return;
  }
  ensureLocalFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2));
}

module.exports = { getRsvps, saveRsvps };
