import { test } from "node:test";
import assert from "node:assert/strict";
import { Events } from "../src/core/events.ts";
import { register } from "node:module";
// rewards.ts brings its stylesheet along; node has nothing to do with it.
register("data:text/javascript,export async function load(url,ctx,next){return url.endsWith('.css')?{format:'module',source:'',shortCircuit:true}:next(url,ctx);}");
const { MissionTracker } = await import("../src/ui/rewards.ts");
import { addLanded, emptyProgress, tallyLabel, tallyPart, trickBook, validProgress, LANDED_MAX } from "../src/data/progress.ts";

test("trick parts are named for the tally: Tailwhips, 360s, Double Backflips, Kickless", () => {
  assert.equal(tallyLabel(tallyPart("Tailwhip")), "Tailwhips");
  assert.equal(tallyLabel(tallyPart("360°")), "360s");
  assert.equal(tallyLabel(tallyPart("2× Backflip")), "Double Backflips");
  assert.equal(tallyLabel(tallyPart("Kickless")), "Kickless");
});

test("the tracker counts each part, lists combos, and survives a reload", async () => {
  const events = new Events(), sent: any[] = [];
  const tracker = new MissionTracker(events, { track: async (...args: any[]) => { sent.push(args); } } as any);
  const trick = (name: string, components: string[], recognized: string | null = null) =>
    events.emit({ type: "trick", name, record: { name, components, recognized, landing: "clean", id: 1, raw: { bodyYaw: 0, deckTurns: 0, barTurns: 0 } } as any, attemptId: 1 });
  trick("Tailwhip", ["Tailwhip"]);
  trick("360° Tailwhip + Barspin", ["360°", "Tailwhip", "Barspin"]);
  trick("Flair", ["Backflip", "180°"], "flair");
  events.emit({ type: "grindCatch", name: "Feeble", assisted: false });
  tracker.flush();
  const landed = sent[0][3];
  assert.deepEqual(landed.tally, { Tailwhip: 2, "360": 1, Barspin: 1, Flair: 1, Feeble: 1 });
  assert.deepEqual(landed.combos, { "360° Tailwhip + Barspin": 1 });

  const p = emptyProgress();
  addLanded(p, landed); addLanded(p, { tally: { Barspin: 522 } });
  const book = trickBook(validProgress(JSON.parse(JSON.stringify(p))));
  const whips = book.groups.find((g) => g.title === "WHIPS & BARSPINS")!;
  assert.deepEqual(whips.rows, [{ label: "Barspins", count: 523 }, { label: "Tailwhips", count: 2 }], "most landed first");
  assert.deepEqual(book.groups.find((g) => g.title === "SPINS")!.rows, [{ label: "360s", count: 1 }]);
  assert.deepEqual(book.groups.find((g) => g.title === "FLIPS")!.rows, [{ label: "Flairs", count: 1 }]);
  assert.deepEqual(book.groups.find((g) => g.title === "GRINDS & MANUALS")!.rows, [{ label: "Feebles", count: 1 }]);
  assert.equal(book.combos[0].name, "360° Tailwhip + Barspin");
});

test("the tally stays bounded and ignores junk", () => {
  const p = emptyProgress();
  addLanded(p, { tally: Object.fromEntries(Array.from({ length: LANDED_MAX + 50 }, (_, i) => [`Trick ${i}`, i + 1])) });
  assert.equal(Object.keys(p.tally).length, LANDED_MAX);
  assert.ok(!("Trick 0" in p.tally), "the least landed make room");
  addLanded(p, { tally: { "<script>": 3, "": 2, Tailwhip: -4, Barspin: 1.5 } });
  assert.ok(!("<script>" in p.tally) && !("Tailwhip" in p.tally) && !("Barspin" in p.tally));
});
