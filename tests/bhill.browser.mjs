// B Hill downhill (#20): the road tips over straight after the spawn, speed
// keeps building from gravity alone past the pushing ceiling, and at bombing
// speed oversteer, jerky corrections and loose ground can put a rider down
// while smooth riding stays clean. Full descents run for scooter and longboard.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
mkdirSync("artifacts/bhill", { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.BROWSER_EXECUTABLE || process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const results = [];
const check = (name, ok, data) => {
  results.push({ name, ok: !!ok, data });
  console.log((ok ? "PASS " : "FAIL ") + name + " " + JSON.stringify(data));
};
try {
  await page.goto((process.env.LAZER_URL || "http://127.0.0.1:5174") + "/?map=b_hill");
  await page.waitForFunction(() => window.__LAZER, null, { timeout: 180000 });
  await page.evaluate(async () => {
    const g = window.__LAZER;
    g.testing(true);
    await g.startSession("b_hill", true);
    const hill = await import("/src/park/bhill.ts");
    const { TUNE } = await import("/src/core/config.ts");
    const s = g.sim;
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    if (!s.__wrapped) { const bail = s.bail.bind(s); s.bail = (r, x) => { if (s.state !== "Bail") s.__reason = r; return bail(r, x); }; s.__wrapped = true; }
    const place = (at, speed, ride = "scooter") => {
      s.rideable = ride;
      s.reset(0, true);
      g.advance(0.2, {}, false);
      const p = hill.routePose(at);
      s.position.set(p.x, p.y + 0.25, p.z); s.previousPosition.copy(s.position); s.body.setTranslation(s.position, true);
      s.yaw = s.previousYaw = p.yaw;
      s.velocity.set(Math.sin(p.yaw) * speed, -hill.bHillGrade(at) * speed, Math.cos(p.yaw) * speed);
      s.body.setLinvel(s.velocity, true);
      s.grounded = true; s.lastGround = s.elapsed; s.__reason = null;
      g.advance(0.1, {}, false);
      return s;
    };
    // One scripted descent. Controlled riders read the road ahead and brake for
    // corners; aggressive riders never brake, steer hard and throw in quick
    // left-right corrections.
    const descend = (ride, style) => {
      s.rideable = ride;
      s.reset(0, true);
      s.__reason = null;
      g.advance(0.3, {}, false);
      const marks = {}, bails = [];
      let t = 0, steer = 0, maxSpeed = 0, maxWobble = 0, last = 0;
      while (t < 160) {
        const p = s.position, speed = s.speed, at = hill.routeProgress(p.x, p.z);
        if (at > hill.B_HILL_LENGTH - 60) break;
        if (s.state === "Bail") {
          bails.push({ at: Math.round(at), speed: +last.toFixed(1), reason: s.__reason });
          if (bails.length > 10) break;
          g.advance(1.5, {}, false);
          place(Math.max(60, at - 10), 0, ride);
          t += 1.8;
          continue;
        }
        const ahead = hill.routePose(at + Math.max(7, speed * (style === "aggressive" ? 0.55 : 0.9)));
        const err = wrap(Math.atan2(ahead.x - p.x, ahead.z - p.z) - s.yaw);
        let want = Math.max(-(style === "aggressive" ? 1 : 0.7), Math.min(style === "aggressive" ? 1 : 0.7, -(style === "aggressive" ? 4.5 : 1.6) * err));
        if (style === "aggressive" && t > 8 && Math.floor(t / 1.6) % 3 === 0) want = Math.sign(Math.sin(t * 9)) * 0.9;
        steer = style === "aggressive" ? want : steer + (want - steer) * 0.5;
        let brake = 0, tuck = style === "aggressive" ? 1 : 0;
        if (style === "controlled") {
          const grip = 13; // #87: the longboard corners as fast as the scooter
          let allowed = 1e9;
          for (let k = 4; k < Math.max(40, speed * 3); k += 4) {
            const a = hill.routePose(at + k - 4), b = hill.routePose(at + k + 4);
            const turn = Math.abs(wrap(b.yaw - a.yaw)) / 8;
            allowed = Math.min(allowed, Math.sqrt(grip * (turn > 1e-4 ? 1 / turn : 1e9) + 6 * Math.max(0, k - 6)));
          }
          if (speed > allowed) brake = ride === "longboard" ? 0.55 : 0.7;
          tuck = speed < allowed - 4 ? 1 : 0;
        }
        g.advance(0.05, { steer, held: { brake, pumpGrind: ride === "longboard" ? tuck : 0 } }, false);
        t += 0.05;
        last = speed;
        maxSpeed = Math.max(maxSpeed, speed);
        maxWobble = Math.max(maxWobble, s.speedWobble.amount);
        for (const m of [50, 100, 200, 400, 600, 900, 1200, 1350]) if (marks[m] === undefined && at >= m) marks[m] = +speed.toFixed(1);
      }
      return { ride, style, time: +t.toFixed(1), maxSpeed: +maxSpeed.toFixed(1), maxWobble: +maxWobble.toFixed(2), marks, bails, finished: hill.routeProgress(s.position.x, s.position.z) > hill.B_HILL_LENGTH - 70 };
    };
    window.__bhill = { g, hill, TUNE, s, place, descend };
  });
  const run = (fn, arg) => page.evaluate(fn, arg);

  // Starting steepness: the road tips over within a few metres of the spawn.
  const start = await run(() => {
    const { g, hill, s } = window.__bhill;
    s.rideable = "scooter"; s.reset(0, true); g.advance(0.3, {}, false);
    const at0 = hill.routeProgress(s.position.x, s.position.z);
    g.advance(3, {}, false);
    return { spawnAt: Math.round(at0), gradeAtSpawn: +hill.bHillGrade(at0).toFixed(3), gradeAt80: +hill.bHillGrade(80).toFixed(3), speedAfter3s: +s.speed.toFixed(1), state: s.state };
  });
  check("Spawn rolls away downhill with no input; grade reaches 9%+ within 25 m", start.speedAfter3s > 2.5 && start.gradeAt80 >= 0.09 && start.state !== "Bail", start);

  // Grade profile: steepening sections with brief easings, no step anywhere.
  const profile = await run(() => {
    const { hill } = window.__bhill, out = { steepest: 0, easings: 0, maxChange: 0 };
    let previous = 0, falling = false;
    for (let at = 40; at < hill.B_HILL_LENGTH - 200; at += 5) {
      const gr = hill.bHillGrade(at);
      out.steepest = Math.max(out.steepest, gr);
      out.maxChange = Math.max(out.maxChange, Math.abs(gr - previous) / 5);
      if (gr < previous - 1e-4 && !falling) { out.easings++; falling = true; } else if (gr > previous + 1e-4) falling = false;
      previous = gr;
    }
    out.top = +hill.bHillGrade(120).toFixed(3); out.mid = +hill.bHillGrade(600).toFixed(3); out.lower = +hill.bHillGrade(880).toFixed(3); out.final = +hill.bHillGrade(1150).toFixed(3);
    return out;
  });
  check("Each section steeper than the last, with easings between", profile.top < profile.mid && profile.mid < profile.lower && profile.lower < profile.final && profile.easings >= 4 && profile.maxChange < 0.005, profile);

  // Oversteer at bombing speed washes the front out; the same speed ridden smoothly stays up.
  const oversteer = await run(() => {
    const { g, s, place } = window.__bhill;
    place(1180, 26);
    let t = 0;
    while (t < 3 && s.state !== "Bail") { g.advance(0.05, { steer: 1 }, false); t += 0.05; }
    return { state: s.state, reason: s.__reason, after: +t.toFixed(2) };
  });
  check("Holding full lock at 26 m/s washes the front out", oversteer.state === "Bail" && /washed out|wobble/i.test(oversteer.reason ?? ""), oversteer);
  const flicks = await run(() => {
    const { g, s, place } = window.__bhill;
    place(1180, 26);
    let t = 0;
    while (t < 1.6 && s.state !== "Bail") { g.advance(0.05, { steer: Math.sign(Math.sin(t * 9)) * 0.9 }, false); t += 0.05; }
    return { state: s.state, reason: s.__reason, after: +t.toFixed(2) };
  });
  check("Rapid left-right corrections at 26 m/s shake the rider off", flicks.state === "Bail" && /wobble/i.test(flicks.reason ?? ""), flicks);
  const smooth = await run(() => {
    const { g, s, place } = window.__bhill;
    place(1180, 26);
    let t = 0, wobble = 0;
    const { hill } = window.__bhill, wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    let steer = 0, surface = "road";
    // Following the road while weaving gently across the lane.
    while (t < 3 && s.state !== "Bail") {
      const at = hill.routeProgress(s.position.x, s.position.z), ahead = hill.routePose(at + 24);
      const err = wrap(Math.atan2(ahead.x - s.position.x, ahead.z - s.position.z) - s.yaw);
      steer += (Math.max(-0.5, Math.min(0.5, -1.6 * err)) + 0.2 * Math.sin(t * 2.1) - steer) * 0.5;
      g.advance(0.05, { steer }, false); t += 0.05; wobble = Math.max(wobble, s.speedWobble.amount);
      if (hill.bHillSurface(s.position.x, s.position.z) !== "road") surface = "off";
    }
    return { state: s.state, reason: s.__reason, wobble: +wobble.toFixed(2), speed: +s.speed.toFixed(1), surface };
  });
  check("Smooth weaving at 26 m/s stays up", smooth.state !== "Bail" && smooth.wobble < 0.3 && smooth.surface === "road", smooth);
  const slow = await run(() => {
    const { g, s, place, TUNE } = window.__bhill;
    place(1180, TUNE.pushMaxSpeed - 3);
    let t = 0, wobble = 0;
    while (t < 1.6 && s.state !== "Bail") { g.advance(0.05, { steer: Math.sign(Math.sin(t * 9)) * 0.9, held: { brake: 0.4 } }, false); t += 0.05; wobble = Math.max(wobble, s.speedWobble.amount); }
    return { state: s.state, wobble, speed: +s.speed.toFixed(1) };
  });
  check("Below pushing speed the same flicks build no wobble (park riding unchanged)", slow.state !== "Bail" && slow.wobble === 0, slow);
  const dirt = await run(() => {
    const { g, s, hill } = window.__bhill;
    window.__bhill.place(1180, 24);
    const p = hill.routePose(1180), off = 9;
    s.position.x += Math.cos(p.yaw) * off; s.position.z -= Math.sin(p.yaw) * off;
    s.position.y = hill.bHillHeight?.(s.position.x, s.position.z) ?? s.position.y;
    const surface = hill.bHillSurface(s.position.x, s.position.z);
    return { surface };
  });
  check("Beyond the shoulder is loose ground", dirt.surface === "dirt", dirt);

  // #87: tucked, a longboard keeps pulling away down the steep lower section;
  // standing up, air holds it back.
  const tuck = await run(() => {
    const { g, s, hill, place } = window.__bhill, out = {};
    for (const held of [1, 0]) {
      place(1090, 24, "longboard");
      let t = 0, max = 0;
      while (t < 4 && s.state !== "Bail") {
        const p = s.position, at = hill.routeProgress(p.x, p.z), ahead = hill.routePose(at + 25);
        let err = Math.atan2(ahead.x - p.x, ahead.z - p.z) - s.yaw;
        err = Math.atan2(Math.sin(err), Math.cos(err));
        g.advance(0.05, { steer: Math.max(-0.8, Math.min(0.8, -1.6 * err)), held: { pumpGrind: held } }, false); t += 0.05;
        max = Math.max(max, s.speed);
      }
      out[held ? "tucked" : "standing"] = { end: +s.speed.toFixed(1), max: +max.toFixed(1), state: s.state };
    }
    return out;
  });
  check("Tucked longboard pulls away on the steep section; standing it holds back", tuck.tucked.end > 26.5 && tuck.tucked.state !== "Bail" && tuck.standing.end < 25 && tuck.tucked.end - tuck.standing.end > 2, tuck);

  // Full descents.
  const runs = [];
  for (const [ride, style] of [["scooter", "controlled"], ["scooter", "aggressive"], ["longboard", "controlled"], ["longboard", "aggressive"]]) {
    const r = await run(([ride, style]) => window.__bhill.descend(ride, style), [ride, style]);
    runs.push(r);
    console.log(JSON.stringify(r));
  }
  const [sc, sa, lc, la] = runs;
  const push = await run(() => window.__bhill.TUNE.pushMaxSpeed);
  check("Scooter controlled: clean run to the bottom", sc.finished && sc.bails.length === 0, sc);
  check("Scooter builds speed through the descent, well past pushing speed", sc.marks[100] < sc.marks[200] && sc.marks[200] < sc.marks[600] && sc.marks[600] <= sc.marks[1200] + 1 && sc.maxSpeed > push * 1.7, { marks: sc.marks, max: sc.maxSpeed, push });
  check("Longboard controlled: clean run to the bottom", lc.finished && lc.bails.length === 0, lc);
  check("Longboard builds substantial downhill speed", lc.marks[200] > 12 && lc.maxSpeed > 27, { marks: lc.marks, max: lc.maxSpeed });
  check("Longboard races at a scooter's pace (#87)", lc.time <= sc.time * 1.05, { longboard: lc.time, scooter: sc.time });
  check("Careless riding at speed is punished (bail or heavy wobble)", sa.bails.length > 0 || sa.maxWobble > 0.6 || la.bails.length > 0, { scooter: { bails: sa.bails, wobble: sa.maxWobble }, longboard: { bails: la.bails, wobble: la.maxWobble } });
  check("No collision explosions: no bail on a clean line", [sc, lc].every((r) => r.bails.every((b) => b.reason !== "Heavy collision")), null);
  check("No page errors", errors.length === 0, errors);
} finally {
  writeFileSync("artifacts/bhill/results.json", JSON.stringify(results, null, 2));
  await browser.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`${results.length - failed.length}/${results.length} B Hill checks passed`);
if (failed.length) process.exit(1);
