/**
 * Recording the game canvas to a video file (replay export, #41, and the phone
 * camera's clips, #77): WebM through MediaRecorder where the browser has it.
 */
export function videoMime() {
  if (typeof MediaRecorder === "undefined") return "";
  // VP8 first: the game is recorded while it runs, and VP8 encodes at a fraction of VP9's cost.
  return ["video/webm;codecs=vp8", "video/webm;codecs=vp9", "video/webm", "video/mp4"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
}
/** Browsers that can record the canvas to a video file. */
export function canRecord(canvas: HTMLCanvasElement) {
  return typeof MediaRecorder !== "undefined" && typeof canvas.captureStream === "function" && !!videoMime();
}
/** The file extension for a recorded video's type. */
export const videoExtension = (type: string) => (type.includes("mp4") ? "mp4" : "webm");
/** A name safe for a downloaded file. */
export const fileName = (name: string, fallback: string) => name.replace(/[^\w\- ]+/g, "").trim() || fallback;
/** Hands a file to the player: a download (the browser's own save), or the share sheet on a phone when a tap asked. */
export async function saveToDevice(blob: Blob, name: string) {
  const file = typeof File === "undefined" ? null : new File([blob], name, { type: blob.type });
  const touch = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
  const tapped = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation?.isActive ?? false;
  if (file && touch && tapped && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return "shared" as const; } catch { /* dismissed: fall back to a download */ }
  }
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return "downloaded" as const;
}
