// Play on Phone QR encoder (portable/qr.cjs). The expected HELLO codewords were
// checked by decoding the generated code with OpenCV's QR reader.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { qrMatrix, qrSvg, qrTerminal } = require("../portable/qr.cjs");

function readCodewords(m: number[][], mask: (r: number, c: number) => boolean) {
  const size = m.length, fixed = (r: number, c: number) => (r < 9 && c < 9) || (r < 9 && c >= size - 8) || (r >= size - 8 && c < 9) || r === 6 || c === 6;
  const bits: number[] = [];
  let up = true;
  for (let right = size - 1; right >= 1; right -= 2, up = !up) {
    if (right === 6) right = 5;
    for (let n = 0; n < size; n++) {
      const r = up ? size - 1 - n : n;
      for (const c of [right, right - 1]) if (!fixed(r, c)) bits.push(m[r][c] ^ (mask(r, c) ? 1 : 0));
    }
  }
  const out: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8).join(""), 2));
  return out;
}

test("byte-mode data, padding and error correction for a version 1-M code", () => {
  const m = qrMatrix("HELLO", 0);
  assert.equal(m.length, 21);
  const words = readCodewords(m, (r, c) => (r + c) % 2 === 0);
  assert.deepEqual(words.slice(0, 26), [0x40, 0x54, 0x84, 0x54, 0xc4, 0xc4, 0xf0, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x23, 0x73, 0x23, 0x99, 0xec, 0x08, 0xc9, 0xf7, 0x37, 0xdf]);
});

test("finder patterns and version sizing for local addresses", () => {
  for (const [text, size] of [["http://192.168.1.23:5188/", 25], ["http://192.168.100.200:5190/?phone=1", 29]] as const) {
    const m = qrMatrix(text);
    assert.equal(m.length, size, text);
    for (const [r0, c0] of [[0, 0], [0, size - 7], [size - 7, 0]]) {
      assert.deepEqual(m[r0].slice(c0, c0 + 7), [1, 1, 1, 1, 1, 1, 1]);
      assert.deepEqual(m[r0 + 3].slice(c0, c0 + 7), [1, 0, 1, 1, 1, 0, 1]);
    }
  }
  assert.throws(() => qrMatrix("x".repeat(200)));
});

test("SVG and console renderings", () => {
  assert.match(qrSvg("http://10.0.0.5:5188/"), /^<svg[^>]+viewBox="0 0 33 33"/);
  const lines = qrTerminal("http://10.0.0.5:5188/").split("\n");
  assert.equal(lines.length, Math.ceil((25 + 4) / 2));
  assert.ok(lines.every((l: string) => l.length === 29));
});
