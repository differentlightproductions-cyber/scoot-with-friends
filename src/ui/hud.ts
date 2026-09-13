import { ridingButtons } from "../input/riding";
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
      <header><div class="wordmark">SCOOT<span>WITH FRIENDS</span></div><div class="location">${OUTDOOR ? "VETERANS MEMORIAL PARK" : "WAREHOUSE <b>01</b>"}<span id="score">SESSION 0 / LINE 0</span></div></header>
      <div id="start" class="overlay"><div class="start-copy"><div class="eyebrow">AN INDOOR FREESTYLE SESSION</div><h1>FIND<br>YOUR<br><i>FLOW.</i></h1><p>One scooter. An empty park.<br>Make your next line a little better.</p><button id="ride" class="primary">A <span>RIDE</span> ↗</button><div id="connection">Connect a controller · or press Enter</div><small>SCOOT WITH FRIENDS</small></div></div>
      <div id="trick-line" aria-live="polite"><div id="line-label">CURRENT LINE</div><div id="line-text"></div><div id="line-status"></div></div>
      <div id="feedback"></div>
      <div id="balance" hidden><span id="balance-title">MANUAL</span><div class="balance-track"><span class="balance-center"></span><i id="balance-dot"></i></div><small>RIGHT STICK / BALANCE</small></div>
      <footer><div class="speed"><strong id="speed">00</strong><span>KM/H</span><i id="charge"></i></div><div id="hint">X PUSH &nbsp; / &nbsp; RS DOWN HOLD / RELEASE TO HOP</div><div class="footer-right"><span id="pad-status">CONTROLLER NOT DETECTED</span><span>H CONTROLS &nbsp; · &nbsp; MENU PAUSE</span></div></footer>
      <aside id="help" hidden></aside>
      <div id="pause" class="overlay" hidden><section class="pause-sheet"><div class="eyebrow">TAKE A BREATH</div><h2>SESSION<br>PAUSED.</h2><button data-action="resume">Resume <span>↗</span></button><button data-action="marker" disabled>Return to Marker <small id="marker-availability">NOT SET</small></button><button data-action="reset">Reset Rider</button><button data-action="assist">Grind Assist: <b id="assist">ON</b></button><button data-action="restart">Restart Session</button><label for="spawn">PRACTICE START</label><select id="spawn">${SPAWNS.map((s, i) => `<option value="${i}">${s.name}</option>`).join("")}</select><button data-action="spot">Move to practice start</button><button data-action="map">Switch to ${OUTDOOR ? "Warehouse 01" : "Veterans Memorial Park"}</button><button data-action="exit">Exit to Main Menu</button><button data-action="sound">Sound: <b id="sound">ON</b></button><p>Left Stick selects · A confirms · B resumes<br>H opens the control guide</p></section></div>
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
    const mapping = ridingButtons(s.tricks.stance);
    if (help.dataset.stance !== s.tricks.stance) {
      help.dataset.stance = s.tricks.stance;
      help.innerHTML =
        '<div class="eyebrow">' +
        s.tricks.stance.toUpperCase() +
        " CONTROLS</div><h2>RIDE / REPEAT</h2><dl>" +
        "<dt>" +
        mapping.pushLabel +
        "</dt><dd>Tap to push on the ground</dd><dt>" +
        mapping.whipLabel +
        "</dt><dd>Tap tailwhip / hold continuous whips in air</dd>" +
        "<dt>RS DOWN / RELEASE</dt><dd>Hold down to crouch and load; release or sweep out to pop. Ramps also launch naturally with speed.</dd>" +
        "<dt>LT + " +
        mapping.whipLabel +
        "</dt><dd>Heelwhip</dd><dt>RT + " +
        mapping.whipLabel +
        "</dt><dd>Fingerwhip; add LT for opposite fingerwhip</dd>" +
        "<dt>B / RB + B</dt><dd>Barspin / opposite barspin. Tap once or hold continuous rotations.</dd>" +
        "<dt>LB / RB DURING WHIP</dt><dd>At 65-90%: tap and release to rewind; hold 0.18 seconds for kickless. Repeat at the next catch window.</dd>" +
        "<dt>LB / RB DURING BARSPIN</dt><dd>Rewind only opposite the current spin: LB left / RB right. Whip windows take priority.</dd>" +
        "<dt>RS CIRCULAR SWEEP</dt><dd>Bri / Inward Bri in air. Pop straight into a sweep; kickless requires an active whip.</dd>" +
        "<dt>LS</dt><dd>Steer on ground; spin and shift weight forward/back in air</dd>" +
        "<dt>Y IN AIR</dt><dd>No-hander. RT + Y: Tuck. LT + Y: Deck Grab. Both triggers + Y: Superman.</dd>" +
        "<dt>BUMPERS + Y</dt><dd>LB: Can Can (LS chooses side). RB: One Foot. Both: No Foot. Release poses to land.</dd>" +
        "<dt>LT / RT ON GROUND</dt><dd>Brake / pump. RT in air requests a grind.</dd>" +
        "<dt>LB + RS UP / DOWN</dt><dd>Nose manual / manual. RS balances. Release LB then hold RS down to load a hop out.</dd>" +
        "<dt>Y ON GROUND</dt><dd>Walk / mount. On foot A jumps or climbs, B sits near benches; LS click runs carrying scooter.</dd>" +
        "<dt>Y NEAR QUARTER COPING</dt><dd>Set up drop-in; LS forward commits, back rebalances, B cancels.</dd>" +
        "<dt>D-PAD UP / VIEW / MENU</dt><dd>Tap marker return, hold to set / reset rider / pause</dd><dt>RS CLICK</dt><dd>Recenter camera; RS orbits while walking</dd></dl>" +
        "<p>KEYBOARD: Space = A, X = X, B = B, Y = Y. Arrows = RS (Down hold/release pops). A/D and W/S = LS. Shift = LB, E = RB, Ctrl = LT, C = RT. F run, M marker, V recenter, R reset, Esc pause. F3 diagnostics. H closes.</p>" +
        "<p>Separate caught rotations form sequences. Grind assist helps contact without fixing your entry angle. Lean prepares landing; full flips are not enabled.</p>";
    }
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
        : "LS WALK / A JUMP / B SIT NEAR BENCH / Y MOUNT",
      Sitting: "B STAND / A JUMP / Y MOUNT",
      DropInReady: "LS FORWARD TO COMMIT / BACK TO REBALANCE / B CANCEL",
      DropInCommit: "LEAN INTO THE TRANSITION",
      Airborne: `LS ROTATE / ${mapping.whipLabel} WHIP / B BARSPIN / RT CATCH RAIL`,
      Manual: "RIGHT STICK BALANCE  /  RS DOWN HOLD / RELEASE TO HOP OUT",
      NoseManual: "RIGHT STICK BALANCE  /  RS DOWN HOLD / RELEASE TO HOP OUT",
      Grinding: "RS DOWN HOLD / RELEASE TO HOP OUT  /  RS LEAN",
      Bail: "VIEW / R TO RESET  ·  BACK UP IN A MOMENT",
      Preloading: "RELEASE RS DOWN TO POP  /  KEEP YOUR SPEED",
      SketchyLanding: "EASE THE STEERING  /  RIDE IT OUT",
    };
    document.querySelector("#hint")!.textContent =
      hints[s.state] ??
      `${mapping.pushLabel} PUSH / RS DOWN HOLD-RELEASE POP / LT BRAKE / Y WALK`;
    const debug = document.querySelector("#debug") as HTMLElement;
    debug.hidden = !input.debug;
    if (input.debug)
      debug.textContent = `SCOOT WITH FRIENDS / DIAGNOSTICS\nFPS ${fps.toFixed(0)}  DRAWS ${drawCalls}\n${JSON.stringify(s.snapshot(), null, 2)}\nGAMEPAD ${input.pad?.id ?? "none"}\nGRIND ASSIST ${s.grindAssist}`;
  }
}
