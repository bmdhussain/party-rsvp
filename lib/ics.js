// Minimal RFC 5545 calendar output, so "Add to calendar" works in Apple
// Calendar, Google Calendar and Outlook without a dependency.

// The events table stores a start time but no duration, so a calendar entry has
// to assume one. Two hours reads as a normal gathering without blocking out
// someone's whole evening.
const DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000;

function escapeText(value) {
  return String(value == null ? '' : value)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

function toIcsUtc(date) {
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(
    date.getUTCDate()
  ).padStart(2, '0')}T${String(date.getUTCHours()).padStart(2, '0')}${String(
    date.getUTCMinutes()
  ).padStart(2, '0')}${String(date.getUTCSeconds()).padStart(2, '0')}Z`;
}

// RFC 5545 caps a content line at 75 octets; the remainder continues on the
// next line behind a single space. The limit counts bytes rather than
// characters, so an emoji in an event name must not be sliced down the middle.
function foldLine(line) {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;

  const chunks = [];
  let start = 0;
  let limit = 75;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // 10xxxxxx marks a UTF-8 continuation byte: walk back off the middle of a
    // character before cutting.
    while (end > start + 1 && end < bytes.length && (bytes[end] & 0xc0) === 0x80) {
      end -= 1;
    }
    chunks.push(bytes.subarray(start, end).toString('utf8'));
    start = end;
    limit = 74; // continuation lines spend one octet on the leading space
  }
  return chunks.join('\r\n ');
}

// Returns null when the event has no date — there's no valid VEVENT to make.
function buildEventIcs({ event, url, uid }) {
  if (!event.event_date) return null;
  const start = new Date(event.event_date);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + DEFAULT_DURATION_MS);

  const description = [event.description, url && `RSVP: ${url}`].filter(Boolean).join('\n\n');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//RSVPfor//Invitation//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${escapeText(uid)}`,
    `DTSTAMP:${toIcsUtc(new Date())}`,
    `DTSTART:${toIcsUtc(start)}`,
    `DTEND:${toIcsUtc(end)}`,
    `SUMMARY:${escapeText(event.name)}`,
    event.location ? `LOCATION:${escapeText(event.location)}` : null,
    description ? `DESCRIPTION:${escapeText(description)}` : null,
    url ? `URL:${escapeText(url)}` : null,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);

  // CRLF throughout, and a trailing break — Outlook is the fussiest about both.
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}

// Calendar clients will happily save a file called "Sam's 30th?.ics"; servers
// and shells are less forgiving, so reduce it to something plain.
function icsFilename(name) {
  const safe = String(name || 'event')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${safe || 'event'}.ics`;
}

module.exports = { buildEventIcs, icsFilename, escapeText, foldLine, toIcsUtc, DEFAULT_DURATION_MS };
