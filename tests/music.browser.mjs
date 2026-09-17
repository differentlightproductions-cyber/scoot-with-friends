// Sesh Music journey test.
//
//   LAZER_URL=http://127.0.0.1:5174 node tests/music.browser.mjs
//
// Uses DEVELOPMENT-ONLY generated test tones written into public/music/tracks
// with a "ZZ Test Tone" prefix, and removes them (and re-syncs the catalog) when
// it finishes. These are not soundtrack content.
//
// Headless Chrome runs with autoplay allowed and a fake audio device, so this
// checks playback STATE (media element progress, status, volume ramps, saved
// preferences), not what a speaker produces. Real audio and device checks are
// separate and manual.
import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const url = process.env.LAZER_URL || 'http://127.0.0.1:5174';
const tracks = 'public/music/tracks';
const tone = (seconds, frequency) => {
  const rate = 8000, n = rate * seconds, data = Buffer.alloc(44 + n * 2);
  data.write('RIFF', 0); data.writeUInt32LE(36 + n * 2, 4); data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
  data.writeUInt32LE(rate, 24); data.writeUInt32LE(rate * 2, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34);
  data.write('data', 36); data.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) data.writeInt16LE(Math.round(Math.sin((i / rate) * frequency * Math.PI * 2) * 6000), 44 + i * 2);
  return data;
};
const fixtures = {
  'ZZ Test Tone - Ångström Café (Live).wav': tone(150, 440),
  'ZZ Test Tone - Second.wav': tone(150, 330),
  'ZZ Test Tone - Broken.mp3': Buffer.from('this is not audio'),
  'ZZ Test Tone - Hash #2.wav': tone(2, 600), // unservable name: must be left out with a warning
  'zz test tone second.wav': tone(2, 550), // same derived id as "Second": must be rejected
};
const sync = () => { const r = spawnSync(process.execPath, ['scripts/music-sync.mjs'], { encoding: 'utf8' }); return r.stdout + r.stderr; };
const cleanup = () => { for (const name of Object.keys(fixtures)) rmSync(join(tracks, name), { force: true }); sync(); };

const results = [];
const check = (label, ok, detail) => { results.push({ label, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${ok ? '' : ' ' + JSON.stringify(detail)}`); };

let browser;
try {
  for (const [name, data] of Object.entries(fixtures)) writeFileSync(join(tracks, name), data);
  let syncOutput = '';
  syncOutput = sync();
  const catalog = JSON.parse(readFileSync('public/music/catalog.json', 'utf8'));
  const ours = catalog.tracks.filter((t) => t.title.includes('Ångström') || t.artist === 'ZZ Test Tone');
  check('Catalog sync picks up dropped files without code changes', ours.length === 3, ours.map((t) => t.file));
  check('A file name with # is left out with a rename warning', !catalog.tracks.some((t) => t.title.includes('Hash')) && syncOutput.includes('Hash #2'), syncOutput);
  check('Duplicate derived id is reported and left out', catalog.tracks.filter((t) => t.id === 'zz-test-tone-second').length === 1, syncOutput);
  const unicode = ours.find((t) => t.title.includes('Ångström'));
  check('Artist/title come from the file name', unicode?.artist === 'ZZ Test Tone' && unicode?.title === 'Ångström Café (Live)', unicode);
  check('File URL is encoded (spaces, Unicode)', unicode?.file === '/music/tracks/' + encodeURIComponent('ZZ Test Tone - Ångström Café (Live).wav'), unicode?.file);

  browser = await chromium.launch({
    executablePath: process.env.BROWSER_EXECUTABLE || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--use-fake-device-for-media-stream'],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const media = await page.request.get(url + unicode.file);
  check('Track URL serves audio, not the HTML fallback', media.ok() && !(media.headers()['content-type'] ?? '').includes('html'), media.headers()['content-type']);

  const boot = async () => {
    await page.goto(url + '/?map=outdoor');
    await page.waitForFunction(() => window.__LAZER?.music?.catalogLoaded, null, { timeout: 90000 });
    await page.evaluate(async () => { const g = window.__LAZER; g.testing(true); await g.startSession('outdoor', true); g.advance(0.5, {}, false); });
  };
  await boot();
  // The live game loop (keyboard, wheel, pause) only runs outside test mode.
  await page.evaluate(() => window.__LAZER.testing(false));
  const state = () => page.evaluate(() => { const m = window.__LAZER.music; return { status: m.status, id: m.current?.id, title: m.current?.title, time: m.position, volume: m.settings.volume, audioVolume: m.audio.volume, open: window.__LAZER.musicPlayer.open }; });
  const waitFor = (fn, arg, timeout = 15000) => page.waitForFunction(fn, arg, { timeout, polling: 50 });

  // ---- Open from the pause menu (the Sesh menu) --------------------------------
  await page.evaluate(() => window.__LAZER.hud.setPaused(true));
  await page.click('[data-action="music"]');
  await waitFor(() => window.__LAZER.musicPlayer.open && !document.querySelector('#sesh-music').hidden);
  check('Music opens from the Sesh pause menu', (await state()).open);
  await page.screenshot({ path: 'artifacts/music/now-playing-empty-selection.png' }).catch(() => {});

  // ---- Tracks page: choose a track ---------------------------------------------
  await page.click('#sesh-music [data-page="tracks"]');
  await page.click(`#sesh-music [data-id="${unicode.id}"]`);
  await waitFor((id) => { const m = window.__LAZER.music; return m.status === 'playing' && m.current?.id === id && m.position > 0.5; }, unicode.id);
  check('Choosing a track plays it', true, await state());
  await page.screenshot({ path: 'artifacts/music/tracks.png' });

  // Selecting the track already playing does not restart it.
  const before = (await state()).time;
  await page.click(`#sesh-music [data-id="${unicode.id}"]`);
  await page.waitForTimeout(400);
  check('Re-selecting the playing track does not restart it', (await state()).time >= before, { before, after: (await state()).time });

  // ---- Next: fade out, switch, fade in ------------------------------------------------
  await page.click('#sesh-music [data-page="now"]');
  const target = (await state()).volume;
  await page.click('#sesh-music [data-music="next"]');
  const samples = [];
  for (let i = 0; i < 40; i++) { samples.push(await state()); await page.waitForTimeout(50); }
  const outgoing = samples.filter((s) => s.id === unicode.id).map((s) => s.audioVolume);
  const incoming = samples.filter((s) => s.id !== unicode.id).map((s) => s.audioVolume);
  check('Skipping fades the outgoing track out', outgoing.length > 3 && Math.min(...outgoing) < target * 0.5 && outgoing[0] > outgoing.at(-1), outgoing.map((v) => +v.toFixed(2)));
  check('The incoming track fades in', incoming.length > 3 && incoming[0] < target * 0.5 && Math.max(...incoming) > incoming[0], incoming.map((v) => +v.toFixed(2)));
  await waitFor((id) => window.__LAZER.music.status === 'playing' && window.__LAZER.music.current?.id !== id, unicode.id);
  await page.screenshot({ path: 'artifacts/music/now-playing.png' });

  // ---- Controller shortcuts do not leak into gameplay -----------------------------------
  await page.evaluate(() => window.__LAZER.hud.setPaused(false));
  await page.evaluate(() => { const g = window.__LAZER; g.sim.reset(0, true); g.sim.walking = true; window.__events = []; g.events.on((e) => window.__events.push(e.type)); });
  await page.waitForTimeout(300);
  const pos0 = await page.evaluate(() => window.__LAZER.sim.position.toArray());
  await page.keyboard.press('KeyX'); // X: play/pause while the player owns input
  await waitFor(() => window.__LAZER.music.status === 'paused');
  await page.keyboard.press('Space'); // A on the focused control
  await page.keyboard.press('KeyE'); // RB: next
  await page.waitForTimeout(600);
  const leaks = await page.evaluate(() => window.__events.filter((t) => ['pop', 'push', 'marker', 'playerEmote', 'trick'].includes(t)));
  check('X toggles play/pause while the panel is open', true);
  check('Panel-open A/X/RB trigger no hop, push, trick or marker', leaks.length === 0, leaks);

  // ---- Volume slider, shared with Settings ------------------------------------------------
  await page.evaluate(() => { const s = document.querySelector('#sesh-music [data-music="volume"]'); s.value = '35'; s.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.click('#sesh-music [data-page="settings"]');
  const settingsVolume = await page.$eval('#sesh-music [data-music="volume"]', (s) => s.value);
  check('Settings shows the same music volume', settingsVolume === '35', settingsVolume);
  await page.screenshot({ path: 'artifacts/music/settings.png' });

  // ---- Close, ride, still playing; reopen without duplicates ------------------------------
  await page.click('#sesh-music [data-page="now"]');
  if ((await state()).status !== 'playing') await page.click('#sesh-music [data-music="play"]');
  await waitFor(() => { const m = window.__LAZER.music; return m.status === 'playing' && m.position > 0.3 && m.audio.volume > 0; });
  const playingId = (await state()).id;
  await page.keyboard.press('Escape');
  await waitFor(() => !window.__LAZER.musicPlayer.open);
  await page.waitForTimeout(250);
  const esc = await page.evaluate(() => ({ paused: window.__LAZER.hud.paused }));
  check('Closing with Escape does not also open the pause menu', !esc.paused, esc);
  const t1 = (await state()).time;
  await page.evaluate(() => { const g = window.__LAZER; g.sim.walking = false; g.advance(1.2, { lean: -1 }, false); });
  await page.waitForTimeout(700);
  const s2 = await state();
  check('Music keeps playing after closing and riding', s2.status === 'playing' && s2.id === playingId && s2.time > t1, { t1, s2 });
  const elements = await page.evaluate(() => document.querySelectorAll('audio').length);
  await page.evaluate(() => window.__LAZER.musicPlayer.show());
  await page.waitForTimeout(200);
  check('Reopening does not add a second player', (await page.evaluate(() => document.querySelectorAll('#sesh-music').length)) === 1 && elements === 0, { elements });
  await page.keyboard.press('Escape');

  // ---- On-foot quick wheel: Music entry opens the same player -----------------------
  // Holding D-Pad Left is not reproducible with headless keyboard events, so this
  // uses the wheel's real option list and action (the hold-to-open code is unchanged).
  const wheel = await page.evaluate(() => { const g = window.__LAZER; g.sim.walking = true; const options = g.social.rootOptions(g.sim); const labels = options.map((o) => o.label); options.find((o) => o.label === 'Music')?.action(); return { labels, open: g.musicPlayer.open, playing: g.music.status }; });
  check('On-foot quick wheel offers Music and opens the same player', wheel.labels.includes('Music') && wheel.open && wheel.playing === 'playing', wheel);
  await page.keyboard.press('Escape');
  await waitFor(() => !window.__LAZER.musicPlayer.open);

  // ---- Map change keeps the same track going ------------------------------------------
  const tMap = (await state()).time;
  await page.evaluate(async () => { await window.__LAZER.startSession('techno_gravity', true); });
  await page.waitForTimeout(800);
  const s3 = await state();
  check('Changing maps does not restart the music', s3.status === 'playing' && s3.id === playingId && s3.time >= tMap, { tMap, s3 });

  // ---- Broken track: unavailable, then the next valid track ---------------------------
  const broken = catalog.tracks.find((t) => t.title === 'Broken');
  await page.evaluate((id) => window.__LAZER.music.select(id), broken.id);
  await waitFor((id) => { const m = window.__LAZER.music; return m.unavailable.has(id) && m.status === 'playing' && m.current?.id !== id; }, broken.id, 20000);
  check('A broken file is marked unavailable and playback moves on', true, await state());

  // ---- Reload: preferences restored, nothing autoplays ----------------------------------
  await page.evaluate(() => window.__LAZER.music.pause());
  const saved = await state();
  await page.waitForTimeout(300);
  await boot();
  const restored = await state();
  check('Reload restores the last track and volume', restored.id === saved.id && Math.abs(restored.volume - 0.35) < 0.001, { saved, restored });
  check('Reload does not start playback by itself (resume setting off)', restored.status !== 'playing', restored);

  // ---- Removed track falls back safely ---------------------------------------------------
  rmSync(join(tracks, 'ZZ Test Tone - Second.wav'), { force: true });
  rmSync(join(tracks, 'ZZ Test Tone - Ångström Café (Live).wav'), { force: true });
  sync();
  await boot();
  const fallback = await state();
  check('A removed saved track falls back without crashing', fallback.status !== 'playing' && !['Second', 'Ångström Café (Live)'].includes(fallback.title), fallback);

  // ---- Empty library ------------------------------------------------------------------------
  cleanup();
  const others = JSON.parse(readFileSync('public/music/catalog.json', 'utf8')).tracks.length;
  await boot();
  await page.evaluate(() => window.__LAZER.musicPlayer.show());
  const emptyText = await page.$eval('#sesh-music', (n) => n.textContent);
  if (others === 0) check('Empty library says "No music added yet." and the game runs', emptyText.includes('No music added yet.') && (await page.evaluate(() => window.__LAZER.sim.position.y > -5)), emptyText.slice(0, 80));
  check('No page errors', errors.length === 0, errors);
} finally {
  if (browser) await browser.close();
  try { cleanup(); } catch {}
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exitCode = failed.length ? 1 : 0;
