// Fastplants anywhere (#84): RT + A plants riding along the flat and going up a
// ramp, not only at a lip or off a drop, so fastplant flips work on flat
// ground; LS back adds the backflip, which lands. Not on a longboard.
//   LAZER_URL=http://127.0.0.1:5195 BROWSER_EXECUTABLE=... node tests/fastplant-anywhere.browser.mjs
import { chromium } from 'playwright';
const url = process.env.LAZER_URL || 'http://127.0.0.1:5186';
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || process.env.CHROME_PATH, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const results = [];
const check = (label, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${label} ${JSON.stringify(detail)}`); };
try {
  const page = await browser.newPage({ viewport: { width: 320, height: 200 } }), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url + '/?map=outdoor');
  await page.waitForFunction(() => window.__LAZER?.startSession, null, { timeout: 900000 });
  const r = await page.evaluate(async () => {
    const g = window.__LAZER; g.testing(true); await g.startSession('outdoor', true); g.renderer.render = () => {};
    const { terrainHeight, terrainNormal } = await import('/src/park/park.ts');
    const { modules, rampLips } = await import('/src/park/outdoor.ts');
    const s = g.sim, a = (t, f = {}) => g.advance(t, f, false);
    const place = (x, z, speed) => { s.reset(0, true); a(.25); s.normal.copy(terrainNormal(x, z)); s.position.set(x, terrainHeight(x, z) + .22 / Math.max(.55, s.normal.y), z); s.previousPosition.copy(s.position); s.body.setTranslation(s.position, true); s.yaw = s.previousYaw = 0; s.velocity.set(0, 0, speed).projectOnPlane(s.normal).normalize().multiplyScalar(speed); s.body.setLinvel(s.velocity, true); s.grounded = true; s.lastGround = s.elapsed; a(1 / 120); return s; };
    const plant = (lean) => {
      const events = []; const off = g.events.on((e) => { if (['pop', 'landing', 'bail', 'fastplant'].includes(e.type)) events.push(e.type + (e.quality ? ':' + e.quality : '') + (e.reason ? ':' + e.reason : '')); });
      const start = s.position.y; let top = start, flip = 0, launched = false;
      a(1 / 120, { held: { hop: 1, pumpGrind: 1 }, pressed: { hop: true }, lean });
      for (let i = 0; i < 240; i++) { a(1 / 120, { held: { hop: 1, pumpGrind: 1 }, lean }); launched ||= !!s.fastplant?.launched; top = Math.max(top, s.position.y); flip = Math.max(flip, Math.abs(s.bodyFlip.angle ?? 0)); if (launched && s.grounded && i > 20) break; }
      for (let i = 0; i < 60 && !s.grounded; i++) a(1 / 60, {});
      off(); return { launched, height: +(top - start).toFixed(2), flip: +flip.toFixed(2), state: s.state, events: events.join(' ') };
    };
    const out = {};
    place(-9, -18, 8); out.flatOpportunity = !!s.fastplantOpportunity(); out.flat = plant(0);
    place(-9, -18, 8); out.flatFlip = plant(-1);
    // Halfway up the back quarter, still well below the coping.
    const q = modules.find((m) => m.id === 'back-quarter'), lipZ = rampLips(q)[0];
    place(3, lipZ - 2.4, 9); out.rampHeight = +(s.position.y).toFixed(2); out.rampOpportunity = !!s.fastplantOpportunity();
    s.rideable = 'longboard'; out.longboard = !!s.fastplantOpportunity(); s.rideable = 'scooter';
    return out;
  });
  check('Riding along the flat: RT + A is a fastplant', r.flatOpportunity && r.flat.launched && /fastplant|pop/.test(r.flat.events), r.flat);
  check('The flat fastplant pops about a metre or more', r.flat.height > 0.9, r.flat);
  check('LS back: a fastplant backflip on flat ground completes and lands', r.flatFlip.launched && r.flatFlip.flip > 5.5 && !/bail/.test(r.flatFlip.events) && r.flatFlip.state !== 'Bail', r.flatFlip);
  check('Going up a ramp, below the coping: RT + A is a fastplant', r.rampOpportunity, r);
  check('Never on a longboard', !r.longboard, r);
  check('No page errors', errors.length === 0, errors);
} finally { await browser.close(); }
const failed = results.filter((r) => !r).length;
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
