import { parkAPI } from "./park-api";
import assets from "../work/site-assets.json";
export default {
  async fetch(request: Request, env: any) {
    const response = await parkAPI(request, env);
    if (response) return response;
    const url = new URL(request.url);
    const path = url.pathname === "/" ? "/index.html" : url.pathname;
    const a = (assets as Record<string, { type: string; body: string }>)[path];
    if (!a) return new Response("Not found", { status: 404 });
    if (request.method !== "GET" && request.method !== "HEAD")
      return new Response("Method not allowed", { status: 405 });
    const bytes = Uint8Array.from(atob(a.body), (c) => c.charCodeAt(0));
    return new Response(request.method === "HEAD" ? null : bytes, {
      headers: {
        "content-type": a.type,
        "cache-control": path.startsWith("/assets/")
          ? "public,max-age=31536000,immutable"
          : "no-cache",
      },
    });
  },
};
