// QR codes, drawn on the server as SVG.
//
// This used to be a browser library loaded from a CDN, at a path that didn't
// exist — so every QR code on the site silently rendered nothing. Doing it here
// means no third-party dependency, no blank square if a CDN is blocked, a code
// that appears even with JavaScript off, and crisp edges at any size (it
// matters on the printable poster).

const qrcode = require('./vendor/qrcode-generator');

const LEVELS = new Set(['L', 'M', 'Q', 'H']);
// Comfortably under the format's limit for a URL, and a sane cap on what a
// query string may ask us to encode.
const MAX_LENGTH = 800;

function svgFor(text, { level = 'M', margin = 2, dark = '#37243d', light = '#ffffff' } = {}) {
  const data = String(text == null ? '' : text);
  if (!data || data.length > MAX_LENGTH) return null;

  const qr = qrcode(0, LEVELS.has(level) ? level : 'M');
  qr.addData(data);
  try {
    qr.make();
  } catch (err) {
    // Thrown when the data can't fit any version at this error-correction level.
    return null;
  }

  const count = qr.getModuleCount();
  const size = count + margin * 2;

  // One path for every dark module, rather than thousands of <rect> elements:
  // a fraction of the bytes, and it scales to any size without blurring.
  let path = '';
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (qr.isDark(row, col)) path += `M${col + margin} ${row + margin}h1v1h-1z`;
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" shape-rendering="crispEdges" role="img" aria-label="QR code">` +
    `<rect width="${size}" height="${size}" fill="${light}"/>` +
    `<path d="${path}" fill="${dark}"/>` +
    `</svg>`;
}

module.exports = { svgFor, MAX_LENGTH };
