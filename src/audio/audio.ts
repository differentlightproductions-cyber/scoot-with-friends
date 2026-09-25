import { GameEvent } from "../core/events";
/** Mixer levels, 0..1 (#71). Music is mixed by the music player, under the same master. */
export interface Volumes { master: number; effects: number; ui: number; ambience: number }
export type UiSound = "move" | "select" | "back" | "tab";
/** The running engine, so menus, the phone and reward screens can use the UI bus. */
let active: AudioEngine | null = null;
/** A short UI click on the UI bus (menus, phone, tabs); silent before the first user gesture. */
export function uiSound(kind: UiSound) { active?.uiClick(kind); }
/** The UI bus for reward jingles and the like: they follow the UI and master levels. */
export function uiBus(): { context: AudioContext; node: AudioNode } | null {
  return active?.context && active.ui ? { context: active.context, node: active.ui } : null;
}
export class AudioEngine {
  context: AudioContext | null = null;
  /**
   * The world's sound effects (rolling, grinding, landings, thunder...). The
   * mix: effects and ambience pass the under-water muffle; UI does not; all
   * three meet at the master level, then the speakers.
   */
  master: GainNode | null = null;
  /** Birds, rain, wind: the park around you. */
  ambience: GainNode | null = null;
  /** Clicks, jingles, notifications. */
  ui: GainNode | null = null;
  private out: GainNode | null = null;
  volumes: Volumes = { master: 1, effects: 1, ui: 0.7, ambience: 1 };
  /** Decoded samples by URL (birds and other recorded sounds). */
  private samples = new Map<string, Promise<AudioBuffer | null>>();
  roll: GainNode | null = null;
  grind: GainNode | null = null;
  water:GainNode|null=null;
  /** Rain on the ground: a soft high hiss, set by weather(). */
  private rain:GainNode|null=null;
  private noiseBuffer:AudioBuffer|null=null;
  private muffle:BiquadFilterNode|null=null;private underwater=false;
  /** Head under water: the world goes dull and far away (#62). */
  setUnderwater(on:boolean){this.underwater=on;if(this.context&&this.muffle)this.muffle.frequency.setTargetAtTime(on?520:20000,this.context.currentTime,.06);}
  filter: BiquadFilterNode | null = null;
  private nextFootstep = 0;
  enabled = true;
  async start() {
    if (!this.context) {
      this.context = new AudioContext();
      active = this;
      this.out = this.context.createGain();
      this.out.gain.value = this.enabled ? this.volumes.master : 0;
      this.out.connect(this.context.destination);
      this.master = this.context.createGain();
      this.master.gain.value = 0.32 * this.volumes.effects;
      this.ambience = this.context.createGain();
      this.ambience.gain.value = this.volumes.ambience;
      this.ui = this.context.createGain();
      this.ui.gain.value = this.volumes.ui;
      this.ui.connect(this.out);
      // The world passes one low-pass on its way out: wide open, closing to a muffle with the head under water (#62).
      this.muffle = this.context.createBiquadFilter();
      this.muffle.type = "lowpass";
      this.muffle.frequency.value = 20000;
      this.master.connect(this.muffle);
      this.ambience.connect(this.muffle);
      this.muffle.connect(this.out);
      this.muffle.frequency.value = this.underwater ? 520 : 20000;
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
      this.rain=this.context.createGain();this.rain.gain.value=0;noise.connect(rainFilter).connect(rainSoft).connect(this.rain).connect(this.ambience);
      this.noiseBuffer=buffer;
      noise.start();
    }
    if (this.context.state === "suspended") await this.context.resume();
  }
  /** New mixer levels (0..1); they apply at once. */
  setVolumes(v: Volumes) {
    this.volumes = { ...v };
    if (!this.context || !this.out || !this.ui) return;
    const t = this.context.currentTime;
    this.out.gain.setTargetAtTime(this.enabled ? v.master : 0, t, 0.03);
    this.ui.gain.setTargetAtTime(v.ui, t, 0.03);
  }
  /** The ears: where the camera is and which way it faces, for sounds placed in the world. */
  setListener(position: { x: number; y: number; z: number }, forward: { x: number; y: number; z: number }, up: { x: number; y: number; z: number }) {
    const l = this.context?.listener;
    if (!l) return;
    if (l.positionX) {
      const t = this.context!.currentTime;
      l.positionX.setTargetAtTime(position.x, t, 0.02); l.positionY.setTargetAtTime(position.y, t, 0.02); l.positionZ.setTargetAtTime(position.z, t, 0.02);
      l.forwardX.setTargetAtTime(forward.x, t, 0.02); l.forwardY.setTargetAtTime(forward.y, t, 0.02); l.forwardZ.setTargetAtTime(forward.z, t, 0.02);
      l.upX.setTargetAtTime(up.x, t, 0.02); l.upY.setTargetAtTime(up.y, t, 0.02); l.upZ.setTargetAtTime(up.z, t, 0.02);
    } else {
      l.setPosition(position.x, position.y, position.z);
      l.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
    }
  }
  /** A recorded sound, fetched and decoded once. Null until audio has started, or if it fails to load. */
  sample(url: string): Promise<AudioBuffer | null> {
    const c = this.context;
    if (!c) return Promise.resolve(null);
    let p = this.samples.get(url);
    if (!p) {
      p = fetch(url).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status))).then((b) => c.decodeAudioData(b)).catch(() => null);
      this.samples.set(url, p);
    }
    return p;
  }
  /**
   * A recorded sound placed in the world on the ambience bus: it is quieter
   * with distance (full within `near` metres, fading to nothing by `far`) and
   * comes from its side. `rate` shifts pitch a little so repeats never match.
   */
  playAt(buffer: AudioBuffer, at: { x: number; y: number; z: number }, gain = 1, rate = 1, near = 4, far = 70) {
    const c = this.context;
    if (!c || !this.ambience || !this.enabled) return null;
    const src = c.createBufferSource(), panner = c.createPanner(), g = c.createGain();
    src.buffer = buffer; src.playbackRate.value = rate;
    panner.panningModel = "HRTF"; panner.distanceModel = "linear";
    panner.refDistance = near; panner.maxDistance = far; panner.rolloffFactor = 1;
    if (panner.positionX) { panner.positionX.value = at.x; panner.positionY.value = at.y; panner.positionZ.value = at.z; }
    else panner.setPosition(at.x, at.y, at.z);
    g.gain.value = gain;
    src.connect(g).connect(panner).connect(this.ambience);
    src.start();
    src.onended = () => { src.disconnect(); g.disconnect(); panner.disconnect(); };
    return { panner, stop: () => { try { src.stop(); } catch { /* already stopped */ } } };
  }
  /** Menu and phone clicks: short, soft and dry, on the UI bus. */
  uiClick(kind: UiSound) {
    const c = this.context, out = this.ui;
    if (!c || !out || !this.enabled || c.state !== "running") return;
    const t = c.currentTime;
    const blip = (from: number, to: number, at: number, length: number, gain: number, type: OscillatorType = "triangle") => {
      const o = c.createOscillator(), a = c.createGain();
      o.type = type; o.frequency.setValueAtTime(from, t + at); o.frequency.exponentialRampToValueAtTime(to, t + at + length);
      a.gain.setValueAtTime(0.0001, t + at); a.gain.exponentialRampToValueAtTime(gain, t + at + 0.004); a.gain.exponentialRampToValueAtTime(0.0001, t + at + length);
      o.connect(a).connect(out); o.start(t + at); o.stop(t + at + length + 0.02);
      o.onended = () => { o.disconnect(); a.disconnect(); };
    };
    if (kind === "move") blip(2300, 1900, 0, 0.028, 0.05, "sine");
    else if (kind === "tab") { blip(1500, 1300, 0, 0.035, 0.06); blip(2100, 1900, 0.03, 0.03, 0.04, "sine"); }
    else if (kind === "select") { blip(880, 1320, 0, 0.05, 0.09); blip(1760, 2100, 0.045, 0.06, 0.05, "sine"); }
    else blip(760, 420, 0, 0.07, 0.07);
  }
  /** How hard it is raining (0..1): the hiss follows it. */
  weather(rain:number){
    if(!this.context||!this.rain)return;
    this.rain.gain.setTargetAtTime(rain*.2,this.context.currentTime,.5);
  }
  /** The last thunder shape, so the next one always sounds different. */
  private lastThunder=-1;
  /**
   * Thunder `delay` seconds from now, from a strike `km` away (#63). No two are
   * alike: each is built fresh from random pieces, and its kind follows the
   * distance. A near strike tears and cracks before its boom; a mid one booms
   * and rolls in peals; a far one is only a low rumble that swells and fades.
   * Strength 0..1.
   */
  thunder(delay:number,strength:number,km=3){
    if(!this.context||!this.master||!this.noiseBuffer||!this.enabled)return;
    const c=this.context,t0=c.currentTime+delay,r=Math.random;
    // Shapes: close crack-boom, crack and long roll, one heavy boom, rolling peals, low grumble, distant rumble.
    const SHAPES=[{crack:1,cutoff:1300,peaks:2,length:6,attack:.01},{crack:.7,cutoff:1000,peaks:4,length:8,attack:.02},{crack:0,cutoff:750,peaks:2,length:6,attack:.05},{crack:0,cutoff:500,peaks:5,length:9,attack:.15},{crack:0,cutoff:300,peaks:3,length:10,attack:.5},{crack:0,cutoff:200,peaks:6,length:12,attack:.9}];
    const near=km<2?[0,1]:km<5?[1,2,3]:[3,4,5];
    let pick=near[Math.floor(r()*near.length)];
    if(pick===this.lastThunder)pick=near[(near.indexOf(pick)+1)%near.length];
    this.lastThunder=pick;
    const shape=SHAPES[pick],length=shape.length*(.8+r()*.45),cut=shape.cutoff*(.8+r()*.4),peak=1.1*strength;
    // The body: low-passed noise, played a little faster or slower each time for its own timbre.
    const src=c.createBufferSource(),low=c.createBiquadFilter(),gain=c.createGain();
    src.buffer=this.noiseBuffer;src.loop=true;src.playbackRate.value=.75+r()*.5;
    low.type='lowpass';low.Q.value=.5+r()*.6;low.frequency.setValueAtTime(cut,t0);low.frequency.exponentialRampToValueAtTime(Math.max(45,cut*.12),t0+length*.7);
    gain.gain.setValueAtTime(.0001,t0);gain.gain.exponentialRampToValueAtTime(peak,t0+shape.attack+.02);
    // Peals: swells at random moments as sound arrives from further along the channel and back off the hills.
    let at=t0+shape.attack+.1;
    for(let i=0;i<shape.peaks;i++){
      at+=(length*.55/shape.peaks)*(.5+r());
      const level=peak*(.25+r()*.6)*(1-(i/(shape.peaks+1))*.6);
      gain.gain.linearRampToValueAtTime(level*.55,at-.04-r()*.08);gain.gain.linearRampToValueAtTime(level,at);
    }
    gain.gain.exponentialRampToValueAtTime(.0008,t0+length);
    src.connect(low).connect(gain).connect(this.master);src.start(t0,r()*1.9);src.stop(t0+length+.1);
    // A near strike first tears the air: a quick run of bright clicks, then the crack.
    if(shape.crack>0){
      const hs=c.createBufferSource(),high=c.createBiquadFilter(),hg=c.createGain();
      hs.buffer=this.noiseBuffer;hs.loop=true;hs.playbackRate.value=.9+r()*.3;
      high.type='highpass';high.frequency.value=1400+r()*1800;
      const loud=strength*shape.crack;let tt=t0;
      hg.gain.setValueAtTime(.0001,t0);
      for(let i=0,n=5+Math.floor(r()*8);i<n;i++){tt+=.016+r()*.03;hg.gain.linearRampToValueAtTime(loud*(.3+r()*.5),tt);hg.gain.exponentialRampToValueAtTime(.002,tt+.012);}
      hg.gain.linearRampToValueAtTime(loud*1.2,tt+.03);hg.gain.exponentialRampToValueAtTime(.0005,tt+.35+r()*.3);
      hs.connect(high).connect(hg).connect(this.master);hs.start(t0,r()*1.9);hs.stop(tt+.8);
    }
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
      this.enabled && !paused ? 0.32 * this.volumes.effects : 0,
      t,
      0.05,
    );
    this.ambience?.gain.setTargetAtTime(this.enabled && !paused ? this.volumes.ambience : 0, t, 0.08);
    this.out?.gain.setTargetAtTime(this.enabled ? this.volumes.master : 0, t, 0.05);
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
    if(e.type==='worldInteraction'&&e.interaction==='bin'){f=190;g=.09;d=.16;}
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
  /**
   * Vending machine sounds (#88), placed at the machine: a keypad blip, the
   * reader's approval beep, the declined buzz, the coil motor, the product
   * landing in the bin and the flap. All synthesised.
   */
  vend(kind: "key" | "error" | "approved" | "declined" | "motor" | "drop" | "flap", at: { x: number; y: number; z: number }) {
    const c = this.context, out = this.ambience ?? this.master;
    if (!c || !out || !this.enabled) return;
    const t0 = c.currentTime, panner = c.createPanner();
    panner.panningModel = "HRTF"; panner.distanceModel = "inverse"; panner.refDistance = 1.5; panner.maxDistance = 40;
    if (panner.positionX) { panner.positionX.value = at.x; panner.positionY.value = at.y; panner.positionZ.value = at.z; } else panner.setPosition(at.x, at.y, at.z);
    panner.connect(out);
    let end = 0;
    const tone = (type: OscillatorType, from: number, to: number, at: number, length: number, gain: number) => {
      const o = c.createOscillator(), a = c.createGain(), t = t0 + at;
      o.type = type; o.frequency.setValueAtTime(from, t); o.frequency.exponentialRampToValueAtTime(Math.max(30, to), t + length);
      a.gain.setValueAtTime(0.0001, t); a.gain.exponentialRampToValueAtTime(gain, t + 0.006); a.gain.setValueAtTime(gain, t + length * 0.8); a.gain.exponentialRampToValueAtTime(0.0001, t + length);
      o.connect(a).connect(panner); o.start(t); o.stop(t + length + 0.03);
      o.onended = () => { o.disconnect(); a.disconnect(); };
      end = Math.max(end, at + length);
    };
    const noise = (at: number, length: number, gain: number, freq: number, type: BiquadFilterType = "lowpass") => {
      const buffer = c.createBuffer(1, Math.ceil(c.sampleRate * length), c.sampleRate), data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 3);
      const src = c.createBufferSource(), filter = c.createBiquadFilter(), a = c.createGain();
      src.buffer = buffer; filter.type = type; filter.frequency.value = freq; a.gain.value = gain;
      src.connect(filter).connect(a).connect(panner); src.start(t0 + at);
      src.onended = () => { src.disconnect(); filter.disconnect(); a.disconnect(); };
      end = Math.max(end, at + length);
    };
    if (kind === "key") tone("square", 1180, 1180, 0, 0.06, 0.05);
    else if (kind === "error") { tone("square", 330, 330, 0, 0.12, 0.05); tone("square", 330, 330, 0.16, 0.12, 0.05); }
    // One clean beep as the reader takes the payment.
    else if (kind === "approved") { tone("sine", 1850, 1850, 0, 0.2, 0.22); tone("sine", 3700, 3700, 0, 0.2, 0.03); }
    else if (kind === "declined") { tone("square", 440, 415, 0, 0.16, 0.08); tone("square", 330, 311, 0.2, 0.3, 0.08); }
    // The coil motor turning once: a low whirr and a gear chatter.
    else if (kind === "motor") { tone("sawtooth", 85, 95, 0, 1.1, 0.05); noise(0, 1.1, 0.12, 900, "bandpass"); }
    else if (kind === "drop") { noise(0, 0.16, 0.9, 420); tone("sine", 140, 55, 0, 0.14, 0.35); }
    else { noise(0, 0.05, 0.4, 2400, "bandpass"); noise(0.18, 0.08, 0.5, 700); }
    setTimeout(() => panner.disconnect(), (end + 0.3) * 1000);
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
