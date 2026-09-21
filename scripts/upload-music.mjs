import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import catalog from "../public/music/catalog.json" with { type: "json" };

const args = new Map(process.argv.slice(2).flatMap((value, index, all) => value.startsWith("--") ? [[value, all[index + 1]]] : []));
const base = (args.get("--base-url") ?? process.env.MUSIC_BASE_URL)?.replace(/\/$/, "");
const ownerFile = args.get("--owner-file");
const owner = ownerFile ? JSON.parse(await readFile(ownerFile, "utf8")) : null;
const key = owner?.publishKey ?? process.env.PARK_PUBLISH_KEY;
if (!base || !key) throw new Error("Pass --base-url and --owner-file, or set MUSIC_BASE_URL and PARK_PUBLISH_KEY.");

for (const track of catalog.tracks) {
  const local = fileURLToPath(new URL("../public" + decodeURIComponent(track.file), import.meta.url));
  if ((await stat(local)).size !== track.bytes) throw new Error(`${track.file} does not match the catalog size.`);
  const response = await fetch(base + track.file, {
    method: "PUT",
    headers: { authorization: `Bearer ${key}`, "content-type": "audio/mpeg", "content-length": String(track.bytes) },
    body: await readFile(local),
  });
  if (!response.ok) throw new Error(`${track.file}: ${response.status} ${await response.text()}`);
  const check = await fetch(base + track.file, { headers: { range: "bytes=0-0" } });
  if (check.status !== 206 || check.headers.get("content-range") !== `bytes 0-0/${track.bytes}` || (await check.arrayBuffer()).byteLength !== 1)
    throw new Error(`${track.file}: upload verification failed.`);
  console.log(`Uploaded ${track.file}`);
}
