import test from "node:test";
import assert from "node:assert/strict";
import { musicAPI } from "../server/music-delivery.ts";

const file = "/music/tracks/Keeto%20-%20Promise.mp3", size = 1778351;
const bytes = new Uint8Array(size); bytes[0] = 1; bytes[size - 1] = 2;
class Bucket {
  data = new Map<string, Uint8Array>([["music/tracks/Keeto - Promise.mp3", bytes]]);
  async head(key: string) { const value = this.data.get(key); return value ? { size: value.length } : null; }
  async get(key: string, options?: { range?: { offset: number; length: number } }) {
    let value = this.data.get(key); if (!value) return null;
    if (options?.range) value = value.slice(options.range.offset, options.range.offset + options.range.length);
    return { size: value.length, body: new Blob([value]).stream() };
  }
  async put(key: string, value: Uint8Array) { this.data.set(key, value.slice()); }
}
const call = (path = file, init?: RequestInit, bucket = new Bucket()) => musicAPI(new Request("https://game.test" + path, init), { PARKS: bucket, PARK_PUBLISH_KEY: "secret" });

test("serves full and valid byte ranges from catalog-listed R2 keys", async () => {
  const full = await call(); assert.equal(full!.status, 200); assert.equal(full!.headers.get("content-type"), "audio/mpeg"); assert.equal((await full!.arrayBuffer()).byteLength, size);
  const middle = await call(file, { headers: { range: "bytes=10-19" } }); assert.equal(middle!.status, 206); assert.equal(middle!.headers.get("content-range"), `bytes 10-19/${size}`); assert.equal((await middle!.arrayBuffer()).byteLength, 10);
  const suffix = await call(file, { headers: { range: "bytes=-8" } }); assert.equal(suffix!.status, 206); assert.equal(suffix!.headers.get("content-range"), `bytes ${size - 8}-${size - 1}/${size}`);
});

test("rejects invalid ranges and paths outside the bundled manifest", async () => {
  for (const value of ["bytes=20-10", `bytes=${size}-`, "bytes=0-1,3-4", "items=0-1"]) assert.equal((await call(file, { headers: { range: value } }))!.status, 416);
  assert.equal((await call("/music/tracks/secret.mp3"))!.status, 404);
  assert.equal(await call("/assets/game.js"), null);
});

test("uploads only exact catalog tracks with owner authorization and size", async () => {
  const bucket = new Bucket(); bucket.data.clear();
  assert.equal((await call(file, { method: "PUT", body: bytes }, bucket))!.status, 401);
  assert.equal((await call(file, { method: "PUT", headers: { authorization: "Bearer secret" }, body: bytes }, bucket))!.status, 415);
  const uploadHeaders = { authorization: "Bearer secret", "content-type": "audio/mpeg" };
  assert.equal((await call(file, { method: "PUT", headers: uploadHeaders, body: bytes.slice(1) }, bucket))!.status, 413);
  const saved = await call(file, { method: "PUT", headers: uploadHeaders, body: bytes }, bucket);
  assert.equal(saved!.status, 204); assert.equal(bucket.data.get("music/tracks/Keeto - Promise.mp3")?.length, size);
});
