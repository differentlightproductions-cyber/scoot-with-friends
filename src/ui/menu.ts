import { version } from '../../package.json';
import * as THREE from "three";
import { MAPS, type MapId } from "../data/maps";
import { RIDERS } from "../data/riders";
import { CLOTHING, OUTFIT_SLOTS, clothing, type OutfitSlot } from '../data/outfits';
import {
  CATEGORIES,
  PARTS,
  selectedPart,
  type Category,
  type ScooterLoadout,
} from "../data/scooterParts";
import { saveProfile, type LocalProfile } from "../data/loadout";
import { RiderModel } from "../scooter/model";
import type { InputFrame } from "../input/input";
export class GameMenu {
  screen = "home";
  category: Category = "deck";
  product = "";
  outfitSlot:OutfitSlot='head';
  index = 0;
  private cooldown = 0;
  previewScene = new THREE.Scene();
  previewCamera = new THREE.PerspectiveCamera(
    38,
    innerWidth / innerHeight,
    0.01,
    100,
  );
  previewRider: RiderModel;
  orbit = 0.55;
  zoom = 3.7;
  zoomTarget = 3.7;
  focus = new THREE.Vector3(0, 0.52, 0);
  focusTarget = new THREE.Vector3(0, 0.52, 0);
  pan = new THREE.Vector3();
  focusBox = new THREE.Box3Helper(new THREE.Box3(), 0xf26c38);
  private focusKey = "";
  private saveFailed = false;
  onRide = (_map: MapId) => {};
  onChange = () => {};
  onEditor = () => {};
  private choices: {
    label: string;
    detail?: string;
    action: () => void;
    selected?: boolean;
  }[] = [];
  constructor(
    public root: HTMLElement,
    public profile: LocalProfile,
  ) {
    this.previewScene.background = new THREE.Color(0xc5cbc1);
    this.previewScene.add(this.focusBox);
    this.focusBox.visible = false;
    let drag: { x: number; y: number; pan: boolean } | null = null;
    window.addEventListener("pointerdown", (e) => {
      if (!this.root.hidden && e.clientX > innerWidth * 0.5) {
        drag = {
          x: e.clientX,
          y: e.clientY,
          pan: e.button === 2 || e.shiftKey,
        };
      }
    });
    window.addEventListener("pointerup", () => {
      drag = null;
    });
    window.addEventListener("pointermove", (e) => {
      if (!drag || this.root.hidden) return;
      const dx = e.clientX - drag.x,
        dy = e.clientY - drag.y;
      if (drag.pan) {
        this.pan.x -= dx * 0.003;
        this.pan.y += dy * 0.003;
      } else this.orbit -= dx * 0.008;
      drag.x = e.clientX;
      drag.y = e.clientY;
    });
    window.addEventListener("contextmenu", (e) => {
      if (!this.root.hidden && e.clientX > innerWidth * 0.5) e.preventDefault();
    });
    window.addEventListener(
      "wheel",
      (e) => {
        if (this.root.hidden) return;
        this.zoomTarget = THREE.MathUtils.clamp(
          this.zoomTarget + e.deltaY * 0.003,
          0.8,
          7,
        );
      },
      { passive: true },
    );
    this.previewScene.add(new THREE.HemisphereLight(0xffffff, 0x6b7970, 2.4));
    const light = new THREE.DirectionalLight(0xffefdc, 3);
    light.position.set(-3, 5, 4);
    this.previewScene.add(light);
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(5, 48),
      new THREE.MeshStandardMaterial({ color: 0xb6beb2, roughness: 1 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.01;
    this.previewScene.add(floor);
    this.previewRider = new RiderModel(this.previewScene);
    this.previewRider.applyProfile(profile);
    this.show("home");
  }
  show(screen: string) {
    this.screen = screen;
    this.index = 0;
    this.cooldown = 0.18;
    this.render();
  }
  private changed() {
    this.saveFailed = !saveProfile(this.profile);
    this.previewRider.applyProfile(this.profile);
    this.onChange();
  }
  private selected(category: Category) {
    return this.profile.scooter[
      category === "wheels" ? "frontWheel" : category
    ];
  }
  private render() {
    const add = (
      label: string,
      action: () => void,
      detail?: string,
      selected = false,
    ) => this.choices.push({ label, action, detail, selected });
    this.choices = [];
    let title = "FIND YOUR FLOW.",
      subtitle = "YOUR NEXT SESSION STARTS HERE";
    switch (this.screen) {
      case "home":
        add("RIDE", () => this.show("maps"), "Choose a park");
        add(
          "RIDER",
          () => this.show("rider"),
          RIDERS.find((r) => r.id === this.profile.riderId)?.name,
        );
        add(
          "SCOOTER",
          () => this.show("scooter"),
          "Scoot with Friends / Your custom build",
        );
        add("SETTINGS", () => this.show("settings"));
        add(
          "PARK EDITOR — TESTING",
          () => this.onEditor(),
          "Local beta: build and save your own lines",
        );
        add("TRICK BOOK", () => this.show("tricks"), "Every trick and its input");
        break;
      case "tricks":
        title = "TRICK BOOK";
        subtitle = "READ THE MOVEMENT, THEN MAKE IT YOURS";
        add("BUNNY HOP / TUCK", () => {}, "RS fully down to crouch, then return it 90% up to pop. A neutral release stands up; holding a tuck reduces drag at speed and helps on downhills.");
        add("TAILWHIP / BARSPIN", () => {}, "Pro: stance whip button / B. Arcade: B whip / X bars. Tap once or hold for continuous rotations.");
        add("HEEL / FINGER WHIP", () => {}, "LT + whip = heelwhip. RT + whip = fingerwhip. LT + RT + whip = opposite fingerwhip.");
        add("BRI / INWARD BRI", () => {}, "Circle RS all the way around. Direction chooses Bri or inward. Load RS down before the circle for a bigger takeoff.");
        add("KICKLESS / REWIND", () => {}, "During a caught whip window, tap LB/RB to rewind. Hold either bumper briefly to turn the caught whip into a kickless.");
        add("SPINS / FAKIE", () => {}, "Use LS while airborne to spin and shift your weight. Land rolling backward to enter fakie; hold it to build score.");
        add("GRINDS / MANUALS", () => {}, "RT asks for a rail catch. LB + RS up/down starts a nose manual/manual; keep RS balanced.");
        add("BODY TRICKS", () => {}, "Y in air = no-hander. RT + Y tuck, LT + Y deck grab, both = superman. Bumpers + Y add can-can, one-foot, or no-foot.");
        add("WALKING / RECOVERY", () => {}, "Y dismounts or mounts. LS walks, LS click runs while carrying the scooter, A climbs, B sits at a bench. After a bail, press A to get up.");
        add("ON-FOOT SOCIAL", () => {}, "Hold D-pad Left and choose with LS, release to emote. Hold D-pad Right for local chat. Enter sends; Esc/B cancels. No multiplayer connection yet.");
        add("COPING STALL", () => {}, "Hold LT while riding into spine coping to brake into a stall. Shift with LS left/right, then lean forward or back to drop in.");
        break;
      case "maps":
        title = "MAP SELECT";
        subtitle = "TWO PARKS. YOUR LINE.";
        for (const map of MAPS)
          add(map.name, () => this.onRide(map.id), map.type);
        break;
      case "rider":
        title = "RIDER";
        subtitle = "SAME PHYSICS. YOUR STYLE.";
        for(const slot of OUTFIT_SLOTS)add(slot.toUpperCase(),()=>{this.outfitSlot=slot;this.show('clothing');},clothing(this.profile.outfit,slot).name);
        for (const rider of RIDERS)
          add(
            rider.name,
            () => {
              this.profile.riderId = rider.id;
              this.profile.outfitId = rider.outfitId;
              this.changed();
              this.render();
            },
            rider.description,
            this.profile.riderId === rider.id,
          );
        break;
      case "clothing":
        title=this.outfitSlot.toUpperCase();subtitle='AUTHORED GEAR / ALL UNLOCKED';
        for(const item of CLOTHING.filter(p=>p.category===this.outfitSlot))add(item.name,()=>{
          this.profile.outfit[this.outfitSlot]=item.id;this.changed();this.render();
        },'Included',this.profile.outfit[this.outfitSlot]===item.id);
        break;
      case "scooter":
        title = "SCOOTER";
        subtitle = "SCOOT WITH FRIENDS / BUILT PART BY PART";
        for (const category of CATEGORIES)
          add(
            category.toUpperCase(),
            () => {
              this.category = category;
              this.show("parts");
            },
            selectedPart(this.selected(category)).part.name,
          );
        break;
      case "parts":
        title = this.category.toUpperCase();
        subtitle = "CHOOSE A PRODUCT / ALL UNLOCKED";
        for (const part of PARTS.filter((p) => p.category === this.category))
          add(
            part.name,
            () => {
              this.product = part.id;
              this.show("variants");
            },
            part.variants.length + " authored colorways",
            part.id === this.selected(this.category).partId,
          );
        break;
      case "variants": {
        const part = PARTS.find((p) => p.id === this.product)!;
        title = part.name;
        subtitle =
          this.category === "wheels"
            ? "APPLY TO BOTH WHEELS"
            : "CHOOSE AN AUTHORED COLORWAY";
        for (const variant of part.variants)
          add(
            variant.name,
            () => {
              const selection = { partId: part.id, variantId: variant.id };
              if (this.category === "wheels") {
                this.profile.scooter.frontWheel = { ...selection };
                this.profile.scooter.rearWheel = { ...selection };
              } else
                this.profile.scooter[this.category as keyof ScooterLoadout] =
                  selection;
              this.changed();
              this.render();
            },
            "Included",
            this.selected(this.category).partId === part.id &&
              this.selected(this.category).variantId === variant.id,
          );
        break;
      }
      case "settings":
        add(
          "CONTROLS " +
            (this.profile.settings.controlStyle === "pro"
              ? "PRO / ADVANCED"
              : "ARCADE"),
          () => {
            this.profile.settings.controlStyle =
              this.profile.settings.controlStyle === "pro" ? "arcade" : "pro";
            this.changed();
            this.show("settings");
          },
        );
        add("STANCE " + this.profile.settings.stance.toUpperCase(), () => {
          this.profile.settings.stance =
            this.profile.settings.stance === "regular" ? "goofy" : "regular";
          this.changed();
          this.render();
        });
        title = "SETTINGS";
        subtitle = "KEEP THE SESSION FEELING RIGHT";
        add("SOUND " + (this.profile.settings.sound ? "ON" : "OFF"), () => {
          this.profile.settings.sound = !this.profile.settings.sound;
          this.changed();
          this.render();
        });
        add(
          "GRIND ASSIST " + (this.profile.settings.grindAssist ? "ON" : "OFF"),
          () => {
            this.profile.settings.grindAssist =
              !this.profile.settings.grindAssist;
            this.changed();
            this.render();
          },
        );
        break;
    }
    if (this.screen !== "home")
      add(
        this.screen === "scooter" || this.screen === "rider"
          ? "SAVE & BACK"
          : "BACK",
        () => this.back(),
      );
    this.root.innerHTML = `<section class="game-menu"><div class="eyebrow">${subtitle}</div><h1>${title}</h1><nav>${this.choices.map((c, i) => `<button ${this.screen === "home" && i === 0 ? 'id="ride"' : ""} data-menu-index="${i}" class="${i === this.index ? "selected " : ""}${c.selected ? "chosen" : ""}"><span>${c.label}</span>${c.selected ? "<b>✓</b>" : ""}${c.detail ? `<small>${c.detail}</small>` : ""}</button>`).join("")}</nav><p class="menu-save-note">${this.saveFailed ? "Changes apply now; local saving is unavailable." : "Selections save on this device."}</p><p class="menu-controls">D-PAD / LS SELECT · A CONFIRM · B BACK<br>RS ROTATE / ZOOM · LB+RS PAN · DRAG / WHEEL · KEYBOARD W/S, ENTER, ESC</p><div id="connection"></div><small class="build-number">SCOOT WITH FRIENDS · ALPHA ${version}</small></section>${this.screen === "maps" ? `<aside class="map-preview"><img src="${MAPS[Math.min(this.index, MAPS.length - 1)].preview}" alt="Park preview"><div class="eyebrow" id="map-type"></div><h2 id="map-name"></h2><p id="map-description"></p></aside>` : ""}`;
    this.root
      .querySelectorAll<HTMLButtonElement>("[data-menu-index]")
      .forEach((button, i) => {
        button.onclick = () => {
          this.index = i;
          this.select();
        };
        button.onpointerenter = () => {
          this.index = i;
          this.highlight();
        };
      });
    this.highlight();
  }
  private highlight() {
    const category =
      this.screen === "scooter"
        ? CATEGORIES[Math.min(this.index, CATEGORIES.length - 1)]
        : this.category;
    const active = ["scooter", "parts", "variants"].includes(this.screen);
    const key = active ? category : "";
    if (key !== this.focusKey) {
      this.focusKey = key;
      this.pan.set(0, 0, 0);
      this.zoomTarget = active ? 2.2 : 3.7;
    }
    this.focusBox.visible = active;
    if (active) {
      const bounds = new THREE.Box3();
      this.previewRider.root.updateMatrixWorld(true);
      this.previewRider.scooter.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          const selected = PARTS.some(
            (p) => p.id === o.userData.part && p.category === category,
          );
          const material = o.material as THREE.MeshStandardMaterial;
          if (material.emissive) {
            material.emissive.set(selected ? 0xb95619 : 0);
            material.emissiveIntensity = selected ? 0.25 : 0;
          }
          if (selected) bounds.expandByObject(o);
        }
      });
      if (!bounds.isEmpty()) {
        this.focusBox.box.copy(bounds).expandByScalar(0.025);
        bounds.getCenter(this.focusTarget);
      } else this.focusBox.visible = false;
    } else this.focusTarget.set(0, 0.83, 0);
    this.root
      .querySelectorAll("[data-menu-index]")
      .forEach((el, i) => el.classList.toggle("selected", i === this.index));
    if (this.screen === "maps") {
      const map = MAPS[Math.min(this.index, MAPS.length - 1)];
      (this.root.querySelector(".map-preview img") as HTMLImageElement).src =
        map.preview;
      this.root.querySelector("#map-type")!.textContent = map.type;
      this.root.querySelector("#map-name")!.textContent = map.name;
      this.root.querySelector("#map-description")!.textContent =
        map.description;
    }
    this.root
      .querySelectorAll("[data-menu-index]")
      [this.index]?.scrollIntoView({ block: "nearest" });
  }
  select() {
    this.choices[this.index]?.action();
  }
  back() {
    this.show(
      this.screen === 'clothing' ? 'rider' : this.screen === "variants"
        ? "parts"
        : this.screen === "parts"
          ? "scooter"
          : "home",
    );
  }
  update(input: InputFrame, dt: number) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    const direction =
      input.held.marker > 0.5
        ? -1
        : input.held.menuDown > 0.5
          ? 1
          : Math.abs(input.lean) > 0.5
            ? Math.sign(input.lean)
            : 0;
    if (direction && this.cooldown === 0) {
      this.index =
        (this.index + direction + this.choices.length) % this.choices.length;
      this.cooldown = 0.2;
      this.highlight();
    } else if (!direction) this.cooldown = 0;
    if (input.pressed.hop) this.select();
    else if (input.pressed.brakeBars || input.pressed.pause) this.back();
    this.focus.lerp(this.focusTarget, 1 - Math.exp(-8 * dt));
    this.zoom += (this.zoomTarget - this.zoom) * (1 - Math.exp(-7 * dt));
    if (input.held.leftModifier > 0.5) {
      this.pan.x += input.rx * dt;
      this.pan.y -= input.ry * dt;
      return;
    }
    this.orbit -= input.rx * dt * 1.8;
    this.zoom = THREE.MathUtils.clamp(this.zoom + input.ry * dt * 1.5, 0.8, 7);
    if (Math.abs(input.ry) > 0.05) this.zoomTarget = this.zoom;
  }
  preview(renderer: THREE.WebGLRenderer) {
    const scooter = ["scooter", "parts", "variants"].includes(this.screen);
    this.previewRider.rider.visible = !scooter;
    const center = this.focus
        .clone()
        .add(this.pan)
        .add(new THREE.Vector3(-0.5, 0, 0)),
      distance = this.zoom * (scooter ? 0.66 : 1);
    this.previewCamera.aspect = innerWidth / innerHeight;
    this.previewCamera.position.set(
      this.focus.x + this.pan.x + Math.sin(this.orbit) * distance,
      this.focus.y + this.pan.y + distance * 0.35,
      this.focus.z + this.pan.z + Math.cos(this.orbit) * distance,
    );
    this.previewCamera.lookAt(center);
    this.previewCamera.updateProjectionMatrix();
    renderer.render(this.previewScene, this.previewCamera);
  }
}
