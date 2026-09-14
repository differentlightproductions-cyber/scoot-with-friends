import { clamp } from "../core/config";
export const MAP = {
  hop: { button: 0, key: "Space" },
  pushDeck: { button: 2, key: "KeyX" },
  brakeBars: { button: 1, key: "KeyB" },
  body: { button: 3, key: "KeyY" },
  leftModifier: { button: 4, key: "ShiftLeft" },
  rightModifier: { button: 5, key: "KeyE" },
  brake: { button: 6, key: "ControlLeft" },
  pumpGrind: { button: 7, key: "KeyC" },
  reset: { button: 8, key: "KeyR" },
  pause: { button: 9, key: "Escape" },
  sprint: { button: 10, key: "KeyF" },
  marker: { button: 12, key: "KeyM" },
  menuDown: { button: 13, key: "PageDown" },
  menuLeft: { button: 14, key: "Home" },
  menuRight: { button: 15, key: "End" },
  recenter: { button: 11, key: "KeyV" },
} as const;
export type Action = keyof typeof MAP;
export interface InputFrame {
  steer: number;
  lean: number;
  rx: number;
  ry: number;
  held: Record<Action, number>;
  pressed: Record<Action, boolean>;
  released: Record<Action, boolean>;
}
export function emptyInput(): InputFrame {
  const held = {} as InputFrame["held"],
    pressed = {} as InputFrame["pressed"],
    released = {} as InputFrame["released"];
  for (const k of Object.keys(MAP) as Action[]) {
    held[k] = 0;
    pressed[k] = false;
    released[k] = false;
  }
  return { steer: 0, lean: 0, rx: 0, ry: 0, held, pressed, released };
}
const dead = (v: number) =>
  Math.abs(v) < 0.15 ? 0 : (Math.sign(v) * (Math.abs(v) - 0.15)) / 0.85;
export class Input {
  keys = new Set<string>();
  previous = emptyInput();
  pad: Gamepad | null = null;
  unsupported=false;
  private blocked=new Set<Action>();private axesBlocked=false;private padIndex=-1;private activePads=new Set<number>();
  debug = false;
  help = false;
  private pendingPressed = new Set<Action>();
  private pendingReleased = new Set<Action>();
  constructor() {
    window.addEventListener("keydown", (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (
        ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
          e.code,
        )
      )
        e.preventDefault();
      this.keys.add(e.code);
      if (!e.repeat)
        for (const [a, m] of Object.entries(MAP))
          if (m.key === e.code) this.pendingPressed.add(a as Action);
      if (!e.repeat && e.code === "F3") {
        e.preventDefault();
        this.debug = !this.debug;
      }
      if (!e.repeat && e.code === "KeyH") this.help = !this.help;
    });
    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.code);
      for (const [a, m] of Object.entries(MAP))
        if (m.key === e.code) this.pendingReleased.add(a as Action);
    });
    window.addEventListener("blur", () => this.clear());
  }
  clear() {
    for(const a of Object.keys(MAP) as Action[])if(this.previous.held[a]>.15)this.blocked.add(a);
    this.axesBlocked=true;
    this.keys.clear();
    this.previous = emptyInput();
    this.pendingPressed.clear();
    this.pendingReleased.clear();
  }
  poll() {
    const pads=Array.from(navigator.getGamepads?.()??[]).filter((p):p is Gamepad=>!!p?.connected);
    this.unsupported=pads.length>0&&!pads.some(p=>p.mapping==='standard');
    const usable=pads.filter(p=>p.mapping==='standard');
    const pressed=usable.filter(p=>p.buttons.some(b=>b.pressed));
    this.pad=pressed.find(p=>!this.activePads.has(p.index)&&p.index!==this.padIndex)??usable.find(p=>p.index===this.padIndex)??usable[0]??null;this.activePads=new Set(pressed.map(p=>p.index));
    if((this.pad?.index??-1)!==this.padIndex){this.clear();this.padIndex=this.pad?.index??-1;for(const [a,m]of Object.entries(MAP))if((this.pad?.buttons[m.button]?.value??0)>.15)this.blocked.add(a as Action);}
    const f = emptyInput();
    if(this.axesBlocked&&(!this.pad||this.pad.axes.slice(0,4).every(v=>Math.abs(v)<.2)))this.axesBlocked=false;
    const axis = (i: number) => this.axesBlocked?0:dead(this.pad?.axes[i] ?? 0);
    f.steer = clamp(
      axis(0) + Number(this.keys.has("KeyD")) - Number(this.keys.has("KeyA")),
      -1,
      1,
    );
    f.lean = clamp(
      axis(1) + Number(this.keys.has("KeyS")) - Number(this.keys.has("KeyW")),
      -1,
      1,
    );
    f.rx = clamp(
      axis(2) +
        Number(this.keys.has("ArrowRight")) -
        Number(this.keys.has("ArrowLeft")),
      -1,
      1,
    );
    f.ry = clamp(
      axis(3) +
        Number(this.keys.has("ArrowDown")) -
        Number(this.keys.has("ArrowUp")),
      -1,
      1,
    );
    for (const [key, m] of Object.entries(MAP)) {
      const a = key as Action;
      f.held[a] = Math.max(
        this.pad?.buttons[m.button]?.value ?? 0,
        Number(this.keys.has(m.key)),
      );
      if(this.blocked.has(a)){if(f.held[a]<.15)this.blocked.delete(a);f.held[a]=0;this.pendingPressed.delete(a);this.pendingReleased.delete(a);}
      if (f.held[a] > 0.5 && this.previous.held[a] <= 0.5)
        this.pendingPressed.add(a);
      if (f.held[a] <= 0.5 && this.previous.held[a] > 0.5)
        this.pendingReleased.add(a);
    }
    this.previous = f;
    return f;
  }
  consume(): InputFrame {
    const f = {
      ...this.previous,
      pressed: { ...this.previous.pressed },
      released: { ...this.previous.released },
    };
    for (const a of this.pendingPressed) f.pressed[a] = true;
    for (const a of this.pendingReleased) f.released[a] = true;
    this.pendingPressed.clear();
    this.pendingReleased.clear();
    return f;
  }
  rumble(strength: number, duration: number) {
    const p = this.pad as
      | (Gamepad & {
          vibrationActuator?: {
            playEffect: (name: string, p: object) => Promise<unknown>;
          };
        })
      | null;
    try {
      p?.vibrationActuator
        ?.playEffect("dual-rumble", {
          duration,
          strongMagnitude: strength * 0.45,
          weakMagnitude: strength,
          startDelay: 0,
        })
        ?.catch(() => {});
    } catch {
      /* Optional hardware support. */
    }
  }
}
