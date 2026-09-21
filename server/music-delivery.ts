import catalog from "../public/music/catalog.json" with { type: "json" };

type Track = { file: string; bytes: number };
type Stored = { size: number; body: ReadableStream<Uint8Array> };
type Bucket = {
  head(key: string): Promise<{ size: number } | null>;
  get(key: string, options?: { range?: { offset: number; length: number } }): Promise<Stored | null>;
  put(key: string, value: Uint8Array, options?: { httpMetadata?: { contentType: string } }): Promise<unknown>;
};

const tracks = new Map((catalog.tracks as Track[]).map((track) => [track.file, track]));
const keyFor = (file: string) => decodeURIComponent(file).slice(1);
const headers = { "accept-ranges": "bytes", "content-type": "audio/mpeg", "cache-control": "public,max-age=86400" };

function authorized(request: Request, secret: string | undefined) {
  const supplied = request.headers.get("authorization") ?? "", expected = "Bearer " + (secret ?? "");
  if (!secret || supplied.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) mismatch |= supplied.charCodeAt(i) ^ expected.charCodeAt(i);
  return mismatch === 0;
}

function range(value: string | null, size: number) {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) return false;
  let start: number, end: number;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return false;
    start = Math.max(0, size - suffix); end = size - 1;
  } else {
    start = Number(match[1]); end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start) return false;
    end = Math.min(end, size - 1);
  }
  return { offset: start, length: end - start + 1, end };
}

async function body(request: Request, expected: number) {
  const declared = Number(request.headers.get("content-length"));
  if (declared && declared !== expected) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > expected) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  if (size !== expected) return null;
  const result = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}

export async function musicAPI(request: Request, env: { PARKS?: Bucket; PARK_PUBLISH_KEY?: string }) {
  const url = new URL(request.url), track = tracks.get(url.pathname);
  if (!url.pathname.startsWith("/music/tracks/")) return null;
  if (!track || !env.PARKS) return new Response("Not found", { status: 404 });
  const key = keyFor(track.file);
  if (request.method === "PUT") {
    if (!authorized(request, env.PARK_PUBLISH_KEY)) return new Response("Owner publishing permission required.", { status: 401 });
    if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "audio/mpeg")
      return new Response("MP3 content required.", { status: 415 });
    const bytes = await body(request, track.bytes);
    if (!bytes) return new Response("Track size does not match the catalog.", { status: 413 });
    await env.PARKS.put(key, bytes, { httpMetadata: { contentType: "audio/mpeg" } });
    return new Response(null, { status: 204 });
  }
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
  const metadata = await env.PARKS.head(key);
  if (!metadata) return new Response("Not found", { status: 404 });
  const selected = range(request.headers.get("range"), metadata.size);
  if (selected === false) return new Response(null, { status: 416, headers: { ...headers, "content-range": `bytes */${metadata.size}` } });
  const object = request.method === "HEAD" ? null : await env.PARKS.get(key, selected ? { range: selected } : undefined);
  if (request.method !== "HEAD" && !object) return new Response("Not found", { status: 404 });
  const responseHeaders: Record<string, string> = { ...headers, "content-length": String(selected?.length ?? metadata.size) };
  if (selected) responseHeaders["content-range"] = `bytes ${selected.offset}-${selected.end}/${metadata.size}`;
  return new Response(request.method === "HEAD" ? null : object!.body, { status: selected ? 206 : 200, headers: responseHeaders });
}
