import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
const browser = await chromium.launch({
  executablePath:
    process.env.BROWSER_EXECUTABLE ||
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const url = process.env.LAZER_URL || "http://127.0.0.1:5174",
  errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
mkdirSync("artifacts", { recursive: true });
try {
  await page.goto(url);
  await page.waitForFunction(() => window.__LAZER);
  const checks = await page.evaluate(() => {
    const g = window.__LAZER;
    g.testing(true);
    const results = [],
      a = (t, f = {}) => g.advance(t, f, false),
      reset = () => {
        g.sim.reset(0, true);
        a(0.5);
      };
    const check = (name, ok) => {
      if (!ok) throw Error(name + " " + JSON.stringify(g.snapshot()));
      results.push(name);
    };
    const place = (x, y, z, vx, vy, vz, yaw = 0) => {
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
    place(-12, 0.22, -20, 0, 0, 6, Math.PI);
    a(1, { steer: 0.15 });
    check(
      "Light steering preserves fakie and travel momentum",
      g.sim.fakie.mode === "Fakie" && g.sim.velocity.z > 5,
    );
    check(
      "Fakie is named and scores while held",
      g.sim.tricks.last === "Fakie" && g.sim.score.line >= 70,
    );
    const points = g.sim.score.line;
    a(1);
    check(
      "Held fakie accumulates points without duplicate entries",
      g.sim.score.line >= points + 29 &&
        g.sim.tricks.line.filter((n) => n === "Fakie").length === 1,
    );
    const before = g.sim.yaw;
    a(0.1, { steer: 1 });
    check(
      "Revert does not snap the rider",
      Math.abs(g.sim.yaw - before) < 0.15,
    );
    a(1, { steer: 1 });
    check(
      "Strong steering completes smooth revert without reversing travel",
      g.sim.fakie.mode === "Forward" && g.sim.velocity.z > 4,
    );
    a(2);
    check(
      "Fakie line banks after forward riding",
      g.sim.score.total > 100 && g.sim.score.line === 0,
    );
    reset();
    place(-12, 0.22, -20, 0, 0, 6);
    a(0.6, { held: { brakeBars: 1 } });
    const bSpeed = g.sim.speed;
    reset();
    place(-12, 0.22, -20, 0, 0, 6);
    a(0.6);
    check(
      "B no longer brakes on flat ground",
      Math.abs(bSpeed - g.sim.speed) < 0.01,
    );
    reset();
    place(-12, 0.22, -20, 0, 0, 6);
    a(0.6, { held: { brake: 1 } });
    check(
      "LT remains progressive ground brake",
      g.sim.speed < bSpeed * 0.6 && g.sim.speed > 0,
    );
    reset();
    a(0.01, { pressed: { body: true } });
    a(2, { lean: -1 });
    check(
      "Y dismounts and left stick walks",
      g.sim.walking && g.sim.position.z > -19 && g.sim.speed <= 3.21,
    );
    a(0.01, { pressed: { body: true } });
    check("Y remounts the scooter", !g.sim.walking && g.sim.grounded);
    reset();
    place(0, 1.47, 3, 0, 0, 5);
    a(0.5, { ry: 1 });
    a(0.01, { ry: 0 });
    a(1.5, { steer: 0.55 });
    a(0.2);
    check(
      "Medium analog input allows controlled 360 off a box",
      g.sim.tricks.history.some((r) => r.name === "360°"),
    );
    reset();
    a(0.5, { ry: 1 });
    a(0.01, { ry: 0 });
    g.camera.reset();
    g.render();
    const heading = g.camera.heading;
    a(0.4, { steer: 1 });
    g.render();
    check(
      "Stationary air spin keeps camera heading stable",
      Math.abs(g.camera.heading - heading) < 0.01 && Math.abs(g.sim.yaw) > 1,
    );
    reset();
    a(0.01, { pressed: { pushDeck: true } });
    a(0.5);
    a(0.5, { ry: 1 });
    a(0.01, { ry: 0 });
    a(0.01, { pressed: { brakeBars: true } });
    a(0.35, { steer: 1 });
    a(1);
    check(
      "Truck Driver resolves and retains raw bar/body data",
      g.sim.tricks.history.some(
        (r) =>
          r.name === "Truck Driver" &&
          r.raw.barTurns === 1 &&
          Math.abs(r.raw.bodyYaw) > 5,
      ),
    );
    for (const [speed, bail] of [
      [7, true],
      [2, false],
    ]) {
      reset();
      place(
        bail ? -14 : -15,
        0.22,
        bail ? 6.5 : 12,
        bail ? 0 : speed,
        0,
        bail ? speed : 0,
        bail ? 0 : Math.PI / 2,
      );
      a(0.5);
      check(
        bail ? "Fast rail impact bails" : "Slow rail clip remains recoverable",
        g.events.history.some(
          (e) => e.type === "railImpact" && e.bail === bail,
        ),
      );
    }
    for (const [yaw, x] of [
      [1.15, -13.82],
      [1.75, -14.18],
    ]) {
      reset();
      place(x, 1.3, 10, 0, -1, 5, yaw);
      g.sim.grounded = false;
      g.sim.state = "Airborne";
      g.sim.airTime = 0.2;
      g.sim.tricks.startAir(false);
      a(0.3);
      check(
        "Assisted deck slide preserves entry yaw and offset " + yaw,
        !!g.sim.grind &&
          Math.abs(g.sim.yaw - yaw) < 0.01 &&
          Math.abs(g.sim.position.x + 14) > 0.1,
      );
      const prior = g.sim.yaw;
      a(0.2, { steer: 0.5 });
      check(
        "Rider can adjust angle during grind " + yaw,
        !!g.sim.grind && Math.abs(g.sim.yaw - prior) > 0.08,
      );
    }
    reset();
    place(-12, 0.22, 33, 0, 0, 9);
    let maxLean = 0;
    for (let i = 0; i < 90; i++) {
      a(1 / 120);
      maxLean = Math.max(maxLean, g.sim.rampLean);
    }
    check("Forward ramp entry generates physical rider lean", maxLean > 0.1);
    reset();
    place(-12, 0.22, -20, 0, 0, 6, Math.PI);
    a(1);
    g.sim.bail("Test");
    check(
      "Bail loses unbanked points",
      g.sim.score.line === 0 && g.sim.score.total === 0,
    );
    return results;
  });
  checks.forEach((n) => console.log("PASS " + n));
  await page.evaluate(() => window.__LAZER.hud.setPaused(true));
  await page.evaluate(() => { const g = window.__LAZER; g.hud.setPaused(false); g.menu.openSesh('maps'); });
  await page.waitForURL("**/?map=outdoor");
  await page.waitForFunction(() => window.__LAZER);
  const outdoor = await page.evaluate(() => {
    const g = window.__LAZER;
    g.testing(true);
    const a = (t, f = {}) => g.advance(t, f, false),
      results = [];
    for (let i = 0; i < 5; i++) {
      g.sim.reset(i, true);
      a(0.4);
      if (!g.sim.grounded || g.sim.state === "Bail")
        throw Error("Unsafe outdoor spawn " + i);
      results.push("Outdoor practice spawn " + i + " is supported");
    }
    for (const [x, z] of [
      [-7, -6],
      [5, 20],
      [-8, -21],
    ]) {
      g.sim.reset(0, true);
      a(0.4);
      const s = g.sim;
      s.position.set(x, 0.22, z);
      s.previousPosition.copy(s.position);
      s.body.setTranslation(s.position, true);
      s.velocity.set(0, 0, z < -15 ? -8 : 8);
      s.body.setLinvel(s.velocity, true);
      s.yaw = z < -15 ? Math.PI : 0;
      let maxY = 0;
      for (let i = 0; i < 140; i++) {
        a(1 / 120);
        maxY = Math.max(maxY, s.position.y);
      }
      if (maxY < 0.55 || !Number.isFinite(s.position.y))
        throw Error("Unrideable outdoor ramp " + x + "," + z);
      results.push("Outdoor ramp supports rolling ascent " + x + "," + z);
    }
    if (g.park.rails.length < 6) throw Error("Missing outdoor grind surfaces");
    results.push(
      "Outdoor coping, split ledges and rail registered for grinding",
    );
    g.sim.reset(0, true);
    a(0.3);
    g.render();
    g.camera.camera.position.set(34, 24, -40);
    g.camera.camera.lookAt(0, 0, 1);
    g.renderer.render(g.park.scene, g.camera.camera);
    return results;
  });
  outdoor.forEach((n) => console.log("PASS " + n));
  await page.screenshot({ path: "artifacts/outdoor-park.png" });
  await page.evaluate(() => window.__LAZER.hud.setPaused(true));
  await page.evaluate(() => { const g = window.__LAZER; g.hud.setPaused(false); g.menu.openSesh('maps'); });
  await page.waitForURL((u) => !u.searchParams.has("map"));
  await page.waitForFunction(() => window.__LAZER);
  if (errors.length) throw Error(errors.join("\n"));
  writeFileSync(
    "artifacts/build2-report.json",
    JSON.stringify(
      {
        checks: [...checks, ...outdoor, "Map switching works both ways"],
        errors,
      },
      null,
      2,
    ),
  );
  console.log("PASS Map switching works both ways");
} finally {
  await browser.close();
}
