// Focused Stage 2 check: nine real RS preload -> upward-release attempts on
// the production back quarter. This intentionally drives InputFrame fields;
// it never calls Simulation.pop() or rewrites velocity.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const browser = await chromium.launch({
  executablePath: process.env.BROWSER_EXECUTABLE || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));

try {
  await page.goto((process.env.LAZER_URL || 'http://127.0.0.1:5186') + '/?map=outdoor');
  await page.waitForFunction(() => window.__LAZER, null, { timeout: 90000 });
  const attempts = await page.evaluate(async () => {
    const g = window.__LAZER;
    g.testing(true);
    await g.startSession('outdoor', true);
    const s = g.sim;
    const { TUNE } = await import('/src/core/config.ts');
    const { terrainHeight } = await import('/src/park/park.ts');
    const { modules, rampLips, outdoorLip } = await import('/src/park/outdoor.ts');
    const quarter = modules.find((module) => module.id === 'back-quarter');
    const lipZ = rampLips(quarter)[0];

    function run(speed, release) {
      s.reset(0, true);
      g.advance(0.3, {}, false);
      s.position.set(3, terrainHeight(3, lipZ - 14) + TUNE.radius, lipZ - 14);
      s.previousPosition.copy(s.position);
      s.body.setTranslation(s.position, true);
      s.yaw = s.previousYaw = 0;
      s.velocity.set(0, 0, speed);
      s.body.setLinvel(s.velocity, true);

      const events = [];
      const trace = [];
      let tick = 0;
      let released = false;
      let naturalSeen = false;
      const off = g.events.on((event) => {
        if (['pop', 'landing', 'bail'].includes(event.type))
          events.push({ tick, type: event.type, quality: event.quality, reason: event.reason, charge: event.charge });
      });
      for (let i = 0; i < Math.round(5 / TUNE.step); i++) {
        tick = i;
        const before = s.velocity.clone();
        const lip = outdoorLip(s.position.x, s.position.z, s.velocity.z, s.velocity.x);
        naturalSeen ||= !s.grounded && s.launch?.kind === 'natural';
        const shouldRelease = !released && (
          release === 'coyote'
            ? naturalSeen
            : !!lip && s.grounded && lip.distance <= release
        );
        const input = shouldRelease ? { ry: -1 } : !released ? { ry: 1 } : {};
        if (shouldRelease) released = true;
        g.advance(TUNE.step, input, false);
        trace.push({
          i,
          grounded: s.grounded,
          state: s.state,
          x: s.position.x,
          y: s.position.y,
          z: s.position.z,
          vx: s.velocity.x,
          vy: s.velocity.y,
          vz: s.velocity.z,
          speed: s.velocity.length(),
          dSpeed: s.velocity.length() - before.length(),
          normalY: s.normal.y,
          launchId: s.launch?.id ?? null,
          launchKind: s.launch?.kind ?? null,
        });
      }
      off();

      const airStart = trace.findIndex((row) => !row.grounded && row.state !== 'Bail');
      const touchdown = trace.find((row, index) => index > airStart && row.grounded);
      const firstAirEnd = touchdown?.i ?? trace.length;
      const launchRows = trace.slice(Math.max(0, airStart), firstAirEnd + 1).filter((row) => row.launchId !== null);
      const launchIds = [...new Set(launchRows.map((row) => row.launchId))];
      const maxSpeed = Math.max(...trace.map((row) => row.speed));
      const maxAirSpeedStep = Math.max(0, ...trace.slice(Math.max(airStart + 1, 1), firstAirEnd + 1).filter((row) => !row.grounded).map((row) => row.dSpeed));
      const firstAirEvents = events.filter((event) => event.tick <= firstAirEnd);
      const pops = firstAirEvents.filter((event) => event.type === 'pop').length;
      const bails = firstAirEvents.filter((event) => event.type === 'bail');
      const landing = firstAirEvents.find((event) => event.type === 'landing');
      const onSourceTransition = !!touchdown && touchdown.x >= quarter.x0 && touchdown.x <= quarter.x1 && touchdown.z <= lipZ && touchdown.normalY < 0.8;
      const failures = [];
      if (!released) failures.push('RS release condition was never reached');
      if (airStart < 0) failures.push('charged RS stroke produced no air');
      if (launchIds.length !== 1) failures.push(`expected one launch ID, saw ${launchIds.join(',') || 'none'}`);
      if (pops !== 1) failures.push(`expected one pop event, saw ${pops}`);
      if (maxSpeed >= 45) failures.push(`absurd speed ${maxSpeed.toFixed(2)} m/s`);
      if (maxAirSpeedStep > 8) failures.push(`unexplained airborne speed increase ${maxAirSpeedStep.toFixed(2)} m/s in one tick`);
      if (bails.length) failures.push(`bailed: ${bails.map((event) => event.reason).join(',')}`);
      if (!onSourceTransition) failures.push(`did not return below coping on source transition (${touchdown ? `${touchdown.x.toFixed(2)},${touchdown.y.toFixed(2)},${touchdown.z.toFixed(2)} nY=${touchdown.normalY.toFixed(2)}` : 'no touchdown'})`);
      if (landing && !['clean', 'good'].includes(landing.quality)) failures.push(`landing graded ${landing.quality}`);
      return {
        speed,
        release: release === 'coyote' ? 'first coyote tick after natural departure' : `lip distance <= ${release} m`,
        status: failures.length ? 'FAIL' : 'PASS',
        failures,
        observations: {
          launchIds,
          launchKinds: [...new Set(launchRows.map((row) => row.launchKind))],
          pops,
          maxSpeed: +maxSpeed.toFixed(2),
          maxAirSpeedStep: +maxAirSpeedStep.toFixed(2),
          touchdown: touchdown && { x: +touchdown.x.toFixed(2), y: +touchdown.y.toFixed(2), z: +touchdown.z.toFixed(2), normalY: +touchdown.normalY.toFixed(2) },
          landing: landing?.quality ?? null,
        },
      };
    }

    // Automatic transition departure occurs at 0.26 m. Thus 0.36 m is the
    // closest grounded timing that represents "0.1 before release"; 0.1 m
    // itself is unreachable while grounded and belongs to the coyote case.
    return [10.2, 11, 12].flatMap((speed) => [0.5, 0.36, 'coyote'].map((release) => run(speed, release)));
  });

  const result = { ranAt: new Date().toISOString(), fixture: 'production back-quarter', attempts, pageErrors };
  mkdirSync('artifacts/physics', { recursive: true });
  writeFileSync('artifacts/physics/stage2-quarter.json', JSON.stringify(result, null, 2));
  for (const attempt of attempts)
    console.log(`${attempt.status.padEnd(4)} ${attempt.speed.toFixed(1)} m/s | ${attempt.release}${attempt.failures.length ? ` | ${attempt.failures.join('; ')}` : ''}`);
  if (pageErrors.length || attempts.some((attempt) => attempt.status !== 'PASS')) process.exitCode = 1;
} finally {
  await browser.close();
}
