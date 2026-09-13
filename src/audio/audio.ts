import { GameEvent } from "../core/events";
export class AudioEngine {
  context: AudioContext | null = null;
  master: GainNode | null = null;
  roll: GainNode | null = null;
  grind: GainNode | null = null;
  filter: BiquadFilterNode | null = null;
  enabled = true;
  async start() {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0.32;
      this.master.connect(this.context.destination);
      const buffer = this.context.createBuffer(
        1,
        this.context.sampleRate * 2,
        this.context.sampleRate,
      );
      const samples = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++)
        samples[i] = (Math.random() * 2 - 1) * 0.6;
      const noise = this.context.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      this.filter = this.context.createBiquadFilter();
      this.filter.type = "lowpass";
      this.filter.frequency.value = 500;
      this.roll = this.context.createGain();
      this.roll.gain.value = 0;
      noise.connect(this.filter).connect(this.roll).connect(this.master);
      const high = this.context.createBiquadFilter();
      high.type = "bandpass";
      high.frequency.value = 1800;
      high.Q.value = 0.8;
      this.grind = this.context.createGain();
      this.grind.gain.value = 0;
      noise.connect(high).connect(this.grind).connect(this.master);
      noise.start();
    }
    if (this.context.state === "suspended") await this.context.resume();
  }
  update(speed: number, grounded: boolean, grinding: boolean, paused: boolean) {
    if (
      !this.context ||
      !this.roll ||
      !this.grind ||
      !this.master ||
      !this.filter
    )
      return;
    const t = this.context.currentTime;
    this.master.gain.setTargetAtTime(
      this.enabled && !paused ? 0.32 : 0,
      t,
      0.05,
    );
    this.roll.gain.setTargetAtTime(
      grounded ? Math.min(0.18, speed * 0.012) : 0,
      t,
      0.09,
    );
    this.filter.frequency.setTargetAtTime(250 + speed * 60, t, 0.12);
    this.grind.gain.setTargetAtTime(grinding ? 0.22 : 0, t, 0.06);
  }
  event(e: GameEvent) {
    if (!this.context || !this.master) return;
    let f = 0,
      g = 0.13,
      d = 0.08;
    if (e.type === "pop") {
      f = 180;
      d = 0.065;
    }
    if (e.type === "push") {
      f = 100;
      g = 0.055;
    }
    if (e.type === "landing") {
      f = e.quality === "clean" ? 120 : 68;
      g = 0.16;
      d = e.quality === "clean" ? 0.12 : 0.22;
    }
    if (e.type === "bail") {
      f = 48;
      g = 0.25;
      d = 0.35;
    }
    if (e.type === "railImpact" && !e.bail) {
      f = 75;
      g = 0.14;
      d = 0.13;
    }
    if (e.type === "pump") {
      f = 260;
      g = 0.035;
    }
    if (!f) return;
    const o = this.context.createOscillator(),
      a = this.context.createGain(),
      t = this.context.currentTime;
    o.type = "triangle";
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(25, f * 0.25), t + d);
    a.gain.setValueAtTime(g, t);
    a.gain.exponentialRampToValueAtTime(0.001, t + d);
    o.connect(a).connect(this.master);
    o.start(t);
    o.stop(t + d + 0.02);
    o.onended = () => {
      o.disconnect();
      a.disconnect();
    };
  }
}
