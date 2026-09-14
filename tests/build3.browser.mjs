import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
const browser = await chromium.launch({
  executablePath:
    process.env.BROWSER_EXECUTABLE ||
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }),
  errors = [],
  checks = [];
const url = process.env.LAZER_URL || "http://127.0.0.1:5174";
page.on("pageerror", (e) => errors.push(String(e)));
page.on("response", (r) => {
  if (r.status() >= 400) errors.push(r.status() + " " + r.url());
});
mkdirSync("artifacts", { recursive: true });
const record = (name) => {
  checks.push(name);
  console.log("PASS " + name);
};
try {
  await page.goto(url);
  await page.waitForFunction(() => window.__LAZER);
  await page.screenshot({ path: "artifacts/main-menu.png" });
  const menus = await page.evaluate(() => {
    const g = window.__LAZER;
    g.testing(true);
    g.exitToMenu();
    const result = [],
      check = (name, condition) => {
        if (!condition) throw Error(name);
        result.push(name);
      };
    const f = (pressed = {}, held = {}, axes = {}) => ({
      ...g.input.previous,
      ...axes,
      pressed: { ...g.input.previous.pressed, ...pressed },
      held: { ...g.input.previous.held, ...held },
      released: { ...g.input.previous.released },
    });
    g.menu.update(f({}, { menuDown: 1 }), 0.3);
    check("D-pad navigates main menu", g.menu.index === 1);
    g.menu.update(f(), 0.1);
    g.menu.update(f({ hop: true }), 0.1);
    check("A opens Rider menu", g.menu.screen === "rider");
    g.menu.update(f({}, { menuDown: 1 }), 0.3);
    g.menu.update(f(), 0.1);
    g.menu.update(f({ hop: true }), 0.1);
    check(
      "Rider preset updates the live model",
      g.profile.riderId === "rider-02" &&
        g.rider.root.userData.riderId === "rider-02",
    );
    g.menu.update(f({ brakeBars: true }), 0.1);
    check("B returns to main menu", g.menu.screen === "home");
    g.menu.show("scooter");
    for (let index = 0; index < 10; index++) {
      g.menu.index = index;
      g.menu.select();
      check("Category opens " + index, g.menu.screen === "parts");
      g.menu.index = 1;
      g.menu.select();
      check(
        "Product has authored variants " + index,
        g.menu.screen === "variants",
      );
      g.menu.index = 0;
      g.menu.select();
      g.menu.back();
      g.menu.back();
    }
    check(
      "Separate wheel slots receive matching selections",
      g.profile.scooter.frontWheel.partId ===
        g.profile.scooter.rearWheel.partId,
    );
    const actual = [];
    g.rider.scooter.traverse((o) => {
      if (o.userData.part) actual.push(o.userData.part);
    });
    for (const [slot, selection] of Object.entries(g.profile.scooter))
      check(
        "Assembled mesh includes selected " + slot,
        actual.includes(selection.partId),
      );
    g.menu.zoomTarget = g.menu.zoom;
    const priorZoom = g.menu.zoom;
    g.menu.update(f({}, {}, { rx: 1, ry: 1 }), 0.3);
    check(
      "Preview orbit and zoom respond to controller",
      g.menu.orbit < 0.55 && g.menu.zoom > priorZoom,
    );
    g.menu.show("home");
    g.menu.select();
    check("Ride opens map selection", g.menu.screen === "maps");
    g.menu.index = 0;
    g.menu.select();
    check(
      "Map selection starts a clean session",
      g.hud.started && !g.hud.paused && g.sim.grounded && !g.sim.marker.saved,
    );
    return result;
  });
  menus.forEach(record);
  const stored = await page.evaluate(() =>
    JSON.stringify(window.__LAZER.profile),
  );
  await page.reload();
  await page.waitForFunction(() => window.__LAZER);
  if (
    (await page.evaluate(() => JSON.stringify(window.__LAZER.profile))) !==
    stored
  )
    throw Error("Loadout did not persist");
  record("Rider, every part slot and settings persist across refresh");
  await page.evaluate(() => {
    window.__LAZER.menu.show("scooter");
    window.__LAZER.render();
  });
  await page.screenshot({ path: "artifacts/scooter-builder.png" });
  const physics = await page.evaluate(() => {
    const g = window.__LAZER;
    g.testing(true);
    const results = [],
      a = (t, f = {}) => g.advance(t, f, false),
      reset = () => {
        g.sim.reset(0, true);
        a(0.4);
      };
    const check = (name, ok) => {
      if (!ok) throw Error(name + " " + JSON.stringify(g.snapshot()));
      results.push(name);
    };
    const place = (x, y, z, vx = 0, vy = 0, vz = 0, yaw = 0) => {
      const s = g.sim;
      s.position.set(x, y, z);
      s.previousPosition.copy(s.position);
      s.body.setTranslation(s.position, true);
      s.velocity.set(vx, vy, vz);
      s.body.setLinvel(s.velocity, true);
      s.yaw = yaw;
      s.previousYaw = yaw;
    };
    reset();
    a(0.4, { held: { marker: 1 } });
    check("Short marker hold does not place a marker", !g.sim.marker.saved);
    a(0.4, { held: { marker: 1 } });
    const first = structuredClone(g.sim.marker.saved);
    check("Holding D-pad Up creates a marker", !!first);
    a(0.01, { released: { marker: true } });
    a(0.01, { pressed: { pushDeck: true } });
    a(1, { steer: 0.2 });
    a(0.03, { held: { marker: 1 } });
    a(0.01, { released: { marker: true } });
    check(
      "Tap returns exact position, yaw, neutral parts and zero velocity",
      g.sim.position.distanceTo({
        x: first.position[0],
        y: first.position[1],
        z: first.position[2],
      }) < 0.0001 &&
        g.sim.yaw === first.yaw &&
        g.sim.speed === 0 &&
        g.sim.tricks.deck.angle === 0 &&
        g.sim.tricks.bars.angle === 0,
    );
    place(-10, 0.22, -18, 0, 0, 0, 0.4);
    a(0.8, { held: { marker: 1 } });
    a(0.01, { released: { marker: true } });
    check(
      "A new marker replaces the previous one",
      g.sim.marker.saved.position[0] === -10 && g.sim.marker.saved.yaw === 0.4,
    );
    g.sim.bail("Test");
    a(0.01, { held: { marker: 1 } });
    a(0.01, { released: { marker: true } });
    check(
      "Marker return cancels a bail cleanly",
      g.sim.state === "Grounded" && g.sim.speed === 0 && g.sim.yaw === 0.4,
    );
    const mark = JSON.stringify(g.sim.marker.saved);
    place(-10, 9, -18, 0, 1, 2);
    g.sim.grounded = false;
    g.sim.state = "Airborne";
    g.sim.tricks.startAir(false);
    a(0.8, { held: { marker: 1 } });
    a(0.01, { released: { marker: true } });
    check(
      "Airborne placement is rejected with feedback and preserves previous marker",
      JSON.stringify(g.sim.marker.saved) === mark &&
        g.events.history.some(
          (e) => e.type === "marker" && e.message === "CAN'T SET MARKER HERE",
        ),
    );
    g.startSession("outdoor", true);
    g.sim.reset(8, true);
    a(0.8, { held: { marker: 1 } });
    check(
      "Markers work beyond the original skatepark boundary",
      !!g.sim.marker.saved && Math.abs(g.sim.marker.saved.position[0]) > 31.8,
    );
    g.sim.reset(0, true);
    place(0, 3.82, -26.25, 0, 0, 0, 0);
    g.sim.walking = true;
    g.sim.grounded = true;
    a(0.01, { pressed: { body: true } });
    check("Drop-in setup is ready for marker", g.sim.dropIn.phase === "ready");
    a(0.8, { held: { marker: 1 } });
    const dropMarker = structuredClone(g.sim.marker.saved);
    g.sim.position.z += 3;
    g.sim.body.setTranslation(g.sim.position, true);
    a(0.01, { released: { marker: true } });
    a(0.03, { held: { marker: 1 } });
    a(0.01, { released: { marker: true } });
    check(
      "Marker restores a ready drop-in position",
      dropMarker.dropIn?.phase === "ready" &&
        g.sim.dropIn.phase === "ready" &&
        Math.abs(g.sim.position.z - dropMarker.position[2]) < 0.001,
    );
    g.startSession("warehouse", true);
    reset();
    a(0.01, { pressed: { body: true } });
    a(0.01, { pressed: { sprint: true } });
    a(1, { lean: -1 });
    check(
      "Left-stick click runs while carrying the scooter",
      g.sim.running && g.sim.walking && g.sim.speed > 6,
    );
    for (let i = 0; i < 30; i++) g.render();
    check(
      "Carry pose lifts scooter to waist level without lifting rider",
      g.rider.scooter.position.y > 0.9 && g.rider.rider.position.y < 0.1,
    );
    const runSpeed = g.sim.speed;
    a(0.01, { pressed: { body: true } });
    check(
      "Running Y mounts with a small forward carry",
      !g.sim.walking && !g.sim.running && g.sim.speed > runSpeed,
    );
    a(0.01, { pressed: { body: true } });
    a(0.01, { pressed: { sprint: true } });
    a(0.01, { pressed: { sprint: true } });
    a(1, { lean: -1 });
    check(
      "Second click returns to walking speed",
      !g.sim.running && g.sim.speed < 3.3,
    );
    g.camera.reset();
    g.render();
    const orbit = g.camera.orbit,
      elevation = g.camera.elevation;
    a(0.01, { rx: 1, ry: 1 });
    g.render();
    check(
      "Walking camera uses corrected axes",
      g.camera.orbit < orbit && g.camera.elevation < elevation,
    );
    g.sim.reset(0, true);
    g.sim.bail("Test crash");
    a(0.8);
    check(
      "A crash remains down until the rider asks to get up",
      g.sim.state === "Bail" && g.sim.bailTimer > 0.55,
    );
    a(0.01, { pressed: { hop: true } });
    check("A gets the rider back up after a bail", g.sim.state === "Walking");
    g.sim.reset(0, true);
    g.sim.stall = {
      anchor: g.sim.position.clone(),
      direction: g.sim.position.clone().set(0, 0, 1),
      offset: 0,
    };
    g.sim.state = "Stall";
    g.sim.grounded = true;
    const stallX = g.sim.position.x;
    a(0.5, { steer: 1 });
    check(
      "A coping stall permits a small sideways adjustment",
      g.sim.state === "Stall" && Math.abs(g.sim.position.x - stallX) > 0.1,
    );
    a(0.01, { lean: -1 });
    check(
      "Leaning out of a coping stall drops the rider in",
      !g.sim.stall && g.sim.velocity.z > 0,
    );
    for (const action of ["hop", "brakeBars"]) {
      reset();
      place(-12, 9, -20, 0, 0, 5);
      g.sim.grounded = false;
      g.sim.state = "Airborne";
      g.sim.tricks.startAir(false);
      a(0.85, { held: { [action]: 1 }, pressed: { [action]: true } });
      const channel = action === "hop" ? g.sim.tricks.deck : g.sim.tricks.bars;
      check(
        "Holding continues spinning " + action,
        Math.abs(channel.angle) > Math.PI * 4 && channel.velocity > 5,
      );
      a(0.5);
      check(
        "Releasing allows a neutral catch " + action,
        channel.mismatch < 0.04 && Math.abs(channel.velocity) < 1,
      );
    }
    reset();
    place(-12, 10, -20, 0, 0, 3);
    g.sim.grounded = false;
    g.sim.state = "Airborne";
    g.sim.tricks.startAir(false);
    a(0.01, { pressed: { brakeBars: true } });
    a(0.48);
    a(0.01, { pressed: { brakeBars: true } });
    a(0.5);
    g.sim.tricks.finish("clean");
    check(
      "Caught consecutive bars are named Barspin to Barspin",
      g.sim.tricks.last === "Barspin to Barspin",
    );
    reset();
    place(-12, 16, -20, 0, 0, 5);
    g.sim.grounded = false;
    g.sim.state = "Airborne";
    g.sim.tricks.startAir(false);
    a(0.5, { lean: -1, steer: 0.4 });
    const yaw = g.sim.yaw;
    check(
      "Forward input shifts body forward and pitches nose down",
      g.sim.airWeight.shift > 0.9 && g.sim.pitch > 0.15,
    );
    a(0.7, { lean: 1, steer: 0.4 });
    check(
      "Back input shifts backward while yaw continues",
      g.sim.airWeight.shift < -0.9 &&
        g.sim.pitch < -0.1 &&
        Math.abs(g.sim.yaw) > Math.abs(yaw),
    );
    check(
      "Weight control cannot flip or provide large air strafing",
      Math.abs(g.sim.pitch) < 1.25 &&
        g.sim.airWeight.driftSpent <= 0.40001 &&
        Math.abs(g.sim.speed - 5) < 0.41,
    );
    g.exitToMenu();
    check(
      "Exit clears gameplay without replacing the page runtime",
      !g.hud.started && !g.sim.marker.saved && g.sim.tricks.line.length === 0,
    );
    g.startSession("outdoor");
    check(
      "New map clears marker and keeps loadout",
      !g.sim.marker.saved && g.rider.root.userData.riderId === "rider-02",
    );
    // Ride up to the actual coping, without teleporting above it or disabling collision.
    for (const x of [-8, 4]) {
      g.sim.reset(0, true);
      a(0.4);
      const z = x < 0 ? -20 : 20,
        sign = x < 0 ? -1 : 1;
      place(x, 0.22, z, 0, 0, 12 * sign, sign < 0 ? Math.PI : 0);
      let maxY = 0,
        popped = false;
      for (let i = 0; i < 270; i++) {
        a(1 / 120, { ry: 1, lean: 0.4 });
        maxY = Math.max(maxY, g.sim.position.y);
        popped ||= g.events.history.some((e) => e.type === "pop");
        if (g.sim.state === "Bail") break;
      }
      check(
        "Sunset coping permits an upward/outward launch " + x,
        popped && maxY > (x < 0 ? 3.5 : 4.5),
      );
    }
    for (const [charged, duration, name] of [
      [true, 0.12, "180°"],
      [true, 0.37, "540°"],
      [false, 0.12, "180°"],
      [false, 0.4, "540°"],
    ]) {
      g.sim.reset(0, true);
      a(0.4);
      place(4, 0.22, 20, 0, 0, 15);
      let steps = 0;
      while (!g.events.history.some((e) => e.type === "pop") && steps++ < 220)
        a(1 / 120, { ry: charged ? 1 : 0 });
      let t = 0,
        maxHeight = 0;
      while (!g.events.history.some((e) => e.type === "landing") && t < 3) {
        a(1 / 120, {
          steer: t < duration ? 1 : 0,
          lean: g.sim.velocity.y < 0 ? -0.8 : 0,
        });
        t += 1 / 120;
        maxHeight = Math.max(maxHeight, g.sim.position.y);
      }
      check(
        (charged ? "Charged" : "Rolling") +
          " coping air lands " +
          name +
          " back in the same quarter",
        g.sim.tricks.last === name &&
          g.sim.lastLanding !== "failed" &&
          g.sim.position.z > 22 &&
          g.sim.position.z < 27.84 &&
          maxHeight > 5 &&
          !g.events.history.some((e) => e.type === "railImpact"),
      );
    }
    return results;
  });
  physics.forEach(record);
  if (errors.length) throw Error(errors.join("\n"));
  record(
    "No runtime errors or missing resources through menus, loadouts and both maps",
  );
  writeFileSync(
    "artifacts/build3-report.json",
    JSON.stringify({ date: new Date().toISOString(), checks, errors }, null, 2),
  );
} finally {
  await browser.close();
}
