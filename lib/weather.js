// Weather for an event, from Open-Meteo: free, no API key, and licensed
// CC-BY-4.0, which the event page honours with a visible credit.
//
// Two different questions get two different answers. Inside the forecast
// window there is a real forecast for that day. Beyond it there is no forecast
// worth showing, so we say what that date is usually like at that place,
// averaged from the same week in previous years, and label it as such. Saying
// "22°C and clear" about a date four months out would be a lie with a number
// attached.

const FORECAST_DAYS = 16;
const NORMALS_YEARS = 5;
const FORECAST_TTL_MS = 3 * 60 * 60 * 1000;
const NORMALS_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// WMO weather codes, grouped into the handful of distinctions a host planning
// an event actually cares about.
const CODES = {
  0: ['Clear', 'sun'],
  1: ['Mostly clear', 'sun'],
  2: ['Partly cloudy', 'cloud-sun'],
  3: ['Overcast', 'cloud'],
  45: ['Fog', 'fog'], 48: ['Freezing fog', 'fog'],
  51: ['Light drizzle', 'drizzle'], 53: ['Drizzle', 'drizzle'], 55: ['Heavy drizzle', 'drizzle'],
  56: ['Freezing drizzle', 'sleet'], 57: ['Freezing drizzle', 'sleet'],
  61: ['Light rain', 'rain'], 63: ['Rain', 'rain'], 65: ['Heavy rain', 'rain'],
  66: ['Freezing rain', 'sleet'], 67: ['Freezing rain', 'sleet'],
  71: ['Light snow', 'snow'], 73: ['Snow', 'snow'], 75: ['Heavy snow', 'snow'],
  77: ['Snow grains', 'snow'],
  80: ['Rain showers', 'rain'], 81: ['Rain showers', 'rain'], 82: ['Heavy showers', 'rain'],
  85: ['Snow showers', 'snow'], 86: ['Snow showers', 'snow'],
  95: ['Thunderstorm', 'storm'], 96: ['Thunderstorm with hail', 'storm'], 99: ['Thunderstorm with hail', 'storm'],
};

function describeCode(code) {
  const hit = CODES[code];
  return hit ? { label: hit[0], icon: hit[1] } : { label: 'Mixed', icon: 'cloud' };
}

// Whether a host should be told to plan for weather, rather than just shown a
// number. Only ever advisory, and never for a date we are guessing about.
function advice({ code, precipitationChance, maxTemp, minTemp }) {
  if ([95, 96, 99].includes(code)) return 'Thunderstorms are forecast — have an indoor option.';
  if (precipitationChance >= 60) return 'Rain looks likely. Worth planning cover.';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Snow is forecast — think about how people will travel.';
  if (maxTemp >= 32) return 'It will be hot. Shade and water go a long way.';
  if (minTemp <= 2) return 'It will be cold. Warn guests, or plan to be indoors.';
  return null;
}

const cache = new Map();

function cached(key, ttl, fetcher) {
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.value;
  const value = fetcher().catch((err) => {
    cache.delete(key);
    throw err;
  });
  cache.set(key, { value, until: Date.now() + ttl });
  return value;
}

function clearCache() {
  cache.clear();
}

// Injected so tests never reach the network, and so a failure here is a missing
// weather line rather than a broken event page.
let fetchJson = async (url) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`weather upstream ${res.status}`);
  return res.json();
};

function setFetcher(fn) {
  fetchJson = fn;
}

// The tests run the real server in its own process, so a stub set from the test
// process cannot reach it. WEATHER_FIXTURE is the seam: set it and the module
// answers from canned JSON instead of the network. It does nothing unless the
// variable is explicitly set, which no deployment does.
if (process.env.WEATHER_FIXTURE) {
  const fixture = JSON.parse(process.env.WEATHER_FIXTURE);
  setFetcher(async (url) => {
    if (url.includes('geocoding-api')) return fixture.geocode || { results: [] };
    if (url.includes('archive-api')) return fixture.archive || {};
    return fixture.forecast || {};
  });
}

function isoDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function daysUntil(dateIso) {
  const today = new Date(new Date().toISOString().slice(0, 10));
  const then = new Date(dateIso);
  return Math.round((then - today) / 86400000);
}

async function forecastFor({ latitude, longitude, date, timezone }) {
  const day = isoDate(date);
  const key = `f:${latitude},${longitude},${day}`;
  const data = await cached(key, FORECAST_TTL_MS, () =>
    fetchJson(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
        `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
        `&timezone=${encodeURIComponent(timezone || 'auto')}&start_date=${day}&end_date=${day}`
    )
  );
  const d = data && data.daily;
  if (!d || !d.time || !d.time.length) return null;
  const code = d.weather_code[0];
  const out = {
    kind: 'forecast',
    date: d.time[0],
    code,
    maxTemp: Math.round(d.temperature_2m_max[0]),
    minTemp: Math.round(d.temperature_2m_min[0]),
    precipitationChance: d.precipitation_probability_max[0] ?? null,
    ...describeCode(code),
  };
  out.advice = advice(out);
  return out;
}

// What that week is usually like, from the same dates in previous years. It is
// a typical value, not a prediction, and the page says so.
async function normalsFor({ latitude, longitude, date, timezone }) {
  const day = isoDate(date);
  const key = `n:${latitude},${longitude},${day}`;
  return cached(key, NORMALS_TTL_MS, async () => {
    const target = new Date(day);
    const thisYear = new Date().getUTCFullYear();
    const highs = [];
    const lows = [];
    let wet = 0;
    let counted = 0;
    for (let i = 1; i <= NORMALS_YEARS; i++) {
      const y = target.getUTCFullYear() - i;
      const start = new Date(Date.UTC(y, target.getUTCMonth(), target.getUTCDate() - 3));
      const end = new Date(Date.UTC(y, target.getUTCMonth(), target.getUTCDate() + 3));
      if (y > thisYear) continue;
      let data;
      try {
        data = await fetchJson(
          `https://archive-api.open-meteo.com/v1/archive?latitude=${latitude}&longitude=${longitude}` +
            `&start_date=${start.toISOString().slice(0, 10)}&end_date=${end.toISOString().slice(0, 10)}` +
            `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=${encodeURIComponent(timezone || 'auto')}`
        );
      } catch {
        continue;
      }
      const d = data && data.daily;
      if (!d || !d.time) continue;
      d.temperature_2m_max.forEach((v) => v != null && highs.push(v));
      d.temperature_2m_min.forEach((v) => v != null && lows.push(v));
      d.precipitation_sum.forEach((v) => {
        if (v == null) return;
        counted += 1;
        if (v >= 1) wet += 1;
      });
    }
    if (!highs.length) return null;
    const mean = (xs) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
    return {
      kind: 'normals',
      date: day,
      years: NORMALS_YEARS,
      maxTemp: mean(highs),
      minTemp: mean(lows),
      wetDayChance: counted ? Math.round((wet / counted) * 100) : null,
    };
  });
}

// The one entry point a page uses. Returns null rather than throwing, because a
// missing weather line must never be the reason an invitation fails to load.
async function weatherFor(event) {
  if (!event || event.latitude == null || event.longitude == null || !event.event_date) return null;
  const day = isoDate(event.event_date);
  if (!day) return null;
  const away = daysUntil(day);
  if (away < 0) return null; // the event has happened; the forecast is history
  try {
    if (away <= FORECAST_DAYS) {
      return await forecastFor({ ...event, date: day });
    }
    return await normalsFor({ ...event, date: day });
  } catch {
    return null;
  }
}

// Place search for the host's own picker. Open-Meteo's geocoder answers on
// settlement names, so this is a town-or-city lookup, not an address lookup —
// which is the honest thing to call it in the interface too.
async function searchPlaces(query) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];
  let data;
  try {
    data = await fetchJson(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&format=json`
    );
  } catch {
    return [];
  }
  return (data.results || []).map((r) => ({
    label: [r.name, r.admin1, r.country].filter(Boolean).join(', '),
    latitude: r.latitude,
    longitude: r.longitude,
    timezone: r.timezone || null,
  }));
}

module.exports = {
  weatherFor, forecastFor, normalsFor, searchPlaces,
  describeCode, advice, daysUntil, isoDate,
  setFetcher, clearCache,
  FORECAST_DAYS, CODES,
};
