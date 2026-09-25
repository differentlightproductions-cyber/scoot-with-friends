// Charged RS releases on both wood quarter faces and a metal quarter.
// LAZER_URL=http://127.0.0.1:5184 node tests/early-quarter-pop.browser.mjs
import { chromium } from 'playwright';

const browser = await chromium.launch({
  executablePath: process.env.BROWSER_EXECUTABLE || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
  await page.goto((process.env.LAZER_URL || 'http://127.0.0.1:5184') + '/?map=outdoor');
  await page.waitForFunction(() => window.__LAZER, null, { timeout: 120000 });
  const renderer = await page.evaluate(() => {
    const gl = window.__LAZER.renderer.getContext();
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  });
  console.log('WebGL renderer:', renderer);
  const rows = await page.evaluate(async () => {
    const g = window.__LAZER;
    g.testing(true);
    await g.startSession('outdoor', true);
    const { terrainHeight } = await import('/src/park/park.ts');
    const { modules, rampLips } = await import('/src/park/outdoor.ts');
    const { metalQuarters } = await import('/src/park/memorial.ts');
    const { TUNE } = await import('/src/core/config.ts');
    const s = g.sim, rows = [];
    const ramps = [modules.find(m => m.id === 'front-quarter'), modules.find(m => m.id === 'back-quarter'), metalQuarters.find(m => m.id === 'metal-west-quarter')];
    for (const ramp of ramps) for (const speed of [9, 12]) for (const angle of [0, 15]) for (const zone of [0.35, 0.55, 0.65]) {
      const metal = ramp.id.startsWith('metal-');
      const dir = ramp.reverse ? -1 : 1;
      const lip = metal ? (ramp.reverse ? ramp.x1 - 3.2 : ramp.x0 + 3.2) : rampLips(ramp)[0];
      const heading = (metal ? Math.PI / 2 : 0) + (dir < 0 ? Math.PI : 0) + angle * Math.PI / 180;
      const start = metal ? { x: lip - dir * 8, z: (ramp.z0 + ramp.z1) / 2 } : { x: 0, z: lip - dir * 10 };
      const base = terrainHeight(start.x, start.z);
      s.reset(0, true);
      g.advance(.3, {}, false);
      s.tricks.controlStyle = 'pro';
      s.position.set(start.x, base + TUNE.radius, start.z);
      s.previousPosition.copy(s.position);
      s.body.setTranslation(s.position, true);
      s.yaw = s.previousYaw = heading;
      s.velocity.set(Math.sin(heading) * speed, 0, Math.cos(heading) * speed);
      s.body.setLinvel(s.velocity, true);
      let released = false, pop = null, peak = -Infinity, bails = [], land = false, popCharge = null;
      const off = g.events.on(e => { if (e.type === 'bail') bails.push(e.reason); if (e.type === 'pop' && e.charge > 0) popCharge = e.charge; });
      for (let i = 0; i < 500; i++) {
        const height = terrainHeight(s.position.x, s.position.z) - base;
        const fraction = height / ramp.h;
        const release = !released && s.grounded && fraction >= zone;
        if (release) released = true;
        const wasGrounded = s.grounded;
        g.advance(TUNE.step, release ? { ry: -1 } : { ry: released ? 0 : 1 }, false);
        if (release) pop = { fraction, charge: s.preload.amount, y: s.position.y, vy: s.velocity.y, state: s.state, lipDistance: metal ? (lip - s.position.x) * dir : (lip - s.position.z) * dir };
        if (pop) {
          peak = Math.max(peak, s.position.y);
          if (!wasGrounded && s.grounded) { land = true; break; }
          if (s.state === 'Bail') break;
        }
      }
      off();
      rows.push({ ramp: ramp.id, speed, angle, zone, pop, popCharge, rise: pop && +(peak - pop.y).toFixed(2), land, bails });
    }
    return rows;
  });
  // The 55% figures pin the original lower-transition takeoff. The 65%
  // figures are the former premature coping redirects; those must launch lower.
  const before = {
    wood: { '9/0': [6.75, 5.91], '9/15': [6.32, 5.52], '12/0': [10.42, 10.02], '12/15': [9.74, 9.15] },
    metal: { '9/0': [8.32, 7.99], '9/15': [7.94, 7.60], '12/0': [11.55, 11.28], '12/15': [10.99, 10.66] },
  };
  const failures = [];
  for (const row of rows) {
    const label = `${row.ramp} ${row.speed} m/s ${row.angle}° at ${row.zone * 100}%`;
    if (!row.pop || row.popCharge < 0.9) { failures.push(`${label}: no charged pop`); continue; }
    const [lowerVy, oldUpperVy] = before[row.ramp.startsWith('metal-') ? 'metal' : 'wood'][`${row.speed}/${row.angle}`];
    if (row.zone === 0.55 && Math.abs(row.pop.vy - lowerVy) > 0.15)
      failures.push(`${label}: lower-transition launch changed (${row.pop.vy.toFixed(2)} vs ${lowerVy})`);
    if (row.zone === 0.65) {
      if (row.pop.vy >= oldUpperVy - 0.2)
        failures.push(`${label}: launch not lowered (${row.pop.vy.toFixed(2)} vs old ${oldUpperVy})`);
      if (!row.land || row.bails.length) failures.push(`${label}: did not land clean (${row.bails.join(', ')})`);
    }
  }
  console.table(rows.map(({ ramp, speed, angle, zone, pop, popCharge, rise, land, bails }) => ({ ramp, speed, angle, zone, charge: popCharge, vy: pop?.vy.toFixed(2), rise, land, bail: bails.join(', ') })));
  if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
} finally {
  await browser.close();
}
