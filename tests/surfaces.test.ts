import test from "node:test";
import assert from "node:assert/strict";
import { addSurface, clearSurfaces, surfaceAt, surfaceDisk, surfaceRect } from "../src/park/surfaces";

test("hard pads win over sand, sand over grass; unregistered ground is null (road)", () => {
  clearSurfaces();
  surfaceRect("grass", -100, 100, -30, 60);
  surfaceDisk("grass", -3, -123, 25);
  surfaceDisk("sand", -3, -123, 11);
  surfaceRect("road", -24, 24, -33, 33);
  addSurface("road", { kind: "segment", a: [27, -93], b: [27, -147], width: 4.3 });
  assert.equal(surfaceAt(50, 40), "grass", "open lawn");
  assert.equal(surfaceAt(0, 0), "road", "the wood park slab over the lawn");
  assert.equal(surfaceAt(-3, -123), "sand", "infield");
  assert.equal(surfaceAt(-3, -140), "grass", "outfield");
  assert.equal(surfaceAt(27, -120), "road", "the path between the fields");
  assert.equal(surfaceAt(29.3, -120), null, "just off the 4.3 m path, outside every zone");
  assert.equal(surfaceAt(200, 200), null);
  clearSurfaces();
  assert.equal(surfaceAt(50, 40), null, "a new map starts with nothing registered");
});
