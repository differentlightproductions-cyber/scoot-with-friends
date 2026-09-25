// Sound settings (#71): SOUND plus MASTER, MUSIC, EFFECTS, AMBIENCE and UI
// SOUNDS sliders. Left/right steps a slider by 5, A steps up by 10 and wraps to
// silent; levels apply to the mix at once and are saved. MUSIC is the phone
// MUSIC app's own level, and MASTER turns the music down with everything else.
//   LAZER_URL=http://127.0.0.1:5195 BROWSER_EXECUTABLE=... node tests/sound-settings.browser.mjs
import { chromium } from 'playwright';
const url = process.env.LAZER_URL || 'http://127.0.0.1:5186';
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || process.env.CHROME_PATH, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const results = [];
const check = (label, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${label} ${JSON.stringify(detail)}`); };
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } }), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url + '/?map=outdoor');
  await page.waitForFunction(() => window.__LAZER?.startSession, null, { timeout: 900000 });
  const rows = await page.evaluate(async () => {
    const g = window.__LAZER; g.testing(true); await g.audio.start();
    g.menu.root.hidden = false; g.menu.show('settings-audio');
    window.__rows = () => [...g.menu.root.querySelectorAll('.menu-grid button, .menu-grid [role=button], .menu-grid .choice')].map((b) => b.textContent.replace(/\s+/g, ' ').trim());
    window.__row = (name) => g.menu.choices.findIndex((c) => new RegExp('^' + name).test(c.label));
    return g.menu.choices.map((c) => c.label);
  });
  check('Six rows: SOUND, MASTER, MUSIC, EFFECTS, AMBIENCE, UI SOUNDS', ['SOUND', 'MASTER', 'MUSIC', 'EFFECTS', 'AMBIENCE', 'UI SOUNDS'].every((n, i) => rows[i]?.toUpperCase().startsWith(n)), rows);

  const master = await page.evaluate(() => {
    const g = window.__LAZER, m = g.menu;
    m.index = __row('MASTER'); m.move(0, -1); m.move(0, -1);
    const saved = JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => /profile/i.test(k)) ?? '') ?? 'null');
    return { label: m.choices[m.index].label, settings: g.profile.settings.volumes.master, engine: g.audio.volumes.master, music: g.music.master, saved: saved?.settings?.volumes?.master ?? null, meter: m.choices[m.index].extra?.meter };
  });
  check('Left twice on MASTER: 90%, the mix and the music follow, and it is saved', /90%/.test(master.label) && master.settings === 90 && Math.abs(master.engine - 0.9) < 1e-6 && Math.abs(master.music - 0.9) < 1e-6 && master.saved === 90 && master.meter?.[0] === 90, master);

  const wrap = await page.evaluate(() => {
    const g = window.__LAZER, m = g.menu;
    m.index = __row('UI SOUNDS'); const start = g.profile.settings.volumes.ui;
    const seen = [];
    for (let i = 0; i < 5; i++) { m.select(); seen.push(g.profile.settings.volumes.ui); }
    return { start, seen, engine: g.audio.volumes.ui };
  });
  check('A on UI SOUNDS steps up by ten and wraps to silent after 100%', wrap.start === 70 && JSON.stringify(wrap.seen) === JSON.stringify([80, 90, 100, 0, 10]) && Math.abs(wrap.engine - 0.1) < 1e-6, wrap);

  const music = await page.evaluate(() => {
    const g = window.__LAZER, m = g.menu;
    m.index = __row('MUSIC'); const before = g.music.settings.volume;
    m.move(0, 1);
    const afterMenu = g.music.settings.volume;
    // The phone's MUSIC app slider moves the same level, and the menu shows it.
    g.music.setVolume(0.35); m.render();
    return { before, afterMenu, label: m.choices[__row('MUSIC')].label };
  });
  check('MUSIC is the MUSIC app level: the menu steps it by 5% and shows what the phone set', Math.abs(music.afterMenu - Math.min(1, music.before + 0.05)) < 1e-6 && /35%/.test(music.label), music);

  const mix = await page.evaluate(() => {
    const g = window.__LAZER, m = g.menu;
    m.index = __row('EFFECTS'); for (let i = 0; i < 4; i++) m.move(0, -1);
    m.index = __row('AMBIENCE'); for (let i = 0; i < 20; i++) m.move(0, -1);
    return { effects: g.profile.settings.volumes.effects, ambience: g.profile.settings.volumes.ambience, engine: { ...g.audio.volumes }, floor: m.choices[__row('AMBIENCE')].label };
  });
  check('EFFECTS and AMBIENCE step down independently and stop at 0%', mix.effects === 80 && mix.ambience === 0 && Math.abs(mix.engine.effects - 0.8) < 1e-6 && mix.engine.ambience === 0 && /0%/.test(mix.floor), mix);

  // Reload: the levels come back.
  await page.reload();
  await page.waitForFunction(() => window.__LAZER?.startSession, null, { timeout: 900000 });
  const back = await page.evaluate(() => ({ ...window.__LAZER.profile.settings.volumes }));
  check('After a reload the levels are as they were left', back.master === 90 && back.ui === 10 && back.effects === 80 && back.ambience === 0, back);
  check('No page errors', errors.length === 0, errors);
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r).length;
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
