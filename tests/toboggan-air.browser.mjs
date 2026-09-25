// Toboggan in real airs (#30 audit): RT + B off a flat hop and out of the back
// quarter, regular and goofy, released early or still held into the landing, and
// after a 180. Each one is scored as a Toboggan, the hand is back on the bars
// when the wheels touch (the pose lets go on its own just before), and the rider
// rides away. Physics only: drawing is stubbed.
//   LAZER_URL=http://127.0.0.1:5195 BROWSER_EXECUTABLE=... node tests/toboggan-air.browser.mjs
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || process.env.CHROME_PATH, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 480, height: 300 } });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.LAZER_URL || 'http://127.0.0.1:5186') + '/?map=outdoor');
await page.waitForFunction(() => window.__LAZER?.startSession, null, { timeout: 900000 });
const out = await page.evaluate(async () => {
  const g = window.__LAZER; g.testing(true); await g.startSession('outdoor', true);
  g.renderer.render = () => {};
  const s = g.sim;
  const { TUNE } = await import('/src/core/config.ts');
  const { terrainHeight } = await import('/src/park/park.ts');
  const { modules, rampLips } = await import('/src/park/outdoor.ts');
  const q = modules.find((m) => m.id === 'back-quarter'), lipZ = rampLips(q)[0], dir = Math.sign(lipZ - (q.z0 + q.z1) / 2) || 1;
  const cases = [];
  for (const stance of ['regular', 'goofy']) {
    cases.push({ stance, where: 'flat hop', release: 'held' });
    cases.push({ stance, where: 'quarter', release: 'held' });
    cases.push({ stance, where: 'quarter', release: 'early' });
    cases.push({ stance, where: 'quarter', release: 'held', spin: true });
  }
  const rows = [];
  for (const c of cases) {
    s.reset(0, true); g.advance(0.3, {}, false);
    s.tricks.stance = c.stance; s.tricks.controlStyle = 'pro';
    const x = 3, speed = c.where === 'quarter' ? 11.5 : 7;
    const z0 = c.where === 'quarter' ? lipZ - dir * 14 : 0;
    s.position.set(x, terrainHeight(x, z0) + TUNE.radius, z0); s.previousPosition.copy(s.position); s.body.setTranslation(s.position, true);
    s.yaw = s.previousYaw = dir > 0 ? 0 : Math.PI; s.velocity.set(0, 0, dir * speed); s.body.setLinvel(s.velocity, true);
    const events = [];
    const off = g.events.on((e) => { if (['pop', 'landing', 'bail', 'trick'].includes(e.type)) events.push(e.type + (e.name ? ':' + e.name : '') + (e.quality ? ':' + e.quality : '') + (e.reason ? ':' + e.reason : '')); });
    let popped = false, airT = 0, touchdown = null, peakBlend = 0, flatHopAt = 0.4;
    for (let i = 0; i < Math.round(5 / TUNE.step); i++) {
      let input = {};
      if (!popped) {
        const now = c.where === 'quarter' ? s.grounded && (lipZ - s.position.z) * dir <= 0.36 : i * TUNE.step >= flatHopAt;
        input = now ? { ry: -1 } : { ry: 1 };
        if (now) popped = true;
      } else if (!s.grounded && !touchdown) {
        airT += TUNE.step;
        const rtB = { held: { pumpGrind: 1, brakeBars: 1 }, pressed: { brakeBars: airT < TUNE.step * 1.5 + (c.spin ? 0.3 : 0) && airT > (c.spin ? 0.3 : 0) } };
        if (c.spin && airT < 0.3) input = { steer: 1 };
        else if (c.release === 'early' && airT > 0.35) input = {};
        else input = rtB;
      }
      g.advance(TUNE.step, input, false);
      peakBlend = Math.max(peakBlend, s.tricks.visualPose === 'Toboggan' ? s.tricks.poseBlend : 0);
      if (popped && airT > 0.05 && s.grounded && !touchdown) touchdown = { blend: +s.tricks.poseBlend.toFixed(2), pose: s.tricks.visualPose, air: +airT.toFixed(2) };
      if (touchdown && events.some((e) => e.startsWith('landing') || e.startsWith('bail'))) break;
    }
    for (let i = 0; i < Math.round(0.5 / TUNE.step); i++) g.advance(TUNE.step, {}, false);
    off();
    rows.push({ ...c, peakBlend: +peakBlend.toFixed(2), touchdown, state: s.state, events: events.join(' ') });
  }
  return rows;
});
let failed = 0;
for (const r of out) {
  const ok = /trick:(\d+° )?Toboggan/i.test(r.events) && r.peakBlend > 0.9 && r.touchdown && r.touchdown.blend < 0.05 && /landing/.test(r.events) && !/bail/.test(r.events) && r.state !== 'Bail' && (!r.spin || /180/.test(r.events));
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${r.stance} ${r.where}${r.spin ? ' 180' : ''}, ${r.release} release: pose peak ${r.peakBlend}, at touchdown ${JSON.stringify(r.touchdown)}, ${r.state}; ${r.events}`);
}
if (errors.length) { failed++; console.log('FAIL page errors', errors); }
console.log(`${out.length - failed}/${out.length} passed`);
await browser.close();
process.exit(failed ? 1 : 0);
