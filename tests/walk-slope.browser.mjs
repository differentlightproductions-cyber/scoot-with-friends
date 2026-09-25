// #70: a walker stands still on gentle ground and at the edge of a slope; only
// steep ground (a ramp wall, a steep bank) carries them down.
//   LAZER_URL=http://127.0.0.1:5195 BROWSER_EXECUTABLE=... node tests/walk-slope.browser.mjs
import { chromium } from 'playwright';
const url = process.env.LAZER_URL || 'http://127.0.0.1:5186';
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || process.env.CHROME_PATH, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const results = [];
const check = (label, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${label} ${JSON.stringify(detail)}`); };
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 500 } }), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url + '/?map=outdoor');
  await page.waitForFunction(() => window.__LAZER?.startSession, null, { timeout: 900000 });
  const found = await page.evaluate(async () => {
    const g = window.__LAZER; g.testing(true); await g.startSession('outdoor', true);
    g.renderer.render = () => {};
    const { terrainNormal, terrainHeight } = await import('/src/park/park.ts');
    const { WATER } = await import('/src/park/water.ts');
    const deg = (x, z) => Math.acos(Math.min(1, terrainNormal(x, z).y)) * 180 / Math.PI;
    // Evenly tilted spots (every neighbour within 3 degrees), by slope band.
    const bands = { gentle: [8, 20], medium: [20, 26], steep: [45, 60] }, spots = {};
    for (let x = -110; x <= 110 && Object.keys(spots).length < 3; x += 0.7)
      for (let z = -110; z <= 110; z += 0.7) {
        if (Math.hypot((x - WATER.x) / (WATER.rx + 3), (z - WATER.z) / (WATER.rz + 3)) < 1) continue;
        const a = deg(x, z);
        for (const [name, [lo, hi]] of Object.entries(bands)) {
          if (spots[name] || a < lo || a > hi) continue;
          const even = [[0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3]].every(([dx, dz]) => Math.abs(deg(x + dx, z + dz) - a) < 3);
          if (even) spots[name] = { x, z, angle: +a.toFixed(1) };
        }
      }
    // An edge: flat ground within 0.1 m of a drop that reads steeper than 30 degrees.
    for (let x = -60; x <= 60 && !spots.edge; x += 0.35)
      for (let z = -60; z <= 60; z += 0.35) {
        if (deg(x, z) < 35) continue;
        for (const [dx, dz] of [[0.12, 0], [-0.12, 0], [0, 0.12], [0, -0.12]])
          if (deg(x + dx, z + dz) < 2 && terrainHeight(x, z) > 0.1) { spots.edge = { x, z, angle: +deg(x, z).toFixed(1) }; break; }
        if (spots.edge) break;
      }
    return spots;
  });
  const stand = await page.evaluate(async (spots) => {
    const g = window.__LAZER, s = g.sim, out = {};
    const { terrainHeight } = await import('/src/park/park.ts');
    for (const [name, p] of Object.entries(spots)) {
      s.swim = null; s.walking = true; s.hasScooter = false; s.running = false;
      s.velocity.set(0, 0, 0); s.position.set(p.x, terrainHeight(p.x, p.z) + 0.4, p.z); s.previousPosition.copy(s.position); s.body.setTranslation(s.position, true);
      for (let i = 0; i < 20; i++) g.advance(1 / 60, {}, false);
      const start = s.position.clone();
      for (let i = 0; i < 180; i++) g.advance(1 / 60, {}, false);
      out[name] = { ...p, drift: +Math.hypot(s.position.x - start.x, s.position.z - start.z).toFixed(3), walking: s.walking };
    }
    return out;
  }, found);
  check('Found gentle, medium and steep test spots', stand.gentle && stand.medium && stand.steep, found);
  check('Standing on gentle ground (8-20 degrees) stays put', stand.gentle?.drift < 0.05, stand.gentle);
  check('Standing on a 20-26 degree slope stays put', stand.medium?.drift < 0.05, stand.medium);
  check('Standing at an edge, half on the flat, stays put', !stand.edge || stand.edge.drift < 0.05, stand.edge ?? 'no edge found');
  check('A steep slope (45+ degrees) still carries a walker down', stand.steep?.drift > 0.5, stand.steep);
  check('No page errors', errors.length === 0, errors.slice(0, 3));
} finally {
  await browser.close();
}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
