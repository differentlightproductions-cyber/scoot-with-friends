import { wrap } from "../core/config";
export class StickGesture {
  samples: { x: number; y: number; t: number }[] = [];
  clock = 0;
  candidate = "";
  confidence = 0;
  consumed = false;
  reset() {
    this.samples = [];
    this.candidate = "";
    this.confidence = 0;
    this.consumed = false;
  }
  step(
    dt: number,
    x: number,
    y: number,
  ): { kind: "bri" | "kickless"; direction: number } | null {
    this.clock += dt;
    const magnitude = Math.hypot(x, y);
    if (this.samples.length && this.clock - this.samples[0].t > 0.8)
      this.reset();
    if (magnitude > 0.55 && !this.consumed)
      this.samples.push({ x, y, t: this.clock });
    let arc = 0,
      path = 0;
    for (let i = 1; i < this.samples.length; i++) {
      const a = this.samples[i - 1],
        b = this.samples[i];
      arc += wrap(Math.atan2(b.y, b.x) - Math.atan2(a.y, a.x));
      path += Math.hypot(b.x - a.x, b.y - a.y);
    }
    this.confidence = Math.min(1, Math.abs(arc) / 4.7);
    this.candidate = path > 1 ? "Sweep" : "";
    if (!this.consumed && Math.abs(arc) > 4.7 && path > 3.5) {
      this.consumed = true;
      this.candidate = "Bri";
      return { kind: "bri", direction: Math.sign(arc) };
    }
    if (magnitude < 0.25) {
      const first = this.samples[0],
        last = this.samples.at(-1);
      const scoop =
        !this.consumed &&
        first &&
        last &&
        Math.abs(first.x) > 0.65 &&
        first.x * last.x < -0.3 &&
        Math.abs(arc) > 2 &&
        Math.abs(arc) < 4.3 &&
        this.samples.some((p) => p.y > 0.7) &&
        path > 1.8;
      const direction = Math.sign(arc);
      this.reset();
      if (scoop) return { kind: "kickless", direction };
    }
    return null;
  }
}
