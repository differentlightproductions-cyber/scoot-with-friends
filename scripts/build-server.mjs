import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";
const root = path.resolve("dist");
const client = path.join(root, "client");
fs.mkdirSync(client, { recursive: true });
// Vite emits the browser build at dist; move that output into the client directory.
for (const entry of fs.readdirSync(root)) {
  if (["client", "server", ".openai"].includes(entry)) continue;
  fs.renameSync(path.join(root, entry), path.join(client, entry));
}
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
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
    else
      assets["/" + path.relative(client, p).replaceAll("\\", "/")] = {
        type: types[path.extname(p)] || "application/octet-stream",
        body: fs.readFileSync(p).toString("base64"),
      };
  }
}
walk(client);
fs.mkdirSync("work", { recursive: true });
fs.writeFileSync("work/site-assets.json", JSON.stringify(assets));
await build({
  entryPoints: ["server/worker.ts"],
  outfile: "dist/server/index.js",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
});
fs.mkdirSync("dist/.openai", { recursive: true });
fs.copyFileSync(".openai/hosting.json", "dist/.openai/hosting.json");
console.log("Built browser game and secure park publisher.");
