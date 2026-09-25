// Quarter airs land back under the coping (#72, #82). Riding straight at the
// back quarter at 9-14.6 m/s (pushing tops out at 14.6), with no pop, an RS pop
// at the coping, just after the natural departure, or a charged pop up to 1.1 m
// early: every air lands on the transition below the coping, never on the deck
// or over the back of the quarter, and the faster airs go well above the coping.
// The published build before #72 threw coping pops at 11 m/s and up onto the
// deck, and at 14.6 m/s right over the quarter.
//   LAZER_URL=http://127.0.0.1:5195 BROWSER_EXECUTABLE=... node tests/quarter-landing.browser.mjs
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || process.env.CHROME_PATH, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 480, height: 300 } });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.LAZER_URL || 'http://127.0.0.1:5186') + '/?map=outdoor');
await page.waitForFunction(() => window.__LAZER?.startSession, null, { timeout: 900000 });
const out = await page.evaluate(async (ids) => {
  const g = window.__LAZER; g.testing(true); await g.startSession('outdoor', true);
  g.renderer.render = () => {};
  const s = g.sim;
  const { TUNE } = await import('/src/core/config.ts');
  const { terrainHeight } = await import('/src/park/park.ts');
  const { modules, rampLips, outdoorLip } = await import('/src/park/outdoor.ts');
  const { MEMORIAL_MODULES } = await import('/src/park/memorial.ts').catch(() => ({}));
  const rows = [];
  for (const id of ids) {
    const q = modules.find((m) => m.id === id); if (!q) { rows.push({ id, missing: true }); continue; }
    const lipZ = rampLips(q)[0], dir = Math.sign(lipZ - (q.z0 + q.z1) / 2) || 1, x = 3;
    const top = Math.max(terrainHeight(x, lipZ - dir * 0.05), terrainHeight(x, lipZ - dir * 0.2));
    for (const speed of [9, 11, 12.5, 14.6]) for (const release of ['none', 'coyote', 0.36, 0.7, 1.1]) {
      s.reset(0, true); g.advance(0.3, {}, false);
      const z0 = lipZ - dir * 14;
      s.position.set(x, terrainHeight(x, z0) + TUNE.radius, z0); s.previousPosition.copy(s.position); s.body.setTranslation(s.position, true);
      s.yaw = s.previousYaw = dir > 0 ? 0 : Math.PI; s.velocity.set(0, 0, dir * speed); s.body.setLinvel(s.velocity, true);
      let released = false, natural = false, apex = -99, air = false, landed = null, events = [];
      const off = g.events.on((e) => { if (['pop', 'landing', 'bail'].includes(e.type)) events.push(e.type + (e.quality ? ':' + e.quality : '') + (e.reason ? ':' + e.reason : '')); });
      for (let i = 0; i < Math.round(4 / TUNE.step); i++) {
        const lip = outdoorLip(s.position.x, s.position.z, s.velocity.z, s.velocity.x);
        natural ||= !s.grounded && s.launch?.kind === 'natural';
        let input = {};
        if (release !== 'none') {
          const now = !released && (release === 'coyote' ? natural : !!lip && s.grounded && lip.distance <= release);
          input = now ? { ry: -1 } : !released ? { ry: 1 } : {};
          if (now) released = true;
        }
        g.advance(TUNE.step, input, false);
        if (!s.grounded) { air = true; apex = Math.max(apex, s.position.y - TUNE.radius); }
        else if (air && !landed) { landed = { z: +((s.position.z - lipZ) * dir).toFixed(2), y: +(s.position.y - TUNE.radius).toFixed(2), nY: +s.normal.y.toFixed(2) }; break; }
      }
      off();
      const where = !landed ? 'none' : landed.z > 0.05 ? (landed.nY > 0.95 ? 'DECK (flat, past coping)' : 'past coping') : landed.nY < 0.9 ? 'transition' : 'flat bottom';
      rows.push({ id, speed, release, apexAboveCoping: +(apex - top).toFixed(2), where, landed, events: events.join(' ') });
    }
  }
  return rows;
}, ['back-quarter']);
let failed = 0;
for (const r of out) {
  if (r.speed === 9 && (r.release === 'none' || r.release === 'coyote')) continue; // 9 m/s never rolls off the coping by itself
  const min = r.speed >= 14 ? 3.5 : r.speed >= 12 ? 2 : r.speed >= 11 ? 1 : 0.25;
  const ok = r.where === 'transition' && r.apexAboveCoping >= min && !/bail/.test(r.events);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${r.speed} m/s, release ${r.release}: ${r.apexAboveCoping} m above the coping, lands on ${r.where} ${JSON.stringify(r.landed)} ${r.events}`);
}
if (errors.length) { failed++; console.log('FAIL page errors', errors); }
console.log(`${out.length - 2 - failed}/${out.length - 2} passed`);
await browser.close();
process.exit(failed ? 1 : 0);
