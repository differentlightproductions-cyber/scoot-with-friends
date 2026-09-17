// Checkpoint 3: the Sometimes Summer longboard inside the real Simulation and
// rider model. Automated input traces, not controller playtests.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
mkdirSync('artifacts', { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.BROWSER_EXECUTABLE || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
try {
  await page.goto((process.env.LAZER_URL || 'http://127.0.0.1:5174') + '/?map=outdoor');
  await page.waitForFunction(() => window.__LAZER, null, { timeout: 90000 });
  const result = await page.evaluate(async () => {
    const g = window.__LAZER;
    g.testing(true);
    await g.startSession('outdoor', true);
    const { TUNE } = await import('/src/core/config.ts');
    const { terrainHeight } = await import('/src/park/park.ts');
    const s = g.sim;
    const a = (t, f = {}) => g.advance(t, f, false);
    const checks = [], data = {};
    const check = (name, ok, detail) => {
      if (!ok) throw Error(name + ' :: ' + JSON.stringify(detail ?? {}));
      checks.push(name);
    };
    const board = (spawn = 12, speed = 0) => {
      s.reset(spawn, true);
      a(0.3);
      s.rideable = 'longboard';
      s.board.reset();
      s.velocity.set(Math.sin(s.yaw) * speed, 0, Math.cos(s.yaw) * speed);
      s.body.setLinvel(s.velocity, true);
      a(1 / 120);
    };
    const render = () => { g.rider.update(s, 1 / 60, 1); };

    // ---- Riding on existing ground ----------------------------------------
    board(12, 0);
    for (let i = 0; i < 12; i++) { a(1 / 120, { pressed: { hop: true } }); a(0.69); } // Normal preset: A pushes
    data.pushed = +s.speed.toFixed(2);
    check('Pushing reaches a cruising pace', s.speed > 5 && s.speed <= TUNE.boardPushMaxSpeed, data);
    a(3, { held: { brake: 1 } });
    check('The foot brake brings the board to a stop', s.speed < 0.3, { speed: s.speed });

    board(12, 6);
    const yaw0 = s.yaw;
    a(1.2, { steer: 1 });
    data.carve = { turned: +(s.yaw - yaw0).toFixed(2), speed: +s.speed.toFixed(2), state: s.state };
    check('Leaning carves the board', Math.abs(s.yaw - yaw0) > 0.8 && s.grounded, data.carve);

    board(12, 10);
    a(0.5, { steer: 1, held: { rightModifier: 1 } });
    const travel = Math.atan2(s.velocity.x, s.velocity.z);
    data.slide = { across: +Math.abs(Math.sin(s.yaw - travel)).toFixed(2), speed: +s.speed.toFixed(2) };
    check('RB with a hard lean slides the board across its travel', data.slide.across > 0.5 && s.speed < 8.5, data.slide);

    // ---- Ramps: the shared riding physics work for the board ---------------
    for (const [name, x, z, yaw, speed] of [['small box bank', -2.5, -13, 0, 10], ['quarter', 6, 12, 0, 11]]) {
      s.reset(0, true); a(0.3); s.rideable = 'longboard'; s.board.reset();
      s.position.set(x, terrainHeight(x, z) + TUNE.radius, z); s.previousPosition.copy(s.position); s.body.setTranslation(s.position, true);
      s.yaw = s.previousYaw = yaw; s.velocity.set(Math.sin(yaw) * speed, 0, Math.cos(yaw) * speed); s.body.setLinvel(s.velocity, true);
      let peak = s.position.y, bailed = false, airborne = false;
      for (let i = 0; i < 480; i++) { a(1 / 120); peak = Math.max(peak, s.position.y); bailed ||= s.state === 'Bail'; airborne ||= s.state === 'Airborne'; }
      data[name] = { peak: +peak.toFixed(2), airborne, bailed, state: s.state, landing: s.lastLanding };
      check(`A longboard rides the ${name} and lands without bailing`, !bailed && peak > 1, data[name]);
    }

    // ---- Scooter-only systems stay with the scooter -------------------------
    board(12, 6);
    a(1 / 120, { pressed: { brakeBars: true } }); a(0.4);
    check('B starts no barspin on a longboard', Math.abs(s.tricks.bars.angle) < 1e-6 && s.state !== 'Airborne');
    board(12, 6);
    a(0.12, { ry: 1 }); a(1 / 120, { ry: -1 });
    let flipped = false;
    for (let i = 0; i < 60; i++) { a(1 / 120, { lean: -1, held: { brake: 1, pumpGrind: 1 } }); flipped ||= s.bodyFlip.active; }
    check('The flip chord does not flip a longboard', !flipped);
    const rail = g.park.rails.find((r) => r.kind === 'rail');
    const mid = rail.a.clone().lerp(rail.b, 0.5), dir = rail.b.clone().sub(rail.a).normalize();
    board(12, 0);
    s.position.copy(mid).add({ x: 0, y: 0.3, z: 0 }); s.previousPosition.copy(s.position); s.body.setTranslation(s.position, true);
    s.velocity.copy(dir).multiplyScalar(6); s.velocity.y = -1; s.body.setLinvel(s.velocity, true);
    s.yaw = Math.atan2(dir.x, dir.z); s.grounded = false; s.state = 'Airborne'; s.airTime = 0.2;
    a(0.2, { held: { pumpGrind: 1 } });
    check('A longboard does not lock onto grind rails', !s.grind);

    // ---- Mount, carry, bail and the rendered rig -----------------------------
    board(12, 0);
    a(0.2);
    a(1 / 120, { pressed: { body: true } });
    check('Y dismounts to walking with the board', s.walking && s.rideable === 'longboard');
    a(0.5, { lean: -1 }); render();
    check('Walking shows the carried board, not the scooter', g.rider.board.visible && !g.rider.scooter.visible);
    const hand = g.rider.hands[0].getWorldPosition(new g.rider.root.position.constructor());
    // Walking: knuckles round the top truck. Standing: the board tucked under the arm.
    const V = g.rider.root.position.constructor;
    const truck = g.rider.boardAssembly.hangers.map((h) => h.getWorldPosition(new V()).distanceTo(hand));
    data.carryGap = +Math.min(...truck).toFixed(3);
    check('The carrying hand holds the board by its truck', data.carryGap < 0.12, data);
    a(0.3);
    a(1 / 120, { pressed: { body: true } });
    check('Y mounts the board again', !s.walking && s.rideable === 'longboard');

    board(12, 5);
    a(0.6, { steer: 1 }); render();
    const hangers = g.rider.boardAssembly.hangers;
    check('Leaning steers the hangers in opposite senses', hangers.length === 2 && Math.abs(hangers[0].quaternion.y) > 1e-4 && Math.sign(hangers[0].quaternion.y) !== Math.sign(hangers[1].quaternion.y));
    const wheel = g.rider.boardAssembly.wheels[0].rotation.x;
    a(0.3); render();
    check('Wheels spin with travel', g.rider.boardAssembly.wheels[0].rotation.x !== wheel);
    const grip = g.rider.assembly.gripSockets[0].getWorldPosition(new g.rider.root.position.constructor());
    const riderHand = g.rider.hands[0].getWorldPosition(new g.rider.root.position.constructor());
    check('No hand reaches for an invisible handlebar', riderHand.distanceTo(grip) > 0.15, { gap: riderHand.distanceTo(grip) });

    s.bail('test');
    for (let i = 0; i < 400 && s.state === 'Bail'; i++) a(1 / 120, { pressed: { hop: i % 60 === 59 } });
    check('A bail recovers with the longboard still the active rideable', s.state !== 'Bail' && s.rideable === 'longboard', { state: s.state });

    s.rideable = 'scooter';
    return { checks, data };
  });
  if (errors.length) throw Error('Page errors: ' + errors.join(' | '));
  console.log(JSON.stringify(result.data, null, 1));
  console.log('\nPASSED ' + result.checks.length + ' CHECKS');
  for (const c of result.checks) console.log('  ok  ' + c);
} finally {
  await browser.close();
}
