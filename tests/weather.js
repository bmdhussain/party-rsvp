// Weather on an event page. The upstream is stubbed throughout: a test that
// calls a live weather service is a test that fails on a Tuesday for reasons
// nobody can reproduce.

const weather = require('../lib/weather');
const { signIn, client, pool, uuid, slug } = require('./helpers');

function daysFromNow(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

async function run({ base, reporter }) {
  const { check, section } = reporter;
  const cookie = await signIn('weather-host', 'Weather Host');
  const host = client(base, cookie);
  const anon = client(base);

  section('Weather codes become something a guest can read');
  check('a clear day', weather.describeCode(0).label, 'Clear');
  check('a thunderstorm', weather.describeCode(95), { label: 'Thunderstorm', icon: 'storm' });
  check('a code nobody has seen still renders', weather.describeCode(7777).label, 'Mixed');

  section('Advice is given only when there is something to act on');
  check('storms get a plan', weather.advice({ code: 95, precipitationChance: 10, maxTemp: 20, minTemp: 12 }) !== null, true);
  check('likely rain gets a plan', weather.advice({ code: 61, precipitationChance: 70, maxTemp: 18, minTemp: 11 }) !== null, true);
  check('heat gets a plan', weather.advice({ code: 0, precipitationChance: 0, maxTemp: 34, minTemp: 24 }) !== null, true);
  check('a pleasant day is left alone', weather.advice({ code: 1, precipitationChance: 10, maxTemp: 22, minTemp: 13 }), null);

  section('A far-off date is never given a forecast');
  // Sixteen days is as far as the upstream goes; past that a number would be
  // invention, so the page gets typical values, labelled as typical.
  let asked = [];
  weather.clearCache();
  weather.setFetcher(async (url) => {
    asked.push(url);
    if (url.includes('archive-api')) {
      return { daily: { time: ['x'], temperature_2m_max: [24], temperature_2m_min: [14], precipitation_sum: [0] } };
    }
    return { daily: { time: ['2026-01-01'], weather_code: [0], temperature_2m_max: [21], temperature_2m_min: [11], precipitation_probability_max: [5] } };
  });

  const soon = await weather.weatherFor({ latitude: 51.5, longitude: -0.1, event_date: daysFromNow(3) });
  check('a date next week gets a real forecast', soon.kind, 'forecast');
  check('and it came from the forecast service', asked.some((u) => u.includes('api.open-meteo.com/v1/forecast')), true);

  asked = [];
  const distant = await weather.weatherFor({ latitude: 51.5, longitude: -0.1, event_date: daysFromNow(120) });
  check('a date in four months gets typical values instead', distant.kind, 'normals');
  check('and it never asked for a forecast', asked.some((u) => u.includes('v1/forecast?')), false);
  check('typical values say how many years they average', distant.years > 0, true);

  const past = await weather.weatherFor({ latitude: 51.5, longitude: -0.1, event_date: daysFromNow(-2) });
  check('an event that already happened gets nothing', past, null);
  check('an event with no coordinates gets nothing', await weather.weatherFor({ event_date: daysFromNow(3) }), null);

  section('An upstream failure loses the weather, not the page');
  weather.clearCache();
  weather.setFetcher(async () => { throw new Error('upstream is down'); });
  check('weatherFor returns nothing rather than throwing', await weather.weatherFor({ latitude: 1, longitude: 1, event_date: daysFromNow(2) }), null);
  check('place search returns nothing rather than throwing', await weather.searchPlaces('London'), []);

  section('The event page carries it, and only when there is a place');
  const evId = uuid();
  const evSlug = slug();
  await pool.query(
    `INSERT INTO events (id, slug, owner_id, name, event_date, location, published_at, visibility)
     VALUES ($1,$2,'weather-host','Garden Lunch',$3,'At Maya''s place', now(), 'public')`,
    [evId, evSlug, daysFromNow(4)]
  );
  let payload = await anon.json('GET', `/api/events/${evSlug}/public`);
  check('a free-text location alone gets no weather', payload.weather, null);
  check('and the page says no place has been set', payload.place, null);

  const saved = await host.json('PUT', `/api/events/${evId}/place`, {
    label: 'London, England, United Kingdom', latitude: 51.5072, longitude: -0.1276, timezone: 'Europe/London',
  });
  check('a host can attach a town', saved.place, 'London, England, United Kingdom');

  // The server answers from its own fixture, set in run.js.
  payload = await anon.json('GET', `/api/events/${evSlug}/public`);
  check('now the page gets a forecast', payload.weather.kind, 'forecast');
  check('with a reading a guest understands', payload.weather.label, 'Light rain');
  check('and advice, because rain is likely', payload.weather.advice !== null, true);

  section('Only the owner can move an event');
  const otherCookie = await signIn('weather-stranger', 'Someone Else');
  const other = client(base, otherCookie);
  check('a stranger cannot set the place', await other.status('PUT', `/api/events/${evId}/place`, { label: 'Paris', latitude: 48.85, longitude: 2.35 }), 404);
  check('nonsense coordinates are refused', await host.status('PUT', `/api/events/${evId}/place`, { label: 'Nowhere', latitude: 999, longitude: 0 }), 400);
  check('place search needs a signed-in host', await anon.status('GET', '/api/places?q=London'), 401);

  const cleared = await host.json('PUT', `/api/events/${evId}/place`, { label: null });
  check('and the host can take it off again', cleared.place, null);
  check('the weather goes with it', (await anon.json('GET', `/api/events/${evSlug}/public`)).weather, null);

  section('A town can be guessed from the browser, never from the visitor\u2019s address');
  check('a real zone yields its city', weather.townFromTimezone('Asia/Kolkata'), 'Kolkata');
  check('underscores become spaces', weather.townFromTimezone('America/New_York'), 'New York');
  check('a three-part zone still finds the city', weather.townFromTimezone('America/Argentina/Buenos_Aires'), 'Buenos Aires');
  check('an offset is not a place', weather.townFromTimezone('Etc/GMT+5'), null);
  check('neither is UTC', weather.townFromTimezone('UTC'), null);
  check('nor a country-shaped zone', weather.townFromTimezone('Japan'), null);
  check('nor nothing at all', weather.townFromTimezone(''), null);

  check('a retired zone name is translated', weather.canonicalZone('Asia/Calcutta'), 'Asia/Kolkata');
  check('and then yields the right city', weather.townFromTimezone('Asia/Calcutta'), 'Kolkata');
  check('Kiev becomes Kyiv', weather.townFromTimezone('Europe/Kiev'), 'Kyiv');

  // A name is not a place: there is a Calcutta in South Africa and a London in
  // Ohio. A suggestion only counts if the candidate's own zone is the one the
  // browser reported, and nothing is suggested otherwise.
  weather.clearCache();
  weather.setFetcher(async (url) => {
    if (!url.includes('geocoding-api')) return {};
    return {
      results: [
        { name: 'Calcutta', admin1: 'Mpumalanga', country: 'South Africa', latitude: -25.9, longitude: 31.1, timezone: 'Africa/Johannesburg', population: 35864 },
        { name: 'Kolkata', admin1: 'West Bengal', country: 'India', latitude: 22.57, longitude: 88.36, timezone: 'Asia/Kolkata', population: 4631392 },
      ],
    };
  });
  const india = await weather.suggestPlace('Asia/Calcutta');
  check('the wrong-continent namesake is not suggested', india.label.includes('India'), true);
  const nothing = await weather.suggestPlace('Pacific/Auckland');
  check('and when nothing is in the right zone, nothing is suggested', nothing, null);
  check('search puts the biggest place first', (await weather.searchPlaces('calcutta'))[0].label.includes('Kolkata'), true);

  const suggested = await host.json('GET', '/api/places/suggest?tz=Europe%2FLondon');
  check('the suggestion is a real place with coordinates', typeof suggested.latitude, 'number');
  check('a junk zone suggests nothing', await host.json('GET', '/api/places/suggest?tz=UTC'), null);
  check('suggestions need a signed-in host', await anon.status('GET', '/api/places/suggest?tz=Europe%2FLondon'), 401);

  section('Coordinates can be turned back into a town, on request');
  weather.clearCache();
  weather.setFetcher(async (url) => {
    if (!url.includes('bigdatacloud')) return {};
    return { city: 'Mumbai', locality: 'Mumbai', principalSubdivision: 'Maharashtra', countryName: 'India' };
  });
  const found = await weather.reverseGeocode(19.076, 72.877);
  check('it names the place', found.label, 'Mumbai, Maharashtra, India');
  check('and keeps the precise coordinates, not the town centre', [found.latitude, found.longitude], [19.076, 72.877]);
  check('impossible coordinates are refused before any lookup', await weather.reverseGeocode(999, 0), null);
  check('so are ones that are not numbers', await weather.reverseGeocode('here', 'there'), null);
  weather.setFetcher(async () => { throw new Error('down'); });
  check('an upstream failure returns nothing rather than throwing', await weather.reverseGeocode(19, 72), null);
  check('the lookup needs a signed-in host', await anon.status('GET', '/api/places/reverse?lat=19&lon=72'), 401);
  check('both forms offer the precise option', [
    (await host.text('/events/new')).includes('data-place-locate'),
    (await host.text(`/host/${evId}/settings`)).includes('data-place-locate'),
  ], [true, true]);

  section('A town can be set as the event is created');
  const born = await host.json('POST', '/api/events', {
    name: 'Rooftop Drinks',
    date: daysFromNow(5).toISOString().slice(0, 16),
    place: { label: 'Lisbon, Portugal', latitude: 38.72, longitude: -9.13, timezone: 'Europe/Lisbon' },
  });
  const bornView = await host.json('GET', `/api/events/${born.id}/host`);
  check('the new event already has its town', (bornView.event || bornView).place_label, 'Lisbon, Portugal');
  const noPlace = await host.json('POST', '/api/events', { name: 'No Town', date: daysFromNow(5).toISOString().slice(0, 16) });
  const noPlaceView = await host.json('GET', `/api/events/${noPlace.id}/host`);
  check('and skipping it is fine', (noPlaceView.event || noPlaceView).place_label, null);
  const junk = await host.json('POST', '/api/events', {
    name: 'Bad Coords', place: { label: 'Nowhere', latitude: 'abc', longitude: 5 },
  });
  const junkView = await host.json('GET', `/api/events/${junk.id}/host`);
  check('coordinates that are not coordinates are dropped, not stored', (junkView.event || junkView).place_label, null);
  check('the create form offers the picker', (await host.text('/events/new')).includes('data-place-input'), true);

  section('The host workspace can see what is set');
  await host.json('PUT', `/api/events/${evId}/place`, {
    label: 'London, England, United Kingdom', latitude: 51.5072, longitude: -0.1276, timezone: 'Europe/London',
  });
  const hostView = await host.json('GET', `/api/events/${evId}/host`);
  const evRow = hostView.event || hostView;
  check('the host endpoint reports the town', evRow.place_label, 'London, England, United Kingdom');
  check('the settings tab offers the picker', (await host.text(`/host/${evId}/settings`)).includes('place-search'), true);
}

module.exports = { run };
