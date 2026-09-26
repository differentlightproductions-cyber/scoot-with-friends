import { chromium } from "playwright";
import fs from "node:fs";
const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } }),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto("http://127.0.0.1:5174/?map=outdoor");
  await page.waitForFunction(() => window.__LAZER);
  const results = await page.evaluate(async () => {
    const g = window.__LAZER;
    g.testing(true);
    const { terrainHeight, terrainNormal, SPAWNS } = await import(
      "/src/park/park.ts"
    );
    const { modules } = await import("/src/park/outdoor.ts");
    const results = [];
    const a = (t, f = {}) => g.advance(t, f, false),
      check = (name, ok, detail) => {
        if (!ok)
          throw Error(name + " " + JSON.stringify(detail ?? g.snapshot()));
        results.push(name);
      };
    const place = (x, z, speed = 0, yaw = 0, airHeight = 0) => {
      g.sim.reset(0, true);
      a(0.3);
      const s = g.sim,
        n = terrainNormal(x, z);
      s.position.set(
        x,
        terrainHeight(x, z) + 0.22 / Math.max(0.55, n.y) + airHeight,
        z,
      );
      s.previousPosition.copy(s.position);
      s.body.setTranslation(s.position, true);
      s.normal.copy(n);
      s.velocity
        .set(Math.sin(yaw), 0, Math.cos(yaw))
        .projectOnPlane(n)
        .normalize()
        .multiplyScalar(speed);
      s.body.setLinvel(s.velocity, true);
      s.yaw = s.previousYaw = yaw;
      if (airHeight) {
        s.grounded = false;
        s.state = "Airborne";
        s.tricks.startAir(false);
        s.airWeight.reset(0, yaw);
      }
      return s;
    };
    check(
      "Wooden ramp geometry remains unchanged",
      JSON.stringify(
        modules.map((m) => [m.id, m.x0, m.x1, m.z0, m.z1, m.h, m.run, m.deck]),
      ) ===
        JSON.stringify([
          ["front-quarter", -13, 13, -30, -22, 3.6, 4.25, 3.75],
          ["back-quarter", -13, 13, 22, 30, 3.6, 4.25, 3.75],
          ["spine", 1, 8, -2.625, 3.625, 2.2, 3, 0.25],
          ["small-box", -4, 1, -7.5, 5.5, 1.4, 2.75, 1.75],
          ["large-transfer", -16, -4, -9, 8, 2.3, 4, 1.65],
        ]),
    );
    for (let i = 8; i < SPAWNS.length; i++) {
      g.sim.reset(i, true);
      a(0.4);
      check(
        "New practice start supported: " + SPAWNS[i].name,
        g.sim.grounded && g.sim.state !== "Bail",
      );
    }
    for (const [x, z, yaw, time, name] of [
      [-35, 0, -Math.PI / 2, 3, "wood-to-metal link"],
      [0, -60, 0, 4, "parking to wooden park"],
      [-62, -60, 0, 5, "parking to metal park"],
      [35, -15, Math.PI / 2, 5, "BMX side path"],
      [-107, 0, 0, 3, "lakeside loop"],
    ]) {
      const s = place(x, z, 6, yaw);
      a(time);
      check(
        "Ride continuous " + name,
        s.state !== "Bail" &&
          s.grounded &&
          Math.hypot(s.position.x - x, s.position.z - z) > time * 4.5,
      );
    }
    for (const [x, z, yaw, name] of [
      [-64, 16, Math.PI / 2, "east metal quarter"],
      [-64, 16, -Math.PI / 2, "west metal quarter"],
      [-65, -16, 0, "pyramid bank"],
      [-44, -16, 0, "metal kicker"],
      [65, -21, 0, "BMX rollers"],
    ]) {
      const s = place(x, z, 11, yaw);
      let maxY = 0,
        pop = false;
      for (let i = 0; i < 480; i++) {
        a(1 / 120);
        maxY = Math.max(maxY, s.position.y);
        pop ||= g.events.history.some((e) => e.type === "pop");
        if (s.state === "Bail") break;
      }
      check("Rideable " + name, maxY > 0.65 && Number.isFinite(s.position.y), {
        maxY,
        state: s.state,
        pop,
      });
      if (name.includes("quarter")) check("Coping does not block " + name, pop);
    }
    check(
      "Metal stair rail, ledge sides and flat rail are grind surfaces",
      g.park.rails.filter((r) => r.id.startsWith("Metal ")).length >= 5,
    );
    check(
      "Metal plaza and BMX track occupy their swapped sides",
      g.park.rails.some((r) => r.id === "Metal flat rail" && r.a.x < 0) &&
        g.park.scene.children.some((o) => o.name === "BMX track entrance gate"),
    );
    check(
      "Metal stairs have distinct treads",
      terrainHeight(66, -5.8) > terrainHeight(66, -5.0) &&
        terrainHeight(66, -5.0) > terrainHeight(66, -4.2),
    );
    for (const stance of ["regular", "goofy"]) {
      const s = place(-20, 0);
      s.tricks.stance = stance;
      const push = stance === "regular" ? "pushDeck" : "hop",
        whip = stance === "regular" ? "hop" : "pushDeck";
      a(0.01, { pressed: { [push]: true } });
      check("Stance push " + stance, s.speed > 2);
      a(0.49, { ry: 1 });
      check("RS visibly crouches " + stance, s.charge > 0.9);
      a(1 / 120, { pressed: { [whip]: true } });
      check(
        "Immediate pop and natural whip " + stance,
        !s.grounded &&
          Math.sign(s.tricks.deck.target) === s.tricks.naturalDirection,
      );
      a(1.3);
      check("Immediate whip lands " + stance, s.tricks.last === "Tailwhip");
      g.render();
      check(
        "Guide updates stance " + stance,
        document.querySelector("#help").dataset.stance === stance,
      );
    }
    g.sim.tricks.stance = "regular";
    for (const direction of [-1, 1]) {
      const s = place(-20, 0, 4);
      a(0.5, { ry: 1 });
      a(1 / 120);
      for (let i = 0; i <= 24; i++) {
        const r = (direction * i * Math.PI * 2) / 24;
        a(0.014, { rx: Math.cos(r), ry: Math.sin(r) });
      }
      check(
        "Pop flows into circular gesture " + direction,
        s.tricks.bri.target * direction > 6,
      );
      for (let i = 0; i < 180 && !s.grounded; i++) a(1 / 120);
      check(
        "Flat pop Bri lands " + direction,
        s.lastLanding !== "failed" &&
          s.tricks.last === (direction === 1 ? "Bri Flip" : "Inward Bri"),
      );
    }
    for (const direction of [-1, 1]) {
      const s = place(-20, 0, 4, 0, 8);
      s.tricks.bri.angle = direction * 1.3;
      s.tricks.bri.velocity = direction * 5;
      g.render();
      check(
        "Physical Bri flip direction swapped " + direction,
        Math.sign(g.rider.scooter.rotation.x) === -direction,
      );
    }
    const heights = [];
    for (const charged of [false, true]) {
      const s = place(4, 20, 15);
      let steps = 0;
      while (!g.events.history.some((e) => e.type === "pop") && steps++ < 260)
        a(1 / 120, { ry: charged ? 1 : 0 });
      a(1 / 120);
      let max = s.position.y;
      for (let i = 0; i < 250; i++) {
        a(1 / 120);
        max = Math.max(max, s.position.y);
        if (s.grounded) break;
      }
      heights.push(max);
    }
    check(
      "Natural quarter air and modest optional pop",
      heights[0] > 5 && heights[1] > heights[0] && heights[1] - heights[0] < 2,
      heights,
    );
    const spine = [];
    for (const speed of [5, 10, 13, 16]) {
      const s = place(4.5, -6, speed);
      for (let i = 0; i < 500 && !s.spineLaunchAngle; i++) a(1 / 120);
      spine.push({
        speed,
        v: s.spineLaunchVelocity.length(),
        angle: s.spineLaunchAngle,
      });
    }
    check(
      "Spine low speed can case and higher speeds scale vertical launch",
      spine[0].v === 0 &&
        spine[1].v > 0 &&
        spine[2].v > spine[1].v &&
        spine[3].v > spine[2].v &&
        spine.slice(1).every((s) => s.angle > 75),
      spine,
    );
    for (const hold of [false, true]) {
      const s = place(-20, 0, 3, 0, 8);
      a(1 / 120, { pressed: { hop: true } });
      for (let i = 0; i < 120 && !s.tricks.deck.canRewind; i++) a(1 / 120);
      a(hold ? 0.22 : 0.04, {
        pressed: { leftModifier: true },
        held: { leftModifier: 1 },
      });
      a(0.02);
      check(
        "Live bumper " + (hold ? "hold kickless" : "tap rewind"),
        hold
          ? s.tricks.kicklessHistory.length === 1
          : s.tricks.deck.reversals.length === 1,
      );
      for (let i = 0; i < 300 && !s.grounded; i++) a(1 / 120);
      check(
        "Contextual trick lands " + hold,
        s.lastLanding !== "failed" &&
          s.tricks.last.includes(hold ? "Kickless" : "Rewind"),
      );
    }
    const s = place(4, 20, 15);
    let steps = 0;
    while (!g.events.history.some((e) => e.type === "pop") && steps++ < 260)
      a(1 / 120, { ry: 1 });
    let air = 0;
    while (!g.events.history.some((e) => e.type === "landing") && air < 3) {
      a(1 / 120, {
        steer: air < 0.5 ? 1 : 0,
        lean: s.velocity.y < 0 ? 0.8 : 0,
      });
      air += 1 / 120;
    }
    check(
      "720 remains possible with earned quarter air and fakie counterweight",
      s.tricks.last === "720°" && s.lastLanding !== "failed",
    );
    check(
      "Location reads Boulder City, NV (#100; supersedes the old no-city rule)",
      document
        .querySelector(".location")
        .textContent.startsWith("BOULDER CITY, NV"),
    );
    g.render();
    return results;
  });
  results.forEach((x) => console.log("PASS " + x));
  if (errors.length) throw Error(errors.join("\n"));
  fs.writeFileSync(
    "artifacts/memorial-controls-report.json",
    JSON.stringify({ results, errors }, null, 2),
  );
  await page.evaluate(() => {
    const g = window.__LAZER;
    document.querySelector("#app").style.display = "none";
    g.park.scene.fog.near = 220;
    g.park.scene.fog.far = 550;
    g.camera.camera.near = 1;
    g.camera.camera.far = 550;
    g.camera.camera.updateProjectionMatrix();
    g.camera.camera.position.set(140, 165, -170);
    g.camera.camera.lookAt(-8, 0, -15);
    g.renderer.render(g.park.scene, g.camera.camera);
  });
  await page.screenshot({ path: "artifacts/memorial-overview.png" });
  await page.evaluate(() => {
    const g = window.__LAZER;
    g.camera.camera.position.set(92, 22, -32);
    g.camera.camera.lookAt(65, 0, 5);
    g.renderer.render(g.park.scene, g.camera.camera);
  });
  await page.screenshot({ path: "artifacts/memorial-metal.png" });
} finally {
  await browser.close();
}
