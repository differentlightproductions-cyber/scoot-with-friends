import { wrap } from "../core/config";
export class StickGesture {
  samples: { x: number; y: number; t: number }[] = [];
  clock = 0;
  candidate = "";
  confidence = 0;
  consumed = false;
  upFlick=false;
  private lastY=0;
  private upStart=-1;
  clear() { this.reset(); this.lastY=0; this.upStart=-1; }
  reset() {
    this.samples = [];
    this.candidate = "";
    this.confidence = 0;
    this.consumed = false;
    this.upFlick=false;
  }
  step(
    dt: number,
    x: number,
    y: number,
  ): { kind: "bri" | "kickless"; direction: number; short?:boolean } | null {
    this.clock += dt;
    this.upFlick=false;
    if(y<this.lastY-.015 && this.lastY>-.45 && this.upStart<0)this.upStart=this.clock;
    if(y<-.65&&this.lastY>=-.65){this.upFlick=this.upStart>=0&&this.clock-this.upStart<.19;this.upStart=-1;}
    if(y>.0)this.upStart=-1;
    this.lastY=y;
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
    // A down-to-up stroke can cross the deadzone between two device polls.
    // Polar angle alone falsely calls that half a circle; require lateral travel.
    const lateral = this.samples.some(p => Math.abs(p.x) > 0.5);
    this.confidence = lateral ? Math.min(1, Math.abs(arc) / 4.7) : 0;
    this.candidate = lateral && path > 1 ? "Sweep" : "";
    const first=this.samples[0],last=this.samples.at(-1);
    if(!this.consumed&&first&&last&&first.y>.65&&Math.abs(first.x)<.35&&Math.abs(x)>.65&&Math.abs(y)<.4&&
      this.samples.some(p=>p.y>.3&&p.x*x>.25)&&this.clock-last.t<.2){
      this.consumed=true;this.candidate=x<0?'Bri scoop':'Inward scoop';
      return {kind:'bri',direction:x<0?1:-1,short:true};
    }
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
