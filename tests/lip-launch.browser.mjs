// Lip / coping launch scenarios on the production Veterans Memorial Park ramps.
//
//   LAZER_URL=http://127.0.0.1:5190 node tests/lip-launch.browser.mjs
//
// Rides real fixtures through g.advance() with InputFrames (never calls pop or
// rewrites velocity) and instruments, per tick: every velocity writer
// (pop / land / absorbCrookedLanding), and every contact the rider's chassis
// and rail guard make with park colliders, with normal and impulse.
//
// Groups:
//   A  natural launches: exit vector vs entry vector in the lip frame
//      (F = along the lip's forward, U = up, L = along the coping)
//   B  pops at the lip, including LS lean back
//   C  angled same-wall quarter airs with no air steering: the landing must
//      not turn a descending rider upward or reverse the travel, and must not
//      relaunch the rider off the coping
//   D  rolling back / manual / fakie roll-in under a coping: the rider's own
//      coping must not throw the rider (rail guard contact)
//
// Writes artifacts/physics/lip-launch.json. Exit code 1 on any failure.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const browser = await chromium.launch({
  executablePath: process.env.BROWSER_EXECUTABLE || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const only = (process.argv.find((a) => a.startsWith('--only=')) ?? '').slice(7).split(',').filter(Boolean);
const pageErrors = [];
let results;
try {
  for (let attempt = 0; attempt < 3 && !results; attempt++) {
    const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
    page.on('pageerror', (e) => pageErrors.push(e.message));
    try {
      await page.goto((process.env.LAZER_URL || 'http://127.0.0.1:5174') + '/?map=outdoor');
      await page.waitForFunction(() => window.__LAZER, null, { timeout: 120000 });
      results = await page.evaluate(runScenarios, only);
    } catch (error) {
      // The dev server reloads the page when another checkout edits a file.
      if (!/context was destroyed|navigation/i.test(String(error)) || attempt === 2) throw error;
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}

async function runScenarios(only = []) {
  const run = (group) => !only.length || only.includes(group);
  const g = window.__LAZER;
  g.testing(true);
  await g.startSession('outdoor', true);
  const s = g.sim;
  const { TUNE } = await import('/src/core/config.ts');
  const { terrainHeight } = await import('/src/park/park.ts');
  const { outdoorLip, modules, rampLips } = await import('/src/park/outdoor.ts');
  const dt = TUNE.step;
  const mod = (id) => modules.find((m) => m.id === id);

  // ---- Instrumentation -------------------------------------------------------
  let tick = -1, writers = [], contacts = [];
  const proto = Object.getPrototypeOf(s);
  for (const name of ['pop', 'land', 'absorbCrookedLanding']) {
    const original = proto[name];
    if (original.__lipLaunch) continue;
    const wrapped = function (...args) {
      const before = this.velocity.toArray();
      const result = original.apply(this, args);
      if (this === g.sim) writers.push({ tick, name, before, after: this.velocity.toArray(), grounded: this.grounded });
      return result;
    };
    wrapped.__lipLaunch = true;
    proto[name] = wrapped;
  }
  const copingHandles = new Set(g.park.rails.filter((r) => r.coping).map((r) => r.colliderHandle));
  const railIds = new Map(g.park.rails.map((r) => [r.colliderHandle, r.id]));
  const world = s.world, step = world.step.bind(world);
  world.step = (queue, hooks) => {
    step(queue, hooks);
    for (const collider of [s.body.collider(0), s.railGuard]) {
      world.contactPairsWith(collider, (other) => {
        if (!railIds.has(other.handle)) return;
        world.contactPair(collider, other, (manifold) => {
          let impulse = 0;
          for (let i = 0; i < manifold.numContacts(); i++) impulse += manifold.contactImpulse(i);
          if (impulse > 1e-3) contacts.push({ tick, self: collider.handle === s.railGuard.handle ? 'guard' : 'chassis', rail: railIds.get(other.handle), coping: copingHandles.has(other.handle), impulse });
        });
      });
    }
  };

  function ride({ x, z, yaw, travelYaw = yaw, speed, seconds = 3.2, script = () => ({}) }) {
    s.reset(0, true);
    g.advance(0.3, {}, false);
    s.tricks.stance = 'regular';
    s.tricks.controlStyle = 'pro';
    s.position.set(x, terrainHeight(x, z) + TUNE.radius, z);
    s.previousPosition.copy(s.position);
    s.body.setTranslation(s.position, true);
    s.yaw = s.previousYaw = yaw;
    s.velocity.set(Math.sin(travelYaw) * speed, 0, Math.cos(travelYaw) * speed);
    s.body.setLinvel(s.velocity, true);
    writers = []; contacts = [];
    const events = [], rows = [];
    const off = g.events.on((e) => events.push({ tick, type: e.type, quality: e.quality, reason: e.reason }));
    for (let i = 0; i < Math.round(seconds / dt); i++) {
      tick = i;
      const wasGrounded = s.grounded, before = s.velocity.toArray();
      g.advance(dt, script(i, s) ?? {}, false);
      const lip = outdoorLip(s.position.x, s.position.z, s.velocity.z, s.velocity.x);
      rows.push({ i, wasGrounded, grounded: s.grounded, grind: !!s.grind, before, v: s.velocity.toArray(), p: s.position.toArray(), lip: lip && { d: lip.distance, f: lip.forward.toArray() } });
    }
    off();
    return { rows, events, writers: writers.slice(), contacts: contacts.slice() };
  }
  const round = (v, n = 2) => +v.toFixed(n);
  // Lip frame components of a velocity.
  const frame = (v, f) => ({ F: v[0] * f[0] + v[2] * f[2], U: v[1], L: v[0] * f[2] - v[2] * f[0] });
  function departure(run) {
    const k = run.rows.findIndex((r, i) => i > 25 && r.wasGrounded && !r.grounded && !r.grind);
    if (k < 0) return null;
    const lipRow = run.rows.slice(Math.max(0, k - 4), k + 1).reverse().find((r) => r.lip);
    const f = lipRow ? lipRow.lip.f : null;
    if (!f) return { k, f: null };
    const entry = frame(run.rows[Math.max(0, k - 3)].v, f), exit = frame(run.rows[k].v, f);
    return { k, f, entry, exit };
  }
  const table = [], failures = [];
  const fail = (group, name, message) => failures.push(`${group} ${name}: ${message}`);
  const approach = {
    quarter(id, speed, deg) {
      const m = mod(id), lip = rampLips(m)[0], toward = m.reverse ? -1 : 1, off = deg * Math.PI / 180;
      const travel = (toward > 0 ? 0 : Math.PI) + off;
      return { x: -Math.sin(travel) * 6, z: lip - toward * 13 * Math.cos(off), yaw: travel, speed };
    },
    spine(side, speed, deg) {
      const off = deg * Math.PI / 180, travel = (side > 0 ? 0 : Math.PI) + off;
      return { x: 4.3 - Math.sin(travel) * 4.5, z: 0.5 - side * 9 * Math.cos(off), yaw: travel, speed };
    },
    box(id, speed, deg, x) {
      const m = mod(id), lip = rampLips(m)[0], off = deg * Math.PI / 180, travel = Math.PI - off;
      return { x, z: lip + 9 * Math.cos(off), yaw: travel, speed };
    },
  };
  const holdThenRelease = (at) => {
    let released = false;
    return (i, sim) => {
      const lip = outdoorLip(sim.position.x, sim.position.z, sim.velocity.z, sim.velocity.x);
      if (!released && lip && sim.grounded && lip.distance <= at) { released = true; return { ry: -1 }; }
      return released ? {} : { ry: i > 20 ? 1 : 0 };
    };
  };

  // ---- A: natural launches -----------------------------------------------------
  const natural = [
    ['back quarter 11 m/s straight', approach.quarter('back-quarter', 11, 0)],
    ['back quarter 12.5 m/s 20 deg', approach.quarter('back-quarter', 12.5, 20)],
    ['front quarter 11 m/s straight', approach.quarter('front-quarter', 11, 0)],
    ['front quarter 12.5 m/s -20 deg', approach.quarter('front-quarter', 12.5, -20)],
    ['spine +z 9 m/s straight', approach.spine(1, 9, 0)],
    ['spine +z 11 m/s 25 deg', approach.spine(1, 11, 25)],
    ['spine -z 11 m/s straight', approach.spine(-1, 11, 0)],
    ['small box 9 m/s straight', approach.box('small-box', 9, 0, -2.9)],
    ['small box 11 m/s straight', approach.box('small-box', 11, 0, -2.9)],
    ['large box 11 m/s straight', approach.box('large-transfer', 11, 0, -12)],
    ['large box 13 m/s 25 deg', approach.box('large-transfer', 13, 25, -9.5)],
  ];
  for (const [name, fixture] of run('A') ? natural : []) {
    const run = ride(fixture), d = departure(run);
    if (!d?.f) { fail('A', name, 'no lip departure'); continue; }
    table.push({ group: 'A', name, entry: d.entry, exit: d.exit });
    const entrySpeed = Math.hypot(d.entry.F, d.entry.U, d.entry.L), exitSpeed = Math.hypot(d.exit.F, d.exit.U, d.exit.L);
    if (exitSpeed > entrySpeed + 0.3) fail('A', name, `speed gain ${round(entrySpeed)} -> ${round(exitSpeed)}`);
    if (Math.abs(d.exit.L - d.entry.L) > 0.3) fail('A', name, `lateral changed ${round(d.entry.L)} -> ${round(d.exit.L)}`);
    if (d.exit.F < -0.2) fail('A', name, `launched backward (F ${round(d.exit.F)})`);
    if (d.exit.U <= 0) fail('A', name, 'no upward launch');
  }

  // ---- B: pops at the lip, with lean ---------------------------------------------
  const pops = [
    ['back quarter pop, no lean', approach.quarter('back-quarter', 11, 0), 0],
    ['back quarter pop, LS back 0.5', approach.quarter('back-quarter', 11, 0), 0.5],
    ['back quarter pop, LS back 1', approach.quarter('back-quarter', 11, 0), 1],
    ['back quarter 9.5 m/s pop, LS back 1', approach.quarter('back-quarter', 9.5, 0), 1],
    ['front quarter pop 20 deg, LS back 1', approach.quarter('front-quarter', 12.5, -20), 1],
    ['spine pop, LS back 1', approach.spine(1, 9, 0), 1],
    ['small box pop, LS back 1', approach.box('small-box', 9, 0, -2.9), 1],
    ['large box pop, LS back 1', approach.box('large-transfer', 11, 0, -12), 1],
  ];
  for (const [name, fixture, lean] of run('B') ? pops : []) {
    const release = holdThenRelease(0.5);
    const run = ride({ ...fixture, script: (i, sim) => ({ ...release(i, sim), lean }) });
    const pop = run.writers.find((w) => w.name === 'pop');
    const lipRow = pop && run.rows.slice(Math.max(0, pop.tick - 4), pop.tick + 1).reverse().find((r) => r.lip);
    if (!pop || !lipRow) { fail('B', name, 'no pop at a lip'); continue; }
    const f = lipRow.lip.f, entry = frame(pop.before, f), exit = frame(pop.after, f);
    table.push({ group: 'B', name, entry, exit });
    const plane = Math.hypot(exit.F, exit.U);
    if (exit.F < -0.1 * plane) fail('B', name, `pop threw the rider backward off the lip (F ${round(exit.F)} of ${round(plane)} m/s)`);
    if (Math.abs(exit.L - entry.L) > 0.3) fail('B', name, `lateral changed ${round(entry.L)} -> ${round(exit.L)}`);
  }

  // ---- C: angled same-wall quarter airs, no air steering ----------------------
  for (const id of run('C') ? ['back-quarter', 'front-quarter'] : [])
    for (const speed of [10, 11, 12.5, 14])
      for (const deg of [15, 20, 30, 40]) {
        const name = `${id} ${speed} m/s ${deg} deg`;
        const run = ride({ ...approach.quarter(id, speed, id === 'front-quarter' ? -deg : deg), seconds: 3.4 });
        const d = departure(run);
        if (!d?.f) continue; // too slow to reach the lip at this angle
        // The crooked-landing redirect (absorbCrookedLanding) of every touchdown:
        // it may turn the travel onto the deck's axis, but never by more than the
        // fail angle the landing was graded against, never from descending to
        // climbing, and never into a large reversal along the coping.
        let worstTurn = 0, flips = [];
        for (const w of run.writers.filter((w) => w.name === 'absorbCrookedLanding')) {
          const [b, a] = [w.before, w.after];
          const turn = Math.acos(Math.max(-1, Math.min(1, (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (Math.hypot(...a) * Math.hypot(...b) + 1e-9)))) * 180 / Math.PI;
          worstTurn = Math.max(worstTurn, turn);
          const shown = `[${b.map((v) => round(v))}] -> [${a.map((v) => round(v))}]`;
          if (turn > TUNE.failAngle * 180 / Math.PI + 0.5) flips.push(`t${w.tick} turned the travel ${round(turn, 0)} deg, past the ${round(TUNE.failAngle * 180 / Math.PI, 0)} deg fail angle ${shown}`);
          if (b[1] < -0.3 && a[1] > 0.3) flips.push(`t${w.tick} turned a descending rider upward ${shown}`);
          const lb = frame(b, d.f).L, la = frame(a, d.f).L;
          if (lb * la < 0 && Math.abs(la) > 0.5 * Math.abs(lb) && Math.abs(la) > 0.5) flips.push(`t${w.tick} reversed the travel along the coping ${round(lb)} -> ${round(la)} m/s ${shown}`);
        }
        const popCount = run.events.filter((e) => e.type === 'pop').length;
        const landings = run.events.filter((e) => e.type === 'landing').map((e) => e.quality);
        const bails = run.events.filter((e) => e.type === 'bail').map((e) => e.reason);
        table.push({ group: 'C', name, entry: d.entry, exit: d.exit, pops: popCount, landings, bails, worstLandingTurn: round(worstTurn, 0) });
        for (const flip of flips) fail('C', name, flip);
        if (popCount > 1) fail('C', name, `${popCount} launches off one quarter air (relaunched from the coping on touchdown)`);
      }

  // ---- D: the rider's own coping must not throw the rider --------------------------
  const own = [
    ['small box: short roll-up falls back under the lip', approach.box('small-box', 6, 0, -2.9)],
    ['large box: short roll-up falls back under the lip', approach.box('large-transfer', 7.8, 0, -12)],
    ['spine: slow roll-up falls back under the lip', approach.spine(1, 7, 0)],
    ['spine: angled short transfer falls back', approach.spine(1, 8, 20)],
    ['back quarter: fakie roll-in off the deck', { x: 2, z: 27.6, yaw: 0, travelYaw: Math.PI, speed: 2 }],
    ['back quarter: fakie roll-in off the deck, 30 deg', { x: 2, z: 27.6, yaw: 0.52, travelYaw: Math.PI + 0.52, speed: 2 }],
    ['back quarter: manual up the transition', { ...approach.quarter('back-quarter', 11, 0), script: (i) => (i > 20 ? { ry: 0.4 } : {}) }],
    ['front quarter: manual up the transition', { ...approach.quarter('front-quarter', 11, 0), script: (i) => (i > 20 ? { ry: 0.4 } : {}) }],
    ['small box: manual up the kicker', { ...approach.box('small-box', 9, 0, -2.9), script: (i) => (i > 20 ? { ry: 0.4 } : {}) }],
  ];
  for (const [name, fixture] of run('D') ? own : []) {
    const run = ride({ seconds: 2.8, ...fixture });
    const hits = run.contacts.filter((c) => c.coping && c.self === 'guard');
    const railImpacts = run.events.filter((e) => e.type === 'railImpact').length;
    const bails = run.events.filter((e) => e.type === 'bail').map((e) => e.reason);
    let kick = 0;
    for (const h of hits) {
      const r = run.rows[h.tick];
      if (r) kick = Math.max(kick, Math.hypot(r.v[0] - r.before[0], r.v[1] - r.before[1] + TUNE.gravity * dt * (r.grounded ? 0 : 1), r.v[2] - r.before[2]));
    }
    table.push({ group: 'D', name, guardCopingContacts: hits.length, maxImpulse: round(Math.max(0, ...hits.map((h) => h.impulse)), 1), velocityKick: round(kick), railImpacts, bails });
    if (hits.length) fail('D', name, `rail guard hit the rider's own coping ${hits.length} ticks (max impulse ${round(Math.max(...hits.map((h) => h.impulse)), 1)}, velocity kick ${round(kick)} m/s)`);
    if (bails.includes('Rail impact')) fail('D', name, 'bailed on a rail impact against its own coping');
  }
  return { table, failures, incidents: s.diagnostics.incidents.length };
}

const report = { ranAt: new Date().toISOString(), fixture: 'production Veterans Memorial Park wood ramps', ...results, pageErrors };
mkdirSync('artifacts/physics', { recursive: true });
writeFileSync('artifacts/physics/lip-launch.json', JSON.stringify(report, null, 2));
const vec = (c) => `F${c.F.toFixed(2).padStart(6)} U${c.U.toFixed(2).padStart(6)} L${c.L.toFixed(2).padStart(6)} |${Math.hypot(c.F, c.U, c.L).toFixed(2)}| ${(Math.atan2(c.U, c.F) * 180 / Math.PI).toFixed(0).padStart(4)}deg`;
for (const row of results.table) {
  if (row.group === 'D')
    console.log(`D  ${row.name.padEnd(52)} guard-coping ticks ${row.guardCopingContacts} impulse ${row.maxImpulse} kick ${row.velocityKick} m/s railImpacts ${row.railImpacts} bails ${row.bails.join(',') || '-'}`);
  else
    console.log(`${row.group}  ${row.name.padEnd(40)} entry ${vec(row.entry)}  ->  exit ${vec(row.exit)}${row.group === 'C' ? `  pops ${row.pops} landings ${row.landings.join(',')} bails ${row.bails.join(',') || '-'} worst landing turn ${row.worstLandingTurn}deg` : ''}`);
}
console.log(`\n${results.failures.length} failure(s); ${results.incidents} guard incident(s); ${pageErrors.length} page error(s)`);
for (const f of results.failures) console.log('FAIL ' + f);
if (results.failures.length || results.incidents || pageErrors.length) process.exitCode = 1;
