// CSV export for the guest list.

// Excel, Sheets and Numbers all treat a leading =, +, - or @ as the start of a
// formula. Guest names and comments are attacker-controlled free text, so a
// value like "=HYPERLINK(...)" would execute when the host opens the export.
// Prefixing with an apostrophe makes the cell literal text.
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

function escapeCell(value) {
  if (value === null || value === undefined) return '';
  let str = typeof value === 'string' ? value : String(value);

  const neutralised = FORMULA_PREFIX.test(str);
  if (neutralised) str = `'${str}`;

  // Double up any quotes, then wrap if the value contains anything structural.
  // A neutralised value is always wrapped as well: the apostrophe alone stops
  // the formula in the spreadsheets we care about, but quoting makes the cell
  // unambiguously text to whatever parses it first.
  if (neutralised || /[",\r\n;]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

// CRLF line endings and a UTF-8 BOM: without the BOM, Excel on Windows mangles
// any non-ASCII guest name.
function toCsv(columns, rows) {
  const header = columns.map((c) => escapeCell(c.label)).join(',');
  const body = rows.map((row) => columns.map((c) => escapeCell(c.value(row))).join(','));
  return `﻿${[header, ...body].join('\r\n')}\r\n`;
}

function csvFilename(name, suffix) {
  const safe = String(name || 'event')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  return `${safe || 'event'}-${suffix}.csv`;
}

module.exports = { toCsv, escapeCell, csvFilename };
