import test from "node:test";
import assert from "node:assert/strict";
import {
  blankLayout,
  makeObject,
  validateLayout,
  LayoutHistory,
  brushHeight,
  setActiveLayout,
} from "../src/editor/layout";
import { parkAPI } from "../server/park-api";
test("Park saves round trip, reject unsafe dimensions, duplicate IDs and oversized imports", () => {
  const l = blankLayout();
  l.objects.push(makeObject("Quarter Pipe"), makeObject("Path"));
  assert.deepEqual(validateLayout(l), l);
  assert.throws(() =>
    validateLayout({ ...l, objects: [l.objects[0], l.objects[0]] }),
  );
  assert.throws(() =>
    validateLayout({ ...l, objects: [{ ...l.objects[0], width: Infinity }] }),
  );
});
test("Undo and redo restore geometry and terrain together", () => {
  const h = new LayoutHistory();
  h.commit((l) => {
    l.objects.push(makeObject("Box Jump"));
    l.terrain.push({
      x: 40,
      z: 0,
      radius: 4,
      mode: "raise",
      strength: 1,
      target: 0,
    });
  });
  h.undo();
  assert.equal(h.layout.objects.length, 0);
  h.redo();
  assert.equal(h.layout.terrain.length, 1);
  setActiveLayout(h.layout);
  assert.equal(brushHeight(40, 0, 0), 1);
  assert.equal(brushHeight(0, 0, 0), 0);
  setActiveLayout(null);
});
test("Publishing requires owner permission, stores the full layout and preserves previous release", async () => {
  const store = new Map<string, string>();
  const env = {
    PARK_PUBLISH_KEY: "test-owner-key",
    PARKS: {
      async get(k: string) {
        return store.has(k) ? { text: async () => store.get(k)! } : null;
      },
      async put(k: string, v: string) {
        store.set(k, v);
      },
    },
  };
  const request = (layout: unknown, key = "test-owner-key") =>
    new Request("https://game.example/api/public-park", {
      method: "PUT",
      headers: {
        authorization: "Bearer " + key,
        "content-type": "application/json",
      },
      body: JSON.stringify({ layout }),
    });
  assert.equal(
    (await parkAPI(request(blankLayout(), "wrong"), env))!.status,
    401,
  );
  assert.equal(store.size, 0);
  assert.equal((await parkAPI(request({ version: 99 }), env))!.status, 400);
  const layout = blankLayout();
  layout.objects.push(makeObject("Tree"));
  assert.equal((await parkAPI(request(layout), env))!.status, 200);
  const first = store.get("current.json");
  layout.title = "Second park";
  assert.equal((await parkAPI(request(layout), env))!.status, 200);
  assert.equal(store.get("previous.json"), first);
  const publicResponse = await parkAPI(
    new Request("https://game.example/api/public-park"),
    env,
  );
  assert.equal(
    ((await publicResponse!.json()) as any).layout.title,
    "Second park",
  );
  assert.equal(
    JSON.stringify([...store.values()]).includes("test-owner-key"),
    false,
  );
});
