// Warehouse build mode (owner's WAREHOUSE TEST, steps 1-15): the phone BUILD
// app, placing a quarter, a box and a rail, moving, rotating and deleting,
// riding what was placed, saving, reloading and clearing with confirmation,
// plus the placement checks (pillars, spawns, walls, overlaps), flush modular
// joins, undo / redo and input ownership. LAZER_URL picks the server.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
const out = process.env.OUT || "artifacts/warehouse-build";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.BROWSER_EXECUTABLE || process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const results = [];
const check = (name, ok, data) => {
  results.push({ name, ok: !!ok });
  console.log((ok ? "PASS " : "FAIL ") + name + (data === undefined ? "" : " " + JSON.stringify(data)));
};
const url = process.env.LAZER_URL || "http://127.0.0.1:5173";
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(url + "/?map=warehouse", { timeout: 240000 });
  await page.waitForFunction(() => window.__LAZER, null, { timeout: 240000 });
  const helpers = async () => page.evaluate(async () => {
    const g = window.__LAZER;
    g.testing(true);
    const { emptyInput } = await import("/src/input/input.ts");
    const frame = (v = {}) => ({ ...emptyInput(), ...v, held: { ...emptyInput().held, ...(v.held || {}) }, pressed: { ...emptyInput().pressed, ...(v.pressed || {}) } });
    window.__wb = {
      g,
      frame,
      // Build-mode frames exactly as the main loop runs them.
      B: (v = {}, n = 1) => { let last; for (let i = 0; i < n; i++) { last = g.builder.update(g.sim, frame(i === 0 ? v : { ...v, pressed: {} }), 1 / 60); g.builder.frame(g.camera.camera, 1 / 60); } return last; },
      rows: () => g.phone.view.page().blocks.filter((b) => b.type === "list").flatMap((b) => b.rows),
      press: (id) => { const r = window.__wb.rows().find((r) => r.id === id); if (!r) throw Error("no row " + id + " on " + g.phone.view.title); r.action(); for (let i = 0; i < 45; i++) g.phone.tick(1 / 60); },
      openBuild: () => { g.phone.open("build"); for (let i = 0; i < 45; i++) g.phone.tick(1 / 60); },
      stand: (x, z, yaw = 0) => { const s = g.sim; s.reset(0, true); g.advance(0.2, {}, false); s.walking = true; s.state = "Walking"; s.position.set(x, 0.22, z); s.previousPosition.copy(s.position); s.body.setTranslation(s.position, true); s.yaw = s.previousYaw = yaw; s.walkCameraYaw = 0; s.velocity.set(0, 0, 0); s.body.setLinvel(s.velocity, true); g.advance(0.2, {}, false); return s; },
      saved: () => JSON.parse(localStorage.getItem("lazer-profile-v1") || "{}").builds?.warehouse?.pieces ?? null,
    };
  });
  const shot = async (name) => {
    try { await page.evaluate(() => window.__LAZER.render()); await page.screenshot({ path: `${out}/${name}.png`, timeout: 120000 }); }
    catch { const data = await page.evaluate(() => { const g = window.__LAZER; g.render(); return g.renderer.domElement.toDataURL("image/png"); }); writeFileSync(`${out}/${name}.png`, Buffer.from(data.split(",")[1], "base64")); }
  };
  await helpers();

  // 1. Enter an empty warehouse.
  const empty = await page.evaluate(async () => {
    const { g } = window.__wb;
    await g.startSession("warehouse", true);
    g.builder.reset();
    const pillars = [];
    g.park.scene.traverse((o) => { if (o.isMesh && o.material?.name === "Steel column") pillars.push(o.position.toArray()); });
    return { pieces: g.builder.layout.objects.length, strayRails: g.park.rails.filter((r) => !r.id.startsWith("Warehouse bench")).length, pillars: pillars.length, grid: !!g.park.scene.getObjectByName("Warehouse floor grid") };
  });
  check("1 Enter an empty warehouse (pillars, floor grid, nothing placed)", empty.pieces === 0 && empty.strayRails === 0 && empty.pillars === 4 && empty.grid, empty);

  // 2. Phone -> BUILD.
  const app = await page.evaluate(() => { const { g, stand, openBuild, rows } = window.__wb; stand(0, -2); openBuild(); return { title: g.phone.view.title, rows: rows().map((r) => r.id) }; });
  check("2 Phone opens the BUILD app with the catalog", app.title === "BUILD" && ["cat-RAMPS", "cat-BOXES", "cat-RAILS", "cat-MISC", "placed", "undo", "save", "clear"].every((id) => app.rows.includes(id)), app);

  // 3. Place a quarter (RAMPS -> Quarter Pipe 1.5 m, A).
  const quarter = await page.evaluate(() => {
    const { g, press, B, rows } = window.__wb;
    press("cat-RAMPS");
    const catalog = rows().map((r) => r.id);
    press("add-quarter-small");
    const placing = !!g.builder.placement, phoneAway = !g.phone.active, allowed = g.phoneAllowed();
    const leak = B({ pressed: { hop: true } });
    const leaked = Object.values(leak.pressed).some(Boolean) || leak.steer !== 0;
    const o = g.builder.layout.objects[0];
    return { catalog, placing, phoneAway, phoneBlocked: !allowed, leaked, placed: g.builder.layout.objects.length, asset: o?.asset, at: o ? [o.x, o.z, o.rotation] : null, height: o ? +window.__LAZER.park.groundHeight(o.x, o.z + 1.9).toFixed(2) : null };
  });
  check("3 Quarter placed from the RAMPS catalog; build mode owns input", quarter.placing && quarter.phoneAway && quarter.phoneBlocked && !quarter.leaked && quarter.placed === 1 && quarter.asset === "quarter-small" && quarter.height > 1, quarter);

  // Validation while a ghost is out: pillar, spawn, wall, overlap and a flush modular join.
  const rules = await page.evaluate(async () => {
    const { g, B } = window.__wb;
    const { pieceObject } = await import("/src/editor/warehouse.ts");
    const { buildAsset } = await import("/src/data/builds.ts");
    const at = (id, x, z, r = 0) => { g.builder.begin(pieceObject(buildAsset(id), x, z, r)); B(); return g.builder.reason; };
    const out = {
      pillar: at("platform", 10, -8),
      spawn: at("grind-box", 0, -17),
      wall: at("bank", 31, 0),
      overlap: at("grind-box", 0, 3),
    };
    // A 1.5 m platform dropped near the quarter's deck end snaps flush against it.
    g.builder.begin(pieceObject(buildAsset("platform"), 0.2, 6.9, 0));
    B();
    const p = g.builder.placement;
    out.join = { x: +p.x.toFixed(2), z: +p.z.toFixed(2), reason: g.builder.reason, prompt: g.builder.prompt.textContent };
    const before = g.builder.layout.objects.length;
    g.builder.begin(pieceObject(buildAsset("platform"), 10, -8, 0));
    B({ pressed: { hop: true } });
    out.refused = g.builder.layout.objects.length === before && !!g.builder.placement;
    g.builder.cancel();
    return out;
  });
  check("Placement refuses a pillar, a spawn point, a wall and an overlap", /pillar/i.test(rules.pillar) && /spawn/i.test(rules.spawn) && /wall/i.test(rules.wall) && /overlaps/i.test(rules.overlap) && rules.refused, rules);
  check("Modular join: a platform snaps flush to the quarter's deck (no gap)", rules.join.x === 0 && rules.join.z === 6.5 && !rules.join.reason && /JOINED/.test(rules.join.prompt), rules.join);

  // Picture: a valid (green) and an invalid (red) ghost in the build camera.
  await page.evaluate(async () => { const { g, B, stand } = window.__wb; const { pieceObject } = await import("/src/editor/warehouse.ts"); const { buildAsset } = await import("/src/data/builds.ts"); stand(-6, -4); g.builder.begin(pieceObject(buildAsset("funbox"), -6, 4, 0)); B({}, 40); });
  await shot("ghost-valid");
  // Invalid: the same funbox pushed onto the pillar at (-10, 12).
  await page.evaluate(async () => { const { g, B } = window.__wb; const { pieceObject } = await import("/src/editor/warehouse.ts"); const { buildAsset } = await import("/src/data/builds.ts"); g.builder.cancel(); g.builder.begin(pieceObject(buildAsset("funbox"), -10, 9, 0)); B({}, 40); });
  await shot("ghost-invalid");
  await page.evaluate(() => window.__LAZER.builder.cancel());

  // 4. Place a box; 5. place a rail.
  const more = await page.evaluate(() => {
    const { g, stand, openBuild, press, B } = window.__wb;
    stand(-8, -2); openBuild(); press("cat-BOXES"); press("add-grind-box"); B({ pressed: { hop: true } });
    stand(8, -2); openBuild(); press("cat-RAILS"); press("add-flat-rail"); B({ pressed: { hop: true } });
    const ids = g.builder.layout.objects.map((o) => o.asset);
    const rail = g.builder.layout.objects.find((o) => o.asset === "flat-rail");
    return { ids, railLive: !!rail && g.park.rails.some((r) => r.id.startsWith(rail.id)) };
  });
  check("4 Box placed", more.ids.includes("grind-box"), more);
  check("5 Rail placed with a live grind rail", more.ids.includes("flat-rail") && more.railLive, more);

  // 6. Move one object (EDIT PLACED -> piece -> MOVE, D-pad nudges, A).
  const moved = await page.evaluate(() => {
    const { g, openBuild, press, B, rows } = window.__wb;
    const box = g.builder.layout.objects.find((o) => o.asset === "grind-box"), before = [box.x, box.z];
    openBuild(); press("placed");
    const listed = rows().map((r) => r.id);
    press("piece-" + box.id); press("move");
    B({ pressed: { marker: true } }); B({ pressed: { marker: true } }); B({ pressed: { hop: true } });
    const after = g.builder.layout.objects.find((o) => o.id === box.id);
    return { listed: listed.includes("piece-" + box.id), before, after: [after.x, after.z], distance: +Math.hypot(after.x - before[0], after.z - before[1]).toFixed(2), count: g.builder.layout.objects.length };
  });
  check("6 Move a placed box (2 grid steps)", moved.listed && Math.abs(moved.distance - 2) < 0.01 && moved.count === 3, moved);

  // 7. Rotate one object (MOVE, then LB turns 45 degrees in grid mode).
  const turned = await page.evaluate(() => {
    const { g, openBuild, press, B } = window.__wb;
    const rail = g.builder.layout.objects.find((o) => o.asset === "flat-rail"), before = rail.rotation;
    openBuild(); press("placed"); press("piece-" + rail.id); press("move");
    B({ pressed: { leftModifier: true } }); B({ pressed: { hop: true } });
    const after = g.builder.layout.objects.find((o) => o.id === rail.id);
    const live = g.park.rails.find((r) => r.id.startsWith(rail.id)), dir = live.b.clone().sub(live.a).normalize();
    return { before, after: +after.rotation.toFixed(3), railYaw: +Math.atan2(dir.x, dir.z).toFixed(3) };
  });
  check("7 Rotate a placed rail 45 degrees (the live rail turns with it)", Math.abs(Math.abs(turned.after - turned.before) - Math.PI / 4) < 0.01 && Math.abs(Math.abs(turned.railYaw) - Math.PI / 4) < 0.02, turned);

  // 8. Delete one object; undo brings it back, redo deletes it again.
  const deleted = await page.evaluate(() => {
    const { g, openBuild, press } = window.__wb;
    const box = g.builder.layout.objects.find((o) => o.asset === "grind-box");
    openBuild(); press("placed"); press("piece-" + box.id); press("del");
    const afterDelete = g.builder.layout.objects.length, boxSolids = g.park.solids.filter((s) => s.parent?.name === "Grind Box").length;
    g.builder.undo(); const afterUndo = g.builder.layout.objects.length;
    g.builder.redo(); const afterRedo = g.builder.layout.objects.length;
    g.phone.close(); for (let i = 0; i < 45; i++) g.phone.tick(1 / 60);
    return { afterDelete, afterUndo, afterRedo, boxSolids };
  });
  check("8 Delete a piece (UNDO restores it, REDO removes it again)", deleted.afterDelete === 2 && deleted.afterUndo === 3 && deleted.afterRedo === 2, deleted);

  // 9. Exit build: the phone is away, nothing is being placed, gameplay has control.
  const exited = await page.evaluate(() => { const { g, stand } = window.__wb; const s = stand(-3, -12); s.walking = true; g.advance(1, { lean: -1 }, false); return { placing: !!g.builder.placement, phone: g.phone.active, walked: +(s.position.z + 12).toFixed(2) }; });
  check("9 Exit build: gameplay has the controls again", !exited.placing && !exited.phone && exited.walked > 0.5, exited);

  // 10. Ride the placed setup: up the quarter and back; grind the placed rail.
  const ride = await page.evaluate(() => {
    const { g } = window.__wb, s = g.sim;
    s.reset(0, true); g.advance(0.2, {}, false);
    s.position.set(0, 0.22, -4); s.previousPosition.copy(s.position); s.body.setTranslation(s.position, true); s.yaw = s.previousYaw = 0; s.velocity.set(0, 0, 7); s.body.setLinvel(s.velocity, true);
    let maxY = 0, bail = null;
    for (let i = 0; i < 240; i++) { g.advance(1 / 60, {}, false); maxY = Math.max(maxY, s.position.y); if (s.state === "Bail") bail = s.bailReason ?? "bail"; }
    const quarter = { maxY: +maxY.toFixed(2), bail, backZ: +s.position.z.toFixed(2) };
    const railObject = g.builder.layout.objects.find((o) => o.asset === "flat-rail"), rail = g.park.rails.find((r) => r.id.startsWith(railObject.id));
    const mid = rail.a.clone().lerp(rail.b, 0.35), dir = rail.b.clone().sub(rail.a).normalize();
    s.reset(0, true); g.advance(0.2, {}, false);
    s.position.set(mid.x, mid.y + 0.34, mid.z); s.previousPosition.copy(s.position); s.body.setTranslation(s.position, true);
    s.yaw = s.previousYaw = Math.atan2(dir.x, dir.z); s.velocity.copy(dir).multiplyScalar(5); s.velocity.y = -0.3; s.body.setLinvel(s.velocity, true); s.grounded = false; s.tricks.startAir(false);
    let grind = "";
    for (let i = 0; i < 40; i++) { g.advance(1 / 60, { held: { pumpGrind: 1 } }, false); if (s.grind) grind = s.grind.rail.id; }
    return { quarter, grind, railId: railObject.id };
  });
  check("10 Ride the placed quarter (up and back, no bail)", ride.quarter.maxY > 1.2 && !ride.quarter.bail && ride.quarter.backZ < 1, ride.quarter);
  check("10 Grind the placed rail", ride.grind.startsWith(ride.railId), ride);
  await page.evaluate(() => { const { g } = window.__wb, s = g.sim; s.reset(0, true); s.position.set(-4, 0.22, -6); s.body.setTranslation(s.position, true); s.yaw = s.previousYaw = 0.5; g.advance(0.3, {}, false); g.camera.reset?.(); for (let i = 0; i < 3; i++) g.render(); });
  await shot("placed-setup");

  // 11. Reopen BUILD; 12. SAVE BUILD.
  const saved = await page.evaluate(() => {
    const { g, openBuild, press, saved } = window.__wb;
    openBuild();
    const sub = g.phone.view.page().blocks[0].sub;
    press("save");
    const notice = g.builder.notice, pieces = saved();
    g.phone.close(); for (let i = 0; i < 45; i++) g.phone.tick(1 / 60);
    return { sub, notice, pieces, layout: g.builder.layout.objects.map((o) => [o.asset, +o.x.toFixed(2), +o.z.toFixed(2), +o.rotation.toFixed(3)]) };
  });
  check("11 Reopen BUILD: it shows the placed pieces", /^2 \//.test(saved.sub), saved.sub);
  check("12 SAVE BUILD writes the compact build to the profile", /SAVED/.test(saved.notice) && saved.pieces?.length === 2 && saved.pieces.every((p) => p.length === 4), saved);

  // 13. Reload the Warehouse (a full page reload); 14. the build came back.
  await page.reload({ timeout: 240000 });
  await page.waitForFunction(() => window.__LAZER, null, { timeout: 240000 });
  await helpers();
  const reloaded = await page.evaluate(async (expect) => {
    const { g } = window.__wb;
    await g.startSession("warehouse", true);
    const layout = g.builder.layout.objects.map((o) => [o.asset, +o.x.toFixed(2), +o.z.toFixed(2), +o.rotation.toFixed(3)]);
    const rail = g.builder.layout.objects.find((o) => o.asset === "flat-rail");
    return { same: JSON.stringify(layout) === JSON.stringify(expect), layout, railLive: !!rail && g.park.rails.some((r) => r.id.startsWith(rail.id)), rideable: +g.park.groundHeight(0, 4.9).toFixed(2) };
  }, saved.layout);
  check("13 Reload the Warehouse", reloaded.layout.length === 2, reloaded.layout);
  check("14 The build persisted exactly (pieces, places, turns, live colliders)", reloaded.same && reloaded.railLive && reloaded.rideable > 1, reloaded);

  // Minimap / Map app see the placed pieces.
  const map = await page.evaluate(() => { const g = window.__LAZER, c = document.createElement("canvas"); c.width = c.height = 300; g.phoneMap.drawMini(c.getContext("2d"), 150, 150, 140, "warehouse", 0, "scooter"); const f = g.phoneMap.source?.features?.() ?? []; return { ramps: f.filter((x) => x.kind === "ramp").length, rails: f.filter((x) => x.kind === "rail").length }; });
  check("Minimap / Map app show the placed ramp and rail", map.ramps >= 1 && map.rails >= 1, map);

  // 15. Clear with confirmation: KEEP IT does nothing, CLEAR empties it.
  const cleared = await page.evaluate(() => {
    const { g, stand, openBuild, press, saved } = window.__wb;
    stand(-12, -24); openBuild(); press("clear");
    const sheet = g.phone.view.title;
    press("sheet-0");
    const kept = g.builder.layout.objects.length;
    press("clear"); press("sheet-1");
    return { sheet, kept, after: g.builder.layout.objects.length, rails: g.park.rails.filter((r) => !r.id.startsWith("Warehouse bench")).length, saved: saved()?.length };
  });
  check("15 CLEAR BUILD asks first; KEEP IT keeps, CLEAR empties the warehouse and the save", /CLEAR/.test(cleared.sheet) && cleared.kept === 2 && cleared.after === 0 && cleared.rails === 0 && cleared.saved === 0, cleared);

  check("No page errors", errors.length === 0, errors.slice(0, 3));
} finally {
  await browser.close();
}
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
