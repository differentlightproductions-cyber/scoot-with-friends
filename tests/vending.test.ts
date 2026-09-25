import test from "node:test";
import assert from "node:assert/strict";
import { VEND_SLOTS, KEYS, vendSlot } from "../src/park/vending";
import { VENDING_KINDS } from "../src/data/items";

// #88: the machine's planogram is keyed on its own keypad, row then column.
test("thirty coils, each with a unique two-digit code the keypad can key", () => {
  assert.equal(VEND_SLOTS.length, 30);
  assert.equal(new Set(VEND_SLOTS.map((s) => s.code)).size, 30);
  const digits = new Set(KEYS.flat().filter((k) => /^\d$/.test(k)));
  for (const s of VEND_SLOTS) {
    assert.match(s.code, /^[1-6][1-5]$/);
    assert.ok([...s.code].every((d) => digits.has(d)), s.code);
    assert.equal(vendSlot(s.code), s);
  }
  assert.equal(vendSlot("77"), null);
});

test("only the park's own products, each priced in whole Coins", () => {
  for (const s of VEND_SLOTS) {
    assert.ok((VENDING_KINDS as readonly string[]).includes(s.kind), s.kind);
    assert.ok(Number.isSafeInteger(s.price) && s.price > 0);
  }
  assert.deepEqual([...new Set(VEND_SLOTS.map((s) => s.kind))].sort(), [...VENDING_KINDS].sort());
});
