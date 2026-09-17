// Checkpoint 1: speed consistency, the raised usable maximum, and jump-on
// mounting. Automated input traces against the real Simulation, not playtests.
import { chromium } from 'playwright';
const browser = await chromium.launch({
  executablePath:
    process.env.BROWSER_EXECUTABLE ||
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
try {
  await page.goto((process.env.LAZER_URL || 'http://127.0.0.1:5174') + '/?map=outdoor');
  await page.waitForFunction(() => window.__LAZER, null, { timeout: 90000 });
  const result = await page.evaluate(async () => {
    const g = window.__LAZER;
    g.testing(true);
    await g.startSession('outdoor', true);
    const { TUNE } = await import('/src/core/config.ts');
    const a = (t, f = {}) => g.advance(t, f, false);
    const s = g.sim;
    const checks = [], data = [];
    const check = (name, ok, detail) => {
      if (!ok) throw Error(name + ' :: ' + JSON.stringify(detail ?? {}));
      checks.push(name);
    };

    // ---- Speed tiers are ordered and distinct -----------------------------
    check('Pushing ceiling sits below the protective ceiling',
      TUNE.pushMaxSpeed < TUNE.extremeSpeed, { push: TUNE.pushMaxSpeed, extreme: TUNE.extremeSpeed });

    // ---- Flat-ground pushing ----------------------------------------------
    // Spawn 12 (lakeside trail) is a genuinely flat run; the wood park runway
    // reaches a transition by the fifth push and would measure terrain instead.
    const pushRun = (n) => {
      s.reset(12, true); a(0.4);
      const speeds = [];
      for (let i = 0; i < n; i++) { a(1 / 120, { pressed: { pushDeck: true } }); a(0.49); speeds.push(s.speed); }
      return speeds;
    };
    const run = pushRun(40);
    data.push({ flatPush: { first: run.slice(0, 5).map(v => +v.toFixed(2)), asymptote: +run.at(-1).toFixed(2) } });
    check('Each push adds speed while below the ceiling',
      run.slice(0, 8).every((v, i) => i === 0 || v > run[i - 1]), run.slice(0, 8));
    check('Pushing reaches a materially higher maximum than the previous 11.31',
      run.at(-1) > 13, { asymptote: run.at(-1) });
    check('Pushing alone cannot exceed its own ceiling',
      run.at(-1) <= TUNE.pushMaxSpeed + 0.01, { asymptote: run.at(-1), ceiling: TUNE.pushMaxSpeed });

    // ---- Repeatability ------------------------------------------------------
    const repeats = [pushRun(12).at(-1), pushRun(12).at(-1), pushRun(12).at(-1)];
    data.push({ repeatability: repeats.map(v => +v.toFixed(3)) });
    check('Identical input produces identical speed',
      repeats.every(v => Math.abs(v - repeats[0]) < 1e-6), repeats);

    // ---- Zero is reachable; no positive minimum-speed clamp ----------------
    s.reset(12, true); a(0.4);
    s.velocity.set(0, 0, -8); s.body.setLinvel(s.velocity, true); s.yaw = Math.PI;
    a(4, { held: { brake: 1 } });
    check('Braking reaches a complete stop', s.speed === 0, { speed: s.speed });
    a(1);
    check('A stopped rider is not pushed back into motion', s.speed === 0, { speed: s.speed });

    // ---- Fakie: signed backward travel survives ---------------------------
    s.reset(12, true); a(0.4);
    s.yaw = s.previousYaw = Math.PI;
    s.velocity.set(0, 0, 6); s.body.setLinvel(s.velocity, true);
    a(1 / 120);
    data.push({ fakie: { travelState: g.snapshot().travelState, vz: +s.velocity.z.toFixed(2) } });
    check('Backward travel is recognised as fakie rather than clamped away',
      g.snapshot().travelState === 'Fakie' && s.velocity.z > 4, { vz: s.velocity.z });

    // ---- The protective ceiling must not touch vertical motion -------------
    s.reset(12, true); a(0.4);
    s.velocity.set(0, 12, 34); s.body.setLinvel(s.velocity, true);
    s.grounded = false; s.state = 'Airborne';
    const beforeY = s.velocity.y, beforeZ = s.velocity.z;
    a(1 / 120);
    const gravityOnly = beforeY - TUNE.gravity / 120;
    data.push({ ceiling: { y: +s.velocity.y.toFixed(3), expectedY: +gravityOnly.toFixed(3), z: +s.velocity.z.toFixed(2) } });
    check('Vertical speed changes only by gravity, never by the speed ceiling',
      Math.abs(s.velocity.y - gravityOnly) < 0.02, { got: s.velocity.y, expected: gravityOnly });
    check('Horizontal travel is eased down, not hard-clamped',
      s.velocity.z < beforeZ && s.velocity.z > TUNE.extremeSpeed, { z: s.velocity.z });

    // ---- Jump-on mounting ---------------------------------------------------
    // A jumps; Y in the air places the scooter. `placeAfter` is seconds after the
    // jump, or null to never press Y.
    const approachJump = ({ running, lean = 1, placeAfter = 0.12 }) => {
      s.reset(12, true); a(0.4);
      s.walking = true; s.running = running; s.hasScooter = true; s.walkCameraYaw = 0;
      a(1.4, { lean });
      const approach = s.speed;
      a(1 / 120, { lean, pressed: { hop: true } });
      const armedByJump = !!s.jumpOn;
      let mounted = false, placed = false, landedOnFoot = false;
      for (let i = 0; i < 220 && !mounted; i++) {
        const press = placeAfter !== null && i === Math.round(placeAfter * 120);
        a(1 / 120, { lean, pressed: { body: press } });
        placed ||= !!s.jumpOn;
        mounted = !s.walking;
        if (s.walking && s.grounded && i > 30) { landedOnFoot = true; break; }
      }
      // Mounting now happens in the air; follow it through to the landing.
      for (let i = 0; i < 240 && mounted && !s.grounded; i++) a(1 / 120, { lean });
      if (mounted) a(1 / 120, { lean });
      return { approach, armedByJump, placed, mounted, landedOnFoot, rideSpeed: s.speed, jumpOnLanded: s.jumpOnLanded };
    };
    const jumpOnly = approachJump({ running: true, placeAfter: null });
    data.push({ jumpWithoutY: jumpOnly });
    check('Jumping alone never releases the scooter or mounts',
      !jumpOnly.armedByJump && !jumpOnly.placed && !jumpOnly.mounted && jumpOnly.landedOnFoot, jumpOnly);
    const running = approachJump({ running: true });
    data.push({ runningJumpOn: { approach: +running.approach.toFixed(2), rideSpeed: +running.rideSpeed.toFixed(2) } });
    check('A running jump with Y in the air lands on the scooter and rides away',
      running.placed && running.mounted && running.rideSpeed > 0 && running.jumpOnLanded > 0, running);
    const late = approachJump({ running: true, placeAfter: 0.4 });
    check('Y placed late in the jump still mounts on touchdown', late.mounted, late);

    // Ordinary running mount, for comparison.
    s.reset(12, true); a(0.4);
    s.walking = true; s.running = true; s.hasScooter = true; s.walkCameraYaw = 0;
    a(1.4, { lean: 1 });
    a(1 / 120, { lean: 1, pressed: { body: true } }); a(0.05);
    const ordinary = s.speed;
    data.push({ ordinaryRunMount: +ordinary.toFixed(2) });
    check('The running jump-on is clearly stronger than the ordinary run mount',
      running.rideSpeed > ordinary + 0.5, { jumpOn: running.rideSpeed, ordinary });
    check('The jump-on bonus stays inside the pushing ceiling',
      running.rideSpeed <= TUNE.pushMaxSpeed + 0.01, { rideSpeed: running.rideSpeed });

    // A standing hop with Y mounts, but earns no boost.
    s.reset(12, true); a(0.4);
    s.walking = true; s.running = false; s.hasScooter = true; s.walkCameraYaw = 0;
    a(1 / 120, { pressed: { hop: true } });
    a(0.1);
    a(1 / 120, { pressed: { body: true } });
    let hopped = false;
    for (let i = 0; i < 220 && !hopped; i++) { a(1 / 120); hopped = !s.walking; }
    data.push({ standingHop: { mounted: hopped, rideSpeed: +s.speed.toFixed(2) } });
    check('A standing hop with Y mounts without earning the running bonus',
      hopped && s.speed < TUNE.jumpOnRunSpeed, { speed: s.speed });

    // Y on the ground is the ordinary mount, not a jump-on.
    s.reset(12, true); a(0.4);
    s.walking = true; s.running = false; s.hasScooter = true;
    a(0.2);
    a(1 / 120, { pressed: { body: true } });
    check('Y on the ground stays the ordinary mount', !s.walking && s.jumpOnLanded === 0 && !s.jumpOn);

    // Walking off an edge and pressing Y is not a jump-on: A must start it.
    s.reset(12, true); a(0.4);
    s.walking = true; s.hasScooter = true;
    s.grounded = false; s.position.y += 1.2; s.body.setTranslation(s.position, true);
    a(1 / 120, { pressed: { body: true } });
    check('Y without an A jump does not place the scooter', !s.jumpOn);

    // One scooter throughout: a released deck is the carried instance.
    check('No duplicate scooter is created by an attempt', s.hasScooter === true);

    return { checks, data };
  });
  console.log(JSON.stringify(result.data, null, 1));
  console.log('\nPASSED ' + result.checks.length + ' CHECKS');
  for (const c of result.checks) console.log('  ok  ' + c);
} finally {
  await browser.close();
}
