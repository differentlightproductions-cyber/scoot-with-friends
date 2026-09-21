import {gzipSync} from 'node:zlib';
﻿import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";
const root = path.resolve("dist");
const client = path.join(root, "client");
fs.mkdirSync(client, { recursive: true });
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".wasm": "application/wasm",
};
const assets = {};
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else {
      const relative = path.relative(client, p).replaceAll("\\", "/");
      // Large media stays in dist/client for local/Windows play and the Sites
      // static asset service; do not also embed it in the API Worker.
      if (relative.startsWith("music/tracks/") || relative.startsWith("models/park/") || relative === "models/humans/christian.glb") continue;
      assets["/" + relative] = {
        type: types[path.extname(p)] || "application/octet-stream",
        body: gzipSync(fs.readFileSync(p),{level:9}).toString("base64"),
        encoding: "gzip",
      };
    }
  }
}
walk(client);
fs.mkdirSync("work", { recursive: true });
fs.writeFileSync("work/site-assets.json", JSON.stringify(assets));
await build({
  entryPoints: [path.resolve("server/worker.ts")],
  outfile: "dist/server/index.js",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
});
fs.mkdirSync("dist/.openai", { recursive: true });
fs.copyFileSync(".openai/hosting.json", "dist/.openai/hosting.json");
fs.cpSync("drizzle", "dist/.openai/drizzle", { recursive: true });
console.log("Built browser game and secure park publisher.");
