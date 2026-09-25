// Curbs, sidewalks and storm drains (#87). At Veterans the lot and the streets
// lie a curb below the park; riding into a curb face throws the rider, a slow
// bump just stops them, a glancing touch slides along it, and the curb ramps
// and a hop get them up and down. The gutters carry rain to the inlets (and on
// B Hill downhill past them), leaves wash to the grates, and snow at the curb
// packs and refreezes into ice that takes the tyres' grip.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
mkdirSync("artifacts/curbs", { recursive: true });
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
const origin = process.env.LAZER_URL || "http://127.0.0.1:5174";
const load = async (map) => {
  await page.goto(`${origin}/?map=${map}`);
  await page.waitForFunction(() => window.__LAZER, null, { timeout: 180000 });
  await page.evaluate(async (map) => {
    const g = window.__LAZER;
    g.testing(true);
    await g.startSession(map, true);
    const s = g.sim;
    if (!s.__wrapped) { const bail = s.bail.bind(s); s.bail = (r, x) => { if (s.state !== "Bail") s.__reason = r; return bail(r, x); }; s.__wrapped = true; }
    const park = await import("/src/park/park.ts");
    // Put the rider down rolling at a speed and heading.
    const place = (x, z, yaw, speed, ride = "scooter") => {
      s.rideable = ride; s.reset(0, true); g.advance(0.2, {}, false);
      const y = park.terrainHeight(x, z);
      s.position.set(x, y + 0.25, z); s.previousPosition.copy(s.position); s.body.setTranslation(s.position, true);
      s.yaw = s.previousYaw = yaw;
      s.velocity.set(Math.sin(yaw) * speed, 0, Math.cos(yaw) * speed); s.body.setLinvel(s.velocity, true);
      s.grounded = true; s.lastGround = s.elapsed; s.__reason = null;
      g.advance(1 / 60, {}, false);
    };
    window.__c = { g, s, park, place };
  }, map);
};
const run = (fn, arg) => page.evaluate(fn, arg);
try {
  await load("outdoor");
  // 1. The ground: a street a curb below the walk, the gutter falling to the face, ramps between.
  const ground = await run(() => {
    const { park, g } = window.__c, h = (x, z) => +park.terrainHeight(x, z).toFixed(3);
    const names = new Set(); g.park.scene.traverse((o) => o.isMesh && names.add(o.name));
    return { street: h(103, 0), lip: h(99.1, 0), face: h(98.52, 0), walk: h(97.5, 0), lawn: h(90, 0), lot: h(20, -70), lotWalk: h(20, -47), rampFoot: h(0, -48.98), rampMid: h(0, -48.25), rampTop: h(0, -47.45), island: h(24, -77),
      meshes: ["Street asphalt", "Gutter pans", "Sidewalks", "Curb ramps", "Curbs", "Curb ramp warning panels", "Drain grates", "Curb inlet openings", "Veterans ground", "Veterans lawn"].filter((n) => !names.has(n)) };
  });
  check("Streets and the lot lie a curb (15 cm) below the walks, lawns and islands", ground.street === -0.15 && ground.lot === -0.15 && ground.walk === 0 && ground.lawn === 0 && ground.lotWalk === 0 && ground.island === 0, ground);
  check("The gutter pan falls toward the curb face", ground.face < ground.lip && ground.face <= -0.175 && ground.lip >= -0.155, ground);
  check("A curb ramp runs down from the walk to the gutter", ground.rampFoot < -0.17 && ground.rampMid > ground.rampFoot && ground.rampMid < ground.rampTop && ground.rampTop > -0.03, ground);
  check("Curbs, gutters, walks, ramps, warning panels and drains are drawn", ground.meshes.length === 0, ground.meshes);

  // 2. Riding into curbs.
  const ride = await run(() => {
    const { g, s, place } = window.__c, out = {};
    const go = (label, x, z, yaw, speed, seconds, input = {}) => {
      place(x, z, yaw, speed);
      let t = 0, minX = Infinity;
      while (t < seconds && s.state !== "Bail") { g.advance(1 / 60, input, false); t += 1 / 60; minX = Math.min(minX, s.position.x); }
      out[label] = { state: s.state, reason: s.__reason, x: +s.position.x.toFixed(2), minX: +minX.toFixed(2), y: +s.position.y.toFixed(3), z: +s.position.z.toFixed(2), speed: +s.speed.toFixed(2) };
    };
    // Straight at the east street's west curb (x = 98.5), from the street.
    go("hard", 101, 0, -Math.PI / 2, 6, 1.2);
    go("slow", 99.6, 0, -Math.PI / 2, 1.4, 1.5);
    // Down the lot's curb ramp at x = 0 and back up it.
    go("down", 0, -45.5, Math.PI, 4, 1.6);
    go("up", 0, -53, 0, 4, 2);
    // Off the curb anywhere: a drop, not a crash.
    go("off", 97, 10, Math.PI / 2, 4, 1.2);
    return out;
  });
  check("Riding straight into a curb at 6 m/s throws the rider", ride.hard.state === "Bail" && ride.hard.reason === "Clipped the curb", ride.hard);
  check("A slow bump into a curb stops the rider in the gutter", ride.slow.state !== "Bail" && ride.slow.minX > 98.3 && ride.slow.y < 0.2, ride.slow);
  check("Rolling down a curb ramp into the lot is smooth", ride.down.state !== "Bail" && ride.down.z < -50 && ride.down.y < 0.15, ride.down);
  check("Rolling up a curb ramp out of the lot is smooth", ride.up.state !== "Bail" && ride.up.z > -47.5, ride.up);
  check("Riding off a curb into the street is only a drop", ride.off.state !== "Bail" && ride.off.x > 99, ride.off);
  const glance = await run(() => {
    const { g, s, place } = window.__c;
    // Heading north (+z) with 10 degrees toward the curb at x = 98.5.
    const yaw = -10 * Math.PI / 180;
    place(99.4, -20, yaw, 7);
    let t = 0;
    while (t < 1.5 && s.state !== "Bail") { g.advance(1 / 60, {}, false); t += 1 / 60; }
    return { state: s.state, reason: s.__reason, x: +s.position.x.toFixed(2), z: +s.position.z.toFixed(2), speed: +s.speed.toFixed(2) };
  });
  check("Touching a curb at a shallow angle slides along it without a crash", glance.state !== "Bail" && glance.x > 98.3 && glance.z > -15, glance);
  const hop = await run(() => {
    const { g, s, place } = window.__c;
    place(99.5, 5, -Math.PI / 2, 5);
    // Arcade controls: A is a plain hop (the pro preset pops from the stick).
    // A press waits a moment in case RT joins it for a fastplant (#84).
    const style = s.tricks.controlStyle;
    s.tricks.controlStyle = "arcade";
    g.advance(0.02, { pressed: { hop: true }, held: { hop: 1 } }, false);
    let t = 0;
    while (t < 1.4 && s.state !== "Bail") { g.advance(1 / 60, { held: { hop: t < 0.1 ? 1 : 0 } }, false); t += 1 / 60; }
    s.tricks.controlStyle = style;
    return { state: s.state, reason: s.__reason, x: +s.position.x.toFixed(2), y: +s.position.y.toFixed(3), grounded: s.grounded };
  });
  check("A hop gets the rider up the curb onto the walk", hop.state !== "Bail" && hop.x < 98.4 && hop.y > 0.1, hop);

  // 3. Rain: the gutters run, the inlets take it, and the leaves wash to the grates.
  const drains = await run(() => {
    const { g } = window.__c, d = g.park.scene.userData.drainage, lines = d.summary();
    const captured = lines.reduce((a, l) => a + l.captured, 0), rain = lines.reduce((a, l) => a + l.rain, 0);
    const spread = lines.map((l) => { const at = l.inlets[0], far = l.spread.map((_, i) => Math.min(...l.inlets.map((k) => Math.abs(i - k)))); const high = far.indexOf(Math.max(...far)); return { atInlet: +l.spread[at].toFixed(3), atHigh: +l.spread[high].toFixed(3) }; });
    return { lines: lines.length, inlets: lines.reduce((a, l) => a + l.inlets.length, 0), share: +(captured / rain).toFixed(3), wider: spread.every((s) => s.atInlet > s.atHigh), sample: spread[0], speed: +Math.max(...lines.flatMap((l) => l.speed)).toFixed(2) };
  });
  check("Veterans' curbs carry gutters to storm drain inlets that take all the flat street's water", drains.lines >= 8 && drains.inlets >= drains.lines && Math.abs(drains.share - 1) < 0.01 && drains.wider, drains);
  const storm = await run(() => {
    const { g } = window.__c, d = g.park.scene.userData.drainage, out = {};
    const find = (name) => { let m = null; g.park.scene.traverse((o) => { if (o.name === name) m = o; }); return m; };
    const dry = { rain: 0, wet: 0, litter: 0, snow: 0, night: 0 };
    for (let i = 0; i < 300; i++) d.update(0.1, dry);
    out.dry = { runoff: d.runoff, water: find("Gutter water").visible };
    // Fall first: leaves collect along the curbs.
    for (let i = 0; i < 100; i++) d.update(0.1, { ...dry, litter: 1 });
    out.leaves = find("Gutter leaves").visible;
    for (let i = 0; i < 300; i++) d.update(0.1, { ...dry, litter: 1, rain: 1, wet: 1 });
    out.storm = { runoff: +d.runoff.toFixed(2), water: find("Gutter water").visible, swirls: find("Inlet swirls").visible, piled: d.piled, drained: d.drained };
    for (let i = 0; i < 400; i++) d.update(0.1, { ...dry, litter: 1 });
    out.after = { runoff: +d.runoff.toFixed(3), water: find("Gutter water").visible };
    for (let i = 0; i < 20; i++) d.update(0.1, dry);
    out.swept = { piled: d.piled, leaves: find("Gutter leaves").visible };
    return out;
  });
  check("Dry weather: no water in the gutters", storm.dry.runoff === 0 && !storm.dry.water, storm.dry);
  check("Rain runs in the gutters and pours into the inlets", storm.storm.runoff > 0.9 && storm.storm.water && storm.storm.swirls, storm.storm);
  check("Fall leaves gather along the curbs and rain washes them to the grates", storm.leaves && storm.storm.piled > 20 && storm.storm.drained > 20, storm.storm);
  check("After the rain the gutters drain dry", storm.after.runoff === 0 && !storm.after.water, storm.after);
  // Snow: a bank at the curb; packed and refrozen it ices; the ice outlasts the snow into the night and thaws by day.
  const snow = await run(() => {
    const { g } = window.__c, d = g.park.scene.userData.drainage, out = {};
    const base = { rain: 0, wet: 0, litter: 0, snow: 0, night: 0 };
    for (let i = 0; i < 900; i++) d.update(0.1, { ...base, snow: 1 });
    out.snowing = { bank: +d.bank.toFixed(2), ice: +d.ice.toFixed(2) };
    for (let i = 0; i < 600; i++) d.update(0.1, { ...base, night: 1 });
    out.night = { bank: +d.bank.toFixed(2), ice: +d.ice.toFixed(2), melt: +d.melt.toFixed(2) };
    for (let i = 0; i < 1200; i++) d.update(0.1, base);
    out.day = { bank: +d.bank.toFixed(2), ice: +d.ice.toFixed(2) };
    for (let i = 0; i < 4000; i++) d.update(0.1, base);
    out.later = { bank: +d.bank.toFixed(2), ice: +d.ice.toFixed(2) };
    return out;
  });
  check("Snow banks against the curb and the gutter beside it packs into ice", snow.snowing.bank > 0.9 && snow.snowing.ice > 0.8, snow.snowing);
  check("After the snow the ice holds through the night", snow.night.ice > 0.8 && snow.night.bank > 0.3, snow.night);
  check("By day the bank melts off and then the ice thaws", snow.day.bank < snow.night.bank && snow.later.bank === 0 && snow.later.ice === 0, snow);
  // Ice under the tyres: the same hard turn along the gutter holds far less of a line.
  const ice = await run(() => {
    const { g, s, place } = window.__c, d = g.park.scene.userData.drainage, out = {};
    for (const frozen of [0, 1]) {
      d.ice = frozen; d.bank = 0;
      place(99.05, -30, 0, 5);
      const dir0 = Math.atan2(s.velocity.x, s.velocity.z);
      for (let i = 0; i < 20; i++) g.advance(1 / 60, { steer: 1 }, false);
      out[frozen ? "ice" : "dry"] = { turned: +Math.abs(Math.atan2(s.velocity.x, s.velocity.z) - dir0).toFixed(3), state: s.state, iceAt: +d.iceAt(99.05, -29).toFixed(2) };
    }
    d.ice = 0;
    return out;
  });
  check("Ice in the gutter takes the tyres' grip", ice.ice.iceAt === 1 && ice.dry.iceAt === 0 && ice.ice.turned < ice.dry.turned * 0.6, ice);

  // 4. B Hill: water runs downhill past on-grade inlets to the sag.
  await load("b_hill");
  const hill = await run(() => {
    const { g } = window.__c, d = g.park.scene.userData.drainage, lines = d.summary();
    return lines.map((l) => {
      const downhill = l.down.filter((j, i) => j === i + 1).length / l.down.length;
      const first = l.inlets[1] ?? l.inlets[0];
      return { inlets: l.inlets.length, downhill: +downhill.toFixed(2), share: +(l.captured / l.rain).toFixed(2), before: +l.spread[first - 1].toFixed(3), after: +l.spread[first + 1].toFixed(3), speed: +Math.max(...l.speed).toFixed(2) };
    });
  });
  check("B Hill's gutters run downhill to inlets every 80 m and a sag at the bottom", hill.length === 2 && hill.every((l) => l.inlets >= 15 && l.downhill > 0.85 && l.share > 0.99), hill);
  check("An on-grade inlet lets some water past: the flow narrows after it", hill.every((l) => l.after < l.before), hill);
  check("Steep gutters run faster than flat ones", hill.every((l) => l.speed > drains.speed), { hill: hill.map((l) => l.speed), veterans: drains.speed });
  check("No page errors", errors.length === 0, errors);
} finally {
  writeFileSync("artifacts/curbs/results.json", JSON.stringify(results, null, 2));
  await browser.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`${results.length - failed.length}/${results.length} curb checks passed`);
if (failed.length) process.exit(1);
