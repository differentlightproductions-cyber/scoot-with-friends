// The street-side metal half pipe (#29 audit): airs out of either wall land back
// on its transition below the coping, never on the deck or over the back. Five
// normal airs and five moderate ones (RS pop at the coping), three rolled fakie
// and three light tricks (tailwhip, barspin), all on the east wall, and the five
// normal airs again on the west wall. Physics only: drawing is stubbed.
//   LAZER_URL=http://127.0.0.1:5195 BROWSER_EXECUTABLE=... node tests/halfpipe-street.browser.mjs
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
  const { metalQuarters } = await import('/src/park/memorial.ts');
  const east = metalQuarters.find((q) => !q.reverse), west = metalQuarters.find((q) => q.reverse);
  const z = (east.z0 + east.z1) / 2, middle = (west.x1 + east.x0) / 2;
  // The transition curves up over 3.2 m from the flat; the coping sits at its top.
  const wall = (q) => { const dir = q.reverse ? -1 : 1, foot = q.reverse ? q.x1 : q.x0; return { dir, foot, coping: foot + dir * 3.2, h: q.h }; };
  const cases = [
    ...[9.5, 10, 10.5, 11, 11.5].map((speed) => ({ group: 'normal', q: east, speed })),
    ...[12, 12.5, 13, 13.5, 14].map((speed, i) => ({ group: 'moderate', q: east, speed, release: i % 2 ? 0.7 : 0.36 })),
    ...[10, 11, 12].map((speed) => ({ group: 'fakie', q: east, speed, fakie: true })),
    ...[[10.5, 'pushDeck', 'tailwhip'], [11.5, 'brakeBars', 'barspin'], [12, 'pushDeck', 'tailwhip']].map(([speed, button, trick]) => ({ group: 'trick', q: east, speed, button, trick })),
    ...[9.5, 10, 10.5, 11, 11.5].map((speed) => ({ group: 'normal west', q: west, speed })),
  ];
  const rows = [];
  for (const c of cases) {
    const w = wall(c.q), release = c.release ?? 0.36;
    s.reset(0, true); g.advance(0.3, {}, false);
    s.tricks.stance = 'regular'; s.tricks.controlStyle = 'pro';
    const x0 = middle;
    s.position.set(x0, terrainHeight(x0, z) + TUNE.radius, z); s.previousPosition.copy(s.position); s.body.setTranslation(s.position, true);
    const travel = w.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    s.yaw = s.previousYaw = c.fakie ? travel + Math.PI : travel;
    s.velocity.set(w.dir * c.speed, 0, 0); s.body.setLinvel(s.velocity, true);
    let popped = false, air = false, trickSent = false, apex = -99, landed = null, fakieAtPop = null;
    const events = [];
    const off = g.events.on((e) => { if (['pop', 'landing', 'bail', 'trick'].includes(e.type)) events.push(e.type + (e.name ? ':' + e.name : '') + (e.quality ? ':' + e.quality : '') + (e.reason ? ':' + e.reason : '')); });
    for (let i = 0; i < Math.round(5 / TUNE.step); i++) {
      const toCoping = (w.coping - s.position.x) * w.dir;
      let input = {};
      if (!popped) {
        const now = s.grounded && toCoping <= release;
        input = now ? { ry: -1 } : { ry: 1 };
        if (now) { popped = true; fakieAtPop = s.fakie.mode; }
      } else if (c.button && !s.grounded && !trickSent && s.velocity.y > 0) { input = { pressed: { [c.button]: true }, held: { [c.button]: 1 } }; trickSent = true; }
      g.advance(TUNE.step, input, false);
      if (!s.grounded) { air = true; apex = Math.max(apex, s.position.y - TUNE.radius); }
      else if (air && !landed) { landed = { x: +((s.position.x - w.coping) * w.dir).toFixed(2), y: +(s.position.y - TUNE.radius).toFixed(2), nY: +s.normal.y.toFixed(2) }; }
      if (landed && i * TUNE.step > 0) { if (s.state === 'Bail' || events.some((e) => e.startsWith('bail'))) break; }
      if (landed && events.some((e) => e.startsWith('landing'))) break;
    }
    // Stay a moment after touching down: a bail right after contact still counts.
    for (let i = 0; i < Math.round(0.4 / TUNE.step) && landed; i++) g.advance(TUNE.step, {}, false);
    off();
    const where = !landed ? 'none' : landed.x > 0.05 ? (landed.nY > 0.95 ? 'DECK (past coping)' : 'past coping') : landed.nY < 0.97 ? 'transition' : 'flat bottom';
    rows.push({ group: c.group, speed: c.speed, release, trick: c.trick, fakieAtPop, apexAboveCoping: +(apex - w.h).toFixed(2), where, landed, bail: s.state === 'Bail' || events.some((e) => e.startsWith('bail')), events: events.join(' ') });
  }
  return rows;
});
let failed = 0;
for (const r of out) {
  const ok = r.where === 'transition' && !r.bail && r.apexAboveCoping >= 0.2 && (r.group !== 'fakie' || r.fakieAtPop === 'Fakie') && (!r.trick || new RegExp(r.trick, 'i').test(r.events));
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${r.group} ${r.speed} m/s${r.trick ? ' ' + r.trick : ''}${r.group === 'fakie' ? ' (rolling ' + r.fakieAtPop + ')' : ''}: ${r.apexAboveCoping} m above the coping, lands on ${r.where} ${JSON.stringify(r.landed)} ${r.events}`);
}
if (errors.length) { failed++; console.log('FAIL page errors', errors); }
console.log(`${out.length - failed}/${out.length} passed`);
await browser.close();
process.exit(failed ? 1 : 0);
