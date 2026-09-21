// Physics acceptance harness: binds scenario IDs from docs/physics/acceptance-matrix.json
// to real production fixtures in Veterans Memorial Park and checks them with
// oracles that read simulation state and events, never the requested trick
// label alone. Automated replays only: this is not a human controller test.
//
//   node tests/physics-acceptance.browser.mjs [--only Q01,B04]
//
// Writes artifacts/physics/acceptance-<build>.json. Scenarios not bound here are
// reported NOT_RUN. A failing scenario is reported as FAIL with its observations;
// tolerances are named in the result so they can be reviewed, not hidden.
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const only = (process.argv.find((a) => a.startsWith('--only=')) ?? '').slice(7).split(',').filter(Boolean);
const matrix = JSON.parse(readFileSync('docs/physics/acceptance-matrix.json', 'utf8'));
let build = 'unknown';
try {
  build = execSync('git rev-parse --short HEAD').toString().trim() + (execSync('git status --porcelain src').toString().trim() ? '+dirty' : '');
} catch {}
mkdirSync('artifacts/physics', { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.BROWSER_EXECUTABLE || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
let results;
try {
  await page.goto((process.env.LAZER_URL || 'http://127.0.0.1:5174') + '/?map=outdoor');
  await page.waitForFunction(() => window.__LAZER, null, { timeout: 90000 });
  results = await page.evaluate(async (only) => {
    const g = window.__LAZER;
    g.testing(true);
    await g.startSession('outdoor', true);
    const s = g.sim;
    const { TUNE } = await import('/src/core/config.ts');
    const { terrainHeight } = await import('/src/park/park.ts');
    const { outdoorLip, modules, rampLips, smallBoxLedge } = await import('/src/park/outdoor.ts');
    const { metalQuarters } = await import('/src/park/memorial.ts');
    const dt = TUNE.step;
    const TAU = Math.PI * 2;
    const quarter = (id) => modules.find((m) => m.id === id);

    // ---- Fixture runner --------------------------------------------------
    // Places the rider on real terrain with a heading and speed, then replays a
    // timestamped input script tick by tick and records what actually happened.
    function ride({ x, z, yaw, speed, stance = 'regular', style = 'pro', rideable = 'scooter', seconds = 4, script = () => ({}), stopWhen, record }) {
      s.reset(0, true);
      g.advance(0.3, {}, false);
      s.rideable = rideable;
      s.tricks.stance = stance;
      s.tricks.controlStyle = style;
      s.position.set(x, terrainHeight(x, z) + TUNE.radius, z);
      s.previousPosition.copy(s.position);
      s.body.setTranslation(s.position, true);
      s.yaw = s.previousYaw = yaw;
      s.velocity.set(Math.sin(yaw) * speed, 0, Math.cos(yaw) * speed);
      s.body.setLinvel(s.velocity, true);
      const captured = [];
      let tick = 0;
      const off = g.events.on((e) => captured.push({ ...e, tick }));
      const trace = [];
      for (let i = 0; i < Math.round(seconds / dt); i++) {
        const before = { vy: s.velocity.y, y: s.position.y, pitch: s.pitch, state: s.state, grounded: s.grounded, grind: !!s.grind };
        tick = i;
        const input = script(i, s) ?? {};
        g.advance(dt, input, false);
        const lip = outdoorLip(s.position.x, s.position.z, s.velocity.z, s.velocity.x);
        const row = {
          i, t: +(i * dt).toFixed(4), state: s.state, grounded: s.grounded, grind: s.grind?.rail.id ?? null,
          x: s.position.x, y: s.position.y, z: s.position.z, vx: s.velocity.x, vy: s.velocity.y, vz: s.velocity.z,
          speed: s.velocity.length(), pitch: s.pitch, ny: s.normal.y, lipDistance: lip?.distance ?? null,
          dVy: s.velocity.y - before.vy, dPitch: s.pitch - before.pitch, wasGrounded: before.grounded, wasGrind: before.grind,
          flip: s.bodyFlip.angle, deck: s.tricks.deck.angle, bars: s.tricks.bars.angle,
          launchId: s.launch?.id ?? null, launchKind: s.launch?.kind ?? null,
        };
        if (record) Object.assign(row, record(s, i));
        // Successful landing resets the channels. Read their contact values,
        // otherwise every catch assertion would see an artificial zero.
        const contact = s.diagnostics.landings.at(-1);
        if (!before.grounded && s.grounded && contact?.t === s.elapsed)
          Object.assign(row, { deck: contact.deck, bars: contact.bars, bri: contact.bri });
        trace.push(row);
        if (stopWhen?.(s, row, trace)) break;
      }
      off();
      const events = captured.map((e) => ({ tick: e.tick, type: e.type, name: e.name, quality: e.quality, reason: e.reason, charge: e.charge }));
      return { trace, events };
    }

    // ---- Independent observations ------------------------------------------
    const airSessions = (trace) => {
      const sessions = [];
      let current = null;
      for (const r of trace) {
        const air = !r.grounded && !r.grind && r.state !== 'Bail';
        if (air && !current) current = { start: r.i, rows: [] };
        if (current) current.rows.push(r);
        if (!air && current) { current.end = r.i; sessions.push(current); current = null; }
      }
      if (current) sessions.push(current);
      return sessions;
    };
    // An upward velocity change while airborne that gravity cannot explain is a
    // launch impulse. The first airborne tick carries the takeoff itself.
    // A departure replaced by a pop inside the grace window is the same launch
    // (same id, natural -> pop, within coyote time of leaving). It is listed as a
    // replacement, not exempted silently; its height is bounded by B04's peak rule.
    const replacements = [];
    const extraLaunches = (trace) => {
      const jumps = [];
      for (const session of airSessions(trace))
        session.rows.slice(1).forEach((r) => {
          if (r.wasGrounded || r.wasGrind || r.grounded || r.grind || r.state === 'Bail' || r.dVy <= 1.0) return;
          const previous = trace[r.i - 1];
          const replacement = previous?.launchKind === 'natural' && r.launchKind === 'pop' && previous.launchId === r.launchId && (r.i - session.start) * dt <= TUNE.coyoteTime + dt;
          (replacement ? replacements : jumps).push({ i: r.i, dVy: +r.dVy.toFixed(2), y: +r.y.toFixed(2) });
        });
      return jumps;
    };
    const popEvents = (events, from = -Infinity, to = Infinity) => events.filter((e) => e.type === 'pop' && e.tick >= from && e.tick <= to).length;
    const landings = (events) => events.filter((e) => e.type === 'landing').map((e) => e.quality);
    const tricks = (events) => events.filter((e) => e.type === 'trick').map((e) => e.name);
    const bails = (events) => events.filter((e) => e.type === 'bail').map((e) => e.reason);
    const peak = (trace) => Math.max(...trace.map((r) => r.y));
    const firstTouchdownAfterAir = (trace) => {
      let air = false;
      for (const r of trace) {
        if (!r.grounded && !r.grind) air = true;
        else if (air && r.grounded) return r;
      }
      return null;
    };
    const maxAbs = (rows, key) => rows.reduce((m, r) => Math.max(m, Math.abs(r[key])), 0);
    const flipNames = (names) => names.filter((n) => /flip|flair/i.test(n));

    const results = {};
    const scenario = (id, fn) => {
      if (only.length && !only.includes(id)) return;
      try {
        const r = fn();
        results[id] = { status: r.failures.length ? 'FAIL' : 'PASS', failures: r.failures, observations: r.observations, tolerances: r.tolerances ?? {} };
      } catch (error) {
        results[id] = { status: 'ERROR', failures: [String(error?.stack ?? error)], observations: {} };
      }
    };
    const expect = (failures, ok, message) => { if (!ok) failures.push(message); };

    // ---- Q: quarter and halfpipe -------------------------------------------
    // A plain air at a quarter: release near the coping, no invented energy, a
    // return onto the transition below the coping, and riding away.
    // A rider turning in the air: steers the rotation so the scooter axis meets
    // the horizontal travel direction (either end, fakie allowed). Positive steer
    // spins toward negative yaw (AirSpinControl).
    const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    const turnToTravel = (i, s) => {
      if (s.grounded || s.grind || Math.hypot(s.velocity.x, s.velocity.z) < 1) return {};
      const travel = Math.atan2(s.velocity.x, s.velocity.z);
      const e1 = wrapAngle(travel - s.yaw), e2 = wrapAngle(travel + Math.PI - s.yaw);
      const error = Math.abs(e1) < Math.abs(e2) ? e1 : e2;
      return { steer: -Math.max(-1, Math.min(1, error * 3 - s.spin * 0.3)) };
    };
    const plainQuarterAir = ({ module, speed, stance, yawOffset = 0, script }) => {
      const m = quarter(module), lip = rampLips(m)[0], toward = m.reverse ? -1 : 1;
      // Angled fixtures start offset so the whole air stays over this quarter's width.
      const x = (m.x0 + m.x1) / 2 + 3 - Math.sign(yawOffset * toward) * 9;
      const z = lip - toward * 14;
      const yaw = (toward > 0 ? 0 : Math.PI) + yawOffset;
      const run = ride({ x, z, yaw, speed, stance, seconds: 5, script });
      const failures = [], trace = run.trace, events = run.events;
      const sessions = airSessions(trace);
      const air = sessions[0];
      const release = air?.rows[0];
      const touchdown = firstTouchdownAfterAir(trace);
      const apex = air ? Math.max(...air.rows.map((r) => r.y)) : null;
      const allowedApex = release ? release.y + (release.vy * release.vy) / (2 * TUNE.gravity) + 0.05 : null;
      const around = touchdown ? trace.filter((r) => Math.abs(r.i - touchdown.i) <= 12) : [];
      const after = touchdown ? trace.find((r) => r.i === touchdown.i + Math.round(1.5 / dt)) : null;
      expect(failures, !!air, 'no air was produced');
      expect(failures, !!release && release.y > m.h - 0.6, `released too far below the coping (y ${release?.y.toFixed(2)} vs coping ${m.h})`);
      expect(failures, apex !== null && apex <= allowedApex, `apex ${apex?.toFixed(2)} exceeds ballistic limit ${allowedApex?.toFixed(2)}`);
      expect(failures, extraLaunches(trace).length === 0, 'extra launch impulse in the air: ' + JSON.stringify(extraLaunches(trace)));
      const windowPops = air && touchdown ? popEvents(events, air.start - 30, touchdown.i) : popEvents(events);
      expect(failures, windowPops <= 1, `${windowPops} launch events for one air`);
      expect(failures, !!touchdown && touchdown.ny < 0.8, `did not return onto the transition (touchdown normal y ${touchdown?.ny.toFixed(2)})`);
      const transitionMinZ = Math.min(lip, m.reverse ? m.z1 : m.z0);
      const transitionMaxZ = Math.max(lip, m.reverse ? m.z1 : m.z0);
      const sameTransition = touchdown && touchdown.x >= m.x0 && touchdown.x <= m.x1 && touchdown.z >= transitionMinZ && touchdown.z <= transitionMaxZ;
      expect(failures, !!sameTransition, `touchdown was not on ${module} (x/z ${touchdown?.x.toFixed(2)}/${touchdown?.z.toFixed(2)})`);
      expect(failures, !!touchdown && touchdown.y < m.h + TUNE.radius / 0.3, 're-entry above the coping');
      expect(failures, !bails(events).length, 'bailed: ' + bails(events).join(','));
      expect(failures, landings(events).every((q) => q === 'clean' || q === 'good'), 'landing grade ' + landings(events).join(','));
      // Ride-away: still rolling 1.5 s later with no bail or sketchy landing in between
      // (a later clean air over another feature is still riding away).
      const between = touchdown && after ? events.filter((e) => e.tick > touchdown.i && e.tick <= after.i) : [];
      expect(failures, !!after && after.state !== 'Bail' && after.speed > 2.5 && !between.some((e) => e.type === 'bail' || (e.type === 'landing' && e.quality !== 'clean' && e.quality !== 'good')), `did not ride away (after 1.5 s: ${after?.state} ${after?.speed.toFixed(2)} m/s)`);
      expect(failures, flipNames(tricks(events)).length === 0 && maxAbs(trace, 'flip') < 0.5, 'plain air credited or animated as a flip');
      expect(failures, maxAbs(around, 'dPitch') <= 0.06, `pitch snapped at touchdown (${maxAbs(around, 'dPitch').toFixed(3)} rad/tick)`);
      return {
        failures,
        observations: {
          fixture: { module, lip, speed, stance, yawOffset, start: [x, z] },
          release: release && { tick: release.i, y: +release.y.toFixed(3), vy: +release.vy.toFixed(2), lipDistanceBefore: trace[release.i - 1]?.lipDistance && +trace[release.i - 1].lipDistance.toFixed(2) },
          apex: apex && +apex.toFixed(2), allowedApex: allowedApex && +allowedApex.toFixed(2),
          touchdown: touchdown && { tick: touchdown.i, x: +touchdown.x.toFixed(2), y: +touchdown.y.toFixed(2), z: +touchdown.z.toFixed(2), normalY: +touchdown.ny.toFixed(2), module: sameTransition ? module : null },
          maxPitchStepAtTouchdown: +maxAbs(around, 'dPitch').toFixed(3),
          events: events.filter((e) => ['pop', 'landing', 'trick', 'bail'].includes(e.type)),
          rideAway: after && { state: after.state, speed: +after.speed.toFixed(2) },
        },
        tolerances: { apexEnergyMargin_m: 0.05, pitchStepAtTouchdown_rad: 0.06, launchImpulseDetection_mps: 1.0 },
      };
    };
    scenario('Q01', () => plainQuarterAir({ module: 'back-quarter', speed: 11, stance: 'regular' }));
    scenario('Q02', () => {
      const back = plainQuarterAir({ module: 'back-quarter', speed: 11, stance: 'goofy' });
      const front = plainQuarterAir({ module: 'front-quarter', speed: 11, stance: 'goofy' });
      const failures = [...back.failures.map((f) => 'back/goofy: ' + f), ...front.failures.map((f) => 'front/goofy: ' + f)];
      const signs = Math.abs((back.observations.apex ?? 0) - (front.observations.apex ?? 0));
      if (signs > 0.1) failures.push(`opposite walls disagree: apex difference ${signs.toFixed(2)} m`);
      return { failures, observations: { back: back.observations, front: front.observations }, tolerances: { wallApexAgreement_m: 0.1 } };
    });
    scenario('Q03', () => {
      // An angled air comes back down across the wall; without turning, the axis
      // is ~60 deg off travel and a sketchy grade is the honest result. The fixture
      // rider turns in the air as a real rider does.
      const angled = plainQuarterAir({ module: 'back-quarter', speed: 11.5, stance: 'regular', yawOffset: 0.5, script: turnToTravel });
      const low = plainQuarterAir({ module: 'back-quarter', speed: 10.2, stance: 'regular' });
      const failures = [...angled.failures.map((f) => 'angled: ' + f), ...low.failures.map((f) => 'low: ' + f)];
      const lowAir = (low.observations.apex ?? 0) - quarter('back-quarter').h;
      if (!(lowAir < 1.2)) failures.push(`low-amplitude fixture was not low (apex ${lowAir.toFixed(2)} m above coping)`);
      return { failures, observations: { angled: angled.observations, low: low.observations } };
    });
    scenario('Q04', () => {
      const m = quarter('back-quarter'), lip = rampLips(m)[0], failures = [], observations = { lip };
      // Rear wheel footprint sits 0.32 m behind the centre (Simulation.support).
      for (const speed of [11, 12]) {
        // Lean forward through the takeoff, then centre the weight from the apex down.
        const run = ride({ x: 3, z: lip - 14, yaw: 0, speed, seconds: 4, script: (i, s) => ({ lean: s.grounded || s.velocity.y > 0 ? -1 : 0 }) });
        const touchdown = firstTouchdownAfterAir(run.trace), rear = touchdown && touchdown.z - 0.32;
        expect(failures, !!touchdown && rear > lip && touchdown.ny > 0.95, `${speed} m/s: forward exit did not put both wheels on the platform (rear wheel z ${rear?.toFixed(2)}, lip ${lip}, normal y ${touchdown?.ny.toFixed(2)})`);
        expect(failures, !bails(run.events).length, `${speed} m/s: bailed ` + bails(run.events).join(','));
        expect(failures, landings(run.events).slice(0, 1).every((q) => q === 'clean' || q === 'good'), `${speed} m/s: landing grade ${landings(run.events)[0]}`);
        expect(failures, extraLaunches(run.trace).length === 0, `${speed} m/s: extra launch impulse`);
        observations[speed] = { touchdown: touchdown && { z: +touchdown.z.toFixed(2), rearWheelZ: +rear.toFixed(2), y: +touchdown.y.toFixed(2), normalY: +touchdown.ny.toFixed(2) }, events: run.events.filter((e) => ['pop', 'landing', 'bail'].includes(e.type)) };
      }
      return { failures, observations, tolerances: { rearWheelOffset_m: 0.32 } };
    });
    scenario('Q05', () => {
      const spine = quarter('spine'), [lipA, lipB] = rampLips(spine);
      const run = ride({ x: 4.5, z: -9, yaw: 0, speed: 11, seconds: 4 });
      const touchdown = firstTouchdownAfterAir(run.trace), failures = [];
      expect(failures, !!touchdown && touchdown.z > lipB, `transfer did not reach the far side (touchdown z ${touchdown?.z.toFixed(2)}, far lip ${lipB})`);
      expect(failures, extraLaunches(run.trace).length === 0, 'extra launch impulse');
      expect(failures, !bails(run.events).length, 'bailed');
      return { failures, observations: { lips: [lipA, lipB], touchdown: touchdown && { z: +touchdown.z.toFixed(2), y: +touchdown.y.toFixed(2), normalY: +touchdown.ny.toFixed(2) }, events: run.events.filter((e) => ['pop', 'landing', 'bail'].includes(e.type)) } };
    });
    const halfpipeApexes = (pump) => {
      // Front and back quarters face each other across the wood park.
      const run = ride({ x: 11, z: 0, yaw: 0, speed: 12, seconds: 24, script: (i, s) => ({ held: { pumpGrind: pump && s.grounded && s.velocity.y < -0.3 ? 1 : 0 } }) });
      const apexes = [];
      for (let k = 1; k < run.trace.length - 1; k++) {
        const r = run.trace[k];
        if (run.trace[k - 1].vy > 0 && r.vy <= 0 && r.y > 1) apexes.push({ tick: r.i, y: +r.y.toFixed(3), z: +r.z.toFixed(3) });
      }
      const middleCrossings = run.trace.filter((r, k) => k > 0 && Math.sign(run.trace[k - 1].z) !== Math.sign(r.z) && Math.abs(r.z) < 0.3).length;
      return { apexes, middleCrossings, maxSpeed: Math.max(...run.trace.map((r) => r.speed)), bails: bails(run.events), pumps: run.events.filter((e) => e.type === 'pump').length };
    };
    const expectHalfpipeFlow = (failures, flow, label) => {
      expect(failures, flow.bails.length === 0, `${label}: bailed ${flow.bails.join(',')}`);
      expect(failures, flow.apexes.length >= 3, `${label}: fewer than three cycles observed`);
      expect(failures, flow.middleCrossings >= flow.apexes.length - 1, `${label}: ${flow.apexes.length} apexes but only ${flow.middleCrossings} middle crossings`);
      for (let k = 1; k < flow.apexes.length; k++)
        expect(failures, Math.sign(flow.apexes[k].z) === -Math.sign(flow.apexes[k - 1].z) && Math.abs(flow.apexes[k].z) > 20, `${label}: apexes ${k - 1}/${k} did not alternate opposing walls (${flow.apexes[k - 1].z}, ${flow.apexes[k].z})`);
    };
    scenario('Q06', () => {
      const passive = halfpipeApexes(false), failures = [];
      for (let k = 1; k < passive.apexes.length; k++)
        if (passive.apexes[k].y > passive.apexes[k - 1].y + 0.02) failures.push(`passive energy gain between cycles ${k - 1} and ${k}: ${passive.apexes[k - 1].y} -> ${passive.apexes[k].y}`);
      expectHalfpipeFlow(failures, passive, 'passive');
      return { failures, observations: passive, tolerances: { perCycleApexGain_m: 0.02 } };
    });
    scenario('Q07', () => {
      const passive = halfpipeApexes(false), active = halfpipeApexes(true), failures = [];
      for (let k = 1; k < active.apexes.length; k++)
        if (active.apexes[k].y > active.apexes[k - 1].y + 0.8) failures.push(`pump gain too large at cycle ${k}: ${active.apexes[k - 1].y} -> ${active.apexes[k].y}`);
      expectHalfpipeFlow(failures, passive, 'passive control');
      expectHalfpipeFlow(failures, active, 'active');
      expect(failures, active.maxSpeed <= TUNE.extremeSpeed, 'pumping exceeded the protective speed ceiling');
      expect(failures, active.pumps > 0, 'no pump actuations recorded, so any gain is not attributable');
      const sum = (a) => a.reduce((x, point) => x + point.y, 0);
      expect(failures, sum(active.apexes.slice(0, 4)) >= sum(passive.apexes.slice(0, 4)) - 0.2, 'pumping did not help relative to passive riding');
      return { failures, observations: { passive, active }, tolerances: { perCyclePumpGain_m: 0.8 } };
    });
    scenario('Q08', () => {
      const failures = [], observations = {};
      // Ride up each transition too slowly to leave it: the rider must stay on
      // the surface through the steep part instead of detaching.
      const metal = metalQuarters.find((m) => m.id === 'metal-west-quarter');
      const cases = [
        ['wood quarter (81 deg top)', { x: 6, z: 12, yaw: 0, speed: 10 }, 3.6],
        ['small box lip (54 deg top)', { x: -2.5, z: 12, yaw: Math.PI, speed: 8 }, 1.4],
        ['metal quarter (69 deg top)', { x: metal.x1 + 9, z: (metal.z0 + metal.z1) / 2, yaw: -Math.PI / 2, speed: 8.5 }, metal.h],
      ];
      for (const [name, fixture, height] of cases) {
        const base = terrainHeight(fixture.x, fixture.z), coping = base + height;
        const run = ride({ ...fixture, seconds: 2.5 });
        const steepest = Math.min(...run.trace.filter((r) => r.grounded).map((r) => r.ny));
        // Leaving the surface upward well below the coping is a detachment, whatever the lip helper says.
        const detached = run.trace.find((r, k) => k > 0 && run.trace[k - 1].grounded && !r.grounded && !r.grind && r.vy > 0.5 && r.y < coping - 0.8);
        observations[name + ' detail'] = { coping: +coping.toFixed(2), release: (() => { const k = run.trace.findIndex((r, k) => k > 0 && run.trace[k - 1].grounded && !r.grounded); return k > 0 ? { y: +run.trace[k].y.toFixed(2), vy: +run.trace[k].vy.toFixed(2), x: +run.trace[k].x.toFixed(2), z: +run.trace[k].z.toFixed(2) } : null; })() };
        observations[name] = { steepestGroundedNormalY: +steepest.toFixed(2), detachedBeforeLip: !!detached, bails: bails(run.events) };
        expect(failures, steepest < 0.7, `${name}: never rode the steep part (normal y ${steepest.toFixed(2)})`);
        expect(failures, !detached, `${name}: detached from the transition before its lip`);
        expect(failures, !bails(run.events).length, `${name}: bailed`);
      }
      return { failures, observations };
    });

    // ---- B: charged big-box takeoffs ----------------------------------------
    // The large transfer box: lip at z = 4, approached from +z heading -z.
    const bigBox = ({ speed = 12, script, style = 'pro', seconds = 3.5 }) => ride({ x: -10, z: 14, yaw: Math.PI, speed, style, seconds, script });
    const largeTransfer = quarter('large-transfer');
    const largeTransferDeckEnd = rampLips(largeTransfer)[0] - largeTransfer.deck;
    // Ignore a one-frame spawn settle left by the previous fixture; box input
    // starts at tick 40, so the relevant air session must start after that.
    const boxAir = (run) => airSessions(run.trace).find((session) => session.start > 40);
    const boxTouchdown = (run) => { const air = boxAir(run); return air && run.trace.find((r) => r.i >= (air.end ?? Infinity) && r.grounded); };
    const clearedLargeTransfer = (touchdown) => !!touchdown && touchdown.x >= largeTransfer.x0 && touchdown.x <= largeTransfer.x1 && touchdown.z < largeTransferDeckEnd;
    const holdThenRelease = (releaseTick, extra = {}) => (i) => {
      if (i < 40) return {};
      if (releaseTick === null || i < releaseTick) return { ry: 1 };
      if (i === releaseTick) return { ry: -1, ...extra };
      return {};
    };
    const naturalReleaseTick = () => {
      const run = bigBox({ script: (i) => ({ ry: i > 40 ? 1 : 0 }) });
      return boxAir(run)?.start ?? null;
    };
    const launchCheck = (run, failures, label) => {
      const extra = extraLaunches(run.trace);
      expect(failures, extra.length === 0, `${label}: extra launch impulse ${JSON.stringify(extra)}`);
      expect(failures, popEvents(run.events) <= 1, `${label}: ${popEvents(run.events)} launch events`);
    };
    scenario('B01', () => {
      const failures = [], observations = {};
      for (const speed of [10, 12, 14]) {
        const run = bigBox({ speed, script: (i) => ({ ry: i > 40 ? 1 : 0 }) });
        launchCheck(run, failures, `speed ${speed}`);
        expect(failures, !bails(run.events).length, `speed ${speed}: bailed ${bails(run.events)}`);
        const touchdown = boxTouchdown(run);
        expect(failures, clearedLargeTransfer(touchdown), `speed ${speed}: did not clear the large-transfer deck (touchdown x/z ${touchdown?.x.toFixed(2)}/${touchdown?.z.toFixed(2)})`);
        observations[speed] = { peak: +peak(run.trace).toFixed(2), touchdown: touchdown && { x: +touchdown.x.toFixed(2), z: +touchdown.z.toFixed(2) }, landings: landings(run.events), bails: bails(run.events) };
      }
      return { failures, observations };
    });
    const trickOverBox = (name, button) => {
      const release = naturalReleaseTick() - 3;
      const run = bigBox({ script: holdThenRelease(release, { pressed: { [button]: true } }) });
      const failures = [];
      launchCheck(run, failures, name);
      expect(failures, tricks(run.events).some((t) => t.includes(name)), `${name} was not confirmed (tricks: ${tricks(run.events).join(',')})`);
      expect(failures, !bails(run.events).length && landings(run.events).every((q) => q !== 'failed'), 'landing failed: ' + bails(run.events).join(','));
      const touchdown = boxTouchdown(run);
      const part = name === 'Barspin' ? 'bars' : 'deck';
      const partTravel = Math.max(...run.trace.map((r) => Math.abs(r[part])));
      expect(failures, partTravel > TAU - 0.35, `${part} never completed a full rotation (max ${partTravel.toFixed(2)} rad)`);
      expect(failures, !!touchdown && Math.abs(((touchdown[part] % TAU) + TAU) % TAU) < 0.35 || Math.abs(((touchdown?.[part] % TAU) + TAU) % TAU - TAU) < 0.35, `${part} not caught at touchdown (${touchdown?.[part]?.toFixed(2)} rad)`);
      expect(failures, clearedLargeTransfer(touchdown), `${name} did not clear the large-transfer deck (touchdown x/z ${touchdown?.x.toFixed(2)}/${touchdown?.z.toFixed(2)})`);
      return { failures, observations: { releaseTick: release, peak: +peak(run.trace).toFixed(2), tricks: tricks(run.events), landings: landings(run.events), partTravel: +partTravel.toFixed(3), partAngleAtTouchdown: touchdown && +touchdown[part].toFixed(3), touchdown: touchdown && { x: +touchdown.x.toFixed(2), z: +touchdown.z.toFixed(2) } } };
    };
    scenario('B02', () => trickOverBox('Barspin', 'brakeBars'));
    scenario('B03', () => trickOverBox('Tailwhip', 'pushDeck')); // Normal preset: X whips
    scenario('B04', () => {
      const failures = [], observations = { offsets: {} };
      const natural = naturalReleaseTick();
      observations.naturalReleaseTick = natural;
      // A release after the natural departure may still count inside the grace
      // window, but it can never out-launch the best release made on the lip.
      let reference = -Infinity;
      for (const offset of [-6, -3, -1, 0, 1, 3]) {
        const run = bigBox({ script: holdThenRelease(natural + offset) });
        const p = peak(run.trace);
        if (offset <= 0) reference = Math.max(reference, p);
        launchCheck(run, failures, `offset ${offset}`);
        expect(failures, offset <= 0 || p <= reference + 0.1, `offset ${offset}: late release peak ${p.toFixed(2)} above the best on-lip release ${reference.toFixed(2)}`);
        replacements.length = 0;
        observations.offsets[offset] = { peak: +p.toFixed(2), pops: popEvents(run.events), landings: landings(run.events), bails: bails(run.events), extra: extraLaunches(run.trace), inGraceReplacement: [...replacements] };
      }
      // Pressing the trick button late while still holding the charge.
      const late = bigBox({ script: (i) => (i < 40 ? {} : i === natural + 1 ? { ry: 1, pressed: { pushDeck: true } } : { ry: 1 }) });
      launchCheck(late, failures, 'late A with charge held');
      observations.lateButton = { peak: +peak(late.trace).toFixed(2), pops: popEvents(late.events), extra: extraLaunches(late.trace) };
      return { failures, observations, tolerances: { latePeakAboveBestOnLip_m: 0.1 } };
    });
    scenario('B05', () => {
      const failures = [];
      const run = bigBox({ speed: 6, script: (i, s) => { const lip = outdoorLip(s.position.x, s.position.z, s.velocity.z, s.velocity.x); return i > 40 && lip && lip.distance < 0.3 ? { ry: -1 } : { ry: i > 40 ? 1 : 0 }; } });
      const ghost = run.trace.find((r) => r.y < terrainHeight(r.x, r.z) + 0.05);
      expect(failures, !ghost, `rider passed below the box surface at z ${ghost?.z.toFixed(2)}`);
      const deckEnd = modules.find((m) => m.id === 'large-transfer');
      const cleared = run.trace.some((r) => r.z < 1.5);
      return { failures, observations: { cleared, peak: +peak(run.trace).toFixed(2), landings: landings(run.events), bails: bails(run.events), finalState: run.trace.at(-1).state } };
    });
    scenario('B06', () => {
      const failures = [], observations = {};
      const natural = naturalReleaseTick();
      for (const style of ['pro', 'arcade']) {
        const run = bigBox({ style, script: holdThenRelease(natural - 2) });
        launchCheck(run, failures, style);
        observations[style] = { peak: +peak(run.trace).toFixed(2), pops: popEvents(run.events), landings: landings(run.events) };
      }
      return { failures, observations };
    });

    // ---- X07: jump-to-mount ---------------------------------------------------
    scenario('X07', () => {
      const failures = [], observations = {};
      s.reset(12, true); g.advance(0.4, {}, false);
      s.walking = true; s.running = true; s.hasScooter = true; s.walkCameraYaw = 0;
      g.advance(1.2, { lean: 1 }, false);
      g.advance(dt, { lean: 1, pressed: { hop: true } }, false);
      g.advance(0.3, { lean: 1 }, false);
      observations.jumpOnly = { walking: s.walking, armed: !!s.jumpOn };
      expect(failures, s.walking && !s.jumpOn, 'a jump alone placed or mounted the scooter');
      s.reset(12, true); g.advance(0.4, {}, false);
      s.walking = true; s.running = true; s.hasScooter = true; s.walkCameraYaw = 0;
      g.advance(1.2, { lean: 1 }, false);
      g.advance(dt, { lean: 1, pressed: { hop: true } }, false);
      g.advance(0.1, { lean: 1 }, false);
      g.advance(dt, { lean: 1, pressed: { body: true } }, false);
      let jump = 0, mounted = false, previous = s.position.clone();
      for (let i = 0; i < 120 && !mounted; i++) {
        const v = s.velocity.clone();
        g.advance(dt, { lean: 1 }, false);
        jump = Math.max(jump, s.position.distanceTo(previous) - Math.max(v.length(), s.velocity.length()) * dt);
        previous = s.position.clone();
        mounted = !s.walking;
      }
      observations.jumpThenY = { mounted, largestUnexplainedStep_m: +jump.toFixed(3) };
      expect(failures, mounted, 'A then Y did not mount');
      expect(failures, jump < 0.3, `mount moved the rider ${jump.toFixed(2)} m in one tick`);
      return { failures, observations };
    });

    // ---- G01: small-box ledge grind clearance ------------------------------------
    scenario('G01', () => {
      const ledge = smallBoxLedge(), failures = [], observations = {};
      const V = s.position.constructor;
      const PIPE = 0.045; // Park.rail collider and mesh radius
      // Signed depth of a world point inside the ledge slab and the skirt under it (positive = inside).
      const inSlab = (p) => {
        let best = -Infinity;
        for (let k = 0; k < ledge.line.length - 1; k++) {
          const a = ledge.line[k], b = ledge.line[k + 1], run = b.clone().sub(a), len = run.length(), dir = run.clone().normalize();
          const along = p.clone().sub(a).dot(dir);
          if (along < 0 || along > len) continue;
          const up = new V(0, 1, 0).addScaledVector(dir, -dir.y).normalize();
          const rel = p.clone().sub(a), across = Math.abs(rel.x), height = rel.dot(up);
          if (height > -0.95) best = Math.max(best, Math.min(ledge.width / 2 - across, ledge.thick / 2 - height));
        }
        return best;
      };
      const rails = g.park.rails.filter((r) => r.id.startsWith('Small box ledge '));
      // Depth inside any ledge pipe (positive = inside).
      const inPipe = (p) => {
        let best = -Infinity;
        for (const r of rails) {
          const ab = r.b.clone().sub(r.a), t = Math.max(0, Math.min(1, p.clone().sub(r.a).dot(ab) / ab.lengthSq()));
          best = Math.max(best, PIPE - p.distanceTo(r.a.clone().addScaledVector(ab, t)));
        }
        return best;
      };
      // Every scooter mesh, sampled from its real vertices (no rider body).
      const samples = [];
      g.rider.scooter.traverse((o) => {
        if (!o.isMesh) return;
        const pos = o.geometry.attributes.position, step = Math.max(1, Math.floor(pos.count / 80));
        const points = [];
        for (let i = 0; i < pos.count; i += step) points.push(new V().fromBufferAttribute(pos, i));
        samples.push({ mesh: o, points, part: /wheel|bearing/i.test(o.name) ? 'wheel' : 'deck/fork' });
      });
      const runs = [];
      for (const side of [-1, 1]) {
        const seg = (i) => rails.find((r) => r.id === `Small box ledge ${side} ${i}`);
        // From the low end of the up ledge, from the low end of the down ledge (riding
        // up it backwards along the rail), and joining the flat top in both directions.
        runs.push({ key: `side ${side} from up-ledge foot`, rail: seg(0), at: 0.08, reverse: false, speed: 7.5 });
        runs.push({ key: `side ${side} from down-ledge foot`, rail: seg(2), at: 0.92, reverse: true, speed: 7.5 });
        runs.push({ key: `side ${side} flat top forward`, rail: seg(1), at: 0.15, reverse: false, speed: 5 });
        runs.push({ key: `side ${side} flat top backward`, rail: seg(1), at: 0.85, reverse: true, speed: 5 });
      }
      let worstAll = -Infinity;
      for (const run of runs) {
        const dir = run.rail.b.clone().sub(run.rail.a).normalize();
        if (run.reverse) dir.negate();
        const start = run.rail.a.clone().lerp(run.rail.b, run.at);
        s.reset(0, true); g.advance(0.3, {}, false);
        // Approach as a rider jumping onto the ledge does: lined up with it, clear
        // above it (0.35 m square to the rail), settling onto it.
        const slope = Math.asin(dir.y), normal = new V(0, Math.cos(slope), 0).addScaledVector(dir.clone().setY(0).normalize(), -Math.sin(slope));
        s.position.copy(start).addScaledVector(normal, 0.35); s.previousPosition.copy(s.position); s.body.setTranslation(s.position, true);
        s.velocity.copy(dir).multiplyScalar(run.speed).addScaledVector(normal, -1); s.body.setLinvel(s.velocity, true);
        s.yaw = s.previousYaw = Math.atan2(dir.x, dir.z); s.pitch = -slope; s.grounded = false; s.state = 'Airborne'; s.airTime = 0.2; s.tricks.startAir(false);
        let grindTicks = 0, sustained = 0, worst = -Infinity, worstPart = '', worstSurface = '', segments = new Set(), deepTicks = 0;
        for (let i = 0; i < 480; i++) {
          g.advance(dt, { held: { pumpGrind: 1 } }, false);
          if (!s.grind) { if (grindTicks) break; continue; }
          grindTicks++;
          segments.add(s.grind.rail.id);
          g.rider.update(s, dt, 1);
          g.rider.root.updateMatrixWorld(true);
          let tickWorst = -Infinity;
          for (const { mesh, points, part } of samples)
            for (const q of points) {
              const p = q.clone().applyMatrix4(mesh.matrixWorld);
              const slab = inSlab(p), pipe = inPipe(p);
              const d = Math.max(slab, pipe);
              tickWorst = Math.max(tickWorst, d);
              if (d > worst) { worst = d; worstPart = part; worstSurface = slab >= pipe ? 'slab' : 'pipe'; }
            }
          if (tickWorst > 0.002) deepTicks++;
        }
        observations[run.key] = { grindTicks, segments: [...segments], maxPenetration_m: +worst.toFixed(3), part: worstPart, surface: worstSurface, ticksOverAlert: deepTicks };
        worstAll = Math.max(worstAll, worst);
        const alert = Math.max(0.002, 0.03 * 0.055);
        expect(failures, grindTicks > 20, `${run.key}: grind did not hold (${grindTicks} ticks)`);
        expect(failures, worst <= alert, `${run.key}: ${worstPart} ${worst.toFixed(3)} m inside the ${worstSurface} (${deepTicks} ticks over alert)`);
      }
      return { failures, observations, tolerances: { penetrationAlert_m: Math.max(0.002, 0.03 * 0.055), pipeRadius_m: PIPE, verticesPerMesh: '<= 80' } };
    });

    // ---- Ledge grind helpers shared by G03/G06 -----------------------------------
    const ledgeGrind = ({ side, seg, at, reverse, speed }) => {
      const V = s.position.constructor;
      const rail = g.park.rails.find((r) => r.id === `Small box ledge ${side} ${seg}`);
      const dir = rail.b.clone().sub(rail.a).normalize(); if (reverse) dir.negate();
      const start = rail.a.clone().lerp(rail.b, at);
      s.reset(0, true); g.advance(0.3, {}, false);
      const slope = Math.asin(dir.y), normal = new V(0, Math.cos(slope), 0).addScaledVector(dir.clone().setY(0).normalize(), -Math.sin(slope));
      s.position.copy(start).addScaledVector(normal, 0.35); s.previousPosition.copy(s.position); s.body.setTranslation(s.position, true);
      s.velocity.copy(dir).multiplyScalar(speed).addScaledVector(normal, -1); s.body.setLinvel(s.velocity, true);
      s.yaw = s.previousYaw = Math.atan2(dir.x, dir.z); s.pitch = -slope; s.grounded = false; s.state = 'Airborne'; s.airTime = 0.2; s.tricks.startAir(false);
      return dir;
    };
    // Deepest scooter vertex inside a ledge pipe or the slab (positive = inside).
    const edgeDepth = (() => {
      const ledge = smallBoxLedge(), rails = g.park.rails.filter((r) => r.id.startsWith('Small box ledge ')), V = s.position.constructor;
      const pts = [];
      g.rider.scooter.traverse((o) => { if (!o.isMesh) return; const p = o.geometry.attributes.position, st = Math.max(1, Math.floor(p.count / 60)); for (let i = 0; i < p.count; i += st) pts.push([o, new V().fromBufferAttribute(p, i)]); });
      return () => {
        g.rider.update(s, dt, 1); g.rider.root.updateMatrixWorld(true);
        let worst = -Infinity;
        for (const [o, q] of pts) {
          const p = q.clone().applyMatrix4(o.matrixWorld);
          for (const r of rails) { const ab = r.b.clone().sub(r.a), k = Math.max(0, Math.min(1, p.clone().sub(r.a).dot(ab) / ab.lengthSq())); worst = Math.max(worst, 0.045 - p.distanceTo(r.a.clone().addScaledVector(ab, k))); }
          for (let k = 0; k < ledge.line.length - 1; k++) {
            const a = ledge.line[k], b = ledge.line[k + 1], dirL = b.clone().sub(a), len = dirL.length(); dirL.normalize();
            const along = p.clone().sub(a).dot(dirL); if (along < 0 || along > len) continue;
            const up = new V(0, 1, 0).addScaledVector(dirL, -dirL.y).normalize(), rel = p.clone().sub(a), h = rel.dot(up);
            if (h > -0.95) worst = Math.max(worst, Math.min(ledge.width / 2 - Math.abs(rel.x), ledge.thick / 2 - h));
          }
        }
        return worst;
      };
    })();
    scenario('G03', () => {
      const failures = [], observations = {};
      const cases = [
        ['off the down-ledge end', { side: -1, seg: 2, at: 0.3, reverse: false, speed: 5 }],
        ['slow up the up-ledge', { side: 1, seg: 0, at: 0.3, reverse: false, speed: 3 }],
        ['slow up the down-ledge backwards', { side: -1, seg: 2, at: 0.8, reverse: true, speed: 3.5 }],
      ];
      for (const [name, fixture] of cases) {
        ledgeGrind(fixture);
        const bails = [], off = g.events.on((e) => e.type === 'bail' && bails.push(e.reason));
        let grindTicks = 0, stuck = 0, worstStuck = 0, released = -1, captured = false;
        for (let i = 0; i < 600; i++) {
          g.advance(dt, { held: { pumpGrind: 1 } }, false);
          if (s.grind) { captured = true; grindTicks++; stuck = s.velocity.length() < 0.3 ? stuck + 1 : 0; worstStuck = Math.max(worstStuck, stuck); }
          else if (captured && released < 0) released = i;
          if (released >= 0 && i > released + 180) break;
        }
        off();
        observations[name] = { captured, grindSeconds: +(grindTicks * dt).toFixed(2), longestStationaryGrind_s: +(worstStuck * dt).toFixed(2), bails, endState: s.state };
        expect(failures, captured, name + ': no grind');
        expect(failures, released >= 0, name + ': grind never released (trapped)');
        expect(failures, worstStuck * dt <= 0.3, `${name}: stationary on the rail for ${(worstStuck * dt).toFixed(2)} s`);
        expect(failures, !bails.length, name + ': bailed ' + bails.join(','));
      }
      return { failures, observations, tolerances: { stationaryGrind_s: 0.3, stationarySpeed_mps: 0.3 } };
    });
    scenario('G06', () => {
      const failures = [], observations = {};
      for (const side of [-1, 1]) {
        const dir = ledgeGrind({ side, seg: 0, at: 0.35, reverse: false, speed: 6.5 });
        const pops = [], off = g.events.on((e) => { if (e.type === 'pop') pops.push(e); });
        let worst = -Infinity;
        // Settle, then legal balance changes: Smith lean, Feeble lean, small steer both ways.
        const script = [[12, {}], [18, { lean: -1 }], [18, { lean: 1 }], [10, { steer: 0.5 }], [10, { steer: -0.5 }]];
        for (const [ticks, extra] of script) for (let k = 0; k < ticks; k++) { g.advance(dt, { held: { pumpGrind: 1 }, ...extra }, false); if (s.grind) worst = Math.max(worst, edgeDepth()); }
        const grinding = !!s.grind, poppedRail = s.grind?.rail.id, alongBefore = s.velocity.dot(dir);
        // RS pop: load, then flick up, with grind released as a rider popping off does.
        for (let k = 0; k < 45; k++) g.advance(dt, { ry: 1 }, false);
        g.advance(dt, { ry: -1 }, false);
        for (let k = 0; k < 3; k++) g.advance(dt, {}, false);
        const alongAfter = s.velocity.dot(dir), leftRail = !s.grind;
        let recaptured = null;
        for (let k = 0; k < 150 && !s.grounded; k++) { g.advance(dt, {}, false); if (s.grind) { recaptured = s.grind.rail.id; break; } }
        off();
        const key = 'side ' + side;
        observations[key] = { grindingBeforePop: grinding, rail: poppedRail, maxDepthDuringBalance_m: +worst.toFixed(3), pops: pops.length, leftRail, alongBefore: +alongBefore.toFixed(2), alongAfter: +alongAfter.toFixed(2), recaptured };
        expect(failures, grinding, key + ': grind did not survive legal balance changes');
        expect(failures, worst <= Math.max(0.002, 0.03 * 0.055), `${key}: ${worst.toFixed(3)} m inside wood/pipe during balance changes`);
        expect(failures, pops.length === 1, `${key}: ${pops.length} pop events`);
        expect(failures, leftRail, key + ': RS pop did not release the rail');
        expect(failures, alongAfter >= alongBefore * 0.7, `${key}: along-edge speed ${alongBefore.toFixed(2)} -> ${alongAfter.toFixed(2)}`);
        expect(failures, !recaptured || !recaptured.startsWith(`Small box ledge ${side} `), `${key}: recaptured the same edge (${recaptured})`);
      }
      observations.notCovered = 'Capture of a different legitimate rail after the pop is not exercised yet.';
      return { failures, observations, tolerances: { alongSpeedKept: 0.7 } };
    });

    // ============================================================================
    // Bindings added for the scenarios that were NOT_RUN. Same rules as above:
    // oracles read simulation state, contacts and events, never the requested
    // trick label alone. Where a scenario can only be partly automated, the
    // uncovered part is written into its observations.
    // ============================================================================
    window.__partsModule = await import('/src/data/scooterParts.ts');
    window.__boardModule = await import('/src/data/longboardParts.ts');
    window.__loadoutModule = await import('/src/data/loadout.ts');
    window.__mapsModule = await import('/src/data/maps.ts');
    window.__shopsModule = await import('/src/data/shops.ts');
    window.__ridingModule = await import('/src/input/riding.ts');
    const bigBoxR = (opts) => ride({ x: -10, z: 14, yaw: Math.PI, speed: 12, style: 'pro', seconds: 3.5, ...opts });
    const flipChord = (lean, steer = 0) => ({ lean, steer, held: { brake: 1, pumpGrind: 1 } });
    const sessionTricks = (run) => tricks(run.events);
    const backQuarterRun = ({ speed = 14, script, seconds = 5 }) => {
      const m = quarter('back-quarter'), lip = rampLips(m)[0], toward = m.reverse ? -1 : 1;
      return { run: ride({ x: (m.x0 + m.x1) / 2 + 3, z: lip - toward * 14, yaw: toward > 0 ? 0 : Math.PI, speed, seconds, script }), m };
    };
    /** Script: nothing until airborne, then `air(t)` with t seconds into the air. */
    const inAir = (air) => { let start = -1; return (i, sim) => { if (start < 0 && !sim.grounded && !sim.grind && sim.state !== 'Bail') start = i; if (start < 0 || sim.grounded) return {}; return air((i - start) * dt) ?? {}; }; };
    /** Largest reversal of the body flip direction while the flip is active (rad). */
    const flipReversal = (trace) => { let sign = 0, worst = 0, extreme = 0; for (const r of trace) { if (!r.flipActive) { sign = 0; continue; } const d = Math.sign(r.flipVelocity); if (!sign && d) { sign = d; extreme = r.flip; } if (sign && d === sign) extreme = sign > 0 ? Math.max(extreme, r.flip) : Math.min(extreme, r.flip); if (sign) worst = Math.max(worst, (extreme - r.flip) * sign); } return worst; };
    const flipRecord = (sim) => ({ flipActive: sim.bodyFlip.active, flipVelocity: sim.bodyFlip.velocity, yaw: sim.yaw, fakie: sim.fakie.mode, manual: sim.manual.active, bri: sim.tricks.bri.angle, briTarget: sim.tricks.bri.target, pose: sim.tricks.visualPose });
    const bigBoxFlip = ({ lean, steer = 0, hold = 0.22, speed = 14, extra }) => {
      const natural = naturalReleaseTick();
      return bigBox({ speed, seconds: 4, script: (i, sim) => { const base = holdThenRelease(natural - 2)(i); if (i <= natural + 1) return base; const t = (i - natural) * dt; const chord = t > 0.05 && t < 0.05 + hold ? flipChord(lean, steer) : {}; return { ...chord, ...(extra?.(t) ?? {}) }; } });
    };

    scenario('R01', () => {
      const failures = [], observations = {};
      const names = [];
      for (const lean of [1, -1]) {
        const natural = naturalReleaseTick();
        const run = bigBox({ speed: 14, seconds: 4, script: (i) => { const base = holdThenRelease(natural - 2)(i); if (i <= natural + 1) return base; const t = (i - natural) * dt; return t > 0.05 && t < 0.3 ? flipChord(lean) : {}; } });
        const flips = flipNames(tricks(run.events));
        const touchdown = firstTouchdownAfterAir(run.trace);
        const peakFlip = maxAbs(run.trace, 'flip');
        names.push(...flips);
        observations['lean ' + lean] = { tricks: tricks(run.events), maxFlipAngle_rad: +peakFlip.toFixed(2), landings: landings(run.events), bails: bails(run.events), pops: popEvents(run.events) };
        expect(failures, peakFlip > Math.PI * 1.6, `lean ${lean}: body rotated only ${peakFlip.toFixed(2)} rad`);
        expect(failures, flips.length === 1, `lean ${lean}: flip recognition ${JSON.stringify(tricks(run.events))}`);
        expect(failures, extraLaunches(run.trace).length === 0, `lean ${lean}: extra launch impulse`);
        expect(failures, !!touchdown, `lean ${lean}: never touched down`);
      }
      expect(failures, names.some((n) => /Backflip/.test(n)) && names.some((n) => /Frontflip/.test(n)), 'forward and backward leans did not produce one Frontflip and one Backflip: ' + names.join(','));
      return { failures, observations, tolerances: { minimumRotationForOneFlip_rad: +(Math.PI * 1.6).toFixed(2) } };
    });

    scenario('R02', () => {
      const failures = [], observations = {};
      for (const [label, steer, hold] of [['flip 180', 1, 0.3], ['flip 360', 1, 0.55]]) {
        const natural = naturalReleaseTick();
        let lastFlipSign = 0, reversals = 0, yawJump = 0, previousYaw = null;
        const run = bigBox({ speed: 15, seconds: 4, script: (i, sim) => { const base = holdThenRelease(natural - 2)(i); if (i <= natural + 1) return base; const t = (i - natural) * dt; if (sim.bodyFlip.active) { const sgn = Math.sign(sim.bodyFlip.velocity); if (lastFlipSign && sgn && sgn !== lastFlipSign && Math.abs(sim.bodyFlip.velocity) > 1) reversals++; if (sgn) lastFlipSign = sgn; } if (previousYaw !== null && !sim.grounded) yawJump = Math.max(yawJump, Math.abs(wrapAngle(sim.yaw - previousYaw))); previousYaw = sim.yaw; return t > 0.05 && t < 0.05 + hold ? flipChord(1, steer) : {}; } });
        observations[label] = { tricks: tricks(run.events), flipDirectionReversals: reversals, largestYawStep_rad: +yawJump.toFixed(3), landings: landings(run.events), bails: bails(run.events) };
        expect(failures, reversals === 0, `${label}: flip direction reversed ${reversals} times`);
        expect(failures, yawJump < 0.25, `${label}: yaw jumped ${yawJump.toFixed(2)} rad in one tick`);
        // A combination that runs out of air may honestly fail on contact; a landed one must be recognized once.
        if (!bails(run.events).length) expect(failures, flipNames(tricks(run.events)).length === 1, `${label}: recognition ${JSON.stringify(tricks(run.events))}`);
      }
      return { failures, observations, tolerances: { yawStepPerTick_rad: 0.25 } };
    });

    const quarterFlair = (lean) => {
      const { run, m } = backQuarterRun({ speed: 14, seconds: 5, script: inAir((t) => (t < 0.25 ? flipChord(lean, 1) : turnToTravel(0, s))) });
      const touchdown = firstTouchdownAfterAir(run.trace);
      return { run, m, touchdown, names: tricks(run.events) };
    };
    scenario('R03', () => {
      const failures = [];
      const { run, m, touchdown, names } = quarterFlair(1);
      const flair = names.find((n) => /^(Flair|Front Flair)/.test(n));
      expect(failures, !!flair, 'no Flair-family name: ' + names.join(','));
      expect(failures, !!touchdown && touchdown.ny < 0.85, `did not return onto the transition (normal y ${touchdown?.ny.toFixed(2)})`);
      expect(failures, !!touchdown && touchdown.y < m.h + 0.5, 're-entry above coping');
      return { failures, observations: { tricks: names, touchdown: touchdown && { y: +touchdown.y.toFixed(2), ny: +touchdown.ny.toFixed(2) }, landings: landings(run.events), bails: bails(run.events), maxFlip: +maxAbs(run.trace, 'flip').toFixed(2) } };
    });
    scenario('R04', () => {
      const failures = [], observations = {};
      const back = quarterFlair(1), front = quarterFlair(-1);
      const kinds = [back, front].map((r) => r.names.find((n) => /Flair/.test(n)) ?? null);
      observations.leanForward = { tricks: front.names, landings: landings(front.run.events), bails: bails(front.run.events) };
      observations.leanBack = { tricks: back.names };
      expect(failures, kinds.every(Boolean), 'both leans should complete a flair-family air: ' + JSON.stringify(kinds));
      expect(failures, kinds[0] !== kinds[1] && kinds.some((k) => /^Front Flair/.test(k ?? '')) && kinds.some((k) => /^Flair/.test(k ?? '')), 'opposite leans must give one Flair and one Front Flair: ' + JSON.stringify(kinds));
      return { failures, observations };
    });

    scenario('R05', () => {
      const failures = [];
      const natural = naturalReleaseTick();
      let intended = 1;
      const run = bigBox({ speed: 16, seconds: 4, script: (i, sim) => { const base = holdThenRelease(natural - 2)(i); if (i <= natural + 1) return base; intended = Math.max(intended, sim.bodyFlip.intendedTurns); return sim.grounded ? {} : flipChord(1); } });
      const rotation = maxAbs(run.trace, 'flip');
      expect(failures, rotation > Math.PI * 2.6, `held flip stopped at ${(rotation / Math.PI / 2).toFixed(2)} turns`);
      expect(failures, intended >= 2, `intended turns stayed ${intended}`);
      return { failures, observations: { turns: +(rotation / Math.PI / 2).toFixed(2), intendedTurns: intended, tricks: tricks(run.events), landings: landings(run.events), bails: bails(run.events), note: 'A held double may still crash if the air is too short; the requirement is that it is not stopped at one.' } };
    });

    scenario('R06', () => {
      const failures = [], observations = {};
      const natural = naturalReleaseTick();
      const released = bigBox({ speed: 14, seconds: 4, script: (i) => { const base = holdThenRelease(natural - 2)(i); if (i <= natural + 1) return base; const t = (i - natural) * dt; return t > 0.05 && t < 0.2 ? flipChord(1) : {}; } });
      const turns = maxAbs(released.trace, 'flip') / (Math.PI * 2);
      observations.briefInput = { turns: +turns.toFixed(2), tricks: tricks(released.events), landings: landings(released.events), bails: bails(released.events) };
      // The flip channel returns to zero on touchdown, so the last few degrees of a landed flip are absorbed by the landing.
      expect(failures, turns > 0.8 && turns < 1.25 && tricks(released.events).some((n) => /flip/i.test(n)), `brief input settled at ${turns.toFixed(2)} turns (expected one bounded, recognised completion)`);
      // Countering mid-flip must actually slow the rotation: the player keeps control.
      let countered = null;
      const braked = bigBox({ speed: 14, seconds: 4, script: (i, sim) => { const base = holdThenRelease(natural - 2)(i); if (i <= natural + 1) return base; const t = (i - natural) * dt; if (t > 0.35 && t < 0.37) countered = Math.abs(sim.bodyFlip.velocity); return t < 0.3 ? (t > 0.05 ? flipChord(1) : {}) : t < 0.7 ? flipChord(-1) : {}; } });
      const brakedTurns = maxAbs(braked.trace, 'flip') / (Math.PI * 2);
      observations.counterInput = { turns: +brakedTurns.toFixed(2), rateWhenCounterStarted: countered && +countered.toFixed(2), landings: landings(braked.events), bails: bails(braked.events) };
      expect(failures, brakedTurns < turns - 0.1, `countering did not reduce rotation (${brakedTurns.toFixed(2)} vs ${turns.toFixed(2)} turns)`);
      return { failures, observations };
    });

    scenario('R07', () => {
      const failures = [], observations = {};
      for (const [label, button, part] of [['flair + tailwhip', 'pushDeck', 'deck'], ['flair + barspin', 'brakeBars', 'bars']]) {
        // The equipment button comes once the flip chord is released: pressed with LT+RT held it is a heel/finger variant by design.
        const { run } = backQuarterRun({ speed: 14, seconds: 5, script: inAir((t) => (t < 0.25 ? flipChord(1, 1) : t < 0.27 ? { pressed: { [button]: true } } : turnToTravel(0, s))) });
        const names = tricks(run.events), touchdown = firstTouchdownAfterAir(run.trace);
        const caught = touchdown && Math.min(Math.abs(((touchdown[part] % TAU) + TAU) % TAU), Math.abs(((touchdown[part] % TAU) + TAU) % TAU - TAU));
        observations[label] = { tricks: names, partAngleAtTouchdown: caught !== null && caught !== undefined ? +caught.toFixed(3) : null, landings: landings(run.events), bails: bails(run.events) };
        expect(failures, names.some((n) => /Flair/.test(n) && new RegExp(part === 'deck' ? 'whip' : 'Barspin', 'i').test(n)), `${label}: combined name missing (${names.join(',')})`);
        expect(failures, caught !== null && caught < 0.35, `${label}: ${part} not caught at touchdown (${caught})`);
      }
      return { failures, observations, tolerances: { catchAngle_rad: 0.35 } };
    });

    scenario('R08', () => {
      const failures = [], observations = {};
      const natural = naturalReleaseTick();
      // Grab (LT + Y) inside a flip, then a fingerwhip (RT + whip) inside a flip.
      const grab = bigBoxR({ speed: 14, seconds: 4, record: flipRecord, script: (i) => { const base = holdThenRelease(natural - 2)(i); if (i <= natural + 1) return base; const t = (i - natural) * dt; if (t < 0.05) return {}; if (t < 0.25) return flipChord(1); if (t < 0.6) return { held: { brake: 1, body: 1 }, pressed: t < 0.27 ? { body: true } : {} }; return {}; } });
      const posed = grab.trace.filter((r) => r.pose === 'Deck Grab').length;
      observations.grabInFlip = { ticksInGrabPose: posed, tricks: tricks(grab.events), landings: landings(grab.events), bails: bails(grab.events) };
      expect(failures, posed > 10, `grab pose never held inside the flip (${posed} ticks)`);
      const finger = bigBox({ speed: 14, seconds: 4, script: (i) => { const base = holdThenRelease(natural - 2)(i); if (i <= natural + 1) return base; const t = (i - natural) * dt; if (t < 0.05) return {}; if (t < 0.25) return flipChord(1); if (t < 0.27) return { held: { pumpGrind: 1 }, pressed: { pushDeck: true } }; return {}; } });
      const touchdown = firstTouchdownAfterAir(finger.trace);
      const deck = touchdown && Math.min(Math.abs(((touchdown.deck % TAU) + TAU) % TAU), Math.abs(((touchdown.deck % TAU) + TAU) % TAU - TAU));
      observations.fingerwhipInFlip = { tricks: tricks(finger.events), deckAtTouchdown: deck !== null ? +deck.toFixed(3) : null, landings: landings(finger.events), bails: bails(finger.events) };
      expect(failures, tricks(finger.events).some((n) => /Fingerwhip/.test(n)), 'fingerwhip not recognized inside the flip: ' + tricks(finger.events).join(','));
      observations.notCovered = 'Limb stretching/clipping is judged from captured frames (artifacts/physics/frames), not asserted here.';
      return { failures, observations };
    });

    scenario('R09', () => {
      const failures = [];
      const { run } = backQuarterRun({ speed: 12, seconds: 5, script: inAir((t) => (t < 0.3 ? { steer: 1 } : turnToTravel(0, s))) });
      const names = tricks(run.events);
      expect(failures, flipNames(names).length === 0, 'plain 180 credited as a flip: ' + names.join(','));
      expect(failures, maxAbs(run.trace, 'flip') < 0.5, `body flip channel moved ${maxAbs(run.trace, 'flip').toFixed(2)} rad`);
      return { failures, observations: { tricks: names, landings: landings(run.events), bails: bails(run.events) } };
    });

    scenario('R10', () => {
      const failures = [], observations = {};
      const spins = {};
      for (const hold of [0.28, 0.55]) {
        const natural = naturalReleaseTick();
        let turned = 0, last = null;
        const run = bigBox({ speed: 15, seconds: 4, script: (i, sim) => { const base = holdThenRelease(natural - 2)(i); if (last !== null && !sim.grounded) turned += wrapAngle(sim.yaw - last); last = sim.yaw; if (i <= natural + 1) return base; const t = (i - natural) * dt; return t > 0.02 && t < 0.02 + hold ? { steer: 1 } : {}; } });
        spins[hold] = { cumulativeYaw_deg: Math.round(Math.abs(turned) * 180 / Math.PI), tricks: tricks(run.events) };
      }
      observations.spins = spins;
      const short = spins[0.28].cumulativeYaw_deg, long = spins[0.55].cumulativeYaw_deg;
      expect(failures, long > short + 120, `longer spin input did not accumulate more rotation (${short} vs ${long} deg)`);
      const labelled = (o, n) => o.tricks.some((t) => t.includes(String(n)));
      expect(failures, labelled(spins[0.55], 360) || labelled(spins[0.55], 540) || labelled(spins[0.55], 720), 'longer spin not named by its turn count: ' + spins[0.55].tricks.join(','));
      observations.unitTests = 'completedDegrees tolerance/sign cases: tests/riding-focus.test.ts (tsx --test).';
      return { failures, observations };
    });

    // ---- L: landing and contact ------------------------------------------------
    scenario('L01', () => {
      const failures = [], observations = {};
      const q = plainQuarterAir({ module: 'back-quarter', speed: 11, stance: 'regular' });
      const quarterGrade = landings(q.observations.events);
      // Flat drop with the same vertical speed a quarter re-entry arrives with.
      const vy = -7;
      s.reset(0, true); g.advance(0.3, {}, false);
      const x = 30, z = -40;
      s.position.set(x, terrainHeight(x, z) + TUNE.radius + 1.6, z); s.previousPosition.copy(s.position); s.body.setTranslation(s.position, true);
      s.velocity.set(0, vy, 7); s.body.setLinvel(s.velocity, true); s.yaw = s.previousYaw = 0; s.grounded = false; s.state = 'Airborne'; s.airTime = 0.8; s.tricks.startAir(false);
      const flat = []; const off = g.events.on((e) => { if (e.type === 'landing' || e.type === 'bail') flat.push(e.type === 'bail' ? 'bail' : e.quality); });
      for (let i = 0; i < 120; i++) g.advance(dt, {}, false);
      off();
      const rank = { clean: 0, good: 1, sketchy: 2, failed: 3, bail: 3 };
      observations.quarterReentry = quarterGrade; observations.flatDropSameVerticalSpeed = flat;
      expect(failures, quarterGrade.length && flat.length, 'missing a landing grade');
      expect(failures, rank[quarterGrade[0]] <= rank[flat[0]], `transition re-entry graded worse (${quarterGrade[0]}) than a flat slam (${flat[0]})`);
      expect(failures, rank[flat[0]] >= 1, `a ${-vy} m/s flat slam graded ${flat[0]}`);
      return { failures, observations, tolerances: { verticalSpeed_mps: -vy } };
    });

    scenario('L02', () => {
      const failures = [], observations = {};
      for (const [label, pitch] of [['front wheel first', 0.28], ['rear wheel first', -0.28]]) {
        s.reset(0, true); g.advance(0.3, {}, false);
        const x = 30, z = -40;
        s.position.set(x, terrainHeight(x, z) + TUNE.radius + 0.6, z); s.previousPosition.copy(s.position); s.body.setTranslation(s.position, true);
        s.velocity.set(0, -3.5, 7); s.body.setLinvel(s.velocity, true); s.yaw = s.previousYaw = 0; s.pitch = pitch; s.grounded = false; s.state = 'Airborne'; s.airTime = 0.6; s.tricks.startAir(false);
        const out = []; const off = g.events.on((e) => { if (e.type === 'landing' || e.type === 'bail') out.push(e.type === 'bail' ? 'bail:' + e.reason : e.quality); });
        for (let i = 0; i < 180; i++) g.advance(dt, {}, false);
        off();
        observations[label] = { results: out, state: s.state, speed: +s.speed.toFixed(2) };
        expect(failures, !out.some((r) => r.startsWith('bail')) && s.state !== 'Bail', `${label}: instant bail (${out.join(',')})`);
      }
      return { failures, observations, tolerances: { pitchAtContact_rad: 0.28, verticalSpeed_mps: 3.5 } };
    });

    scenario('L03', () => {
      const failures = [];
      const { run } = backQuarterRun({ speed: 11, seconds: 4, record: undefined, script: () => ({}) });
      const touchdown = firstTouchdownAfterAir(run.trace);
      const after = touchdown && run.trace.find((r) => r.i === touchdown.i + 40);
      const heading = after && Math.atan2(after.vx, after.vz);
      // Riding back down with the scooter still facing up the wall is fakie.
      expect(failures, !!touchdown, 'no re-entry');
      expect(failures, !bails(run.events).length, 'bailed: ' + bails(run.events).join(','));
      return { failures, observations: { landings: landings(run.events), touchdown: touchdown && { ny: +touchdown.ny.toFixed(2) }, travelYawAfter: heading && +heading.toFixed(2), note: 'A straight quarter air returns rolling backward; the travel/fakie state itself is exercised by the fakie wobble and revert probes.' } };
    });

    scenario('L04', () => {
      const failures = [], observations = {};
      const m = quarter('back-quarter'), lip = rampLips(m)[0], toward = m.reverse ? -1 : 1;
      // Falling broadside onto the coping from above the deck side, moving outward.
      s.reset(0, true); g.advance(0.3, {}, false);
      const x = (m.x0 + m.x1) / 2, z = lip + toward * 0.05;
      s.position.set(x, m.h + 0.9, z); s.previousPosition.copy(s.position); s.body.setTranslation(s.position, true);
      s.velocity.set(0, -4, -toward * 2.5); s.body.setLinvel(s.velocity, true); s.yaw = s.previousYaw = Math.PI / 2; s.grounded = false; s.state = 'Airborne'; s.airTime = 0.6; s.tricks.startAir(false);
      const out = []; const off = g.events.on((e) => { if (['landing', 'bail', 'railImpact'].includes(e.type)) out.push(e.type + ':' + (e.quality ?? e.reason ?? '')); });
      let minY = Infinity;
      for (let i = 0; i < 150; i++) { g.advance(dt, {}, false); minY = Math.min(minY, s.position.y); }
      off();
      observations.events = out; observations.minY = +minY.toFixed(2); observations.copingHeight = m.h;
      expect(failures, out.length > 0, 'a coping strike produced no contact outcome at all');
      expect(failures, !out.some((e) => e === 'landing:clean'), 'broadside coping strike graded clean');
      return { failures, observations };
    });

    scenario('L05', () => {
      const failures = [], observations = {};
      // Launch hard away from a quarter (a transfer it cannot make) and check no
      // teleport or extra airtime: every airborne step is explained by velocity.
      const { run } = backQuarterRun({ speed: 13, seconds: 4, script: (i, sim) => (!sim.grounded ? { lean: 1 } : { lean: 1 }) });
      let worstStep = 0;
      for (const session of airSessions(run.trace)) for (let k = 1; k < session.rows.length; k++) { const a = session.rows[k - 1], b = session.rows[k]; const moved = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z); worstStep = Math.max(worstStep, moved - Math.max(a.speed, b.speed) * dt); }
      observations.largestUnexplainedAirStep_m = +worstStep.toFixed(3);
      observations.extraLaunches = extraLaunches(run.trace);
      expect(failures, worstStep < 0.05, `airborne position jumped ${worstStep.toFixed(3)} m beyond its velocity`);
      expect(failures, extraLaunches(run.trace).length === 0, 'extra lift added in the air');
      return { failures, observations, tolerances: { unexplainedStep_m: 0.05 } };
    });

    scenario('L06', () => {
      const failures = [];
      // Player override: holding the flip through the air must raise intent, not be pulled back to one.
      const natural = naturalReleaseTick();
      let peakIntent = 1, assistAgainst = 0;
      const run = bigBox({ speed: 16, seconds: 4, script: (i, sim) => { const base = holdThenRelease(natural - 2)(i); if (i <= natural + 1) return base; peakIntent = Math.max(peakIntent, sim.bodyFlip.intendedTurns); if (sim.bodyFlip.assisting && Math.abs(sim.bodyFlip.angle) > Math.PI * 2 && Math.abs(sim.bodyFlip.velocity) < 2) assistAgainst++; return sim.grounded ? {} : flipChord(1); } });
      expect(failures, peakIntent >= 2, `intent stayed at ${peakIntent} turn while the player held on`);
      expect(failures, assistAgainst < 12, `guidance slowed a held second rotation for ${assistAgainst} ticks`);
      return { failures, observations: { peakIntendedTurns: peakIntent, ticksAssistSlowingDouble: assistAgainst, tricks: tricks(run.events), note: 'Transfer-direction override on quarters is covered by Q04 (deliberate platform exit).' } };
    });

    // ---- G: grind capture integrity -------------------------------------------------
    scenario('G02', () => {
      const failures = [], observations = {};
      const V = s.position.constructor;
      for (const side of [-1, 1]) {
        const rail = g.park.rails.find((r) => r.id === `Small box ledge ${side} 1`);
        const dir = rail.b.clone().sub(rail.a).normalize();
        const start = rail.a.clone().lerp(rail.b, 0.2);
        s.reset(0, true); g.advance(0.3, {}, false);
        // Below the ledge top, beside the box wall, moving along it with RT held.
        s.position.copy(start).add(new V(side * 0.55, -0.45, 0)); s.previousPosition.copy(s.position); s.body.setTranslation(s.position, true);
        s.velocity.copy(dir).multiplyScalar(5); s.body.setLinvel(s.velocity, true); s.yaw = s.previousYaw = Math.atan2(dir.x, dir.z);
        let captured = false, worst = -Infinity;
        for (let i = 0; i < 120; i++) { g.advance(dt, { held: { pumpGrind: 1 } }, false); captured ||= !!s.grind; worst = Math.max(worst, edgeDepth()); }
        observations['side ' + side] = { captured, maxDepth_m: +worst.toFixed(3) };
        expect(failures, !captured, `side ${side}: captured a grind from underneath`);
        expect(failures, worst <= 0.02, `side ${side}: scooter ${worst.toFixed(3)} m inside the box`);
      }
      return { failures, observations, tolerances: { depth_m: 0.02 } };
    });

    const equip = (scooterEdit) => { const { defaultScooter } = window.__partsModule; const loadout = defaultScooter(); scooterEdit(loadout); g.profile.scooter = loadout; g.rider.applyProfile(g.profile); };
    const freshDepth = () => {
      const ledge = smallBoxLedge(), rails = g.park.rails.filter((r) => r.id.startsWith('Small box ledge ')), V = s.position.constructor, pts = [];
      g.rider.scooter.traverse((o) => { if (!o.isMesh) return; const p = o.geometry.attributes.position, st = Math.max(1, Math.floor(p.count / 60)); for (let i = 0; i < p.count; i += st) pts.push([o, new V().fromBufferAttribute(p, i)]); });
      return () => { g.rider.update(s, dt, 1); g.rider.root.updateMatrixWorld(true); let worst = -Infinity; for (const [o, q] of pts) { const p = q.clone().applyMatrix4(o.matrixWorld); for (const r of rails) { const ab = r.b.clone().sub(r.a), k = Math.max(0, Math.min(1, p.clone().sub(r.a).dot(ab) / ab.lengthSq())); worst = Math.max(worst, 0.045 - p.distanceTo(r.a.clone().addScaledVector(ab, k))); } for (let k = 0; k < ledge.line.length - 1; k++) { const a = ledge.line[k], b = ledge.line[k + 1], dirL = b.clone().sub(a), len = dirL.length(); dirL.normalize(); const along = p.clone().sub(a).dot(dirL); if (along < 0 || along > len) continue; const up = new V(0, 1, 0).addScaledVector(dirL, -dirL.y).normalize(), rel = p.clone().sub(a), h = rel.dot(up); if (h > -0.95) worst = Math.max(worst, Math.min(ledge.width / 2 - Math.abs(rel.x), ledge.thick / 2 - h)); } } return worst; };
    };
    scenario('G04', () => {
      const failures = [], observations = {};
      const saved = structuredClone(g.profile.scooter);
      try {
        for (const [label, edit] of [['street deck + 120 wheels', (l) => { l.deck = { partId: 'street-deck', variantId: 'silver' }; l.frontWheel = l.rearWheel = { partId: '120-wheels', variantId: 'blue' }; }], ['light deck + 100 wheels', (l) => { l.deck = { partId: 'light-deck', variantId: 'white' }; l.frontWheel = l.rearWheel = { partId: '100-wheels', variantId: 'black' }; }]]) {
          equip(edit);
          const depth = freshDepth();
          ledgeGrind({ side: 1, seg: 1, at: 0.2, reverse: false, speed: 5 });
          let ticks = 0, worst = -Infinity;
          for (let i = 0; i < 240; i++) { g.advance(dt, { held: { pumpGrind: 1 } }, false); if (s.grind) { ticks++; worst = Math.max(worst, depth()); } else if (ticks) break; }
          observations[label] = { grindTicks: ticks, maxDepth_m: +worst.toFixed(3) };
          expect(failures, ticks > 20, `${label}: grind did not hold`);
          expect(failures, worst <= 0.02, `${label}: ${worst.toFixed(3)} m inside wood/pipe`);
        }
      } finally { g.profile.scooter = saved; g.rider.applyProfile(g.profile); }
      return { failures, observations, tolerances: { depth_m: 0.02 } };
    });

    scenario('G05', () => {
      const failures = [];
      const depth = freshDepth();
      const dir = ledgeGrind({ side: -1, seg: 1, at: 0.15, reverse: false, speed: 5 });
      s.position.y += 0.35; s.body.setTranslation(s.position, true); s.velocity.y = 1.5; s.body.setLinvel(s.velocity, true);
      g.advance(dt, { pressed: { pushDeck: true } }, false);
      let worst = -Infinity, captured = false, deckAtCapture = null;
      for (let i = 0; i < 240; i++) { g.advance(dt, { held: { pumpGrind: 1 } }, false); worst = Math.max(worst, depth()); if (s.grind && !captured) { captured = true; deckAtCapture = s.tricks.deck.angle; } }
      return { failures: [...(worst <= 0.02 ? [] : [`${worst.toFixed(3)} m inside wood/pipe during a spinning-deck approach`])], observations: { captured, deckAngleAtCapture: deckAtCapture !== null ? +deckAtCapture.toFixed(2) : null, maxDepthOverWholeApproach_m: +worst.toFixed(3), along: +s.velocity.dot(dir).toFixed(2) }, tolerances: { depth_m: 0.02 } };
    });

    // ---- T: grip tape and cosmetic equivalence --------------------------------------
    scenario('T01', () => {
      const failures = [], observations = {};
      const saved = structuredClone(g.profile.scooter);
      const V = s.position.constructor;
      try {
        for (const deck of ['pro-deck', 'street-deck', 'light-deck']) {
          equip((l) => { l.deck = { partId: deck, variantId: window.__partsModule.PARTS.find((p) => p.id === deck).variants[0].id }; l.griptape = { partId: 'stripe-griptape', variantId: 'black-red' }; });
          g.rider.root.updateMatrixWorld(true);
          let deckMin = new V(Infinity, Infinity, Infinity), deckMax = new V(-Infinity, -Infinity, -Infinity), gripMin = deckMin.clone(), gripMax = deckMax.clone(), gripMeshes = 0;
          g.rider.scooter.traverse((o) => { if (!o.isMesh) return; const part = o.userData.part; if (part !== deck && part !== 'stripe-griptape') return; o.geometry.computeBoundingBox(); const bb = o.geometry.boundingBox; const lo = bb.min.clone(), hi = bb.max.clone(); if (part === deck) { deckMin.min(lo); deckMax.max(hi); } else { gripMeshes++; gripMin.min(lo); gripMax.max(hi); } });
          const fits = gripMeshes > 0 && gripMin.x >= deckMin.x - 0.002 && gripMax.x <= deckMax.x + 0.002 && gripMin.z >= deckMin.z - 0.002 && gripMax.z <= deckMax.z + 0.002;
          observations[deck] = { gripMeshes, gripWidth: +(gripMax.x - gripMin.x).toFixed(3), deckWidth: +(deckMax.x - deckMin.x).toFixed(3), fitsInsideDeck: fits };
          expect(failures, fits, `${deck}: grip tape does not sit within the deck outline`);
        }
        // Same assembly code builds the menu preview model.
        g.menu.previewRider.applyProfile(g.profile);
        let previewGrip = 0; g.menu.previewRider.scooter.traverse((o) => { if (o.isMesh && o.userData.part === 'stripe-griptape') previewGrip++; });
        observations.previewModelGripMeshes = previewGrip;
        expect(failures, previewGrip > 0, 'menu preview model has no grip tape');
      } finally { g.profile.scooter = saved; g.rider.applyProfile(g.profile); g.menu.previewRider.applyProfile(g.profile); }
      return { failures, observations };
    });

    scenario('T02', () => {
      const failures = [], observations = {};
      const { defaultLongboard, LONGBOARD_DIMENSIONS } = window.__boardModule;
      const board = defaultLongboard(); board.grip = { partId: 'ss-grip', variantId: 'sea-glass' };
      g.rider.setLongboard(board); g.rider.root.updateMatrixWorld(true);
      let gripHalfWidth = 0, gripHalfLength = 0, gripMeshes = 0;
      g.rider.board.traverse((o) => { if (!o.isMesh || o.userData.part !== 'ss-grip') return; gripMeshes++; o.geometry.computeBoundingBox(); const bb = o.geometry.boundingBox; gripHalfWidth = Math.max(gripHalfWidth, Math.abs(bb.min.x), Math.abs(bb.max.x)); gripHalfLength = Math.max(gripHalfLength, Math.abs(bb.min.z), Math.abs(bb.max.z)); });
      observations.gripMeshes = gripMeshes; observations.gripHalfWidth = +gripHalfWidth.toFixed(3); observations.gripHalfLength = +gripHalfLength.toFixed(3); observations.deck = { halfWidth: LONGBOARD_DIMENSIONS.width / 2, halfLength: LONGBOARD_DIMENSIONS.length / 2 };
      expect(failures, gripMeshes > 0, 'no longboard grip mesh');
      expect(failures, gripHalfWidth <= LONGBOARD_DIMENSIONS.width / 2 + 0.003 && gripHalfLength <= LONGBOARD_DIMENSIONS.length / 2 + 0.003, 'grip extends past the deck outline');
      return { failures, observations };
    });
    scenario('T03', () => {
      const failures = [], observations = {};
      const { loadProfile, saveProfile, PROFILE_KEY } = window.__loadoutModule;
      const before = localStorage.getItem(PROFILE_KEY);
      try {
        const p = loadProfile(); p.scooter.griptape = { partId: 'logo-griptape', variantId: 'smoke-red' }; p.longboard.grip = { partId: 'ss-grip', variantId: 'sand' }; saveProfile(p);
        const reloaded = loadProfile();
        observations.reloaded = { scooter: reloaded.scooter.griptape, board: reloaded.longboard.grip };
        expect(failures, reloaded.scooter.griptape.partId === 'logo-griptape' && reloaded.longboard.grip.variantId === 'sand', 'grip choice did not persist');
        const raw = JSON.parse(localStorage.getItem(PROFILE_KEY)); raw.scooter.griptape = { partId: 'no-such-tape', variantId: 'x' }; delete raw.longboard.grip; raw.wallet.owned = [...raw.wallet.owned, 'mafioso-bars-y:mafioso_bars_y_chrome']; localStorage.setItem(PROFILE_KEY, JSON.stringify(raw));
        const fallback = loadProfile();
        observations.invalidAndOld = { scooter: fallback.scooter.griptape, board: fallback.longboard.grip, ownershipKept: fallback.wallet.owned.includes('mafioso-bars-y:mafioso_bars_y_chrome') };
        expect(failures, fallback.scooter.griptape.partId === 'standard-griptape' && fallback.longboard.grip.partId === 'ss-grip', 'invalid or missing grip did not fall back to the default');
        expect(failures, observations.invalidAndOld.ownershipKept, 'ownership lost while falling back');
        observations.mapSwitch = 'Parts persisting across a map change are covered by tests/shop.browser.mjs.';
      } finally { if (before === null) localStorage.removeItem(PROFILE_KEY); else localStorage.setItem(PROFILE_KEY, before); }
      return { failures, observations };
    });
    scenario('T04', () => {
      const failures = [];
      const saved = structuredClone(g.profile.scooter);
      const replay = (tape) => { equip((l) => { l.griptape = tape; }); const run = bigBox({ speed: 12, seconds: 2.5, script: (i) => (i > 40 && i < 90 ? { ry: 1 } : i === 90 ? { ry: -1, pressed: { pushDeck: true } } : {}) }); return run.trace.map((r) => [r.x, r.y, r.z, r.deck]); };
      let diff = 0;
      try {
        const a = replay({ partId: 'standard-griptape', variantId: 'black' }), b = replay({ partId: 'mafioso-griptape-crown', variantId: 'mafioso_grip_frost' });
        for (let i = 0; i < Math.min(a.length, b.length); i++) for (let k = 0; k < 4; k++) diff = Math.max(diff, Math.abs(a[i][k] - b[i][k]));
        if (a.length !== b.length) failures.push('replays ran different lengths');
      } finally { g.profile.scooter = saved; g.rider.applyProfile(g.profile); }
      expect(failures, diff < 1e-6, `grip tape changed the physics replay by ${diff}`);
      return { failures, observations: { maxDifference: diff }, tolerances: { maxDifference: 1e-6 } };
    });

    scenario('T05', () => {
      const failures = [], observations = {};
      const run = ride({ x: 30, z: -60, yaw: 0, speed: 8, rideable: 'longboard', seconds: 3, script: (i) => ({ steer: i < 180 ? 1 : -1 }) });
      observations.fullLeanCarve = { bails: bails(run.events), endState: run.trace.at(-1).state, endSpeed: +run.trace.at(-1).speed.toFixed(2) };
      expect(failures, !bails(run.events).length, 'full-lean carve bailed (wheelbite): ' + bails(run.events).join(','));
      // Switch families and render: only the ridden family is visible, no stale scooter.
      for (const kind of ['scooter', 'longboard', 'scooter']) { s.rideable = kind; g.rider.update(s, dt, 1); observations[kind] = { boardVisible: g.rider.board.visible, scooterVisible: g.rider.scooter.visible }; expect(failures, g.rider.board.visible === (kind === 'longboard') && g.rider.scooter.visible === (kind === 'scooter'), `after switching to ${kind} the wrong rideable is shown`); }
      return { failures, observations };
    });

    // ---- X: cross-system --------------------------------------------------------------
    const frameLoop = (rate, seconds, inputAt) => {
      s.reset(0, true); g.advance(0.3, {}, false);
      const x = 30, z = -60; s.position.set(x, terrainHeight(x, z) + TUNE.radius, z); s.previousPosition.copy(s.position); s.body.setTranslation(s.position, true); s.yaw = s.previousYaw = 0; s.velocity.set(0, 0, 5); s.body.setLinvel(s.velocity, true);
      const pops = []; const off = g.events.on((e) => { if (e.type === 'pop') pops.push(e); });
      let accumulator = 0, time = 0, peakY = -Infinity, prevHeld = {};
      const frame = 1 / rate;
      while (time < seconds) {
        accumulator += Math.min(frame, 0.05);
        const input = inputAt(time);
        let first = true;
        while (accumulator >= TUNE.step) {
          const pressed = {}; for (const k of Object.keys(input.held ?? {})) if (input.held[k] > 0.5 && !(prevHeld[k] > 0.5)) pressed[k] = true;
          g.advance(TUNE.step, { ...input, pressed: first ? pressed : {} }, false);
          accumulator -= TUNE.step; first = false; peakY = Math.max(peakY, s.position.y);
        }
        prevHeld = input.held ?? {};
        time += frame;
      }
      off();
      return { pops: pops.length, peak: peakY };
    };
    scenario('X01', () => {
      const failures = [], observations = {};
      const script = (t) => (t > 0.3 && t < 0.8 ? { ry: 1 } : t >= 0.8 && t < 0.85 ? { ry: -1 } : {});
      for (const rate of [30, 60, 120, 144]) observations[rate + ' fps'] = frameLoop(rate, 2, script);
      const peaks = Object.values(observations).map((o) => o.peak);
      expect(failures, Object.values(observations).every((o) => o.pops === 1), 'pop count varied with render rate: ' + JSON.stringify(observations));
      expect(failures, Math.max(...peaks) - Math.min(...peaks) < 0.08, `hop height varied ${(Math.max(...peaks) - Math.min(...peaks)).toFixed(3)} m across render rates`);
      return { failures, observations, tolerances: { peakSpread_m: 0.08 } };
    });
    scenario('X02', () => {
      const failures = [], observations = {};
      // A 1 s hitch is clamped to 0.05 s of catch-up (main loop), with the charge held throughout.
      const hitch = frameLoop(2, 3, (t) => (t < 2 ? { ry: 1 } : {}));
      observations.hitchWithHeldCharge = hitch;
      expect(failures, hitch.pops === 0, `a held charge through a hitch fabricated ${hitch.pops} pop(s)`);
      observations.backgroundResume = 'Input.clear() on blur and TouchPad.clear() on visibilitychange are exercised by artifacts/claude/touch-pad.mjs (emulated).';
      return { failures, observations, tolerances: { catchUpPerFrame_s: 0.05 } };
    });
    scenario('X03', () => {
      const failures = [], observations = {};
      // Manual from a gentle RS hold.
      const manual = ride({ x: 30, z: -60, yaw: 0, speed: 5, seconds: 1.2, record: flipRecord, script: () => ({ ry: 0.32 }) });
      observations.manual = manual.trace.some((r) => r.manual);
      expect(failures, observations.manual, 'gentle RS hold no longer starts a manual');
      // Flat-ground hop tailwhip (Normal preset X).
      const whip = ride({ x: 30, z: -60, yaw: 0, speed: 6, seconds: 1.6, script: (i) => (i === 5 ? { pressed: { pushDeck: true } } : {}) });
      observations.tailwhip = tricks(whip.events);
      expect(failures, tricks(whip.events).some((n) => /Tailwhip/.test(n)), 'X no longer tailwhips on the Normal preset');
      // Spine stall with LT.
      observations.grinds = 'G01, G03 and G06 cover grinds.';
      return { failures, observations };
    });
    scenario('X04', () => {
      const failures = [], observations = {};
      const banked = []; const off = g.events.on((e) => { if (e.type === 'banked') banked.push(e.eventId); });
      ride({ x: 30, z: -60, yaw: 0, speed: 6, seconds: 4, script: (i) => (i === 5 ? { pressed: { pushDeck: true } } : {}) });
      off();
      observations.bankedEvents = banked;
      expect(failures, banked.length === 1 && new Set(banked).size === 1, `one landed trick banked ${banked.length} times`);
      return { failures, observations, tolerances: {}, };
    });
    scenario('X05', () => {
      const failures = [], observations = {};
      const { MAPS } = window.__mapsModule, { SHOPS } = window.__shopsModule;
      observations.maps = MAPS.map((m) => m.id);
      for (const id of ['warehouse', 'outdoor', 'techno_gravity', 'b_hill']) expect(failures, MAPS.some((m) => m.id === id), 'missing map ' + id);
      observations.shopStock = SHOPS[0].stock.length;
      expect(failures, SHOPS[0].stock.length > 20, 'shop stock shrank');
      const { loadProfile } = window.__loadoutModule; const p = loadProfile();
      expect(failures, Object.values(p.scooter).every((sel) => window.__partsModule.PARTS.some((part) => part.id === sel.partId)), 'saved scooter references a missing part');
      observations.notCovered = 'Traveling between maps in one session is covered by tests/shop.browser.mjs.';
      return { failures, observations };
    });
    scenario('X06', () => {
      const failures = [], observations = {};
      const { ridingButtons } = window.__ridingModule;
      observations.presets = { normal: ridingButtons('regular'), goofy: ridingButtons('goofy'), arcade: ridingButtons('regular', 'arcade') };
      expect(failures, ridingButtons('regular').push === 'hop' && ridingButtons('regular').whip === 'pushDeck', 'Normal preset is not A push / X whip');
      expect(failures, ridingButtons('goofy').push === 'pushDeck' && ridingButtons('goofy').whip === 'hop', 'Goofy preset is not X push / A whip');
      observations.testedDevices = 'Automated only: desktop headless Chrome with simulated standard Gamepad API (tests/mobile.browser.mjs) and Chrome mobile emulation with CDP multi-touch (artifacts/claude/touch-pad.mjs). No physical phone or Bluetooth controller was tested.';
      return { failures, observations };
    });
    // ---- B07/B08: direct RS Bri / Inward from the big-box lip -----------------------------
    const lipGesture = (direction) => {
      const natural = naturalReleaseTick();
      let start = null;
      const run = bigBoxR({ speed: 12, seconds: 3.5, record: flipRecord, script: (i) => {
        if (i < 40) return {};
        if (i < natural - 26) return { ry: 1 };
        if (start === null) start = i;
        const k = i - start;
        if (k <= 24) { const r = direction * k * Math.PI * 2 / 24; return { rx: Math.sin(r) * 0.95, ry: Math.cos(r) * 0.95 }; }
        return {};
      } });
      return run;
    };
    // From the preloaded down position, left is the natural Bri scoop and right
    // is Inward. Keep the scenario identity independent of whichever label fires.
    for (const [id, direction, expectedName] of [['B07', -1, 'Bri'], ['B08', 1, 'Inward']]) scenario(id, () => {
      const failures = [];
      const run = lipGesture(direction);
      const air = boxAir(run);
      const briTarget = Math.max(...run.trace.map((r) => Math.abs(r.briTarget ?? 0)));
      const touchdown = boxTouchdown(run);
      const airborneBri = air?.rows.map((r) => r.bri ?? 0) ?? [];
      const briTravel = Math.max(0, ...airborneBri.map(Math.abs));
      const briRange = { min: Math.min(0, ...airborneBri), max: Math.max(0, ...airborneBri) };
      const targetChanges = run.trace.filter((r, k, rows) => k === 0 || Math.abs((r.briTarget ?? 0) - (rows[k - 1].briTarget ?? 0)) > 0.1).map((r) => ({ tick: r.i, grounded: r.grounded, angle: +((r.bri ?? 0).toFixed(2)), target: +((r.briTarget ?? 0).toFixed(2)) }));
      const maxBriStep = airborneBri.slice(1).reduce((max, angle, k) => Math.max(max, Math.abs(angle - airborneBri[k])), 0);
      const caught = touchdown && Math.min(Math.abs(touchdown.bri % TAU), Math.abs(Math.abs(touchdown.bri % TAU) - TAU)) < 0.35;
      const names = tricks(run.events);
      expect(failures, !!air, 'no takeoff');
      expect(failures, popEvents(run.events) <= 1, `${popEvents(run.events)} launch events`);
      expect(failures, extraLaunches(run.trace).length === 0, 'extra launch impulse');
      expect(failures, briTarget > 6, `the ${expectedName} never committed a full scoop (target ${briTarget.toFixed(2)})`);
      expect(failures, briTravel > TAU - 0.35, `actual scooter motion did not complete a rotation (max ${briTravel.toFixed(2)} rad)`);
      expect(failures, maxBriStep < 0.5, `scooter motion snapped ${maxBriStep.toFixed(2)} rad in one tick`);
      expect(failures, !!caught, `scooter was not caught at touchdown (${touchdown?.bri?.toFixed(2)} rad)`);
      expect(failures, clearedLargeTransfer(touchdown), `attempt did not clear the large-transfer deck (touchdown x/z ${touchdown?.x.toFixed(2)}/${touchdown?.z.toFixed(2)})`);
      expect(failures, names.some((name) => new RegExp(expectedName).test(name)), `completed feasible attempt was not confirmed as ${expectedName} (${names.join(',')})`);
      return { failures, observations: { tricks: names, air: air && { start: air.start, end: air.end }, briTarget: +briTarget.toFixed(2), briTravel: +briTravel.toFixed(2), briRange: { min: +briRange.min.toFixed(2), max: +briRange.max.toFixed(2) }, targetChanges, maxBriStep: +maxBriStep.toFixed(3), caught: !!caught, touchdown: touchdown && { tick: touchdown.i, x: +touchdown.x.toFixed(2), z: +touchdown.z.toFixed(2), bri: +touchdown.bri.toFixed(3) }, pops: popEvents(run.events), landings: landings(run.events), bails: bails(run.events) } };
    });

    // ---- R11/R12: body flip started during an airborne Inward / Bri -------------------------
    for (const [id, lean] of [['R11', -1], ['R12', 1]]) scenario(id, () => {
      const failures = [], observations = {};
      // Either scoop direction; the requirement is that the equipment timeline and the new body flip compose.
      for (const direction of [1, -1]) {
        let start = null, flipAt = null, briAtFlip = null, dropped = false, lastAngle = null;
        const run = bigBoxR({ speed: 13, seconds: 3.5, record: flipRecord, script: (i, sim) => {
          const atLip = sim.grounded && sim.normal.y < 0.85 && sim.velocity.y > 2;
          if (start === null) { if (atLip) start = i; else return i > 40 ? { ry: 1 } : {}; }
          const k = i - start;
          if (!sim.grounded && flipAt !== null && lastAngle !== null && Math.abs(sim.tricks.bri.angle) < Math.abs(lastAngle) - 0.3) dropped = true;
          if (!sim.grounded) lastAngle = sim.tricks.bri.angle;
          if (k <= 24) { const r = direction * k * Math.PI * 2 / 24; return { rx: Math.sin(r) * 0.95, ry: Math.cos(r) * 0.95 }; }
          if (!sim.grounded && k > 30 && k < 60) { if (flipAt === null && sim.bodyFlip.active) { flipAt = k; briAtFlip = sim.tricks.bri.angle; } return flipChord(lean); }
          return {};
        } });
        const names = tricks(run.events), key = 'scoop ' + direction;
        observations[key] = { flipStartedTick: flipAt, briAngleAtFlip: briAtFlip !== null ? +briAtFlip.toFixed(2) : null, tricks: names, pops: popEvents(run.events), landings: landings(run.events), bails: bails(run.events), extra: extraLaunches(run.trace), flipStartTick: run.trace.find((r) => r.flipActive)?.i, airStart: airSessions(run.trace)[0]?.start };
        expect(failures, flipAt !== null, key + ': the flip did not start during the airborne scoop');
        expect(failures, briAtFlip !== null && Math.abs(briAtFlip) > 0.5, key + ': the scoop was not already under way when the flip began');
        expect(failures, !dropped, key + ': the Bri/Inward angle jumped back while airborne');
        // Lift that appears once the flip has started (the single lip pop comes before it).
        const flipTick = run.trace.find((r) => r.flipActive)?.i ?? Infinity;
        const lateLift = run.trace.filter((r) => r.i >= flipTick && !r.grounded && !r.wasGrounded && !r.grind && r.state !== 'Bail' && r.dVy > 1);
        observations[key].liftAfterTakeoff = lateLift.map((r) => ({ i: r.i, dVy: +r.dVy.toFixed(2) }));
        expect(failures, popEvents(run.events) <= 1 && lateLift.length === 0, key + ': second launch when the flip started');
        if (!bails(run.events).length) expect(failures, names.some((n) => /flip/i.test(n) && /Bri|Inward/.test(n)), key + ': landed combination not named with both parts: ' + names.join(','));
      }
      return { failures, observations };
    });

    // ---- L07: hop / equipment trick into a manual with the gentle RS hold ------------------
    scenario('L07', () => {
      const failures = [], observations = {};
      for (const [label, extra] of [['hop', null], ['tailwhip', 'pushDeck']]) {
        let landed = false;
        const run = ride({ x: 30, z: -60, yaw: 0, speed: 7, seconds: 2.5, record: flipRecord, script: (i, sim) => {
          if (i < 30) return { ry: 1 };
          if (i === 30) return { ry: -1 };
          if (extra && i === 33) return { ry: 0.32, pressed: { [extra]: true } };
          return { ry: 0.32 };
        } });
        // The hop is released at tick 30; the spawn settle before it is not this landing.
        const touchdown = firstTouchdownAfterAir(run.trace.filter((r) => r.i > 31));
        const later = touchdown && run.trace.slice(touchdown.i, touchdown.i + 90);
        landed = !!touchdown;
        const manualAfter = !!later?.some((r) => r.manual);
        const banked = run.events.filter((e) => e.type === 'trick').length;
        observations[label] = { touchdownTick: touchdown?.i, manualTicks: run.trace.filter((r) => r.manual).map((r) => r.i).slice(0, 5), states: [...new Set(run.trace.map((r) => r.state))], landed, manualAfterTouchdown: manualAfter, trickEvents: banked, tricks: tricks(run.events), bails: bails(run.events) };
        expect(failures, landed, label + ': no touchdown');
        expect(failures, manualAfter, label + ': the held gentle RS did not catch a manual on touchdown');
      }
      return { failures, observations };
    });

    results.__guard = g.sim.diagnostics.incidents.map((i) => ({ t: i.t, reason: i.reason }));
    s.reset(0, true);
    return results;
  }, only);
} finally {
  await browser.close();
}

const report = {
  schema: 'physics-acceptance-run/1',
  build,
  ranAt: new Date().toISOString(),
  platform: `${process.platform} / headless Chrome swiftshader / fixed tick 1/120 via test hook`,
  note: 'Automated replays against production fixtures. Not a human controller test; render-rate and device coverage are separate scenarios.',
  pageErrors: errors,
  // The extreme-state guard is a last resort: any activation during these replays is a failure.
  guardActivations: results.__guard ?? [],
  scenarios: matrix.scenarios.map((sc) => ({ id: sc.id, scenario: sc.scenario, ...(results[sc.id] ?? { status: 'NOT_RUN' }) })),
};
const file = `artifacts/physics/acceptance-${build}.json`;
writeFileSync(file, JSON.stringify(report, null, 2));
const bound = report.scenarios.filter((s) => s.status !== 'NOT_RUN');
for (const sc of bound) {
  console.log(`${sc.status.padEnd(5)} ${sc.id}  ${sc.scenario}`);
  for (const f of sc.failures ?? []) console.log('        - ' + f);
}
console.log(`\n${bound.filter((s) => s.status === 'PASS').length} PASS, ${bound.filter((s) => s.status !== 'PASS').length} FAIL/ERROR, ${report.scenarios.length - bound.length} NOT_RUN  ->  ${file}`);
if (errors.length) console.log('Page errors: ' + errors.join(' | '));
if (report.guardActivations.length) console.log('Riding guard activated: ' + JSON.stringify(report.guardActivations));
process.exitCode = bound.some((s) => s.status !== 'PASS') || report.guardActivations.length ? 1 : 0;
