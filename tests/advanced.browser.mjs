import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }),
  errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
try {
  await page.goto("http://127.0.0.1:5174/?map=outdoor");
  await page.waitForFunction(() => window.__LAZER);
  const results = await page.evaluate(async () => {
    const g = window.__LAZER;
    g.testing(true);
    const { terrainHeight, terrainNormal } = await import("/src/park/park.ts");
    const { modules, rampLips } = await import("/src/park/outdoor.ts");
    const results = [],
      a = (t, f = {}) => g.advance(t, f, false),
      check = (name, ok) => {
        if (!ok) throw Error(name + " " + JSON.stringify(g.snapshot()));
        results.push(name);
      };
    const place = (x, z, speed = 0, yaw = 0) => {
      g.sim.reset(0, true);
      a(0.3);
      const s = g.sim,
        n = terrainNormal(x, z);
      s.position.set(x, terrainHeight(x, z) + 0.22 / Math.max(0.55, n.y), z);
      s.previousPosition.copy(s.position);
      s.normal.copy(n);
      s.body.setTranslation(s.position, true);
      s.yaw = yaw;
      s.previousYaw = yaw;
      s.walkCameraYaw = yaw;
      s.velocity
        .set(Math.sin(yaw), 0, Math.cos(yaw))
        .projectOnPlane(n)
        .normalize()
        .multiplyScalar(speed);
      s.body.setLinvel(s.velocity, true);
    };
    const spine = modules.find((m) => m.id === "spine"),
      small = modules.find((m) => m.id === "small-box"),
      large = modules.find((m) => m.id === "large-transfer"),
      quarters = modules.filter((m) => m.kind === "quarter");
    check(
      "Only outer obstacles swap; small box retains original middle lane",
      small.x1 === spine.x0 &&
        large.x1 === small.x0 &&
        small.x0 === -4 &&
        small.x1 === 1 &&
        large.x0 < small.x0 &&
        spine.x1 > small.x1,
    );
    check(
      "Opposing tall quarters share exact centerlines",
      quarters[0].x0 === quarters[1].x0 &&
        quarters[0].x1 === quarters[1].x1 &&
        quarters.every((m) => m.h === 3.6),
    );
    check(
      "Spine has tight paired coping and large box has longer landing",
      Math.abs(rampLips(spine)[0] - rampLips(spine)[1]) < 0.3 &&
        large.z1 - large.run - large.deck - large.z0 > large.run,
    );
    const heights = [];
    for (const speed of [3, 7, 12, 15, 20]) {
      place(7, 20, speed);
      let max = 0,
        maxZ = 0;
      for (let i = 0; i < 600; i++) {
        a(1 / 120);
        max = Math.max(max, g.sim.position.y);
        maxZ = Math.max(maxZ, g.sim.position.z);
        if (g.sim.state === "Bail") break;
      }
      heights.push(max);
      if (speed === 3)
        check(
          "Slow quarter approach rolls back without launch",
          max < 1 && !g.events.history.some((e) => e.type === "pop"),
        );
      if (speed === 20)
        check("Extreme quarter speed can clear the back", maxZ > 30);
    }
    check(
      "Quarter air height scales with actual speed",
      heights.every((h, i) => i === 0 || h > heights[i - 1] + 0.5),
    );
    for (const [id, x] of [
      ["spine", 4.5],
      ["small-box", -1.5],
      ["large-transfer", -10],
    ]) {
      place(x, 26.2, 0.1, Math.PI);
      let launched = false;
      for (let i = 0; i < 1300; i++) {
        a(1 / 120, {
          lean: !g.sim.grounded && g.sim.velocity.y < 0 ? -0.7 : 0,
        });
        launched ||= g.events.history.some((e) => e.type === "pop");
        if (launched && g.events.history.some((e) => e.type === "landing"))
          break;
      }
      const m = modules.find((m) => m.id === id),
        landingStart =
          id === "spine" ? rampLips(m)[0] : rampLips(m)[0] - m.deck;
      check(
        "Gravity-only drop clears " + id + " into landing",
        launched &&
          g.sim.lastLanding !== "failed" &&
          g.sim.position.z < landingStart &&
          g.sim.position.z > m.z0,
      );
      place(x, -26.2, 0.1, 0);
      let crossed = false;
      for (let i = 0; i < 1800; i++) {
        a(1 / 120, {
          lean: !g.sim.grounded && g.sim.velocity.y < 0 ? -0.5 : 0,
        });
        if (g.sim.position.z > m.z1 + 1) {
          crossed = true;
          break;
        }
        if (g.sim.state === "Bail") break;
      }
      check("Reverse approach traverses " + id, crossed);
    }
    place(7, 15);
    g.sim.walking = true;
    g.sim.running = true;
    a(0.5, { lean: -1 });
    a(1 / 120, { lean: -1, pressed: { hop: true } });
    a(0.15, { lean: -1 });
    check(
      "On-foot jump preserves running momentum",
      !g.sim.grounded &&
        g.sim.position.y > 0.6 &&
        g.sim.speed > 5.5 &&
        g.sim.tricks.deck.angle === 0,
    );
    place(7, 23);
    g.sim.walking = true;
    g.sim.running = true;
    let climbed = false;
    for (let i = 0; i < 500; i++) {
      a(1 / 120, {
        lean: -1,
        pressed: { hop: i === 170 || i === 225 || i === 280 },
      });
      if (g.sim.position.z > 26.5) {
        climbed = true;
        break;
      }
    }
    check(
      "Run and contextual climb reach quarter deck without resets",
      climbed && g.sim.position.y > 3.7 && g.sim.walking,
    );
    place(7, 26.55, 0, Math.PI);
    g.sim.walking = true;
    a(1 / 120, { pressed: { body: true } });
    check(
      "Y prepares coping without dropping automatically",
      g.sim.dropIn.phase === "ready" && g.sim.speed === 0,
    );
    a(0.5, { lean: -0.4 });
    check("Small analog input stays perched", g.sim.dropIn.phase === "ready");
    a(0.5, { lean: 1 });
    check("Pulling back cancels lean safely", g.sim.dropIn.lean < 0.05);
    a(1 / 120, { pressed: { brakeBars: true } });
    check(
      "B cancels setup to standing scooter",
      g.sim.walking && !g.sim.dropIn.phase,
    );
    a(1 / 120, { pressed: { body: true } });
    a(0.8, { lean: -1 });
    a(2);
    check(
      "Committed drop gains speed from gravity",
      !g.sim.walking &&
        !g.sim.dropIn.phase &&
        g.sim.speed > 7 &&
        g.sim.position.z < 22,
    );
    const air = () => {
      place(-20, 0, 4);
      const s = g.sim;
      s.position.y = 8;
      s.body.setTranslation(s.position, true);
      s.velocity.y = 5;
      s.body.setLinvel(s.velocity, true);
      s.grounded = false;
      s.state = "Airborne";
      s.tricks.startAir(false);
      s.airWeight.reset(0, 0);
    };
    const land = () => {
      for (
        let i = 0;
        i < 600 && !g.events.history.some((e) => e.type === "landing");
        i++
      )
        a(1 / 120);
    };
    for (const [channel, direction, name] of [
      ["deck", 1, "Whip Rewind + Rewind"],
      ["deck", -1, "Heel Rewind + Rewind"],
      ["bars", 1, "Bar Rewind + Rewind"],
    ]) {
      air();
      a(1 / 120, {
        pressed: { [channel === "deck" ? "pushDeck" : "brakeBars"]: true },
        held: direction < 0 ? { leftModifier: 1 } : {},
      });
      for (let i = 0; i < 2; i++) {
        let guard = 0;
        while (!g.sim.tricks[channel].canRewind && guard++ < 120) a(1 / 120);
        const sign = Math.sign(
          g.sim.tricks[channel].segmentEnd - g.sim.tricks[channel].segmentStart,
        );
        a(1 / 120, {
          pressed: { [sign > 0 ? "leftModifier" : "rightModifier"]: true },
        });
      }
      land();
      check(
        "Actual timed bumper inputs land " + name,
        g.sim.tricks.last === name,
      );
    }
    for (const [name, direction] of [
      ["Bri Flip", 1],
      ["Inward Bri", -1],
    ]) {
      air();
      for (let i = 0; i <= 24; i++) {
        const r = (direction * i * Math.PI * 2) / 24;
        a(0.02, { rx: Math.cos(r), ry: Math.sin(r) });
      }
      a(0.02);
      land();
      check(
        "Gesture performs and lands " + name,
        g.sim.tricks.last === name && g.sim.lastLanding !== "failed",
      );
    }
    air();
    for (let i = 0; i <= 12; i++) {
      const r = (i * Math.PI) / 12;
      a(0.025, { rx: Math.cos(r), ry: Math.sin(r) });
    }
    a(0.02);
    land();
    check(
      "Scoop performs and lands Kickless",
      g.sim.tricks.last === "Kickless",
    );
    air();
    a(1 / 120, { pressed: { pushDeck: true }, held: { brake: 1 } });
    land();
    check(
      "Trigger modifier performs and lands Fingerwhip",
      g.sim.tricks.last === "Fingerwhip",
    );
    for (const [name, rx, ry, held] of [
      ["Superman", 0, 1, {}],
      ["Can Can", 1, 0, {}],
      ["No Foot", 0, 0, { leftModifier: 1, rightModifier: 1 }],
      ["Deck Grab", 0, 0, { brake: 1 }],
    ]) {
      air();
      a(0.3, { rx, ry, held: { body: 1, ...held } });
      a(0.3);
      land();
      check("Released body pose lands " + name, g.sim.tricks.last === name);
    }
    air();
    a(1.9, { ry: 1, held: { body: 1 } });
    check(
      "Unreturned body pose cannot land cleanly",
      g.sim.state === "Bail" || g.sim.lastLanding === "failed",
    );
    g.sim.reset(0, true);
    check(
      "Reset clears advanced pose and rotations",
      g.sim.tricks.poseBlend === 0 &&
        g.sim.tricks.bri.angle === 0 &&
        g.sim.tricks.kickless.angle === 0,
    );
    g.render();
    g.camera.camera.position.set(33, 27, -43);
    g.camera.camera.lookAt(0, 0, 0);
    g.renderer.render(g.park.scene, g.camera.camera);
    return results;
  });
  if (errors.length) throw Error(errors.join("\n"));
  results.forEach((r) => console.log("PASS " + r));
  writeFileSync(
    "artifacts/advanced-report.json",
    JSON.stringify({ results, errors }, null, 2),
  );
  await page.screenshot({ path: "artifacts/sunset-refined.png" });
  const preview = await page.evaluate(() => {
    const g = window.__LAZER;
    g.renderer.render(g.park.scene, g.camera.camera);
    return g.renderer.domElement.toDataURL("image/png");
  });
  writeFileSync(
    "public/previews/outdoor.png",
    Buffer.from(preview.split(",")[1], "base64"),
  );
  await page.evaluate(() => {
    const g = window.__LAZER;
    g.exitToMenu();
    g.menu.show("settings");
  });
  await page
    .getByRole("button", { name: "STANCE REGULAR", exact: true })
    .click();
  await page.reload();
  await page.waitForFunction(() => window.__LAZER);
  const stance = await page.evaluate(() => ({
    stance: window.__LAZER.profile.settings.stance,
    natural: window.__LAZER.sim.tricks.naturalDirection,
    preview: window.__LAZER.menu.previewRider.root.userData.stance,
  }));
  if (
    stance.stance !== "goofy" ||
    stance.natural !== -1 ||
    stance.preview !== "goofy"
  )
    throw Error("Stance persistence/preview failed");
  console.log(
    "PASS Settings persists Goofy and updates physical/preview stance",
  );
} finally {
  await browser.close();
}
