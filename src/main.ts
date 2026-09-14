import { ParkEditor } from "./editor/editor";
import { buildObject, deformGroundLayers } from "./editor/assets";
import {
  setActiveLayout,
  setEditedHeightQuery,
  validateLayout,
  type ParkLayout,
} from "./editor/layout";
import { buildBaseAssets } from "./editor/base-assets";
import { WaterEffects } from "./park/water";
import "./style.css";
import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { Events } from "./core/events";
import { TUNE } from "./core/config";
import { Input, emptyInput, InputFrame } from "./input/input";
import { OUTDOOR, Park, SPAWNS, selectPark } from "./park/park";
import { Simulation } from "./physics/simulation";
import { RiderModel } from "./scooter/model";
import { ChaseCamera } from "./camera/chase";
import { AudioEngine } from "./audio/audio";
import { HUD } from "./ui/hud";
import { SocialControls } from "./ui/social";
import { GameMenu } from "./ui/menu";
import { loadProfile, saveProfile } from "./data/loadout";
import type { MapId } from "./data/maps";
async function boot() {
  const profile = loadProfile();
  const events = new Events(),
    hud = new HUD(events),
    input = new Input(),
    audio = new AudioEngine();
  await RAPIER.init();
  const scene = new THREE.Scene();
  const waterEffects = new WaterEffects(scene);
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
  document.body.prepend(renderer.domElement);
  renderer.domElement.setAttribute(
    "aria-label",
    "Playable third-person Scoot with Friends game",
  );
  let world = new RAPIER.World({ x: 0, y: -TUNE.gravity, z: 0 });
  world.timestep = TUNE.step;
  let park = new Park(scene, world),
    sim = new Simulation(world, park, events),
    rider = new RiderModel(scene);
  const camera = new ChaseCamera();
  const social = new SocialControls(events);
  rider.applyProfile(profile);
  sim.grindAssist = profile.settings.grindAssist;
  sim.tricks.stance = profile.settings.stance;
  sim.tricks.controlStyle = profile.settings.controlStyle;
  audio.enabled = profile.settings.sound;
  const editor = new ParkEditor(renderer, scene);
  editor.getPark = () => park;
  const menu = new GameMenu(document.querySelector("#start")!, profile);
  menu.onChange = () => {
    rider.applyProfile(profile);
    sim.grindAssist = profile.settings.grindAssist;
    sim.tricks.stance = profile.settings.stance;
    sim.tricks.controlStyle = profile.settings.controlStyle;
    audio.enabled = profile.settings.sound;
    document.querySelector("#sound")!.textContent = audio.enabled
      ? "ON"
      : "OFF";
  };
  document.querySelector("#sound")!.textContent = audio.enabled ? "ON" : "OFF";
  let publicLayout: ParkLayout | null = null;
  async function latestPark() {
    try {
      const response = await fetch("/api/public-park", {
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        const data = await response.json();
        publicLayout = data.layout ? validateLayout(data.layout) : null;
      }
    } catch {
      /* Offline copies retain the playable base park. */
    }
  }
  void latestPark();
  menu.onRide = async (id) => {
    if (id === "outdoor") await latestPark();
    setActiveLayout(id === "outdoor" ? publicLayout : null);
    setEditedHeightQuery(null);
    startSession(id, true);
    if (id === "outdoor" && publicLayout) applyLayout(publicLayout, false);
  };
  menu.onEditor = () => {
    if (
      !editor.history.past.length &&
      !editor.layout.objects.length &&
      publicLayout
    )
      editor.history.layout = validateLayout(publicLayout);
    editor.open();
  };
  function applyLayout(layout: ParkLayout, editing: boolean) {
    deformGroundLayers(park);
    const baseObjects = buildBaseAssets(
      park,
      layout,
      editor.owner || Object.keys(layout.baseEdits).length > 0,
    );
    const objects = layout.objects.map((o) => buildObject(park, o));
    world.step();
    if (Object.keys(layout.baseEdits).length)
      setEditedHeightQuery((x, z) => {
        const ceiling =
          editor.active || sim.resolvingSpawn ? 30 : sim.position.y + 0.8;
        const hit = world.castRay(
          new RAPIER.Ray({ x, y: ceiling, z }, { x: 0, y: -1, z: 0 }),
          40,
          true,
          undefined,
          undefined,
          undefined,
          sim.body,
          (c) => !park.railHandles.has(c.handle),
        );
        return hit ? ceiling - hit.timeOfImpact : -3;
      });
    if (editor.showDebug) {
      const d = world.debugRender();
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(d.vertices, 3));
      g.setAttribute("color", new THREE.BufferAttribute(d.colors, 4));
      const debug = new THREE.LineSegments(
        g,
        new THREE.LineBasicMaterial({
          vertexColors: true,
          depthTest: false,
          transparent: true,
          opacity: 0.65,
        }),
      );
      debug.name = "editor-collisions";
      scene.add(debug);
    }
    if (editing) editor.bind(objects, baseObjects);
  }
  editor.onBuild = (layout) => {
    setEditedHeightQuery(null);
    setActiveLayout(layout);
    startSession("outdoor", true);
    applyLayout(layout, true);
    hud.started = false;
    document.querySelector("#start")!.setAttribute("hidden", "");
    rider.root.visible = false;
  };
  editor.onTest = () => {
    const debug = scene.getObjectByName("editor-collisions");
    if (debug) debug.visible = false;
    rider.root.visible = true;
    hud.start();
    hud.setPaused(false);
    input.clear();
    sim.reset();
    camera.reset();
  };
  editor.onExit = () => {
    setActiveLayout(null);
    setEditedHeightQuery(null);
    startSession("outdoor", true);
    exitToMenu();
  };
  events.on((e) => {
    audio.event(e);
    if (e.type === "splash") waterEffects.splash(e.x, e.z);
    if (e.type === "pop") input.rumble(TUNE.rumble.pop, 45);
    if (e.type === "landing")
      input.rumble(
        e.quality === "clean" ? TUNE.rumble.clean : TUNE.rumble.sketchy,
        e.quality === "clean" ? 75 : 135,
      );
    if (e.type === "bail") input.rumble(TUNE.rumble.bail, 180);
    if (e.type === "railImpact" && !e.bail)
      input.rumble(TUNE.rumble.sketchy, 90);
    if (e.type === "marker" && e.message === "MARKER SET")
      input.rumble(0.15, 55);
    if (
      e.type === "reset" ||
      (e.type === "marker" && e.message === "RETURN TO MARKER")
    )
      camera.reset();
  });
  let startHopBlocked = false;
  hud.onStart = () => {
    startHopBlocked = input.previous.held.hop > 0.5;
    void audio.start();
    input.clear();
  };
  // Some browsers do not treat Gamepad polling as an audio-unlock gesture.
  window.addEventListener("pointerdown", () => {
    if (hud.started) void audio.start();
  });
  window.addEventListener("keydown", () => {
    if (hud.started) void audio.start();
  });
  function startSession(id: MapId, force = false) {
    if (force || (OUTDOOR ? "outdoor" : "warehouse") !== id) {
      sim.score.dispose();
      sim.contactEvents.free();
      world.free();
      const geometries = new Set<THREE.BufferGeometry>(),
        materials = new Set<THREE.Material>();
      scene.remove(editor.helper, editor.highlight);
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
          geometries.add(o.geometry);
          for (const mat of Array.isArray(o.material)
            ? o.material
            : [o.material])
            materials.add(mat);
        }
        if (o instanceof THREE.DirectionalLight) o.shadow.map?.dispose();
      });
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => {
        (m as THREE.MeshBasicMaterial).map?.dispose();
        m.dispose();
      });
      scene.clear();
      selectPark(id);
      world = new RAPIER.World({ x: 0, y: -TUNE.gravity, z: 0 });
      world.timestep = TUNE.step;
      park = new Park(scene, world);
      sim = new Simulation(world, park, events);
      rider = new RiderModel(scene);
    }
    sim.reset(0, true);
    rider.applyProfile(profile);
    sim.grindAssist = profile.settings.grindAssist;
    sim.tricks.stance = profile.settings.stance;
    sim.tricks.controlStyle = profile.settings.controlStyle;
    history.replaceState(
      null,
      "",
      id === "outdoor" ? "?map=outdoor" : location.pathname,
    );
    document.querySelector(".location")!.innerHTML =
      (OUTDOOR ? "VETERANS MEMORIAL PARK" : "WAREHOUSE <b>01</b>") +
      '<span id="score">SESSION 0 / LINE 0</span>';
    document.querySelector("#spawn")!.innerHTML = SPAWNS.map(
      (s, i) => `<option value="${i}">${s.name}</option>`,
    ).join("");
    document.querySelector('[data-action="map"]')!.textContent = OUTDOOR
      ? "Switch to Warehouse 01"
      : "Switch to Veterans Memorial Park";
    hud.started = false;
    hud.start();
    hud.setPaused(false);
    camera.reset();
    pending = emptyInput();
    accumulator = 0;
  }
  function exitToMenu() {
    sim.reset(0, true);
    hud.started = false;
    hud.setPaused(false);
    document.body.classList.remove("riding");
    document.querySelector("#start")!.removeAttribute("hidden");
    menu.show("home");
    input.clear();
    pending = emptyInput();
    accumulator = 0;
    audio.update(0, false, false, true);
  }
  const reset = (restart = false) => {
    sim.reset(sim.spawnIndex, restart);
    camera.reset();
    hud.setPaused(false);
    input.clear();
  };
  document
    .querySelectorAll<HTMLButtonElement>("[data-action]")
    .forEach((button) =>
      button.addEventListener("click", () => {
        switch (button.dataset.action) {
          case "resume":
            hud.setPaused(false);
            break;
          case "marker":
            sim.marker.returnTo(sim);
            hud.setPaused(false);
            input.clear();
            break;
          case "exit":
            exitToMenu();
            break;
          case "reset":
            reset();
            break;
          case "assist":
            sim.grindAssist = !sim.grindAssist;
            profile.settings.grindAssist = sim.grindAssist;
            saveProfile(profile);
            document.querySelector("#assist")!.textContent = sim.grindAssist
              ? "ON"
              : "OFF";
            break;
          case "restart":
            reset(true);
            break;
          case "spot":
            sim.spawnIndex = Number(
              (document.querySelector("#spawn") as HTMLSelectElement).value,
            );
            reset();
            break;
          case "map":
            startSession(OUTDOOR ? "warehouse" : "outdoor");
            break;
          case "sound":
            audio.enabled = !audio.enabled;
            profile.settings.sound = audio.enabled;
            saveProfile(profile);
            document.querySelector("#sound")!.textContent = audio.enabled
              ? "ON"
              : "OFF";
            break;
        }
      }),
    );
  window.addEventListener("keydown", (e) => {
    if (e.code === "Enter" && !hud.started && !e.repeat) menu.select();
  });
  window.addEventListener("blur", () => {
    if (hud.started) hud.setPaused(true);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && hud.started) hud.setPaused(true);
  });
  window.addEventListener("gamepaddisconnected", () => {
    if (hud.started) hud.setPaused(true);
  });
  window.addEventListener("resize", () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.resize();
  });
  let last = performance.now(),
    accumulator = 0,
    fps = 60,
    frame = emptyInput(),
    testMode = false;
  const render = (dt: number, alpha = 1) => {
    waterEffects.update(dt, sim.elapsed);
    rider.update(sim, dt, alpha);
    camera.update(sim, frame, dt, alpha);
    if (hud.started) renderer.render(scene, camera.camera);
    else menu.preview(renderer);
    hud.update(sim, input, dt, fps, renderer.info.render.calls);
    social.render(rider.head.getWorldPosition(new THREE.Vector3()), camera.camera, hud.started && !hud.paused);
  };
  renderer.setAnimationLoop(() => {
    const now = performance.now(),
      dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    fps += (1 / Math.max(dt, 0.001) - fps) * 0.04;
    if (testMode) return;
    input.poll();
    frame = input.consume();
    if (editor.active) {
      editor.update(frame, dt);
      return;
    }
    if (!hud.started) {
      menu.update(frame, dt);
      render(dt);
      return;
    }
    if (frame.pressed.pause) {
      hud.setPaused(!hud.paused);
      accumulator = 0;
    }
    if (hud.paused) {
      social.update(sim, emptyInput(), 0, false);
      hud.menu(frame);
      audio.update(0, false, false, true);
      render(dt);
      return;
    }
    if (startHopBlocked) {
      const stillHeld = frame.held.hop > 0.5;
      frame.held.hop = 0;
      frame.pressed.hop = false;
      frame.released.hop = false;
      if (!stillHeld) startHopBlocked = false;
    }
    frame = social.update(sim, frame, dt);
    accumulator += dt;
    let first = true;
    // Keep edges queued until a physics step; otherwise high refresh-rate displays
    // can lose a press between fixed ticks.
    pendingFrame(frame);
    while (accumulator >= TUNE.step) {
      const f = first
        ? consumePending()
        : {
            ...frame,
            pressed: emptyInput().pressed,
            released: emptyInput().released,
          };
      sim.walkCameraYaw = camera.heading + camera.orbit;
      sim.step(TUNE.step, f);
      accumulator -= TUNE.step;
      first = false;
    }
    audio.update(
      sim.speed,
      sim.grounded,
      !!sim.grind,
      false,
      sim.walking,
      sim.running,
    );
    render(dt, accumulator / TUNE.step);
  });
  let pending = emptyInput();
  function pendingFrame(f: InputFrame) {
    for (const k of Object.keys(f.pressed) as (keyof InputFrame["pressed"])[]) {
      pending.pressed[k] ||= f.pressed[k];
      pending.released[k] ||= f.released[k];
    }
    pending = { ...f, pressed: pending.pressed, released: pending.released };
  }
  function consumePending() {
    const f = pending;
    pending = emptyInput();
    return f;
  }
  hud.ready();
  // Dev-only deterministic harness. It drives the same input frame, physics,
  // collision world, detector, and renderer used by ordinary gameplay.
  if (import.meta.env.DEV) {
    (window as any).__LAZER = {
      get sim() {
        return sim;
      },
      menu,
      editor,
      profile,
      startSession,
      exitToMenu,
      get rider() {
        return rider;
      },
      input,
      hud,
      events,
      get park() {
        return park;
      },
      camera,
      social,
      renderer,
      snapshot: () => sim.snapshot(),
      testing: (value: boolean) => {
        testMode = value;
        hud.start();
        hud.setPaused(false);
      },
      advance: (
        seconds: number,
        values: Partial<InputFrame> = {},
        draw = true,
      ) => {
        const f = {
          ...emptyInput(),
          ...values,
          held: { ...emptyInput().held, ...values.held },
          pressed: { ...emptyInput().pressed, ...values.pressed },
          released: { ...emptyInput().released, ...values.released },
        };
        for (let t = 0; t < seconds; t += TUNE.step) {
          sim.step(TUNE.step, f);
          f.pressed = emptyInput().pressed;
          f.released = emptyInput().released;
        }
        frame = f;
        if (draw) render(1 / 60);
        return sim.snapshot();
      },
      render: () => render(1 / 60),
    };
  }
}
boot().catch((error) => {
  console.error(error);
  const loading = document.querySelector("#loading");
  if (loading)
    loading.textContent = `Could not start the park: ${String(error)}. Reload after checking WebGL support.`;
});
