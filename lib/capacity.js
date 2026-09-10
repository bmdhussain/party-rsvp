const { pool } = require('./db');

// Capacity counts heads (adults + kids), not RSVP rows: a family of four fills
// four spots. `events.capacity` NULL means unlimited. A guest who says yes to a
// full event is recorded with status 'waitlist' rather than turned away, and is
// promoted in the order they replied once room frees up.

function parseCapacity(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = parseInt(value, 10);
  if (Number.isNaN(n) || n < 0) return null;
  return Math.min(n, 1000000);
}

// Accepts either the pool or a checked-out client, so callers inside a
// transaction count the same rows they're about to change.
async function confirmedHeadcount(db, eventId, excludeRsvpId = null) {
  const { rows } = await db.query(
    `SELECT COALESCE(SUM(adults + kids), 0)::int AS heads
     FROM rsvps
     WHERE event_id = $1 AND status = 'confirmed' AND ($2::uuid IS NULL OR id <> $2)`,
    [eventId, excludeRsvpId]
  );
  return rows[0].heads;
}

// Fills freed space from the waitlist, earliest reply first. A party too large
// for the remaining room is skipped rather than blocking everyone behind it —
// otherwise one family of six could stall a queue of singles indefinitely.
// Returns the promoted rows so the caller can notify them.
async function promoteFromWaitlist(eventId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: eventRows } = await client.query(
      'SELECT id, capacity FROM events WHERE id = $1 FOR UPDATE',
      [eventId]
    );
    if (!eventRows[0]) {
      await client.query('ROLLBACK');
      return [];
    }

    const { rows: waiting } = await client.query(
      `SELECT id, name, email, adults, kids FROM rsvps
       WHERE event_id = $1 AND status = 'waitlist'
       ORDER BY created_at ASC`,
      [eventId]
    );
    if (!waiting.length) {
      await client.query('ROLLBACK');
      return [];
    }

    const capacity = eventRows[0].capacity;
    let remaining = Infinity;
    if (capacity !== null) {
      remaining = capacity - (await confirmedHeadcount(client, eventId));
    }

    const promoted = [];
    for (const row of waiting) {
      const party = row.adults + row.kids;
      if (party > remaining) continue;
      promoted.push(row);
      remaining -= party;
    }

    if (promoted.length) {
      await client.query(`UPDATE rsvps SET status = 'confirmed' WHERE id = ANY($1::uuid[])`, [
        promoted.map((r) => r.id),
      ]);
    }
    await client.query('COMMIT');
    return promoted;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { parseCapacity, confirmedHeadcount, promoteFromWaitlist };
