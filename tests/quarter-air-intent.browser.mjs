import { chromium } from 'playwright';

const browser = await chromium.launch({
  executablePath: process.env.BROWSER_EXECUTABLE || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
  await page.goto((process.env.LAZER_URL || 'http://127.0.0.1:5187') + '/?map=outdoor');
  await page.waitForFunction(() => window.__LAZER, null, { timeout: 90000 });
  const results = await page.evaluate(async () => {
    const g = window.__LAZER;
    g.testing(true);
    await g.startSession('outdoor', true);
    const { TUNE } = await import('/src/core/config.ts');
    const { terrainHeight } = await import('/src/park/park.ts');
    const { modules, rampLips } = await import('/src/park/outdoor.ts');
    const rows = [];
    for (const quarterId of ['back-quarter', 'front-quarter']) for (const { name, angle, lean, sideDelay, flair } of [
      { name: 'straight ride-up', angle: 0, lean: 0 },
      { name: 'straight forward deck intent', angle: 0, lean: -1 },
      { name: 'slightly angled forward lean', angle: 5, lean: -1 },
      { name: 'angled forward lean', angle: 12, lean: -1 },
      { name: 'side lean in air', angle: 0, lean: -1, sideDelay: 0.2 },
      { name: 'flair toward transition', angle: 0, lean: -1, sideDelay: 0.2, flair: true },
    ]) {
      const quarter = modules.find((module) => module.id === quarterId);
      const lipZ = rampLips(quarter)[0];
      const direction = quarter.reverse ? -1 : 1;
      g.sim.reset(0, true);
      g.advance(0.3, {}, false);
      const s = g.sim;
      const yaw = (quarter.reverse ? Math.PI : 0) + angle * (quarter.reverse ? -1 : 1) * Math.PI / 180;
      const startZ = lipZ - direction * 14;
      const startX = angle ? -4 : 3;
      s.position.set(startX, terrainHeight(startX, startZ) + TUNE.radius, startZ);
      s.previousPosition.copy(s.position);
      s.body.setTranslation(s.position, true);
      s.yaw = s.previousYaw = yaw;
      s.velocity.set(Math.sin(yaw) * 15, 0, Math.cos(yaw) * 15);
      s.body.setLinvel(s.velocity, true);
      let air = false, peak = -Infinity, touchdown = null, bail = null, airStart = null, flipSeen = false, maxTurn = 0;
      const off = g.events.on((event) => { if (event.type === 'bail') bail = event.reason; });
      for (let i = 0; i < Math.round(4 / TUNE.step); i++) {
        const wasGrounded = s.grounded;
        const side = sideDelay !== undefined && s.airTime > sideDelay;
        const input = { lean: air && sideDelay !== undefined ? (flair ? -1 : 0) : lean, steer: side && (!flair || s.airTime < 0.8) ? 1 : 0, held: flair && side ? { brake: 1, pumpGrind: 1 } : {} };
        g.advance(TUNE.step, input, false);
        flipSeen ||= s.bodyFlip.active;
        if (air) maxTurn = Math.max(maxTurn, Math.abs(s.yaw - yaw));
        if (!air && !s.grounded) { air = true; airStart = { z: s.position.z, vz: s.velocity.z }; }
        if (air) peak = Math.max(peak, s.position.y);
        if (air && !wasGrounded && s.grounded) { touchdown = { x: s.position.x, z: s.position.z, normalY: s.normal.y }; break; }
        if (bail) break;
      }
      off();
      rows.push({ quarterId, name, air, peak, airStart, touchdown, bail, flipSeen, maxTurn, finalZ: s.position.z, onTransition: !!touchdown && (touchdown.z - lipZ) * direction < 0 && touchdown.normalY < 0.8, onDeck: !!touchdown && (touchdown.z - lipZ) * direction > 0 && touchdown.normalY > 0.9, transitionSide: (s.position.z - lipZ) * direction < 0 });
    }
    return rows;
  });
  for (const row of results) console.log(`${row.quarterId} ${row.name}: ${JSON.stringify(row)}`);
  const failures = [];
  for (const row of results) {
    const expected = row.name === 'straight forward deck intent' ? row.onDeck : row.name === 'flair toward transition' ? row.flipSeen && row.maxTurn > 0.5 && row.transitionSide : row.onTransition;
    if (!expected || (row.bail && row.name !== 'flair toward transition')) failures.push(`${row.quarterId} ${row.name} did not land as intended cleanly`);
  }
  if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
} finally {
  await browser.close();
}
