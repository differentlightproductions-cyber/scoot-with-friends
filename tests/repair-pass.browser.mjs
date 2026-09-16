// Drives the real Simulation through synthetic input traces for the four
// failures in this repair pass: manual entry/catch, manual balance response,
// quarter outward throw, and direct Bri/Inward takeoffs.
// These are AUTOMATED INPUT TESTS, not controller playtests.
import { chromium } from 'playwright';
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
try {
  await page.goto('http://127.0.0.1:5174/?map=outdoor');
  await page.waitForFunction(() => window.__LAZER, null, { timeout: 60000 });
  const result = await page.evaluate(async () => {
    const g = window.__LAZER;
    g.testing(true);
    g.startSession('outdoor', true);
    const { terrainHeight, terrainNormal } = await import('/src/park/park.ts');
    const { outdoorLip } = await import('/src/park/outdoor.ts');
    const { TUNE } = await import('/src/core/config.ts');
    const checks = [], data = [];
    const check = (name, ok, detail) => {
      if (!ok) throw Error(name + ' :: ' + JSON.stringify(detail ?? g.snapshot()));
      checks.push(name);
    };
    const a = (t, f = {}) => g.advance(t, f, false);
    const place = (x, z, speed, dir = -1) => {
      g.sim.reset(0, true); a(.4);
      const s = g.sim;
      s.position.set(x, terrainHeight(x, z) + .22, z);
      s.previousPosition.copy(s.position);
      s.body.setTranslation(s.position, true);
      s.yaw = dir < 0 ? Math.PI : 0;
      s.normal.copy(terrainNormal(x, z));
      s.velocity.set(0, 0, dir * speed).projectOnPlane(s.normal).normalize().multiplyScalar(speed);
      s.body.setLinvel(s.velocity, true);
      return s;
    };
    const flat = (speed = 6) => {
      g.sim.reset(0, true); a(.4);
      const s = g.sim;
      s.velocity.set(0, 0, -speed);
      s.body.setLinvel(s.velocity, true);
      s.yaw = Math.PI;
      a(.15);
      return s;
    };

    // ---- 1. MANUALS: the gentle band is findable across its whole width -----
    for (const ry of [.18, .25, .32, .45, .52]) {
      const s = flat(6);
      a(.16, { ry });
      data.push({ manualEntry: ry, active: s.manual.active, nose: s.manual.nose, intent: s.manualIntentTime });
      check('Manual entry at RS ' + ry, s.manual.active && !s.manual.nose,
        { ry, active: s.manual.active, intent: s.manualIntentTime });
    }
    for (const ry of [-.25, -.45]) {
      const s = flat(6);
      a(.16, { ry });
      check('Nose manual entry at RS ' + ry, s.manual.active && s.manual.nose, { ry, active: s.manual.active });
    }
    // Entry is prompt: a deliberate gentle movement must not need a long hold.
    {
      const s = flat(6);
      a(.09, { ry: .32 });
      check('Manual responds promptly to a deliberate gentle movement', s.manual.active, { intent: s.manualIntentTime });
    }
    // Deep RS is the preload, never a manual.
    {
      const s = flat(6);
      a(.3, { ry: .9 });
      check('Deep RS loads a pop and never a manual', !s.manual.active && s.charge > 0,
        { active: s.manual.active, charge: s.charge });
    }
    // The transition region between the bands cancels neither owner.
    {
      const s = flat(6);
      a(.16, { ry: .35 });
      const wasActive = s.manual.active;
      a(.1, { ry: .6 });
      check('Easing through the transition region keeps the manual', wasActive && s.manual.active,
        { wasActive, stillActive: s.manual.active });
    }
    // Ordinary drift must not become a manual.
    {
      const s = flat(6);
      a(.4, { ry: .1 });
      check('Stick drift does not trigger a manual', !s.manual.active, { active: s.manual.active });
    }

    // ---- 2. BALANCE RESPONSE AND METER AGREE -------------------------------
    {
      const s = flat(6);
      a(.16, { ry: .32 });
      const before = s.manual.balance;
      a(1 / 120, { ry: .62 });
      const after = s.manual.balance;
      data.push({ balanceStep: [before, after], command: s.manual.command });
      check('Balance answers the stick within one physics step', after !== before,
        { before, after });
    }

    // ---- 3. LAND ANY COMPLETED TRICK INTO A MANUAL -------------------------
    // Hop, then hold the gentle position through the landing transition with no
    // fresh movement and no neutral reset before contact.
    for (const [name, ry] of [['Manual', .32], ['Nose Manual', -.32]]) {
      const s = flat(7);
      a(.12, { ry: 1 });            // load
      a(1 / 120, { ry: -1 });       // release: hop
      check('Hop leaves the ground for ' + name, !s.grounded, { grounded: s.grounded, state: s.state });
      let landed = false;
      for (let i = 0; i < 240 && !landed; i++) { a(1 / 120, { ry }); landed = s.grounded; }
      data.push({ catchInto: name, landed, active: s.manual.active, nose: s.manual.nose });
      check('Bunny hop catches into ' + name, s.manual.active && s.manual.nose === (ry < 0),
        { landed, active: s.manual.active, nose: s.manual.nose, catch: s.manualCatchTimer });
    }
    // A tailwhip into a manual, still with no fresh stick movement on landing.
    {
      const s = flat(7);
      a(1 / 120, { pressed: { hop: true } });
      let landed = false;
      for (let i = 0; i < 240 && !landed; i++) { a(1 / 120, { ry: .32 }); landed = s.grounded; }
      data.push({ whipToManual: { landed, active: s.manual.active, deck: s.tricks.deck.angle } });
      check('Tailwhip catches into a manual', s.manual.active, { landed, active: s.manual.active });
    }

    // ---- 4. QUARTER PIPES: outward throw, not jump height ------------------
    // Roll up a quarter transition and leave it naturally, then compare the
    // takeoff split against what the previous formula would have produced for
    // the same plane speed. Same energy, redirected: height must not drop.
    for (const speed of [10, 13, 16, 19]) {
      // Ride up the back quarter (z0=22, run 4.25) and leave it naturally.
      const s = place(0, 19, speed, 1);
      let takeoff = null, maxY = s.position.y, maxOut = 0, wasGrounded = true;
      for (let i = 0; i < 900; i++) {
        a(1 / 120);
        if (!takeoff && wasGrounded && !s.grounded && s.velocity.y > 0.3)
          takeoff = { vy: s.velocity.y, vz: s.velocity.z, vx: s.velocity.x, y: s.position.y, z: s.position.z };
        wasGrounded = s.grounded;
        if (takeoff) {
          maxY = Math.max(maxY, s.position.y);
          maxOut = Math.max(maxOut, s.position.z - takeoff.z);
        }
        if (takeoff && s.grounded) break;
      }
      if (!takeoff) { data.push({ quarterNoTakeoff: speed }); continue; }
      const plane = Math.hypot(takeoff.vz, takeoff.vy);
      const measured = Math.abs(takeoff.vz) / plane;
      // Same plane speed through both formulas. This is the change itself, with
      // no measurement noise: outward share must shrink and the vertical share
      // must not, because the plane speed is conserved either way.
      const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
      const now = clamp(
        (plane - TUNE.quarterOverDeckSpeed) * TUNE.quarterRolloutSpeedGain,
        TUNE.quarterRolloutRatioMin, TUNE.quarterRolloutRatioMax);
      const before = clamp((plane - TUNE.quarterOverDeckSpeed) * 0.04, -0.035, 0.35);
      const upNow = Math.sqrt(1 - now * now), upBefore = Math.sqrt(1 - before * before);
      data.push({
        quarter: speed, plane: +plane.toFixed(2), measuredOutwardShare: +measured.toFixed(4),
        outwardRatioBefore: +before.toFixed(4), outwardRatioNow: +now.toFixed(4),
        verticalShareBefore: +upBefore.toFixed(4), verticalShareNow: +upNow.toFixed(4),
        maxY: +maxY.toFixed(2), maxOutward: +maxOut.toFixed(2),
      });
      check('Quarter takeoff stays mostly upward at ' + speed,
        measured <= TUNE.quarterRolloutRatioMax + 0.02, { measured, plane });
      // Signed: less outward (or unchanged). Negative leans back over the deck.
      check('Quarter outward throw is reduced or equal at ' + speed,
        now <= before + 1e-9, { now, before, plane });
      check('Quarter vertical share is not reduced at ' + speed,
        upNow >= upBefore - 1e-9, { upNow, upBefore });
      check('Quarter still produces real height at ' + speed, takeoff.vy > plane * 0.9,
        { vy: takeoff.vy, plane });
    }

    // ---- 5. BRI / INWARD DIRECTLY FROM RS ---------------------------------
    const scoop = (s, direction, chargeSeconds) => {
      const pops = [];
      const before = g.events.history.length;
      if (chargeSeconds > 0) a(chargeSeconds, { ry: 1 });
      for (let i = 0; i <= 18; i++) {
        const r = direction * i * Math.PI * 2 / 18;
        a(.012, { rx: Math.cos(r), ry: Math.sin(r) });
      }
      for (const e of g.events.history.slice(before)) if (e.type === 'pop') pops.push(e.charge);
      return pops;
    };
    for (const [label, seconds] of [['charged', .95], ['partial', .4], ['uncharged', 0]]) {
      const s = flat(7);
      const pops = scoop(s, 1, seconds);
      const target = Math.abs(s.tricks.bri.target);
      data.push({ bri: label, pops, target: +target.toFixed(2), airborne: !s.grounded });
      check('Bri ' + label + ' takes off directly from RS', !s.grounded && target > 6, { pops, target });
      check('Bri ' + label + ' applies exactly one launch impulse', pops.length === 1, { pops });
    }
    // A charged attempt must launch meaningfully harder than an uncharged one.
    // Compare the charge actually applied at takeoff: reading velocity later
    // would just measure how long gravity had been acting.
    {
      const curve = [];
      for (const seconds of [0, .2, .45, .7, .95]) {
        const s = flat(7);
        const pops = scoop(s, 1, seconds);
        curve.push({ seconds, charge: +(pops[0] ?? 0).toFixed(3) });
      }
      data.push({ chargeCurve: curve });
      check('An uncharged flick still earns a real attempt',
        curve[0].charge >= TUNE.briMinCharge - 1e-6, curve);
      check('Charge builds progressively toward full',
        curve.every((p, i) => i === 0 || p.charge >= curve[i - 1].charge - 1e-6), curve);
      check('Roughly one second of hold reaches full charge',
        curve.at(-1).charge > .9, curve);
      check('Charge meaningfully increases the Bri pop',
        curve.at(-1).charge > curve[0].charge + .5, curve);
    }
    // The timeline must run to completion without a mid-air reset that snaps
    // the scooter back under the feet.
    for (const direction of [1, -1]) {
      const s = flat(7);
      scoop(s, direction, .95);
      const target = s.tricks.bri.target;
      // Only inspect the timeline while it is actually airborne: landing legally
      // ends the attempt and resets the channel.
      let regressed = false, previous = Math.abs(s.tricks.bri.angle), reset = false, peak = previous;
      for (let i = 0; i < 300; i++) {
        a(1 / 120);
        if (s.grounded) break;
        const now = Math.abs(s.tricks.bri.angle);
        // Tolerate the channel settling onto its target (a few degrees of
        // overshoot). A real half-trick reset reverses by radians, not degrees.
        if (now + 1e-6 < previous - .25) regressed = true;
        if (s.tricks.bri.target !== target) reset = true;
        previous = now;
        peak = Math.max(peak, now);
      }
      data.push({ briRun: direction, target: +target.toFixed(2), peakAngle: +peak.toFixed(2), completion: +(peak / Math.abs(target)).toFixed(3), regressed, reset });
      check('Bri ' + direction + ' never reverses mid-motion', !regressed, { regressed });
      check('Bri ' + direction + ' timeline is not reset mid-air', !reset, { reset });
      // The whole complaint: the motion used to stop about halfway and the
      // scooter snapped back under the feet.
      check('Bri ' + direction + ' completes its motion rather than half of it',
        peak / Math.abs(target) > TUNE.briCatchProgress, { peak, target });
    }

    // ---- 6. LANDING GRADES ------------------------------------------------
    const grades = {};
    for (const speed of [5, 7, 9, 11]) {
      for (const ry of [0, .3]) {
        const s = flat(speed);
        a(.12, { ry: 1 });
        a(1 / 120, { ry: -1 });
        const before = g.events.history.length;
        let landed = false;
        for (let i = 0; i < 300 && !landed; i++) { a(1 / 120, { ry }); landed = s.grounded; }
        const events = g.events.history.slice(before).filter(e => e.type === 'landing');
        for (const e of events) grades[e.quality] = (grades[e.quality] ?? 0) + 1;
        data.push({ gradeRun: { speed, ry, qualities: events.map(e => e.quality) } });
        check('One touchdown produces exactly one grade (' + speed + '/' + ry + ')',
          events.length === 1, { events: events.map(e => e.quality) });
      }
    }
    data.push({ gradeDistribution: grades });
    check('Routine straight hops are not graded SKETCHY',
      (grades.sketchy ?? 0) === 0, grades);
    check('Routine straight hops land PERFECT or GOOD',
      (grades.clean ?? 0) + (grades.good ?? 0) === 8, grades);

    return { checks, data };
  });
  console.log(JSON.stringify(result.data, null, 1));
  console.log('\nPASSED ' + result.checks.length + ' CHECKS');
  for (const c of result.checks) console.log('  ok  ' + c);
} finally {
  await browser.close();
}
