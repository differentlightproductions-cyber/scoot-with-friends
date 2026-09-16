import {loadingStage,finishLoading,loadingFailed} from './ui/loading';
import {shopForMap} from './data/shops';
import {FreeRide} from './network/client';
import {CreditEconomy} from './data/credit';
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
import { VisualFidelity } from './render/fidelity';
import { WorldInteractions } from './park/interactions';
import { WarehouseBuilder } from './editor/warehouse';
import { Daylight } from './park/daylight';
import { ACTIVE_MAP } from './park/park';
import {loadHuman} from './scooter/human';
import {MobileGate} from './ui/mobile';
async function boot() {
  await loadingStage("Loading your rider",15);
  const profile = loadProfile();
  if(ACTIVE_MAP==="techno_gravity"){const shop=await import("./park/shop");shop.installShop();setActiveLayout(shop.shopLayout);selectPark("techno_gravity");}
  await loadHuman(profile.riderId);
  const events = new Events(),
    hud = new HUD(events),
    input = new Input(),
    audio = new AudioEngine();
  await loadingStage("Preparing the park",40);
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
  const economy=new CreditEconomy();economy.onChange=()=>{profile.wallet=loadProfile().wallet;};window.addEventListener("storage",()=>{profile.wallet=loadProfile().wallet;});events.on(e=>{if(e.type==="banked")void economy.reward(e.eventId,e.points);});
  const camera = new ChaseCamera();
  const social = new SocialControls(events);
  let interactions = new WorldInteractions(park,profile), builder = new WarehouseBuilder(park), daylight = new Daylight(park);
  const interact = () => { const f=emptyInput();f.pressed.brakeBars=true;interactions.update(sim,f,0); };
  social.onInteract=interact;social.onScooter=interact;
  social.onItems=()=>interactions.openItems(sim);interactions.openOptions=(title,options)=>social.openOptions(title,options);
  social.onBuild=()=>social.openOptions('BUILD / RS SELECT',[
    ...builder.options(sim),...builder.editOptions(sim),
    {label:'Reset Warehouse',action:()=>social.openOptions('CLEAR YOUR LAYOUT?',[
      {label:'Cancel',action:()=>{}},{label:'Clear placed objects',action:()=>builder.reset()}
    ])}, {label:'Cancel',action:()=>{}}
  ]);
  social.warehouse=ACTIVE_MAP==='warehouse';
  camera.mountFlourish=profile.settings.mountFlourish;
  rider.applyProfile(profile);
  sim.grindAssist = profile.settings.grindAssist;
  sim.tricks.stance = profile.settings.stance;
  sim.tricks.controlStyle = profile.settings.controlStyle;
  audio.enabled = profile.settings.sound;
  const editor = new ParkEditor(renderer, scene);
  editor.getPark = () => park;
  const network=new FreeRide(scene,profile,()=>sim);
  network.onLost=()=>{input.clear();pending=emptyInput();accumulator=0;if(hud.started)hud.setPaused(true);};
  network.onJoined=()=>{input.clear();pending=emptyInput();accumulator=0;};
  events.on(e=>{if(e.type==='playerChat'&&network.status==='Connected')network.send({type:'chat',message:e.message});});
  const menu = new GameMenu(document.querySelector("#start")!, profile);
  network.prepare=async()=>{if(!hud.started||ACTIVE_MAP!=='outdoor')await menu.onRide('outdoor');};
  menu.networkChoices=()=>!network.endpoint?[{label:'PRIVATE FREE-RIDE / LOCAL TESTING',detail:'An internet room server is not connected to this build yet. Solo and shop visits are available.',action:()=>{}},{label:'PLAY SOLO',action:()=>menu.show('maps')}]:[
    {label:network.status,action:()=>{}},
    ...(network.id?[{label:'COPY INVITE',action:()=>void navigator.clipboard.writeText(location.origin+location.pathname+'#room='+encodeURIComponent(network.code))},{label:'LEAVE ROOM / PLAY SOLO',action:()=>network.leave()},...network.roster.map(p=>({label:p.name+(p.id===network.owner?' / OWNER':''),detail:p.connected?'Connected':'Reconnecting',action:()=>{if(p.id!==network.id){network.muted.has(p.id)?network.muted.delete(p.id):network.muted.add(p.id);}}})),...(network.owner===network.id?[{label:network.locked?'UNLOCK ROOM':'LOCK ROOM',action:()=>network.send({type:'lock',locked:!network.locked})},...network.roster.filter(p=>p.id!==network.id).map(p=>({label:'REMOVE '+p.name,action:()=>{if(confirm('Remove '+p.name+' from this room?'))network.send({type:'kick',id:p.id});}}))]:[])]:[
    ...(network.secret?[{label:'RECONNECT TO ROOM',action:()=>network.connect('resume')}]:[]),
    {label:'CREATE PRIVATE ROOM',action:()=>network.connect('create',prompt('Guest display name','Rider')||'Rider')},
    {label:'JOIN ROOM',action:()=>{const invite=prompt('Paste invite link or room code',new URLSearchParams(location.hash.slice(1)).get('room')||'');if(invite){const code=invite.includes('#room=')?decodeURIComponent(invite.split('#room=')[1]):invite;network.connect('join',prompt('Guest display name','Rider')||'Rider',code);}}}
    ])];
  network.onChange=()=>{if(menu.screen==='online'&&!menu.root.hidden)menu.show('online');};
  menu.economy=economy;menu.owner=()=>editor.owner;menu.onCloseShop=()=>{input.clear();pending=emptyInput();accumulator=0;};
  const shopPrompt=document.createElement("div");shopPrompt.className="world-prompt";shopPrompt.hidden=true;document.body.append(shopPrompt);
  const fidelity=new VisualFidelity(renderer);
  fidelity.apply(scene,profile.settings.fidelity);menu.previewScene.environment=fidelity.environment;
  let appearancePending=false;
  menu.onCloseSesh=()=>{hud.setPaused(true);input.clear();pending=emptyInput();accumulator=0;};
  menu.onChange = () => {appearancePending=true;network.send({type:"appearance",generation:network.generation,appearance:profile});
    sim.grindAssist = profile.settings.grindAssist;
    sim.tricks.stance = profile.settings.stance;
    sim.tricks.controlStyle = profile.settings.controlStyle;
    audio.enabled = profile.settings.sound;
    camera.mountFlourish=profile.settings.mountFlourish;
    fidelity.apply(scene,profile.settings.fidelity);
    menu.previewScene.environment=fidelity.environment;
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
  let destinationLoading=false;
  const loadDestination = async (id:MapId) => {
    if(destinationLoading)return;destinationLoading=true;input.clear();
    try{await loadingStage(id==="techno_gravity"?"Traveling to Techno Gravity Shop":"Loading your park",10);
    if(id==="techno_gravity"){const shop=await import("./park/shop");shop.installShop();}
    if (id === "outdoor") await latestPark();
    await loadingStage("Building the destination",40);
    setActiveLayout(id === "outdoor" ? publicLayout : null);
    setEditedHeightQuery(null);
    startSession(id, true);
    if (id === "outdoor" && publicLayout) applyLayout(publicLayout, false);
    await loadingStage("Preparing the view",80);
    await renderer.compileAsync(scene,camera.camera);
    await loadingStage("Ready to ride",100);finishLoading();
    }catch(error){loadingFailed();throw error;}finally{destinationLoading=false;input.clear();pending=emptyInput();accumulator=0;}
  };
  network.loadMap=async id=>{await loadDestination(id as MapId);};
  menu.onRide=async id=>{if(network.id){await network.changeMap(id);return;}await loadDestination(id);};
  menu.onEditor = () => {}; // Park editor is shelved for this alpha.
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
        e.quality === "sketchy" ? TUNE.rumble.sketchy : TUNE.rumble.clean,
        e.quality === "sketchy" ? 135 : 75,
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
    if (force || ACTIVE_MAP !== id) {
      interactions.dispose();builder.dispose();
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
      fidelity.disposeScene();
      selectPark(id);
      world = new RAPIER.World({ x: 0, y: -TUNE.gravity, z: 0 });
      world.timestep = TUNE.step;
      park = new Park(scene, world);
      sim = new Simulation(world, park, events);
      rider = new RiderModel(scene);
      interactions=new WorldInteractions(park,profile);builder=new WarehouseBuilder(park);daylight=new Daylight(park);
      interactions.openOptions=(title,options)=>social.openOptions(title,options);
    }
    sim.reset(0, true);
    sim.rideable = profile.activeRideable;
    social.warehouse=id==='warehouse';
    rider.applyProfile(profile);
    fidelity.apply(scene,profile.settings.fidelity);
    sim.grindAssist = profile.settings.grindAssist;
    sim.tricks.stance = profile.settings.stance;
    sim.tricks.controlStyle = profile.settings.controlStyle;
    history.replaceState(
      null,
      "",
      "?map="+id,
    );
    document.querySelector(".location")!.innerHTML =
      (OUTDOOR ? "VETERANS MEMORIAL PARK" : ACTIVE_MAP==="techno_gravity"?"TECHNO GRAVITY SHOP":"WAREHOUSE <b>01</b>") +
      '<span id="score">SESH 0 / LINE 0</span>';
    document.querySelector("#spawn")!.innerHTML = SPAWNS.map(
      (s, i) => `<option value="${i}">${s.name}</option>`,
    ).join("");
    document.querySelector('[data-action="map"]')!.textContent = "Parks";
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
          case "customization":
          case "shops":
          case "rider":
          case "scooter":
          case "online":
          case "settings":
            menu.openSesh(button.dataset.action==="map"?"maps":button.dataset.action!,ACTIVE_MAP as MapId);
            (document.querySelector("#pause") as HTMLElement).hidden=true;
            input.clear();pending=emptyInput();accumulator=0;
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
  const suspend=()=>{input.clear();sim.preload.reset();sim.tricks.gesture.clear();sim.hopBuffer=0;sim.groundIntent=null;sim.tricks.pendingBumper=null;sim.tricks.deck.holdTime=sim.tricks.bars.holdTime=0;pending=emptyInput();accumulator=0;if(hud.started)hud.setPaused(true);};
  const mobile=new MobileGate(()=>void audio.start(),suspend);
  window.addEventListener("blur", suspend);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden)suspend();
  });
  window.addEventListener("gamepaddisconnected", () => {
    suspend();
  });
  window.addEventListener("resize", () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.resize();
  });
  await loadingStage("Ready",100);finishLoading();
  let last = performance.now(),
    accumulator = 0,
    fps = 60,
    frame = emptyInput(),
    testMode = false;
  const render = (dt: number, alpha = 1) => {
    if(appearancePending&&sim.grounded&&!sim.grind&&!sim.manual.active){rider.applyProfile(profile);appearancePending=false;
      // Switching rideable takes effect on the ground, never mid-air or mid-grind,
      // and not while the current one sits in a rack.
      if(sim.rideable!==profile.activeRideable&&!interactions.stored){sim.rideable=profile.activeRideable;sim.board.reset();}}
    daylight.update(dt,profile.settings.daylight,sim.position);
    fidelity.update(sim.position,dt);
    waterEffects.update(dt, sim.elapsed);
    rider.update(sim, dt, alpha);
    interactions.online=!!network.id;interactions.render(rider);
    const cameraBlocked=menu.shopOpen||hud.paused||!hud.started||!social.wheel.hidden||!social.chat.hidden||!!builder.placement;
    if(!cameraBlocked)camera.update(sim, frame, dt, alpha);
    const overlayOpen=!menu.root.hidden||hud.paused;document.body.classList.toggle("ui-open",overlayOpen);
    if(overlayOpen){renderer.setClearColor(0xc5cbc1);renderer.clear();}else if (hud.started){network.render(camera.camera,dt);renderer.render(scene, camera.camera);}
    if(!hud.started||menu.shopOpen||menu.seshOpen)menu.preview(renderer);
    hud.update(sim, input, dt, fps, renderer.info.render.calls);
    const balance=document.querySelector("#score");if(balance)balance.textContent+=" / "+profile.wallet.credit+" Credit";
    social.render(rider.head.getWorldPosition(new THREE.Vector3()), camera.camera, hud.started && !hud.paused);
  };
  renderer.setAnimationLoop(() => {
    const now = performance.now(),
      dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    fps += (1 / Math.max(dt, 0.001) - fps) * 0.04;
    if (testMode) return;
    input.poll();
    if(mobile.update(input)){audio.update(0,false,false,true);accumulator=0;return;}
    frame = input.consume();
    if(destinationLoading){audio.update(0,false,false,true);return;}
    if (editor.active) {
      editor.update(frame, dt);
      return;
    }
    if(menu.shopOpen||menu.seshOpen){menu.update(frame,dt);audio.update(0,false,false,true);render(dt);return;}
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
    shopPrompt.hidden=true;
    if(sim.walking){const shop=shopForMap(ACTIVE_MAP);const nearest=shop?.displays.find(d=>Math.hypot(sim.position.x-d.x,sim.position.z-d.z)<1.6);if(shop&&nearest){shopPrompt.hidden=false;shopPrompt.textContent='B / Browse '+nearest.label+' / '+shop.name;if(frame.pressed.brakeBars){if(nearest.category==='longboard')menu.openBoardShop(shop.id);else menu.openShop(nearest.category,shop.id);input.clear();accumulator=0;render(dt);return;}}}
    if(builder.placement)frame=builder.update(sim,frame,dt);
    else {
      frame = social.update(sim, frame, dt);
      frame = interactions.update(sim,frame,dt,social.wheel.hidden&&social.chat.hidden);
    }
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
      interactions.waterActive,
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
      network,
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
      get builder(){return builder;},get interactions(){return interactions;},get daylight(){return daylight;},
      renderer,
      fidelity,
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
  loadingFailed();
  console.error(error);
  const loading = document.querySelector("#loading");
  if (loading)
    loading.textContent = `Could not start the park: ${String(error)}. Reload after checking WebGL support.`;
});
