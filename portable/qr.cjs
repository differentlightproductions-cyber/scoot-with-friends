'use strict';
// A small QR code encoder (ISO/IEC 18004): byte mode, error correction level M,
// versions 1-6 (up to 106 bytes, plenty for a local game address). No
// dependencies, so the Windows package stays self-contained. Used by
// "Play on Phone" to show the address as a code the phone camera can open.

// [total codewords, EC codewords per block, blocks] for level M, versions 1-6.
const VERSIONS = [null, [26, 10, 1], [44, 16, 1], [70, 26, 1], [100, 18, 2], [134, 24, 2], [172, 16, 4]];
const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34]];

// GF(256) with the QR polynomial x^8 + x^4 + x^3 + x^2 + 1.
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

function generator(degree) {
  let g = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) { next[j] ^= g[j]; next[j + 1] ^= mul(g[j], EXP[i]); }
    g = next;
  }
  return g;
}
function remainder(data, degree) {
  const g = generator(degree), out = [...data, ...new Array(degree).fill(0)];
  for (let i = 0; i < data.length; i++) {
    const factor = out[i];
    if (factor) for (let j = 0; j < g.length; j++) out[i + j] ^= mul(g[j], factor);
  }
  return out.slice(data.length);
}

function codewords(bytes, version) {
  const [total, ec, blocks] = VERSIONS[version], dataTotal = total - ec * blocks;
  const bits = [];
  const put = (value, length) => { for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1); };
  put(0b0100, 4);
  put(bytes.length, 8);
  for (const b of bytes) put(b, 8);
  put(0, Math.min(4, dataTotal * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let pad = 0xec; data.length < dataTotal; pad ^= 0xec ^ 0x11) data.push(pad);
  // Split into blocks (shorter blocks first), add error correction, interleave.
  const short = Math.floor(dataTotal / blocks), longCount = dataTotal % blocks, groups = [];
  for (let b = 0, at = 0; b < blocks; b++) {
    const size = short + (b >= blocks - longCount ? 1 : 0);
    const block = data.slice(at, at + size);
    at += size;
    groups.push({ data: block, ec: remainder(block, ec) });
  }
  const out = [];
  for (let i = 0; i < short + 1; i++) for (const g of groups) if (i < g.data.length) out.push(g.data[i]);
  for (let i = 0; i < ec; i++) for (const g of groups) out.push(g.ec[i]);
  return out;
}

const MASKS = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function formatBits(mask) {
  const data = (0b00 << 3) | mask; // level M
  let rem = data << 10;
  for (let i = 14; i >= 10; i--) if ((rem >>> i) & 1) rem ^= 0x537 << (i - 10);
  return ((data << 10) | rem) ^ 0x5412;
}

function build(version, words, mask) {
  const size = version * 4 + 17;
  const m = Array.from({ length: size }, () => new Array(size).fill(0));
  const fixed = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (r, c, dark) => { m[r][c] = dark ? 1 : 0; fixed[r][c] = true; };
  const finder = (r0, c0) => {
    for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
      const rr = r0 + r, cc = c0 + c;
      if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
      const ring = Math.max(Math.abs(r - 3), Math.abs(c - 3));
      set(rr, cc, ring !== 2 && ring !== 4);
    }
  };
  finder(0, 0); finder(0, size - 7); finder(size - 7, 0);
  for (let i = 8; i < size - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const align = ALIGN[version];
  for (const r of align) for (const c of align) {
    if (fixed[r][c]) continue;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
  }
  set(size - 8, 8, true); // dark module
  // Reserve the format areas (filled below).
  for (let i = 0; i < 9; i++) { if (!fixed[8][i]) set(8, i, false); if (!fixed[i][8]) set(i, 8, false); }
  for (let i = 0; i < 8; i++) { set(8, size - 1 - i, false); if (!fixed[size - 1 - i][8]) set(size - 1 - i, 8, false); }
  // Data, in the zigzag from the bottom right, skipping the vertical timing column.
  const bits = [];
  for (const w of words) for (let i = 7; i >= 0; i--) bits.push((w >>> i) & 1);
  let k = 0, upward = true;
  for (let right = size - 1; right >= 1; right -= 2, upward = !upward) {
    if (right === 6) right = 5;
    for (let n = 0; n < size; n++) {
      const r = upward ? size - 1 - n : n;
      for (const c of [right, right - 1]) {
        if (fixed[r][c]) continue;
        const bit = k < bits.length ? bits[k++] : 0;
        m[r][c] = bit ^ (MASKS[mask](r, c) ? 1 : 0);
      }
    }
  }
  const f = formatBits(mask);
  const bit = (i) => ((f >>> i) & 1) === 1;
  // Around the top-left finder (bit 14 first).
  const a = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]];
  a.forEach(([r, c], i) => set(r, c, bit(14 - i)));
  // Split copy: bottom-left column, then top-right row.
  for (let i = 0; i < 7; i++) set(size - 1 - i, 8, bit(14 - i));
  for (let i = 0; i < 8; i++) set(8, size - 8 + i, bit(7 - i));
  set(size - 8, 8, true);
  return m;
}

function penalty(m) {
  const size = m.length;
  let score = 0;
  for (let pass = 0; pass < 2; pass++) for (let a = 0; a < size; a++) {
    let run = 1;
    for (let b = 1; b < size; b++) {
      const cur = pass ? m[b][a] : m[a][b], prev = pass ? m[b - 1][a] : m[a][b - 1];
      if (cur === prev) { run++; if (run === 5) score += 3; else if (run > 5) score++; } else run = 1;
    }
  }
  for (let r = 0; r < size - 1; r++) for (let c = 0; c < size - 1; c++) {
    const v = m[r][c];
    if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) score += 3;
  }
  const patterns = [[1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1]];
  for (let a = 0; a < size; a++) for (let b = 0; b + 11 <= size; b++) for (const p of patterns) {
    if (p.every((v, i) => m[a][b + i] === v)) score += 40;
    if (p.every((v, i) => m[b + i][a] === v)) score += 40;
  }
  let dark = 0;
  for (const row of m) for (const v of row) dark += v;
  score += Math.floor(Math.abs((dark * 100) / (size * size) - 50) / 5) * 10;
  return score;
}

/** Module matrix (1 = dark) for text, or throws if it is too long. */
function qrMatrix(text, forceMask) {
  const bytes = [...Buffer.from(String(text), 'utf8')];
  let version = 1;
  while (version <= 6) {
    const [total, ec, blocks] = VERSIONS[version];
    if ((total - ec * blocks) * 8 >= 12 + bytes.length * 8) break;
    version++;
  }
  if (version > 6) throw Error('Text too long for the QR code');
  const words = codewords(bytes, version);
  if (forceMask !== undefined) return build(version, words, forceMask);
  let best = null, bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const m = build(version, words, mask), s = penalty(m);
    if (s < bestScore) { best = m; bestScore = s; }
  }
  return best;
}

/** The code drawn with half-height block characters for a console window. */
function qrTerminal(text) {
  const m = qrMatrix(text), quiet = 2, size = m.length + quiet * 2;
  const dark = (r, c) => r >= quiet && c >= quiet && r < size - quiet && c < size - quiet && m[r - quiet][c - quiet] === 1;
  const lines = [];
  // Light-on-dark consoles: print light modules as blocks so the code reads correctly.
  for (let r = 0; r < size; r += 2) {
    let line = '';
    for (let c = 0; c < size; c++) {
      const top = !dark(r, c), bottom = r + 1 < size ? !dark(r + 1, c) : true;
      line += top && bottom ? '█' : top ? '▀' : bottom ? '▄' : ' ';
    }
    lines.push(line);
  }
  return lines.join('\n');
}

/** The code as an SVG image (dark modules on white). */
function qrSvg(text, scale = 10) {
  const m = qrMatrix(text), quiet = 4, size = m.length + quiet * 2;
  let path = '';
  m.forEach((row, r) => row.forEach((v, c) => { if (v) path += `M${c + quiet} ${r + quiet}h1v1h-1z`; }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size * scale}" height="${size * scale}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}

module.exports = { qrMatrix, qrTerminal, qrSvg };
