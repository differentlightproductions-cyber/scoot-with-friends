import test from 'node:test';
import assert from 'node:assert/strict';
import { CITIES, LiveSky, conditionsAt, parseStation, phaseAt, sunAt, weatherFromCode, weatherFromStation } from '../src/park/liveSky';

// "Match Boulder City now" (#48): the time of day follows the real sun there,
// the weather follows Open-Meteo, and it still works offline.
const bc = CITIES['boulder-city'];
const pdt = (iso: string) => new Date(iso + '-07:00');

test('the real sun sets the time of day in Boulder City', () => {
  assert.equal(phaseAt(pdt('2026-06-21T12:30:00'), bc), 'day');
  assert.equal(phaseAt(pdt('2026-06-21T02:00:00'), bc), 'night');
  assert.equal(phaseAt(pdt('2026-06-21T19:45:00'), bc), 'sunset');
  assert.equal(phaseAt(pdt('2026-06-21T05:25:00'), bc), 'sunrise');
  assert.equal(phaseAt(new Date('2026-12-21T17:30:00-08:00'), bc), 'night', 'winter evenings (PST) are dark by 5:30');
  const noon = sunAt(pdt('2026-06-21T12:50:00'), bc).elevation;
  assert.ok(Math.abs(noon - (90 - bc.lat + 23.44)) < 1.5, `solstice noon ${noon}`);
});

test('weather codes map to Sunny, Rain and Snow; falling leaves stay in the Fall setting (#74)', () => {
  const june = pdt('2026-06-01T12:00:00'), october = pdt('2026-10-15T12:00:00');
  assert.equal(weatherFromCode(0, june, bc.timeZone), 'sunny');
  assert.equal(weatherFromCode(3, june, bc.timeZone), 'sunny');
  assert.equal(weatherFromCode(0, october, bc.timeZone), 'sunny');
  assert.equal(weatherFromCode(2, october, bc.timeZone), 'sunny');
  for (const code of [51, 61, 65, 81, 95, 99]) assert.equal(weatherFromCode(code, october, bc.timeZone), 'rain', `code ${code}`);
  for (const code of [71, 75, 77, 85, 86]) assert.equal(weatherFromCode(code, june, bc.timeZone), 'snow', `code ${code}`);
});

test('a live reading is used; offline falls back to a clear sky; the time needs no network', async () => {
  const now = pdt('2026-07-04T21:30:00');
  const ok = new LiveSky();
  const urls: string[] = [];
  ok.fetcher = async (url) => { urls.push(url); return new Response(JSON.stringify({ current: { weather_code: 63 } })); };
  assert.equal(ok.current(bc, now).source, 'loading');
  await new Promise((r) => setTimeout(r, 20));
  const live = ok.current(bc, new Date(now.getTime() + 2000));
  assert.deepEqual([live.source, live.weather, live.phase], ['live', 'rain', 'night']);
  assert.match(urls[0], /latitude=35\.978&longitude=-114\.832/);
  assert.doesNotMatch(urls[0], /key|token|user/i);

  const off = new LiveSky();
  off.fetcher = async () => { throw new Error('blocked'); };
  off.current(bc, now);
  await new Promise((r) => setTimeout(r, 20));
  const offline = off.current(bc, new Date(now.getTime() + 2000));
  assert.deepEqual([offline.source, offline.weather, offline.phase], ['offline', 'sunny', 'night']);
  assert.equal(offline.clock, '9:30 PM');
});

// An api.weather.gov observation, trimmed to the fields the park reads.
const observation = (at: string, over: Record<string, unknown> = {}) => ({ properties: {
  timestamp: at, textDescription: 'Blowing Dust',
  temperature: { unitCode: 'wmoUnit:degC', value: 31 }, windDirection: { unitCode: 'wmoUnit:degree_(angle)', value: 200 },
  windSpeed: { unitCode: 'wmoUnit:km_h-1', value: 46.44 }, windGust: { unitCode: 'wmoUnit:km_h-1', value: 75.6 },
  cloudLayers: [{ base: { value: 3000 }, amount: 'FEW' }, { base: { value: 6000 }, amount: 'SCT' }],
  presentWeather: [{ intensity: null, modifier: 'blowing', weather: 'dust', rawString: 'BLDU' }], ...over } });

test('the Boulder City airport station (KBVU): wind in m/s, cloud layers, blowing dust (#74)', () => {
  const now = pdt('2026-04-12T15:00:00'), s = parseStation(observation('2026-04-12T21:55:00+00:00'), now.getTime())!;
  assert.ok(Math.abs(s.wind! - 12.9) < 0.01 && Math.abs(s.gust! - 21) < 0.01 && s.from === 200 && s.temperature === 31);
  assert.equal(s.cloud, 0.45);
  assert.deepEqual(s.phenomena, ['blowing dust']);
  assert.equal(weatherFromStation(s), null);
  const c = conditionsAt({ code: 0, at: now.getTime(), cloud: 5, wind: 3, gust: 5, from: 90, temperature: 20 }, s, now, bc);
  assert.ok(c.dust >= 0.7, `dust ${c.dust}`);
  assert.equal(c.wind, s.wind, 'the station outranks the model while its report is fresh');
  assert.equal(c.observed, 'Blowing Dust');
  assert.ok(c.devils < 0.05, 'too windy for dust devils');
  // A three-hour-old report is stale: the model's calm wind is used instead.
  const later = conditionsAt({ code: 0, at: now.getTime(), cloud: 5, wind: 3, gust: 5, from: 90, temperature: 20 }, s, new Date(now.getTime() + 3 * 3600e3), bc);
  assert.equal(later.wind, 3);
  assert.equal(later.observed, null);
  assert.equal(weatherFromStation(parseStation(observation('2026-04-12T21:55:00+00:00', { presentWeather: [{ intensity: 'light', modifier: null, weather: 'rain' }] }))!), 'rain');
  assert.equal(parseStation({ nope: 1 }), null);
});

test('dust devils: hot, sunny, light-wind afternoons; never at night, in rain or in strong wind', () => {
  const afternoon = pdt('2026-07-10T14:30:00'), model = (o: Record<string, number> = {}) => ({ code: 0, at: afternoon.getTime(), cloud: 5, wind: 3, gust: 5, from: 180, temperature: 39, ...o });
  assert.ok(conditionsAt(model(), null, afternoon, bc).devils > 0.8);
  assert.equal(conditionsAt(model(), null, pdt('2026-07-10T23:30:00'), bc).devils, 0, 'night');
  assert.ok(conditionsAt(model({ wind: 11 }), null, afternoon, bc).devils < 0.01, 'windy');
  assert.equal(conditionsAt(model({ code: 63 }), null, afternoon, bc).devils, 0, 'rain');
  assert.ok(conditionsAt(model({ temperature: 18 }), null, afternoon, bc).devils < 0.01, 'cool');
  assert.ok(conditionsAt(model({ cloud: 90 }), null, afternoon, bc).devils < 0.01, 'overcast');
  // The station seeing them ("PO": dust/sand whirls) settles it.
  const seen = parseStation(observation('2026-07-10T21:20:00+00:00', { presentWeather: [{ weather: 'dust_whirls', rawString: 'PO' }], windSpeed: { value: 10 }, windGust: { value: null } }), afternoon.getTime())!;
  const c = conditionsAt(model(), seen, afternoon, bc);
  assert.equal(c.devils, 1);
  assert.equal(c.dust, 0, 'dust whirls are not blowing dust');
  // Gusts past about 30 mph raise dust even without a report.
  assert.ok(conditionsAt(model({ wind: 12, gust: 22 }), null, afternoon, bc).dust > 0.5);
});

test('both sources are asked for, and a station report of rain or snow sets the weather', async () => {
  const now = pdt('2026-01-20T10:00:00'), sky = new LiveSky(), urls: string[] = [];
  sky.fetcher = async (url) => { urls.push(url); return new Response(JSON.stringify(url.includes('weather.gov') ? observation('2026-01-20T17:50:00+00:00', { presentWeather: [{ intensity: 'light', weather: 'snow' }], textDescription: 'Light Snow' }) : { current: { weather_code: 3, cloud_cover: 100, wind_speed_10m: 4, wind_gusts_10m: 9, wind_direction_10m: 320, temperature_2m: 1 } })); };
  sky.current(bc, now);
  await new Promise((r) => setTimeout(r, 20));
  const live = sky.current(bc, new Date(now.getTime() + 2000));
  assert.equal(urls.length, 2);
  assert.match(urls[0], /open-meteo.*wind_gusts_10m/);
  assert.match(urls[1], /api\.weather\.gov\/stations\/KBVU\/observations\/latest/);
  assert.deepEqual([live.source, live.weather, live.conditions.observed], ['live', 'snow', 'Light Snow']);
});
