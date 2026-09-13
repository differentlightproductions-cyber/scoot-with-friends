import { chromium } from "playwright";
import fs from "node:fs";
const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto("http://127.0.0.1:5174/?map=outdoor");
  await page.waitForFunction(() => window.__LAZER);
  console.log(
    await page.evaluate(async () => {
      const g = window.__LAZER;
      g.testing(true);
      const e = g.editor,
        checks = [];
      const check = (n, v) => {
        if (!v) throw Error(n + " / " + e.notice);
        checks.push(n);
      };
      e.open();
      check("Editor opens", e.active);
      e.add("Quarter Pipe", 30, 0);
      const quarter = e.selected;
      check(
        "Quarter mesh and collision",
        g.park.solids.length > 0 && e.layout.objects.length === 1,
      );
      e.add("Flat Rail", 36, 0);
      check(
        "Rail grind metadata",
        g.park.rails.some((r) => r.id.startsWith(e.selected)),
      );
      e.add("Box Jump", 30, 10);
      const box = e.selected;
      e.change((l) => {
        const o = l.objects.find((o) => o.id === box);
        o.width = 7;
        o.length = 9;
        o.rotation = Math.PI / 2;
      });
      check(
        "Resize and rotate saved",
        e.layout.objects[2].width === 7 &&
          e.layout.objects[2].rotation === Math.PI / 2,
      );
      e.duplicate();
      check("Duplicate", e.layout.objects.length === 4);
      e.remove();
      check("Delete", e.layout.objects.length === 3);
      e.undo();
      check("Undo", e.layout.objects.length === 4);
      e.undo(true);
      check("Redo", e.layout.objects.length === 3);
      e.change((l) => {
        l.title = "Browser test park";
        l.terrain.push({
          x: 35,
          z: 20,
          radius: 4,
          strength: 1,
          mode: "raise",
          target: 0,
        });
      });
      e.save(true);
      const slot = e.slot;
      e.history.layout.objects = [];
      e.load(slot);
      check("Local park save/load", e.layout.objects.length === 3);
      e.testRide();
      check("Test ride starts", !e.active && g.hud.started);
      g.advance(0.3, {}, false);
      e.open(false);
      check("Return retains edits", e.active && e.layout.objects.length === 3);
      e.owner = true;
      e.ownerMode = true;
      e.onBuild(e.safeLayout());
      check(
        "Owner selects existing assets",
        e.scene.children.some((o) => o.userData.baseId),
      );
      const bench = e.scene.children.find((o) =>
        o.name.startsWith("Wood park bench"),
      );
      check("Existing bench grouped", !!bench);
      e.attach(bench);
      const before = bench.position.x;
      bench.position.x += 3;
      e.commitTransform();
      const moved = e.scene.children.find(
        (o) => o.userData.baseId === e.selected,
      );
      check(
        "Owner asset move saved",
        Math.abs(moved.position.x - before - 3) < 0.01,
      );
      const path = e.scene.children.find(
        (o) => o.name === "Dirt riding track" && o.userData.baseId,
      );
      check(
        "Existing dirt riding track selectable as one asset",
        !!path && path.children.length > 1,
      );
      e.attach(path);
      path.position.x += 8;
      path.rotation.y = 0.25;
      e.commitTransform();
      check(
        "Whole path edit persists",
        Math.abs(e.layout.baseEdits[e.selected].x - 8) < 0.01,
      );
      const tree = e.scene.children.find(
        (o) => o.name.startsWith("Tree ") && o.userData.baseId,
      );
      e.attach(tree);
      check(
        "Tree keeps trunk and foliage together",
        tree.children.length === 2,
      );
      tree.position.z += 2;
      tree.scale.setScalar(1.2);
      e.commitTransform();
      check(
        "Tree resizing saved",
        e.layout.baseEdits[e.selected].scale[0] === 1.2,
      );
      const { makeObject } = await import("/src/editor/layout.ts");
      e.change((l) => {
        const p = makeObject("Path", 35, -30);
        p.width = 3;
        p.height = 0.05;
        p.material = "dirt";
        p.points = [
          [-4, 0],
          [0, 3],
          [6, 1],
        ];
        l.objects.push(p);
      });
      check(
        "Custom curved path built as one asset",
        e.layout.objects.at(-1).type === "Path",
      );
      const { outdoorLip } = await import("/src/park/outdoor.ts");
      const { localXZ } = await import("/src/editor/layout.ts");
      e.change((l) => {
        const q = l.objects.find((o) => o.id === quarter);
        q.rotation = Math.PI / 4;
      });
      const q = e.layout.objects.find((o) => o.id === quarter),
        z = -q.length / 2 + q.radius - 0.1,
        x = q.x + Math.sin(q.rotation) * z,
        wz = q.z + Math.cos(q.rotation) * z,
        lip = outdoorLip(x, wz, 4, 4);
      check(
        "Rotated quarter has launch metadata",
        !!lip && lip.forward.x > 0.6 && lip.forward.z > 0.6,
      );
      const points = localXZ(q, x, wz);
      check(
        "Rotated ramp coordinate round trip",
        Math.abs(points.z - z) < 0.001,
      );
      e.selected = "";
      e.gizmo.detach();
      e.camera.position.set(25, 24, 32);
      e.orbit.target.set(0, 0, 0);

      const { emptyInput } = await import("/src/input/input.ts");
      e.update(emptyInput(), 0.016);
      return checks;
    }),
  );
  await page.screenshot({ path: "artifacts/editor.png" });
  if (errors.length) throw Error(errors.join("\n"));
} finally {
  await browser.close();
}
