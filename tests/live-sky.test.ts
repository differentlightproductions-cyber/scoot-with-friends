import test from 'node:test';
import assert from 'node:assert/strict';
import { CITIES, LiveSky, phaseAt, sunAt, weatherFromCode } from '../src/park/liveSky';

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

test('weather codes map to the four weathers; dry autumn days are Fall', () => {
  const june = pdt('2026-06-01T12:00:00'), october = pdt('2026-10-15T12:00:00');
  assert.equal(weatherFromCode(0, june, bc.timeZone), 'sunny');
  assert.equal(weatherFromCode(3, june, bc.timeZone), 'sunny');
  assert.equal(weatherFromCode(0, october, bc.timeZone), 'fall');
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
