import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
const b = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const p = await b.newPage({ viewport: { width: 1200, height: 850 } }),
  errors = [];
p.on("pageerror", (e) => errors.push(String(e)));
try {
  await p.goto("http://127.0.0.1:5174/?map=outdoor");
  await p.waitForFunction(() => window.__LAZER);
  const results = await p.evaluate(async () => {
    const g = window.__LAZER;
    g.testing(true);
    const THREE = await import("/node_modules/.vite/deps/three.js");
    const { terrainHeight } = await import("/src/park/park.ts");
    const out = [],
      a = (t, f = {}) => g.advance(t, f, false),
      check = (n, c) => {
        if (!c) throw Error(n + " " + JSON.stringify(g.snapshot()));
        out.push(n);
      };
    const place = (x, y, z) => {
      g.sim.reset(0, true);
      a(0.3);
      const s = g.sim;
      s.position.set(x, y, z);
      s.previousPosition.copy(s.position);
      s.body.setTranslation(s.position, true);
      s.velocity.set(0, 0, 0);
      s.body.setLinvel(s.velocity, true);
    };
    for (const bench of g.park.benches) {
      place(
        bench.x - bench.width / 2 - 0.45,
        bench.seat - 0.55 + 0.22,
        bench.z,
      );
      g.sim.walking = true;
      a(1 / 120, { pressed: { brakeBars: true } });
      check("Sit on " + bench.id, !!g.sim.sitting);
      a(0.3);
      check("Sitting is stable " + bench.id, g.sim.speed === 0);
      a(1 / 120, { pressed: { brakeBars: true } });
      check("Stand from " + bench.id, !g.sim.sitting && g.sim.walking);
      check(
        "Both bench edges grind " + bench.id,
        g.park.rails.filter((r) => r.id.startsWith(bench.id)).length === 2,
      );
      place(bench.x, bench.seat + 1.1, bench.z);
      g.sim.grounded = false;
      g.sim.state = "Airborne";
      g.sim.tricks.startAir(false);
      a(0.8);
      check(
        "Bench top supports landing " + bench.id,
        g.sim.grounded &&
          Math.abs(g.sim.position.y - (bench.seat + 0.22)) < 0.1,
      );
      a(0.1, { held: { hop: 1 } });
      a(1 / 120, { released: { hop: true } });
      check("Can hop off bench " + bench.id, !g.sim.grounded);
    }
    place(-20, 2, 0);
    const s = g.sim;
    s.grounded = false;
    s.state = "Airborne";
    s.tricks.startAir(false);
    for (const direction of [-1, 1]) {
      for (let i = 0; i < 150; i++) {
        s.tricks.bri.angle = direction * (i / 149) * Math.PI * 2;
        s.tricks.bri.velocity = 5;
        g.rider.update(s, 1 / 120, 1);
        check(
          "Bri stays shoulder-bound " + direction + " " + i,
          g.rider.scooter.position.length() < 2.6 &&
            Math.abs(g.rider.rider.position.y) < 0.01,
        );
      }
    }
    s.tricks.bri.reset();
    for (const charge of [0, 0.5, 1]) {
      s.charge = charge;
      s.airWeight.shift = 0.7;
      for (let i = 0; i < 50; i++) g.rider.update(s, 1 / 120, 1);
      g.rider.root.updateMatrixWorld(true);
      for (let i = 0; i < 2; i++) {
        const top = g.rider.thighs[i].localToWorld(
            new THREE.Vector3(0, -0.5, 0),
          ),
          hip = g.rider.hips.localToWorld(
            new THREE.Vector3(i === 0 ? -0.095 : 0.095, -0.015, 0),
          );
        check(
          "Leg remains joined to hips under bend " + charge + " " + i,
          top.distanceTo(hip) < 0.001,
        );
      }
    }
    check(
      "Face and fingers are real geometry",
      g.rider.head.children.length >= 8 &&
        g.rider.hands.every((h) => h.children.length >= 10),
    );
    s.charge = 0;
    s.airWeight.shift = 0;
    s.tricks.fingerTime = 0.175;
    g.rider.update(s, 1 / 60, 1);
    check(
      "Fingerwhip hand reaches outside the torso",
      g.rider.hands[1].position.z > 0.15,
    );
    g.exitToMenu();
    g.menu.show("scooter");
    g.menu.index = 1;
    g.menu.highlight();
    check(
      "Editor highlights the selected component",
      g.menu.focusBox.visible && g.menu.zoomTarget === 2.2,
    );
    const targetY = g.menu.focusTarget.y;
    g.menu.index = 4;
    g.menu.highlight();
    check("Editor focus follows category", g.menu.focusTarget.y < targetY);
    const input = (await import("/src/input/input.ts")).emptyInput();
    input.held.leftModifier = 1;
    input.rx = 1;
    g.menu.update(input, 0.2);
    check("Editor permits manual panning", g.menu.pan.x > 0);
    input.held.leftModifier = 0;
    input.ry = 1;
    g.menu.update(input, 0.2);
    check("Editor permits zooming back out", g.menu.zoom > 2.2);
    g.startSession("outdoor");
    place(-20, 0.22, 0);
    a(0.1);
    g.render();
    g.camera.camera.position.set(-18, 1.6, 2.4);
    g.camera.camera.lookAt(-20, 0.95, 0);
    g.renderer.render(g.park.scene, g.camera.camera);
    return out;
  });
  if (errors.length) throw Error(errors.join("\n"));
  console.log(
    "PASS " + results.length + " park, bench, animation and editor checks",
  );
  writeFileSync(
    "artifacts/polish-report.json",
    JSON.stringify({ results, errors }, null, 2),
  );
  await p.screenshot({ path: "artifacts/rider-detail.png" });
} finally {
  await b.close();
}
