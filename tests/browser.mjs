import { chromium } from "playwright";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const url = process.env.LAZER_URL || "http://127.0.0.1:5173";
let server;
try {
  await fetch(url);
} catch {
  server = spawn(
    process.execPath,
    [path.join(root, "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1",'--port',new URL(url).port||'5173'],
    { cwd: root, stdio: "ignore" },
  );
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(url);
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
}
const installedChrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const executablePath =
  process.env.BROWSER_EXECUTABLE ||
  (existsSync(installedChrome) ? installedChrome : undefined);
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: process.env.SOFTWARE_GL
    ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
    : [],
});
const report = {
  date: new Date().toISOString(),
  browser: await browser.version(),
  checks: [],
  errors: [],
  notes: [
    "Gamepad checks inject a standard Gamepad API device; physical controller and actuator feel require a hands-on test.",
    "Headless software rendering is not a gaming-PC framerate benchmark.",
  ],
};
const record = (name, details) => {
  report.checks.push({ name, passed: true, details });
  console.log(`PASS ${name}`);
};
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  page.on("pageerror", (e) => report.errors.push(String(e)));
  page.on("response", (r) => {
    if (r.status() >= 400) report.errors.push(`${r.status()} ${r.url()}`);
  });
  await page.goto(url);
  await page.waitForFunction(() => window.__LAZER);
  assert(await page.locator("#ride").isVisible());
  record("Startup loads a rendered park with a clear controller prompt");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.__LAZER.hud.started);
  record("Keyboard can enter the park");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.__LAZER.hud.paused);
  await page.locator('[data-action="assist"]').click();
  assert.equal(
    await page.evaluate(() => window.__LAZER.sim.grindAssist),
    false,
  );
  await page.locator('[data-action="assist"]').click();
  await page.locator('[data-action="resume"]').click();
  record("Pause/resume and functional Grind Assist switch");
  const checks = await page.evaluate(() => {
    const g = window.__LAZER;
    g.testing(true);
    g.input.help = false;
    const results = [];
    const check = (name, condition, details) => {
      if (!condition) throw Error(`${name}: ${JSON.stringify(details)}`);
      results.push({ name, passed: true, details });
    };
    const a = (t, f = {}) => g.advance(t, f, false),
      reset = (spot = 0) => {
        g.sim.reset(spot, true);
        a(0.1);
      };
    const push = () => {
      a(0.01, { pressed: { pushDeck: true } });
      a(0.5);
    };
    const hop = (charge = 0.5) => {
      a(charge, { held: { hop: 1 } });
      a(0.01, { released: { hop: true } });
    };
    const trickEvents = () =>
      g.events.history.filter((e) => e.type === "trick").map((e) => e.name);
    reset();
    for (let i = 0; i < 5; i++) push();
    let speed = g.sim.speed;
    check("Repeated pushes build momentum", speed > 7 && speed < 12, speed);
    a(1);
    check(
      "Coasting preserves momentum",
      g.sim.speed > speed * 0.9,
      g.sim.speed,
    );
    a(0.5, { steer: 0.5 });
    check(
      "Carving changes heading smoothly",
      Math.abs(g.sim.yaw) > 0.1 && Math.abs(g.sim.yaw) < 1,
      g.sim.yaw,
    );
    speed = g.sim.speed;
    a(0.4, { held: { brake: 0.6 } });
    check(
      "Progressive braking reduces speed without instant stop",
      g.sim.speed > 0 && g.sim.speed < speed,
      g.sim.speed,
    );
    reset();
    a(1.5, { held: { pushDeck: 1 }, pressed: { pushDeck: true } });
    check(
      "Holding push does not become an accelerator",
      g.sim.speed < 2.6,
      g.sim.speed,
    );
    reset();
    a(0.12, { held: { hop: 1 } });
    check(
      "Preload stays grounded and charges",
      g.sim.grounded && g.sim.charge > 0,
      g.snapshot(),
    );
    a(0.01, { released: { hop: true } });
    const quick = g.sim.velocity.y;
    check(
      "Release pops into actual ballistic flight",
      !g.sim.grounded && quick > 3,
      quick,
    );
    reset();
    hop();
    check(
      "Full preload produces a higher hop",
      g.sim.velocity.y > quick + 1,
      g.sim.velocity.y,
    );
    for (const [name, frame] of Object.entries({
      Tailwhip: { pressed: { pushDeck: true } },
      Heelwhip: { pressed: { pushDeck: true }, held: { leftModifier: 1 } },
      Barspin: { pressed: { brakeBars: true } },
      "Tailwhip + Barspin": { pressed: { pushDeck: true, brakeBars: true } },
    })) {
      reset();
      push();
      push();
      hop();
      a(0.01, frame);
      a(1.25);
      check(
        `Land ${name}`,
        g.sim.tricks.last === name && g.sim.lastLanding === "clean",
        g.snapshot(),
      );
    }
    for (const [family, name] of [
      ["pushDeck", "Double Tailwhip"],
      ["brakeBars", "Double Barspin"],
    ]) {
      reset();
      push();
      hop();
      a(0.01, { pressed: { [family]: true } });
      a(0.18);
      a(0.01, { pressed: { [family]: true } });
      a(1.3);
      check(`Land ${name}`, g.sim.tricks.last === name, g.snapshot());
    }
    for (const [modifier, name] of [
      ["none", "No-hander"],
      ["leftModifier", "Tuck No-hander"],
      ["rightModifier", "One-footer"],
    ]) {
      reset();
      push();
      hop();
      a(0.5, { held: { body: 1, [modifier]: 1 } });
      a(1.0);
      check(`Land ${name}`, g.sim.tricks.last === name, g.snapshot());
    }
    for (const [duration, name] of [
      [0.17, "180°"],
      [0.38, "360°"],
      [0.75, "540°"],
    ]) {
      reset();
      push();
      push();
      hop();
      a(duration, { steer: 1 });
      a(1.3);
      check(
        `Actual accumulated ${name} body rotation`,
        trickEvents().includes(name),
        g.snapshot(),
      );
    }
    reset();
    push();
    push();
    hop();
    a(0.01, { pressed: { pushDeck: true } });
    a(0.38, { steer: 1 });
    a(1.3);
    check(
      "360 Downside Whip combines opposing physical channels",
      g.sim.tricks.last === "360° Downside Whip",
      g.snapshot(),
    );
    reset();
    for (let i = 0; i < 8; i++) push();
    let limit = 0;
    while (g.sim.position.z < 32 && limit++ < 2000) a(1 / 120);
    while (g.sim.position.z < 37 && limit++ < 2500)
      a(1 / 120, { held: { hop: 1 } });
    a(0.01, { released: { hop: true } });
    a(0.75, { steer: 1 });
    a(2);
    check(
      "720 from a quarter-pipe takeoff using only riding inputs",
      trickEvents().includes("720°"),
      g.snapshot(),
    );
    for (const [angle, quality] of [
      [0, "clean"],
      [0.65, "sketchy"],
      [1.5, "failed"],
    ]) {
      reset();
      const s = g.sim;
      s.position.set(-12, 1.5, -20);
      s.body.setTranslation(s.position, true);
      s.velocity.set(0, -2, 5);
      s.body.setLinvel(s.velocity, true);
      s.yaw = angle;
      s.grounded = false;
      s.state = "Airborne";
      s.airTime = 0.2;
      s.tricks.startAir(false);
      a(0.5);
      check(
        `${quality} landing from a live falling contact`,
        s.lastLanding === quality,
        g.snapshot(),
      );
      a(2.0);
      check(
        quality === "failed"
          ? "Bail automatically resets safely"
          : "Landing recovers to ordinary riding",
        s.state === "Grounded",
        g.snapshot(),
      );
    }
    reset();
    push();
    hop(0.06);
    a(0.13);
    a(0.01, { pressed: { pushDeck: true } });
    a(0.4);
    check(
      "Unfinished deck rotation cannot be claimed as a completed trick",
      !trickEvents().includes("Tailwhip"),
      g.snapshot(),
    );
    for (const nose of [false, true]) {
      reset();
      push();
      push();
      a(0.01, { held: { leftModifier: 1 }, ry: nose ? -1 : 1 });
      a(0.75);
      check(
        nose
          ? "Nose manual enters and lifts rear wheel"
          : "Manual enters and lifts front wheel",
        g.sim.manual.active && g.sim.manual.nose === nose,
        g.snapshot(),
      );
      const before = g.sim.manual.balance;
      a(0.2, { ry: nose ? 0.4 : -0.4 });
      check(
        "Right Stick actively changes balance",
        g.sim.manual.balance < before,
        g.snapshot(),
      );
    }
    reset();
    push();
    push();
    a(0.01, { held: { leftModifier: 1 }, ry: 1 });
    a(0.4);
    a(1.2, { ry: 1 });
    check(
      "Overbalancing creates a momentum-based bail",
      g.sim.state === "Bail",
      g.snapshot(),
    );
    reset();
    push();
    push();
    hop();
    a(0.01, { pressed: { pushDeck: true } });
    a(0.9);
    a(0.35, { held: { leftModifier: 1 }, ry: 1 });
    hop();
    a(0.01, { pressed: { brakeBars: true } });
    a(1.3);
    check(
      "Air → Manual → Barspin Out stays one line",
      JSON.stringify(g.sim.tricks.line) ===
        JSON.stringify(["Tailwhip", "Manual", "Barspin Out"]),
      g.snapshot(),
    );
    a(2);
    check(
      "Ordinary riding banks the completed line points",
      g.sim.tricks.line.length === 0 && g.sim.score.total > 0,
      g.snapshot(),
    );
    const railFixture = (yaw = 0, pitch = 0, x = -13.8, assist = true) => {
      reset(1);
      const s = g.sim;
      s.grindAssist = assist;
      s.position.set(x, 1.3, 10);
      s.body.setTranslation(s.position, true);
      s.velocity.set(0, -1, 5);
      s.body.setLinvel(s.velocity, true);
      s.grounded = false;
      s.state = "Airborne";
      s.airTime = 0.2;
      s.pitch = pitch;
      s.yaw = yaw;
      s.tricks.startAir(false);
      s.airWeight.reset(pitch,yaw);
      a(0.3, { held: { pumpGrind: 1 }, lean: -pitch / 0.48 });
    };
    for (const [yaw, pitch, name] of [
      [0, 0, "50-50"],
      [0, -0.2, "Feeble"],
      [0, 0.2, "Smith"],
      [Math.PI / 2, 0, "Deck Slide"],
    ]) {
      railFixture(yaw, pitch);
      check(
        `Contact-based ${name} grind`,
        g.sim.grind?.name === name,
        g.snapshot(),
      );
      if (yaw === 0) {
        a(0.35);
        hop(0.16);
        a(0.01, { pressed: { brakeBars: true } });
        a(1.3);
        check(
          `${name} → air trick`,
          trickEvents().includes(name) && trickEvents().includes("Barspin Out"),
          g.snapshot(),
        );
      }
    }
    railFixture(0, 0, -13.7, false);
    check(
      "Assist Off rejects an inaccurate approach",
      !g.sim.grind,
      g.snapshot(),
    );
    railFixture(0, 0, -14, false);
    check(
      "Assist Off accepts an accurately positioned approach",
      !!g.sim.grind,
      g.snapshot(),
    );
    railFixture(0, 0, -12, true);
    check(
      "Assist On never attracts from unrealistic distance",
      !g.sim.grind,
      g.snapshot(),
    );
    reset(1);
    g.sim.grindAssist = true;
    push();
    push();
    hop(0.18);
    a(1.3, { held: { pumpGrind: 1 } });
    check(
      "Flat rail can be caught with ordinary push/hop inputs",
      !!g.sim.grind,
      g.snapshot(),
    );
    a(2.0, { held: { leftModifier: 1 }, ry: 1 });
    check(
      "Grind can link into a manual at the end",
      g.sim.manual.active,
      g.snapshot(),
    );
    for (const id of ["West ledge", "Down rail"]) {
      reset();
      a(0.5);
      const rail = g.park.rails.find((r) => r.id === id),
        s = g.sim;
      const point = rail.a.clone().lerp(rail.b, 0.25);
      s.position.copy(point);
      s.position.y += 0.7;
      s.body.setTranslation(s.position, true);
      s.velocity.copy(rail.b).sub(rail.a).normalize().multiplyScalar(4);
      s.velocity.y -= 1;
      s.body.setLinvel(s.velocity, true);
      s.grounded = false;
      s.state = "Airborne";
      s.airTime = 0.2;
      s.tricks.startAir(false);
      a(0.35, { held: { pumpGrind: 1 } });
      check(
        `${id} is grindable in the actual park`,
        s.grind?.rail.id === id,
        g.snapshot(),
      );
    }
    // Terrain fixtures use safe spawn positions to drive along every obstacle surface.
    for (const [name, x, z, yaw] of [
      ["Bank / Funbox", 0, -17, 0],
      ["Quarter pipe", -12, 25, 0],
      ["Hip", 15, 0, 0],
      ["Spine", 1, 17, 0],
      ["Bowl", 20, 27, 0],
      ["Stairs", 13, -18, 0],
    ]) {
      reset();
      const s = g.sim;
      s.position.set(x, 0, z);
      /* use known safe spawn elevation via a downward ray */ const hit =
        s.world.castRay(
          { origin: { x, y: 10, z }, dir: { x: 0, y: -1, z: 0 } },
          20,
          true,
          undefined,
          undefined,
          undefined,
          s.body,
        );
      s.position.y = 10 - (hit?.timeOfImpact ?? 10) + 0.24;
      s.body.setTranslation(s.position, true);
      s.yaw = yaw;
      s.previousYaw = yaw;
      s.grounded = true;
      a(0.1);
      for (let i = 0; i < 4; i++) push();
      a(2);
      check(
        `${name} has solid traversable geometry and finite physics`,
        Number.isFinite(s.position.lengthSq() + s.velocity.lengthSq()) &&
          s.position.y > -0.2,
        g.snapshot(),
      );
    }
    let pumpSpeeds = [];
    for (const pumping of [false, true]) {
      reset(3);
      const s = g.sim;
      s.position.set(-12, 2.3, 38);
      s.body.setTranslation(s.position, true);
      s.velocity.set(0, 0, -5);
      s.body.setLinvel(s.velocity, true);
      s.yaw = Math.PI;
      s.grounded = true;
      for (let i = 0; i < 300; i++)
        a(1 / 120, {
          held: { pumpGrind: pumping && s.position.z > 34.5 ? 1 : 0 },
        });
      pumpSpeeds.push(s.speed);
    }
    check(
      "Timed transition compression adds noticeable bounded momentum",
      pumpSpeeds[1] > pumpSpeeds[0] + 0.6 && pumpSpeeds[1] < pumpSpeeds[0] + 3,
      pumpSpeeds,
    );
    reset();
    g.sim.position.set(60, -10, 0);
    g.sim.body.setTranslation(g.sim.position, true);
    a(0.02);
    check(
      "Out-of-bounds reset is reliable",
      g.sim.position.x === -12 && g.sim.grounded,
      g.snapshot(),
    );
    const cameraFrame = {
      steer: 0,
      lean: 0,
      rx: 0,
      ry: 0,
      held: {},
      pressed: { recenter: true },
      released: {},
    };
    g.camera.orbit = 1.2;
    g.camera.update(g.sim, cameraFrame, 1 / 60, 1);
    cameraFrame.pressed = {};
    for (let i = 0; i < 60; i++) g.camera.update(g.sim, cameraFrame, 1 / 60, 1);
    check(
      "One recenter tap smoothly returns a stationary camera",
      Math.abs(g.camera.orbit) < 0.02,
      g.camera.orbit,
    );
    g.sim.manual.enter(false);
    cameraFrame.rx = 1;
    const orbitBefore = g.camera.orbit;
    g.camera.update(g.sim, cameraFrame, 0.2, 1);
    check(
      "Manual balance context cannot accidentally orbit the camera",
      Math.abs(g.camera.orbit - orbitBefore) < 0.01,
      g.camera.orbit,
    );
    g.sim.manual.reset();
    // Deterministic stress ride: all mutations still enter through ordinary InputFrame values.
    reset();
    let seed = 7;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < 1200; i++) {
      const f = {
        steer: (rand() - 0.5) * 1.4,
        held: { pumpGrind: rand() > 0.5 ? 1 : 0, hop: i % 12 < 4 ? 1 : 0 },
        pressed: { pushDeck: i % 5 === 0, brakeBars: i % 17 === 0 },
        released: { hop: i % 12 === 4 },
      };
      a(0.1, f);
      checkFinite();
    }
    function checkFinite() {
      if (
        !Number.isFinite(
          g.sim.position.lengthSq() +
            g.sim.velocity.lengthSq() +
            g.sim.yaw +
            g.sim.tricks.deck.angle +
            g.sim.tricks.bars.angle,
        )
      )
        throw Error("Nonfinite stress state");
    }
    check(
      "Two simulated minutes of mixed controls have no NaNs or physics explosions",
      true,
      g.snapshot(),
    );
    reset();
    g.render();
    return results;
  });
  checks.forEach((c) => {
    report.checks.push(c);
    console.log(`PASS ${c.name}`);
  });
  // Exercise the actual input mapper through navigator.getGamepads, including rumble fallback.
  const mapping = await page.evaluate(() => {
    const g = window.__LAZER;
    let calls = [];
    const pad = {
      id: "Standard Xbox-style test controller",
      index: 0,
      connected: true,
      mapping: "standard",
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({
        value: 0,
        pressed: false,
        touched: false,
      })),
      vibrationActuator: {
        playEffect: (name, values) => {
          calls.push({ name, values });
          return Promise.resolve("complete");
        },
      },
    };
    Object.defineProperty(navigator, "getGamepads", {
      value: () => [pad],
      configurable: true,
    });
    g.input.clear();
    g.input.poll();
    g.input.consume();
    pad.buttons[2].value = 1;
    g.input.poll();
    const first = g.input.consume();
    g.input.poll();
    const second = g.input.consume();
    pad.buttons[2].value = 0;
    g.input.poll();
    const released = g.input.consume();
    pad.axes = [0.8, 0, 0.7, -0.6];
    pad.buttons[6].value = 0.4;
    g.input.poll();
    const axes = g.input.consume();
    g.input.rumble(0.2, 45);
    delete pad.vibrationActuator;
    g.input.rumble(0.2, 45);
    return { first, second, released, axes, calls };
  });
  assert(
    mapping.first.pressed.pushDeck &&
      !mapping.second.pressed.pushDeck &&
      mapping.released.released.pushDeck,
  );
  assert(
    mapping.axes.steer > 0.7 &&
      mapping.axes.rx > 0.5 &&
      mapping.axes.held.brake === 0.4,
  );
  assert(mapping.calls.length === 1);
  record(
    "Standard Gamepad API edges, sticks, analog trigger, and optional rumble",
    mapping,
  );
  await page.evaluate(() => {
    const g = window.__LAZER;
    g.hud.setPaused(true);
    g.hud.menu({
      steer: 0,
      lean: 1,
      rx: 0,
      ry: 0,
      held: {},
      pressed: {},
      released: {},
    });
  });
  assert.equal(await page.evaluate(() => window.__LAZER.hud.menuIndex), 1);
  record("Controller can navigate the pause menu");
  await page.evaluate(() => {
    const g = window.__LAZER;
    g.hud.setPaused(false);
    g.input.debug = true;
    g.render();
  });
  assert(await page.locator("#debug").isVisible());
  record("Debug overlay includes live physics and controller state");
  await page.evaluate(() => {
    const g = window.__LAZER;
    delete navigator.getGamepads;
    g.input.poll();
    g.input.debug = false;
    g.sim.reset(0, true);
    g.render();
  });
  mkdirSync(path.join(root, "artifacts"), { recursive: true });
  await page.screenshot({ path: path.join(root, "artifacts/playtest.png") });
  const controllerPage = await browser.newPage();
  controllerPage.on('pageerror', error => report.errors.push(String(error)));
  await controllerPage.addInitScript(() => {
    window.testPad = {id:'Xbox-style API test device',index:0,connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({value:0,pressed:false,touched:false}))};
    Object.defineProperty(navigator,'getGamepads',{value:()=>[window.testPad],configurable:true});
  });
  await controllerPage.goto(url);
  await controllerPage.waitForFunction(()=>window.__LAZER);
  await controllerPage.evaluate(()=>{window.testPad.buttons[0].value=1;});
  await controllerPage.waitForFunction(()=>window.__LAZER.menu.screen==='maps');
  await controllerPage.evaluate(()=>{window.testPad.buttons[0].value=0;});
  await controllerPage.waitForTimeout(100);
  await controllerPage.evaluate(()=>{window.testPad.buttons[0].value=1;});
  await controllerPage.waitForFunction(()=>window.__LAZER.hud.started);
  await controllerPage.evaluate(()=>{window.testPad.buttons[0].value=0;});
  await controllerPage.waitForTimeout(200);
  assert.equal(await controllerPage.evaluate(()=>window.__LAZER.sim.grounded),true);
  record('Gamepad A enters the park without an accidental startup hop');
  await controllerPage.evaluate(()=>{window.testPad.buttons[2].value=1;});
  await controllerPage.waitForFunction(()=>window.__LAZER.sim.speed>1);
  await controllerPage.evaluate(()=>{window.testPad.buttons[2].value=0;});
  record('Gamepad X drives the real-time riding loop');
  await controllerPage.evaluate(()=>{window.testPad.buttons[8].value=1;});
  await controllerPage.waitForFunction(()=>window.__LAZER.sim.speed===0);
  record('Gamepad View resets the real-time rider');
  await controllerPage.close();
  assert.deepEqual(report.errors, []);
  record("No browser runtime errors or failed resource requests");
} catch (e) {
  report.checks.push({ name: "Test run", passed: false, details: String(e) });
  throw e;
} finally {
  mkdirSync(path.join(root, "artifacts"), { recursive: true });
  writeFileSync(
    path.join(root, "artifacts/browser-report.json"),
    JSON.stringify(report, null, 2),
  );
  await browser.close();
  server?.kill();
}
