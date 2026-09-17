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
          touchdown: touchdown && { tick: touchdown.i, y: +touchdown.y.toFixed(2), z: +touchdown.z.toFixed(2), normalY: +touchdown.ny.toFixed(2) },
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
        if (run.trace[k - 1].vy > 0 && r.vy <= 0 && r.y > 1) apexes.push(+r.y.toFixed(3));
      }
      return { apexes, maxSpeed: Math.max(...run.trace.map((r) => r.speed)), bails: bails(run.events), pumps: run.events.filter((e) => e.type === 'pump').length };
    };
    scenario('Q06', () => {
      const passive = halfpipeApexes(false), failures = [];
      for (let k = 1; k < passive.apexes.length; k++)
        if (passive.apexes[k] > passive.apexes[k - 1] + 0.02) failures.push(`passive energy gain between cycles ${k - 1} and ${k}: ${passive.apexes[k - 1]} -> ${passive.apexes[k]}`);
      expect(failures, passive.apexes.length >= 3, 'fewer than three cycles observed');
      return { failures, observations: passive, tolerances: { perCycleApexGain_m: 0.02 } };
    });
    scenario('Q07', () => {
      const passive = halfpipeApexes(false), active = halfpipeApexes(true), failures = [];
      for (let k = 1; k < active.apexes.length; k++)
        if (active.apexes[k] > active.apexes[k - 1] + 0.8) failures.push(`pump gain too large at cycle ${k}: ${active.apexes[k - 1]} -> ${active.apexes[k]}`);
      expect(failures, active.maxSpeed <= TUNE.extremeSpeed, 'pumping exceeded the protective speed ceiling');
      expect(failures, active.pumps > 0, 'no pump actuations recorded, so any gain is not attributable');
      const sum = (a) => a.reduce((x, y) => x + y, 0);
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
    const holdThenRelease = (releaseTick, extra = {}) => (i) => {
      if (i < 40) return {};
      if (releaseTick === null || i < releaseTick) return { ry: 1 };
      if (i === releaseTick) return { ry: -1, ...extra };
      return {};
    };
    const naturalReleaseTick = () => {
      const run = bigBox({ script: (i) => ({ ry: i > 40 ? 1 : 0 }) });
      return airSessions(run.trace)[0]?.start ?? null;
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
        observations[speed] = { peak: +peak(run.trace).toFixed(2), landings: landings(run.events), bails: bails(run.events) };
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
      const touchdown = firstTouchdownAfterAir(run.trace);
      const part = name === 'Barspin' ? 'bars' : 'deck';
      expect(failures, !!touchdown && Math.abs(((touchdown[part] % TAU) + TAU) % TAU) < 0.35 || Math.abs(((touchdown?.[part] % TAU) + TAU) % TAU - TAU) < 0.35, `${part} not caught at touchdown (${touchdown?.[part]?.toFixed(2)} rad)`);
      return { failures, observations: { releaseTick: release, peak: +peak(run.trace).toFixed(2), tricks: tricks(run.events), landings: landings(run.events), partAngleAtTouchdown: touchdown && +touchdown[part].toFixed(3) } };
    };
    scenario('B02', () => trickOverBox('Barspin', 'brakeBars'));
    scenario('B03', () => trickOverBox('Tailwhip', 'hop'));
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
      const late = bigBox({ script: (i) => (i < 40 ? {} : i === natural + 1 ? { ry: 1, pressed: { hop: true } } : { ry: 1 }) });
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
process.exitCode = bound.some((s) => s.status !== 'PASS') ? 1 : 0;
