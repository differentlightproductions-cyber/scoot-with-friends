import { presetName, ridingButtons } from "../input/riding";
import { Simulation } from "../physics/simulation";
import { Input, InputFrame } from "../input/input";
import { Events } from "../core/events";
import { TUNE } from "../core/config";
import { OUTDOOR, SPAWNS } from "../park/park";
import type { TrickRecord } from "../tricks/resolver";
export class HUD {
  /** Replaces the riding hint while the phone is out. */
  phoneHint = '';
  started = false;
  paused = false;
  menuIndex = 0;
  private navHeld = false;
  private sideHeld = false;
  /** Column within a button row (the Now Playing controls): 0 previous, 1 play/pause, 2 next. */
  private rowIndex = 1;
  lineAge = 10;
  feedbackAge = 10;
  lineEnded = false;
  /** The running line (#42): its points so far, and a note when it banks. */
  private linePoints = 0;
  private lineTricks = 0;
  private bankedAge = 10;
  private displayKey = "";
  private attempt!:HTMLElement;
  private attemptAge = 0;
  onStart = () => {};
  onReset = (restart = false) => {};
  root: HTMLElement;
  constructor(public events: Events) {
    document.querySelector("#app")!.innerHTML = `
      <header><div class="location">${OUTDOOR ? "VETERANS MEMORIAL PARK" : "WAREHOUSE <b>01</b>"}<span id="score">SESH 0 / LINE 0</span></div></header>
      <div id="start" class="overlay"><div class="start-copy"><div class="eyebrow">AN INDOOR FREESTYLE SESH</div><h1>FIND<br>YOUR<br><i>FLOW.</i></h1><p>One scooter. An empty park.<br>Make your next line a little better.</p><button id="ride" class="primary">A <span>RIDE</span> ↗</button><div id="connection">Connect a controller · or press Enter</div><small>SCOOT WITH FRIENDS</small></div></div>
      <div id="trick-line" aria-live="polite"><div id="line-label">CURRENT LINE</div><div id="line-text"></div><div id="line-meter" hidden><span class="lm-count"></span><span class="lm-points"></span><i class="lm-timer"><b></b></i></div><div id="line-status"></div></div>
      <div id="feedback"></div>
      <div id="balance" hidden><span id="balance-title">MANUAL</span><div class="balance-track"><span class="balance-center"></span><u id="balance-command"></u><i id="balance-dot"></i></div><small>RIGHT STICK / BALANCE</small></div>
      <footer><div id="hint">A PUSH &nbsp; / &nbsp; RS DOWN HOLD / RELEASE TO HOP</div><div class="footer-right"><span id="pad-status">CONTROLLER NOT DETECTED</span><span>H CONTROLS &nbsp; · &nbsp; MENU PAUSE</span></div></footer>
      <aside id="help" hidden></aside>
      <div id="pause" class="overlay" hidden><section class="pause-sheet"><div class="eyebrow">TAKE A BREATH</div><h2>SESH<br>PAUSED.</h2><div class="np-player" aria-label="Now playing"><div class="np-meta"><span class="np-label">NOW PLAYING</span><strong class="np-title">Nothing playing</strong><small class="np-artist"></small><u class="np-bar"><s></s></u></div><div class="np-controls"><button data-action="music-prev" data-row="music-toggle" aria-label="Previous track">⏮</button><button data-action="music-toggle" data-row="music-toggle" aria-label="Play">▶</button><button data-action="music-next" data-row="music-toggle" aria-label="Next track">⏭</button></div></div><button data-action="resume">Resume <span>↗</span></button><button data-action="capture-replay">Capture Replay</button><button data-action="replays">Replays</button><button data-action="marker" disabled>Return to Marker <small id="marker-availability">NOT SET</small></button><button data-action="reset">Reset Rider</button><button data-action="restart">Restart Sesh</button><label for="spawn">PRACTICE START</label><select id="spawn">${SPAWNS.map((s, i) => `<option value="${i}">${s.name}</option>`).join("")}</select><button data-action="spot">Move to practice start</button><button data-action="hillstart" hidden>Return to Hill Start</button><button data-action="map">Maps</button><button data-action="shops">Shops</button><button data-action="rides">Rides</button><button data-action="rider">Rider</button><button data-action="music">Music</button><button data-action="settings">Settings</button><button data-action="online">Private Free-ride</button><button data-action="exit">Exit to Main Menu</button><button data-action="sound">Sound: <b id="sound">ON</b></button><p>Left Stick selects · A confirms · B resumes<br>H opens the control guide</p></section></div>
      <pre id="debug" hidden></pre><div id="loading">BUILDING THE PARK…</div>`;
    this.root = document.querySelector("#app")!;
    this.attempt = document.querySelector("#line-text")!;
    document
      .querySelector("#ride")!
      .addEventListener("click", () => this.start());
    events.on((e) => {
      if (e.type === "landing")
        this.feedback(
          // One grade per landing, in the existing integrated readout. CLEAN was
          // the old name for the top grade and now reads PERFECT.
          e.quality === "clean"
            ? "PERFECT"
            : e.quality === "good"
              ? "GOOD"
              : e.quality === "sketchy"
                ? "SKETCHY / STAY WITH IT"
                : "BAIL",
          e.quality === "sketchy" ? "warn" : "",
        );
      if (e.type === "bail") {
        this.feedback(`${e.reason.toUpperCase()} / PRESS A TO GET UP`, "warn");
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
      // A line of two or more tricks that runs out its 3 s banks with a note.
      if (e.type === "line" && e.ended && this.lineTricks >= 2 && this.linePoints > 0) {
        document.querySelector("#line-status")!.textContent = `LINE BANKED · ${this.lineTricks} TRICKS · +${this.linePoints.toLocaleString()}`;
        this.bankedAge = 0;
      }
      if (e.type === "pump") this.feedback("PUMP");
      if (e.type === "fastplant" && e.phase === "armed") this.feedback("FASTPLANT ARMED");
      else if (e.type === "fastplant" && e.phase === "missed") this.feedback("NO PLANT / ROUGH LANDING", "warn");
      if (e.type === "swim" && e.trick) this.feedback(e.trick.clean ? `${e.trick.name.toUpperCase()}${e.phase === "enter" ? " / SPLASH" : " / STUCK IT"}` : `${e.trick.name.toUpperCase()} / OUCH`, e.trick.clean ? "" : "warn");
      else if (e.type === "swim" && e.phase === "enter") this.feedback(e.fromRide ? "SPLASH / YOUR RIDE WAITS AT THE EDGE" : "SPLASH");
      if (e.type === "railImpact" && !e.bail)
        this.feedback("RAIL CLIP / RIDE IT OUT", "warn");
      if (e.type === "grindCatch")
        this.feedback(`${e.name.toUpperCase()} / ON RAIL`);

      if (e.type === "reset") {
        this.attempt.textContent = "";
        this.attemptAge = 0;
        this.displayKey = "";
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
    const all = Array.from(
      document.querySelectorAll<HTMLButtonElement>("[data-action]"),
    ).filter((b) => !b.disabled && !b.hidden);
    // A row of buttons (data-row names its lead) is one stop going up and down;
    // left and right move along it.
    const buttons = all.filter((b) => !b.dataset.row || b.dataset.row === b.dataset.action);
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
    const lead = buttons[this.menuIndex];
    let target = lead;
    if (lead?.dataset.row) {
      const row = all.filter((b) => b.dataset.row === lead.dataset.row);
      if (side && !this.sideHeld) this.rowIndex = Math.max(0, Math.min(row.length - 1, this.rowIndex + side));
      target = row[this.rowIndex] ?? lead;
    } else this.rowIndex = 1;
    this.sideHeld = !!side;
    all.forEach((b) => b.classList.toggle("selected", b === target));
    if (input.pressed.hop) target?.click();
    if (input.pressed.brakeBars) this.setPaused(false);
  }
  update(
    s: Simulation,
    input: Input,
    dt: number,
    fps: number,
    drawCalls: number,
  ) {
    s.score.observe(s.tricks.attempt);
    const view=s.score.display;
    const key=view?view.id+'/'+view.status+'/'+view.name+'/'+view.points:'';
    if(key!==this.displayKey){
      this.displayKey=key;this.attempt.className=view?.status==='failed'?'shatter':'';
      this.attempt.replaceChildren();
      if(view){
        const name=document.createElement('strong');name.textContent=view.name.toUpperCase();
        const points=document.createElement('div');points.className='attempt-points';points.textContent=view.points.toLocaleString()+' × '+view.multiplier.toFixed(2);
        if(view.status==='failed')for(const word of (name.textContent+' '+points.textContent).split(' ').slice(0,20)){const fragment=document.createElement('span');fragment.textContent=word+' ';fragment.style.setProperty('--i',String(this.attempt.childElementCount%7));this.attempt.append(fragment);}
        else this.attempt.append(name,points);
      }
    }
    this.bankedAge+=dt;
    if(this.bankedAge>2)document.querySelector('#line-status')!.textContent=view?view.status==='pending'?'PENDING':view.status==='landed'?'LANDED · BANKED':'ATTEMPT LOST':'';
    // The line meter: tricks and points in this line, its multiplier, and the
    // 3 s the next trick has to land in to keep stacking (grinds, manuals and
    // air keep it open).
    const tricks=s.tricks.line.length,meter=document.querySelector('#line-meter') as HTMLElement;
    meter.hidden=tricks===0;
    if(tricks){
      this.lineTricks=tricks;this.linePoints=s.score.line;
      meter.querySelector('.lm-count')!.textContent=`LINE ×${s.score.multiplier.toFixed(2)} · ${tricks} TRICK${tricks>1?'S':''}`;
      meter.querySelector('.lm-points')!.textContent=s.score.line.toLocaleString();
      const left=Math.max(0,1-s.tricks.ordinary/TUNE.comboTimeout);
      (meter.querySelector('.lm-timer b') as HTMLElement).style.transform=`scaleX(${left.toFixed(3)})`;
      meter.classList.toggle('closing',left<.34);
    }
    (
      document.querySelector('[data-action="marker"]') as HTMLButtonElement
    ).disabled = !s.marker.saved;
    document.querySelector("#marker-availability")!.textContent = s.marker.saved
      ? "READY"
      : "NOT SET";
    this.lineAge += dt;
    if (s.tricks.fakieRecord) this.lineAge = 0;
    document.querySelector("#score")!.textContent =
      `SESH ${s.score.total.toLocaleString()}`;
    this.feedbackAge += dt;
    // Screens such as the rider creator have no connection line.
    const connection = document.querySelector("#connection");
    if (connection) connection.textContent = input.pad
      ? "Controller connected · Press A to ride"
      : "Connect a controller · Enter or click Ride for keyboard";
    document.querySelector("#pad-status")!.textContent = input.pad
      ? "● CONTROLLER CONNECTED"
      : "○ NO CONTROLLER / KEYBOARD READY";
    (document.querySelector("footer") as HTMLElement).style.opacity = this
      .started
      ? "1"
      : "0";
    const help = document.querySelector("#help") as HTMLElement;
    help.hidden = !input.help;
    const mapping = ridingButtons(s.tricks.stance, s.tricks.controlStyle);
    if (
      help.dataset.stance !== s.tricks.stance ||
      help.dataset.controlStyle !== s.tricks.controlStyle
    ) {
      help.dataset.stance = s.tricks.stance;
      help.dataset.controlStyle = s.tricks.controlStyle;
      help.innerHTML =
        '<div class="eyebrow">' +
        s.tricks.controlStyle.toUpperCase() +
        " / " +
        presetName(s.tricks.stance).toUpperCase() +
        " CONTROLS</div><h2>RIDE / REPEAT</h2><dl>" +
        "<dt>" +
        mapping.pushLabel +
        "</dt><dd>Tap or hold the current Push action to repeat pushes</dd><dt>" +
        mapping.whipLabel +
        "</dt><dd>Tap for a trick takeoff / hold continuous whips in air</dd>" +
        (s.tricks.controlStyle === "arcade"
          ? "<dt>A</dt><dd>Quick hop</dd>"
          : "") +
        "<dt>RS BUNNY HOP / TUCK</dt><dd>Hold RS fully down to crouch, then move it back up at least 90% toward the rider to pop. Letting it return neutral stands you up smoothly. Holding a tuck reduces drag at speed and adds a small downhill gain.</dd>" +
        "<dt>LT + " +
        mapping.whipLabel +
        "</dt><dd>Heelwhip</dd><dt>RT + " +
        mapping.whipLabel +
        "</dt><dd>Fingerwhip; add LT for opposite fingerwhip</dd>" +
        (s.tricks.controlStyle === "arcade"
          ? "<dt>X / RB + X</dt>"
          : "<dt>B / RB + B</dt>") +
        "<dd>Barspin / opposite barspin. Tap once or hold continuous rotations.</dd>" +
        "<dt>LB / RB DURING WHIP</dt><dd>At 65-90%: tap and release to rewind; hold 0.18 seconds for kickless. Repeat at the next catch window.</dd>" +
        "<dt>LB / RB DURING BARSPIN</dt><dd>Rewind only opposite the current spin: LB left / RB right. Whip windows take priority.</dd>" +
        "<dt>RS CIRCULAR SWEEP</dt><dd>Complete a full circular sweep for Bri / Inward Bri from ground or air. Load first for a higher pop; kickless requires an active whip.</dd>" +
        "<dt>LS</dt><dd>Steer on ground; spin and shift weight forward/back in air</dd>" +
        "<dt>Y IN AIR</dt><dd>No-hander. RT + Y: Superman. LT + Y: Deck Grab. LT + LB + Y: Tuck.</dd>" +
        "<dt>RT + RB IN AIR</dt><dd>Clamp Grab: one hand stays on the bar, the stance-side hand holds the clamp for as long as you hold both. Same buttons in both stances. Lets go just before landing.</dd>" +
        "<dt>BUMPERS + Y</dt><dd>LB: Can Can (LS chooses side). RB: One Foot. Both: No Foot. Release poses to land.</dd>" +
        "<dt>LT / RT ON GROUND</dt><dd>Brake / pump. LT near spine coping requests a stall. RT in air requests a grind.</dd>" +
        "<dt>GENTLE RS UP / DOWN</dt><dd>Nose manual / manual at 20–50% RS. Neutral settles the wheel. Deep RS down then up pops out.</dd>" +
        "<dt>Y ON GROUND</dt><dd>Walk / mount. On foot A jumps or climbs, B sits near benches; LS click runs carrying scooter.</dd>" +
        "<dt>Y NEAR QUARTER COPING</dt><dd>Set up drop-in; LS forward commits, back rebalances, B cancels.</dd><dt>SPINE STALL</dt><dd>Hold LT while grounded at spine coping to brake into a stall. Use LS left/right to adjust, then lean LS forward or back to drop in.</dd>" +
        "<dt>BAIL</dt><dd>Press A after the fall to get up. Double-tap A to skip the crash.</dd>" +
        "<dt>HOLD D-PAD DOWN: PHONE</dt><dd>Music, emotes, rides, rider, map, items, build and messages. LS moves, A opens, B back, Y home; hold D-pad Down again to put it away.</dd><dt>ON FOOT: HOLD D-PAD RIGHT</dt><dd>Chat; Enter sends, Esc/B cancels. Messages appear above your head.</dd><dt>D-PAD UP / VIEW / MENU</dt><dd>Tap marker return, hold to set / reset rider / pause</dd><dt>RS CLICK</dt><dd>Recenter camera; RS orbits while walking</dd></dl>" +
        "<p>KEYBOARD: Space = A, X = X, B = B, Y = Y. Arrows = RS (Down hold/release pops). A/D and W/S = LS. Shift = LB, E = RB, Ctrl = LT, C = RT. F run, M marker, V recenter, R reset, Esc pause. F3 diagnostics. H closes.</p>" +
        "<p>Separate caught rotations form sequences. Grind assist helps contact without fixing your entry angle. Lean prepares landing; full flips are not enabled.</p>";
    }
    const line = document.querySelector("#trick-line") as HTMLElement;
    line.style.opacity=this.started&&view&&(view.status==='pending'||view.age<(view.status==='failed'?1.1:4))?'1':'0';
    (document.querySelector("#feedback") as HTMLElement).style.opacity =
      this.started && this.feedbackAge < 1.7 ? "1" : "0";
    const balance = document.querySelector("#balance") as HTMLElement;
    balance.hidden = !s.manual.active;
    document.querySelector("#balance-title")!.textContent = s.manual.nose
      ? "NOSE MANUAL"
      : "MANUAL";
    // The main indicator is the simulated balance and nothing else. The small
    // notch shows where the stick is driving it, so the player can read their
    // own correction without the indicator faking a response the rider has not
    // made yet. Both come from the same simulation state on the same frame.
    const span = TUNE.manualLoopLimit - TUNE.manualDropLimit;
    const track = (v: number) =>
      `${Math.max(0, Math.min(100, ((v - TUNE.manualDropLimit) / span) * 100))}%`;
    (document.querySelector("#balance-dot") as HTMLElement).style.bottom = track(
      s.manual.balance,
    );
    (document.querySelector("#balance-command") as HTMLElement).style.bottom =
      track(s.manual.balance + s.manual.command * 0.25);
    const hints: Record<string, string> = {
      Walking: s.swim
        ? "LS SWIM / HOLD A STROKE HARDER / SWIM TO A LADDER OR THE BANK TO CLIMB OUT"
        : s.footAir && !s.grounded
          ? "LT+RT + LS FLIP / LB RB TWIST / X TUCK / B SWAN · LET GO TO OPEN UP"
          : s.running
            ? "A JUMP / CLIMB / LS CLICK WALK / Y MOUNT"
            : "LS WALK / A JUMP / B SIT NEAR BENCH / Y MOUNT",
      Sitting: "B STAND / A JUMP / Y MOUNT",
      DropInReady: "LS FORWARD TO COMMIT / BACK TO REBALANCE / B CANCEL",
      DropInCommit: "LEAN INTO THE TRANSITION",
      Airborne: `LS ROTATE / ${mapping.whipLabel} WHIP / B BARSPIN / RT CATCH RAIL`,
      Manual: "RIGHT STICK BALANCE  /  RS DOWN HOLD / RELEASE TO HOP OUT",
      NoseManual: "RIGHT STICK BALANCE  /  RS DOWN HOLD / RELEASE TO HOP OUT",
      Grinding: "RS DOWN HOLD / RELEASE TO HOP OUT  /  RS LEAN",
      Bail: s.crash?.canRecover?'A / SPACE: GET UP · Or stay and rest':'FALLING ? DOUBLE-TAP A / SPACE TO SKIP',
      Preloading: "FLICK RS UP TO POP / SIDE SCOOP TO TRICK",
      SketchyLanding: "EASE THE STEERING  /  RIDE IT OUT",
    };
    document.querySelector("#hint")!.textContent = this.phoneHint ||
      (hints[s.state] ??
      `${mapping.pushLabel} PUSH / RS DOWN → UP: POP / LT BRAKE / Y WALK`);
    const debug = document.querySelector("#debug") as HTMLElement;
    debug.hidden = !input.debug;
    if (input.debug)
      debug.textContent = `SCOOT WITH FRIENDS / DIAGNOSTICS\nFPS ${fps.toFixed(0)}  DRAWS ${drawCalls}\n${JSON.stringify(s.snapshot(), null, 2)}\nGAMEPAD ${input.pad?.id ?? "none"}\nGRIND ASSIST ${s.grindAssist}`;
  }
}
