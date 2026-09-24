import { test } from "node:test";
import assert from "node:assert/strict";
import { Tricks } from "../src/tricks/tricks.ts";
import { Events } from "../src/core/events.ts";
import { ScoreSystem } from "../src/tricks/score.ts";
import { TUNE } from "../src/core/config.ts";

// Trick lines (#42): a trick that lands within 3 s of the last one stacks onto
// the line (the multiplier grows); 3 s of plain riding banks it.
test("tricks landed within 3 s stack into one line; 3 s idle ends it", () => {
  const events = new Events(), tricks = new Tricks(events), score = new ScoreSystem(events), ended: string[][] = [];
  events.on((e) => { if (e.type === "line" && e.ended) ended.push(e.names); });
  tricks.add("Tailwhip"); tricks.tick(2.5, false);
  tricks.add("Barspin"); tricks.tick(2.9, false);
  tricks.add("360");
  assert.equal(tricks.line.length, 3);
  assert.equal(score.multiplier, 1 + 3 * TUNE.comboStep, "each new trick raises the multiplier");
  const line = score.line;
  assert.ok(line > 0);
  tricks.tick(TUNE.comboTimeout - 0.1, false);
  assert.equal(ended.length, 0, "still open just inside the window");
  tricks.tick(0.2, false);
  assert.deepEqual(ended, [["Tailwhip", "Barspin", "360"]]);
  assert.equal(score.line, 0);
  assert.equal(score.multiplier, 1);
  assert.equal(tricks.line.length, 0);
});

test("grinds, manuals and air keep the line open past 3 s", () => {
  const events = new Events(), tricks = new Tricks(events);
  tricks.add("Tailwhip");
  for (let i = 0; i < 60; i++) tricks.tick(0.1, true);
  tricks.tick(2.5, false);
  assert.equal(tricks.line.length, 1);
});
