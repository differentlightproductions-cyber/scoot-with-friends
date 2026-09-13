import { Simulation } from "../physics/simulation";
import { Input, InputFrame } from "../input/input";
import { Events } from "../core/events";
import { OUTDOOR, SPAWNS } from "../park/park";
import type { TrickRecord } from "../tricks/resolver";
export class HUD {
  started = false;
  paused = false;
  menuIndex = 0;
  private navHeld = false;
  private sideHeld = false;
  lineAge = 10;
  feedbackAge = 10;
  lineEnded = false;
  private pendingResolution: TrickRecord | null = null;
  onStart = () => {};
  onReset = (restart = false) => {};
  root: HTMLElement;
  constructor(public events: Events) {
    document.querySelector("#app")!.innerHTML = `
      <header><div class="wordmark">SCOOT<span>WITH FRIENDS</span></div><div class="location">${OUTDOOR ? "SUNSET PLAZA <b>02</b>" : "WAREHOUSE <b>01</b>"}<span id="score">SESSION 0 / LINE 0</span></div></header>
      <div id="start" class="overlay"><div class="start-copy"><div class="eyebrow">AN INDOOR FREESTYLE SESSION</div><h1>FIND<br>YOUR<br><i>FLOW.</i></h1><p>One scooter. An empty park.<br>Make your next line a little better.</p><button id="ride" class="primary">A <span>RIDE</span> ↗</button><div id="connection">Connect a controller · or press Enter</div><small>SCOOT WITH FRIENDS</small></div></div>
      <div id="trick-line" aria-live="polite"><div id="line-label">CURRENT LINE</div><div id="line-text"></div><div id="line-status"></div></div>
      <div id="feedback"></div>
      <div id="balance" hidden><span id="balance-title">MANUAL</span><div class="balance-track"><span class="balance-center"></span><i id="balance-dot"></i></div><small>RIGHT STICK / BALANCE</small></div>
      <footer><div class="speed"><strong id="speed">00</strong><span>KM/H</span><i id="charge"></i></div><div id="hint">X PUSH &nbsp; / &nbsp; HOLD A, RELEASE TO HOP</div><div class="footer-right"><span id="pad-status">CONTROLLER NOT DETECTED</span><span>H CONTROLS &nbsp; · &nbsp; MENU PAUSE</span></div></footer>
      <aside id="help" hidden><div class="eyebrow">THE CONTROLS</div><h2>RIDE / REPEAT</h2><dl>
      <dt>LEFT STICK</dt><dd>Steer / spin; forward/back shifts air weight</dd><dt>X</dt><dd>Tap to push · tailwhip in air</dd><dt>LB + X</dt><dd>Heelwhip in air</dd><dt>A</dt><dd>Hold to preload · release to hop</dd><dt>B</dt><dd>Tap barspin / hold continuous spin in air</dd><dt>LT</dt><dd>Progressive brake</dd><dt>RT</dt><dd>Compress to pump · hold to grind</dd><dt>RIGHT STICK</dt><dd>Orbit camera · tune trick speed in air</dd><dt>LB + RS ↓ / ↑</dt><dd>Enter manual / nose manual</dd><dt>RS ↑ / ↓</dt><dd>Balance after the entry flick</dd><dt>LS CLICK ON FOOT</dt><dd>Toggle run / carry scooter</dd><dt>Y ON GROUND</dt><dd>Get off / back on / LS to walk</dd><dt>Y / LB+Y / RB+Y IN AIR</dt><dd>No-hander / tuck / one-footer</dd><dt>RS CLICK</dt><dd>Recenter camera</dd><dt>D-PAD UP</dt><dd>Tap return to marker / hold to set</dd><dt>VIEW</dt><dd>Reset rider</dd><dt>MENU</dt><dd>Pause / settings</dd></dl>
      <p>Tap X or B for one rotation; hold to keep spinning, then release to catch. Separate caught spins are named as sequences. Assist helps nearby descending rail entries; RT widens the catch window. Keep your entry angle and steer gently on the rail. Strong LS turns revert a fakie; light turns keep it rolling. Left Stick up/down changes airborne pitch for feeble/smith contact.</p><div class="eyebrow">KEYBOARD FALLBACK</div><p>A/D steer · W/S pitch · X push/whip · B barspin · Space preload/hop · Shift LB · E RB · Ctrl LT · C RT · arrows RS · Y walk/body / F run / M marker · V recenter · R reset · Esc pause · F3 debug.</p><p>ON FOOT: A jumps or climbs a nearby low ledge. Y near quarter coping sets up a drop-in; lean LS forward to commit, pull back to rebalance, or B to cancel.</p><p>ADVANCED: LT/RT + X fingerwhip. During 65–90% of a whip or barspin, press the opposite-direction bumper to rewind (LB left / RB right); repeat with alternating bumpers. RS circular sweep: Bri / Inward Bri. RS lower half-circle then neutral: Kickless. Y + RS up: tuck; down: Superman; left/right: Can Can. RB + Y: One Foot; both bumpers + Y: No Foot. Release poses before landing. Settings selects Regular/Goofy stance; Heelwhip is the opposite whip direction.</p><small>H closes this guide</small></aside>
      <div id="pause" class="overlay" hidden><section class="pause-sheet"><div class="eyebrow">TAKE A BREATH</div><h2>SESSION<br>PAUSED.</h2><button data-action="resume">Resume <span>↗</span></button><button data-action="marker" disabled>Return to Marker <small id="marker-availability">NOT SET</small></button><button data-action="reset">Reset Rider</button><button data-action="assist">Grind Assist: <b id="assist">ON</b></button><button data-action="restart">Restart Session</button><label for="spawn">PRACTICE START</label><select id="spawn">${SPAWNS.map((s, i) => `<option value="${i}">${s.name}</option>`).join("")}</select><button data-action="spot">Move to practice start</button><button data-action="map">Switch to ${OUTDOOR ? "Warehouse 01" : "Sunset Plaza 02"}</button><button data-action="exit">Exit to Main Menu</button><button data-action="sound">Sound: <b id="sound">ON</b></button><p>Left Stick selects · A confirms · B resumes<br>H opens the control guide</p></section></div>
      <pre id="debug" hidden></pre><div id="loading">BUILDING THE PARK…</div>`;
    this.root = document.querySelector("#app")!;
    document
      .querySelector("#ride")!
      .addEventListener("click", () => this.start());
    events.on((e) => {
      if (e.type === "trick" && e.record?.recognized)
        this.pendingResolution = e.record;
      if (e.type === "line") {
        this.lineAge = 0;
        this.lineEnded = e.ended;
        document.querySelector("#line-text")!.innerHTML = e.names
          .slice(-5)
          .map((name, i, names) => {
            const record = this.pendingResolution;
            if (
              record &&
              name === record.name &&
              i === names.length - 1 &&
              !e.ended
            )
              return `<div class="trick combo-resolve"><span class="combo-primitives">${record.components.map((part, j) => `<span class="combo-part" style="--part:${j}">${j ? "+ " : ""}${part.toUpperCase()}</span>`).join("")}</span><span class="combo-result">${name.toUpperCase()}</span></div>`;
            return `<div class="trick ${i ? "linked" : ""}">${i ? "<span>↳</span> " : ""}${name.toUpperCase()}</div>`;
          })
          .join("");
        this.pendingResolution = null;
        document.querySelector("#line-status")!.textContent = e.ended
          ? "LINE COMPLETE"
          : "";
      }
      if (e.type === "landing")
        this.feedback(
          e.quality === "clean"
            ? "CLEAN"
            : e.quality === "sketchy"
              ? "SKETCHY / STAY WITH IT"
              : "BAIL",
          e.quality === "sketchy" ? "warn" : "",
        );
      if (e.type === "bail") {
        this.feedback(`${e.reason.toUpperCase()} / VIEW TO RESET`, "warn");
        document.querySelector("#line-status")!.textContent = "LINE LOST";
        this.lineAge = 0;
        this.lineEnded = true;
      }
      if (e.type === "marker")
        this.feedback(
          e.message +
            (e.message === "SETTING MARKER"
              ? ` ? ${Math.round(e.progress * 100)}%`
              : ""),
        );
      if (e.type === "pump") this.feedback("PUMP");
      if (e.type === "railImpact" && !e.bail)
        this.feedback("RAIL CLIP / RIDE IT OUT", "warn");
      if (e.type === "grindCatch")
        this.feedback(`${e.name.toUpperCase()} / ON RAIL`);
      if (e.type === "dismount")
        this.feedback(
          e.walking ? "ON FOOT / Y TO RIDE" : "BACK ON THE SCOOTER",
        );
      if (e.type === "reset") {
        this.pendingResolution = null;
        this.lineAge = 10;
        this.feedbackAge = 10;
        document.querySelector("#line-text")!.textContent = "";
        document.querySelector("#line-status")!.textContent = "";
      }
    });
  }
  ready() {
    document.querySelector("#loading")!.remove();
  }
  start() {
    if (this.started) return;
    this.started = true;
    document.body.classList.add("riding");
    document.querySelector("#start")!.setAttribute("hidden", "");
    this.onStart();
  }
  setPaused(value: boolean) {
    this.paused = value;
    (document.querySelector("#pause") as HTMLElement).hidden = !value;
    this.navHeld = false;
  }
  feedback(text: string, kind = "") {
    this.feedbackAge = 0;
    const el = document.querySelector("#feedback")!;
    el.textContent = text;
    el.className = kind;
  }
  menu(input: InputFrame) {
    if (!this.paused) return;
    const buttons = Array.from(
      document.querySelectorAll<HTMLButtonElement>("[data-action]"),
    ).filter((b) => !b.disabled);
    const direction =
      input.held.marker > 0.5
        ? -1
        : input.held.menuDown > 0.5
          ? 1
          : Math.abs(input.lean) > 0.5
            ? Math.sign(input.lean)
            : 0;
    if (direction && !this.navHeld) {
      this.menuIndex =
        (this.menuIndex + direction + buttons.length) % buttons.length;
      this.navHeld = true;
    }
    if (!direction) this.navHeld = false;
    this.menuIndex = Math.min(this.menuIndex, buttons.length - 1);
    const side =
      input.held.menuLeft > 0.5
        ? -1
        : input.held.menuRight > 0.5
          ? 1
          : Math.abs(input.steer) > 0.5
            ? Math.sign(input.steer)
            : 0;
    if (
      side &&
      !this.sideHeld &&
      buttons[this.menuIndex]?.dataset.action === "spot"
    ) {
      const spawn = document.querySelector("#spawn") as HTMLSelectElement;
      spawn.selectedIndex =
        (spawn.selectedIndex + side + spawn.options.length) %
        spawn.options.length;
    }
    this.sideHeld = !!side;
    buttons.forEach((b, i) =>
      b.classList.toggle("selected", i === this.menuIndex),
    );
    if (input.pressed.hop) buttons[this.menuIndex]?.click();
    if (input.pressed.brakeBars) this.setPaused(false);
  }
  update(
    s: Simulation,
    input: Input,
    dt: number,
    fps: number,
    drawCalls: number,
  ) {
    (
      document.querySelector('[data-action="marker"]') as HTMLButtonElement
    ).disabled = !s.marker.saved;
    document.querySelector("#marker-availability")!.textContent = s.marker.saved
      ? "READY"
      : "NOT SET";
    this.lineAge += dt;
    if (s.tricks.fakieRecord) this.lineAge = 0;
    document.querySelector("#score")!.textContent =
      `SESSION ${s.score.total.toLocaleString()} / LINE ${s.score.line.toLocaleString()}`;
    document.querySelector("#assist")!.textContent = s.grindAssist
      ? "ON"
      : "OFF";
    if (s.tricks.fakieRecord)
      document.querySelector("#line-status")!.textContent =
        `FAKIE ${s.tricks.fakieDuration.toFixed(1)}s / +30 PER SECOND`;
    else if (!this.lineEnded)
      document.querySelector("#line-status")!.textContent = "";
    this.feedbackAge += dt;
    document.querySelector("#connection")!.textContent = input.pad
      ? "Controller connected · Press A to ride"
      : "Connect a controller · Enter or click Ride for keyboard";
    document.querySelector("#pad-status")!.textContent = input.pad
      ? "● CONTROLLER CONNECTED"
      : "○ NO CONTROLLER / KEYBOARD READY";
    (document.querySelector("footer") as HTMLElement).style.opacity = this
      .started
      ? "1"
      : "0";
    document.querySelector("#speed")!.textContent = Math.round(s.speed * 3.6)
      .toString()
      .padStart(2, "0");
    (document.querySelector("#charge") as HTMLElement).style.transform =
      `scaleX(${s.charge})`;
    const help = document.querySelector("#help") as HTMLElement;
    help.hidden = !input.help;
    const line = document.querySelector("#trick-line") as HTMLElement;
    line.style.opacity =
      this.started &&
      document.querySelector("#line-text")!.textContent &&
      this.lineAge < (this.lineEnded ? 5 : 15)
        ? "1"
        : "0";
    (document.querySelector("#feedback") as HTMLElement).style.opacity =
      this.started && this.feedbackAge < 1.7 ? "1" : "0";
    const balance = document.querySelector("#balance") as HTMLElement;
    balance.hidden = !s.manual.active;
    document.querySelector("#balance-title")!.textContent = s.manual.nose
      ? "NOSE MANUAL"
      : "MANUAL";
    (document.querySelector("#balance-dot") as HTMLElement).style.left =
      `${Math.max(0, Math.min(100, ((s.manual.balance + 0.55) / 1.4) * 100))}%`;
    const hints: Record<string, string> = {
      Walking: s.running
        ? "A JUMP / CLIMB / LS CLICK WALK / Y MOUNT"
        : "LS WALK / A JUMP / LS CLICK RUN / Y MOUNT",
      DropInReady: "LS FORWARD TO COMMIT / BACK TO REBALANCE / B CANCEL",
      DropInCommit: "LEAN INTO THE TRANSITION",
      Airborne: "LS ROTATE  /  X WHIP  /  B BARSPIN  /  RT CATCH RAIL",
      Manual: "RIGHT STICK BALANCE  /  HOLD A, RELEASE TO HOP OUT",
      NoseManual: "RIGHT STICK BALANCE  /  HOLD A, RELEASE TO HOP OUT",
      Grinding: "HOLD A, RELEASE TO HOP OUT  /  RS LEAN",
      Bail: "VIEW / R TO RESET  ·  BACK UP IN A MOMENT",
      Preloading: "RELEASE A TO POP  /  KEEP YOUR SPEED",
      SketchyLanding: "EASE THE STEERING  /  RIDE IT OUT",
    };
    document.querySelector("#hint")!.textContent =
      hints[s.state] ?? "X PUSH / A HOP / LT BRAKE / Y WALK";
    const debug = document.querySelector("#debug") as HTMLElement;
    debug.hidden = !input.debug;
    if (input.debug)
      debug.textContent = `SCOOT WITH FRIENDS / DIAGNOSTICS\nFPS ${fps.toFixed(0)}  DRAWS ${drawCalls}\n${JSON.stringify(s.snapshot(), null, 2)}\nGAMEPAD ${input.pad?.id ?? "none"}\nGRIND ASSIST ${s.grindAssist}`;
  }
}
