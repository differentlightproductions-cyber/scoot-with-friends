// Now Playing: the Sesh (pause) menu player and the riding HUD chip.
//
//   LAZER_URL=http://127.0.0.1:5174 CHROME_PATH=... node tests/now-playing.browser.mjs
//
// Uses the first track of the real catalog (public/music/tracks). Headless
// Chrome runs with autoplay allowed, so this checks playback STATE and what the
// two views show, not what a speaker produces.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const url = process.env.LAZER_URL || 'http://127.0.0.1:5174';
const out = process.env.OUT || 'artifacts/now-playing';
mkdirSync(out, { recursive: true });
const results = [];
const check = (label, ok, detail) => { results.push({ label, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${label} ${JSON.stringify(detail ?? '')}`); };

const browser = await chromium.launch({
  executablePath: process.env.BROWSER_EXECUTABLE || process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--use-fake-device-for-media-stream', '--mute-audio'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url + '/?map=outdoor');
  await page.waitForFunction(() => window.__LAZER?.music?.catalogLoaded, null, { timeout: 90000 });
  await page.evaluate(async () => { const g = window.__LAZER; g.testing(true); await g.startSession('outdoor', true); g.advance(0.5, {}, false); g.testing(false); });
  const view = () => page.evaluate(() => {
    const chip = document.querySelector('#now-playing'), player = document.querySelector('#pause .np-player'), m = window.__LAZER.music;
    const box = (el) => { const r = el?.getBoundingClientRect(); return r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), bottom: Math.round(r.bottom) } : null; };
    const inside = (el) => { const r = el?.getBoundingClientRect(), p = el?.parentElement?.getBoundingClientRect(); return !!r && !!p && r.left >= p.left - 1 && r.right <= p.right + 1 && r.top >= p.top - 1 && r.bottom <= p.bottom + 1; };
    return {
      status: m.status, id: m.current?.id, title: m.current?.title, artist: m.current?.artist, time: m.position,
      chip: { shown: !chip.hidden && getComputedStyle(chip).display !== 'none', title: chip.querySelector('b').textContent, artist: chip.querySelector('small').textContent, box: box(chip) },
      player: { title: player.querySelector('.np-title').textContent, artist: player.querySelector('.np-artist').textContent, toggle: player.querySelector('[data-action="music-toggle"]').textContent, progress: +getComputedStyle(player).getPropertyValue('--np-progress') || 0, box: box(player), fits: [...player.querySelectorAll('.np-title,.np-artist,.np-controls')].every(inside) },
      viewport: { w: innerWidth, h: innerHeight },
    };
  });
  // Waits for the live loop to draw `n` more frames (software rendering can take far longer than 16 ms a frame).
  const frames = async (n = 3) => {
    const start = await page.evaluate(() => window.__LAZER.renderer.info.render.frame);
    await page.waitForFunction(([s, k]) => window.__LAZER.renderer.info.render.frame >= s + k, [start, n], { timeout: 120000, polling: 50 });
  };
  // Software rendering makes a full-page capture slow while the live loop runs.
  const shot = (name) => page.screenshot({ path: out + '/' + name + '.png', timeout: 120000 });

  let v = await view();
  // Idle: either nothing chosen yet, or the remembered track waiting behind a play button.
  check('Not playing: no chip; the pause player shows nothing or the waiting track with play', !v.chip.shown && v.status !== 'playing' && (v.player.title === 'Nothing playing' || (v.player.title === v.title && v.player.toggle === '▶')), { status: v.status, chip: v.chip.shown, player: v.player });

  await page.evaluate(async () => { const m = window.__LAZER.music; m.select(m.tracks[0].id); await m.play(); });
  await page.waitForFunction(() => window.__LAZER.music.status === 'playing' && window.__LAZER.music.position > 0.3, null, { timeout: 20000 });
  await frames();
  v = await view();
  check('Playing while riding: the chip shows title and artist', v.chip.shown && v.chip.title === v.title && v.chip.artist === v.artist, v.chip);
  check('The chip sits in the bottom-right corner, on screen', v.chip.box && v.chip.box.right <= v.viewport.w && v.chip.box.bottom <= v.viewport.h && v.chip.box.x > v.viewport.w / 2 && v.chip.box.y > v.viewport.h / 2, v.chip.box);
  await shot('riding-chip');

  // Pause: the menu player takes over, the chip hides.
  await page.evaluate(() => window.__LAZER.hud.setPaused(true));
  await frames();
  v = await view();
  check('Pause menu shows the same track with a pause button', v.player.title === v.title && v.player.artist === v.artist && v.player.toggle === '❚❚', v.player);
  check('The chip hides over the pause menu', !v.chip.shown, v.chip);
  check('Pause player text and controls stay inside its box', v.player.fits, v.player.box);
  const p1 = v.player.progress;
  await page.waitForTimeout(1200);
  await frames();
  v = await view();
  check('Progress bar advances', v.player.progress > p1, { before: p1, after: v.player.progress });
  await shot('pause-player');

  // Controls: play / pause and next from the menu buttons.
  await page.click('#pause [data-action="music-toggle"]');
  await page.waitForFunction(() => window.__LAZER.music.status === 'paused', null, { timeout: 5000 });
  await frames();
  v = await view();
  check('Play/pause button pauses and shows play', v.status === 'paused' && v.player.toggle === '▶', { status: v.status, toggle: v.player.toggle });
  const first = v.id;
  await page.click('#pause [data-action="music-next"]');
  await page.waitForFunction((id) => window.__LAZER.music.current?.id !== id, first, { timeout: 8000 });
  await frames();
  v = await view();
  check('Next moves to another track and the player follows', v.id !== first && v.player.title === v.title, { first, now: v.id, title: v.player.title });
  await page.evaluate(async () => { await window.__LAZER.music.play(); });
  await page.waitForFunction(() => window.__LAZER.music.status === 'playing', null, { timeout: 8000 });

  // Resume: the chip is back; the phone hides it again.
  await page.evaluate(() => window.__LAZER.hud.setPaused(false));
  await frames();
  v = await view();
  check('Resume riding: the chip returns with the new track', v.chip.shown && v.chip.title === v.title, v.chip);
  await page.evaluate(() => { const g = window.__LAZER; g.phone.open(); });
  await frames(4);
  v = await view();
  check('The phone hides the chip', !v.chip.shown, v.chip);
  await page.evaluate(() => window.__LAZER.phone.close());
  await frames(4);
  // Paused music: no chip while riding.
  await page.evaluate(async () => { await window.__LAZER.music.pause(); });
  await frames();
  v = await view();
  check('Paused music: no chip while riding', !v.chip.shown, { status: v.status, chip: v.chip.shown });
  check('No page errors', errors.length === 0, errors);
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
