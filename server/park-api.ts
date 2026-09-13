import { validateLayout } from "../src/editor/layout";
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
interface Bucket {
  get(key: string): Promise<{ text(): Promise<string> } | null>;
  put(key: string, value: string): Promise<unknown>;
}
export interface Env {
  PARKS: Bucket;
  PARK_PUBLISH_KEY: string;
}
export async function parkAPI(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (path !== "/api/public-park") return null;
  if (request.method === "GET") {
    try {
      const p = await env.PARKS.get("current.json");
      return json(
        p ? JSON.parse(await p.text()) : { revision: null, layout: null },
      );
    } catch {
      return json({ error: "Public park is temporarily unavailable." }, 503);
    }
  }
  if (request.method !== "PUT")
    return json({ error: "Method not allowed" }, 405);
  const supplied = request.headers.get("authorization") ?? "",
    expected = "Bearer " + env.PARK_PUBLISH_KEY;
  if (!env.PARK_PUBLISH_KEY || supplied.length !== expected.length)
    return json({ error: "Owner publishing permission required." }, 401);
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++)
    mismatch |= supplied.charCodeAt(i) ^ expected.charCodeAt(i);
  if (mismatch)
    return json({ error: "Owner publishing permission required." }, 401);
  try {
    if (Number(request.headers.get("content-length") || 0) > 2_000_000)
      return json({ error: "Park file is too large." }, 413);
    const reader = request.body?.getReader();
    if (!reader) return json({ error: "Missing park" }, 400);
    let text = "",
      size = 0;
    const decoder = new TextDecoder();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 2_000_000) {
        await reader.cancel();
        return json({ error: "Park file is too large." }, 413);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    const { layout: raw } = JSON.parse(text),
      layout = validateLayout(raw),
      revision = crypto.randomUUID();
    const old = await env.PARKS.get("current.json");
    if (old) await env.PARKS.put("previous.json", await old.text());
    const record = { revision, publishedAt: new Date().toISOString(), layout };
    await env.PARKS.put("current.json", JSON.stringify(record));
    return json({ revision, publishedAt: record.publishedAt });
  } catch (e) {
    if (
      e instanceof SyntaxError ||
      /Invalid|Unsupported|outside/.test(String(e))
    )
      return json({ error: "The park file contains invalid data." }, 400);
    return json(
      { error: "Publishing failed. Your local park is still saved." },
      503,
    );
  }
}
