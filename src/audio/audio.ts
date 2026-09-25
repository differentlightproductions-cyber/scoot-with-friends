import { GameEvent } from "../core/events";
export class AudioEngine {
  context: AudioContext | null = null;
  master: GainNode | null = null;
  roll: GainNode | null = null;
  grind: GainNode | null = null;
  water:GainNode|null=null;
  /** Rain on the ground: a soft high hiss, set by weather(). */
  private rain:GainNode|null=null;
  private noiseBuffer:AudioBuffer|null=null;
  filter: BiquadFilterNode | null = null;
  private nextFootstep = 0;
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
      const splashFilter=this.context.createBiquadFilter();splashFilter.type='bandpass';splashFilter.frequency.value=2400;splashFilter.Q.value=.4;this.water=this.context.createGain();this.water.gain.value=0;noise.connect(splashFilter).connect(this.water).connect(this.master);
      const rainFilter=this.context.createBiquadFilter();rainFilter.type='highpass';rainFilter.frequency.value=1400;const rainSoft=this.context.createBiquadFilter();rainSoft.type='lowpass';rainSoft.frequency.value=7000;
      this.rain=this.context.createGain();this.rain.gain.value=0;noise.connect(rainFilter).connect(rainSoft).connect(this.rain).connect(this.master);
      this.noiseBuffer=buffer;
      noise.start();
    }
    if (this.context.state === "suspended") await this.context.resume();
  }
  /** How hard it is raining (0..1): the hiss follows it. */
  weather(rain:number){
    if(!this.context||!this.rain)return;
    this.rain.gain.setTargetAtTime(rain*.2,this.context.currentTime,.5);
  }
  /**
   * Thunder `delay` seconds from now: a crack for a near strike, then a low
   * rumble that rolls and fades over several seconds. Strength 0..1.
   */
  thunder(delay:number,strength:number){
    if(!this.context||!this.master||!this.noiseBuffer||!this.enabled)return;
    const c=this.context,t=c.currentTime+delay,src=c.createBufferSource(),low=c.createBiquadFilter(),gain=c.createGain(),length=4+strength*2.5;
    src.buffer=this.noiseBuffer;src.loop=true;
    low.type='lowpass';low.Q.value=.7;low.frequency.setValueAtTime(260+900*strength*strength,t);low.frequency.exponentialRampToValueAtTime(70,t+length*.6);
    gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(1.1*strength,t+.05);gain.gain.exponentialRampToValueAtTime(.4*strength,t+.6);
    // The roll: a few swells as the sound comes back off distant cloud and hills.
    for(let i=1;i<4;i++){const at=t+.6+i*length/5;gain.gain.linearRampToValueAtTime((.45-.08*i)*strength*(.7+Math.random()*.6),at);}
    gain.gain.exponentialRampToValueAtTime(.001,t+length);
    src.connect(low).connect(gain).connect(this.master);src.start(t,Math.random()*1.5);src.stop(t+length+.1);
  }
  update(
    speed: number,
    grounded: boolean,
    grinding: boolean,
    paused: boolean,
    walking = false,
    running = false,
    fountain=false,
  ) {
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
      grounded && !walking ? Math.min(0.18, speed * 0.012) : 0,
      t,
      0.09,
    );
    this.filter.frequency.setTargetAtTime(250 + speed * 60, t, 0.12);
    this.grind.gain.setTargetAtTime(grinding ? 0.22 : 0, t, 0.06);
    this.water?.gain.setTargetAtTime(fountain&&!paused?.10:0,t,.045);
    if (
      this.enabled &&
      !paused &&
      walking &&
      grounded &&
      speed > 0.45 &&
      t >= this.nextFootstep
    ) {
      this.footstep(running);
      this.nextFootstep = t + (running ? 0.27 : 0.42);
    }
    if (!walking) this.nextFootstep = 0;
  }
  private footstep(running: boolean) {
    if (!this.context || !this.master) return;
    const t = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(running ? 112 : 84, t);
    oscillator.frequency.exponentialRampToValueAtTime(38, t + 0.07);
    gain.gain.setValueAtTime(running ? 0.065 : 0.045, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(t);
    oscillator.stop(t + 0.1);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  }
  event(e: GameEvent) {
    if (!this.context || !this.master) return;
    if (e.type === "splash") {
      const buffer=this.context.createBuffer(1,this.context.sampleRate*.65,this.context.sampleRate);
      const data=buffer.getChannelData(0);
      for(let i=0;i<data.length;i++) data[i]=(Math.random()*2-1)*Math.pow(1-i/data.length,2)*.7;
      const source=this.context.createBufferSource(), filter=this.context.createBiquadFilter();
      source.buffer=buffer; filter.type="lowpass";filter.frequency.value=1200;
      source.connect(filter).connect(this.master);source.start(); return;
    }
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
      // GOOD is a successful landing and must not get the rough-landing cue;
      // only SKETCHY sounds like one.
      const rough = e.quality === "sketchy";
      f = rough ? 68 : e.quality === "clean" ? 120 : 104;
      g = 0.16;
      d = rough ? 0.22 : e.quality === "clean" ? 0.12 : 0.15;
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
    if(e.type==='worldInteraction'&&e.interaction==='open'){f=1300;g=.08;d=.075;}
    if(e.type==='worldInteraction'&&e.interaction==='vend'){f=340;g=.045;d=.12;}
    if(e.type==='worldInteraction'&&e.interaction==='novelty'){this.novelty(e.item);return;}
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
  /** Novelty items (#55): a squeak, a kazoo tune, a whoosh, a pop, bubbles. All synthesised. */
  novelty(kind: string) {
    const c = this.context;
    const out = this.master;
    if (!c || !out || !this.enabled) return;
    const t0 = c.currentTime;
    const tone = (type: OscillatorType, from: number, to: number, at: number, length: number, gain: number, vibrato = 0) => {
      const o = c.createOscillator(), a = c.createGain(), t = t0 + at;
      o.type = type; o.frequency.setValueAtTime(from, t); o.frequency.exponentialRampToValueAtTime(Math.max(30, to), t + length);
      if (vibrato) { const v = c.createOscillator(), vg = c.createGain(); v.frequency.value = 6.5; vg.gain.value = vibrato; v.connect(vg).connect(o.frequency); v.start(t); v.stop(t + length + 0.02); }
      a.gain.setValueAtTime(0.0001, t); a.gain.exponentialRampToValueAtTime(gain, t + 0.015); a.gain.exponentialRampToValueAtTime(0.0001, t + length);
      o.connect(a).connect(out); o.start(t); o.stop(t + length + 0.03);
      o.onended = () => { o.disconnect(); a.disconnect(); };
    };
    const noise = (at: number, length: number, gain: number, freq: number) => {
      const buffer = c.createBuffer(1, Math.ceil(c.sampleRate * length), c.sampleRate), data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      const src = c.createBufferSource(), filter = c.createBiquadFilter(), a = c.createGain();
      src.buffer = buffer; filter.type = "bandpass"; filter.frequency.value = freq; filter.Q.value = 0.8; a.gain.value = gain;
      src.connect(filter).connect(a).connect(out); src.start(t0 + at);
      src.onended = () => { src.disconnect(); filter.disconnect(); a.disconnect(); };
    };
    if (kind === "Rubber Duck") { tone("square", 820, 1500, 0, 0.11, 0.05); tone("square", 900, 1650, 0.16, 0.13, 0.05); }
    else if (kind === "Kazoo") { [392, 392, 440, 392, 523, 494].forEach((f, i) => tone("sawtooth", f, f * 1.01, i * 0.2, 0.19, 0.045, 7)); }
    else if (kind === "Foam Finger") { noise(0, 0.35, 0.18, 700); }
    else if (kind === "Party Popper") { noise(0, 0.12, 0.6, 1800); [1760, 2093, 2637].forEach((f, i) => tone("triangle", f, f * 1.2, 0.08 + i * 0.06, 0.18, 0.03)); }
    else if (kind === "Bubble Wand") { for (let i = 0; i < 6; i++) { const f = 520 + Math.random() * 480; tone("sine", f, f * 1.7, 0.2 + i * 0.28 + Math.random() * 0.1, 0.09, 0.05); } }
  }
}
