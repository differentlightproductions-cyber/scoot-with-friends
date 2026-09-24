import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { randomId, sha256 } from "../src/core/secure";

// The plain-JavaScript SHA-256 must match the platform's exactly: layout
// revisions are compared between a PC on https/localhost and a phone on http.
test("fallback SHA-256 matches the platform digest", () => {
  const inputs = ["", "abc", "a".repeat(55), "a".repeat(56), "a".repeat(64), "a".repeat(1000), JSON.stringify({ objects: [1, 2, 3], name: "Park ✓" })];
  for (const text of inputs) {
    const ours = Buffer.from(sha256(new TextEncoder().encode(text))).toString("hex");
    assert.equal(ours, createHash("sha256").update(text, "utf8").digest("hex"), `length ${text.length}`);
  }
});

test("random ids are RFC 4122 v4 and unique", () => {
  const ids = new Set(Array.from({ length: 200 }, randomId));
  assert.equal(ids.size, 200);
  for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
