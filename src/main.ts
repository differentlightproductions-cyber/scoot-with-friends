import {loadingStage,finishLoading,loadingFailed} from './ui/loading';
import { version } from "../package.json";
import * as riding from "./input/riding";
import { copyText } from "./core/secure";
import { TouchPad } from "./input/touchpad";
import { CamcorderFilter } from "./render/camcorder";
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
import { OUTDOOR, Park, SPAWNS, selectPark, terrainHeight } from "./park/park";
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
import { Weather } from './park/weather';
import { ACTIVE_MAP } from './park/park';
import {MobileGate} from './ui/mobile';
import { music } from './audio/music';
import { Phone } from './phone/phone';
import { PhoneRig, READ_TILT } from './phone/rig';
import { PhoneMap, type MapFeature } from './phone/map';
import { MessageStore } from './phone/messages';
import { installApps, homePage, releasePhoneThumbnails, type PhoneDeps } from './phone/apps';
import { ownsBoard } from './data/catalog';
import { MAPS } from './data/maps';
import { MissionTracker, RewardFx } from './ui/rewards';
import { collectibles } from './data/progress';
import { cloud } from './ui/account';
import { B_HILL_LENGTH, routeProgress } from './park/bhill';
async function boot() {
  await loadingStage("Loading your rider",15);
  const profile = loadProfile();
  if(ACTIVE_MAP==="techno_gravity"){const shop=await import("./park/shop");shop.installShop();setActiveLayout(shop.shopLayout);selectPark("techno_gravity");}
  const events = new Events(),
    hud = new HUD(events),
    input = new Input(),
    audio = new AudioEngine();
  await loadingStage("Preparing the park",40);
  await RAPIER.init();
  const scene = new THREE.Scene();
  scene.userData.parkGeneration=0;
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
  rider.root.userData.weatherDynamic=true;
  const economy=new CreditEconomy();economy.onChange=()=>{const before=profile.wallet.credit;const saved=loadProfile();profile.wallet=saved.wallet;profile.progress=saved.progress;const earned=profile.wallet.credit-before;if(earned>0)creditNote(earned);};
  // Banked lines pay Credit often: the phone sums it into one note a minute
  // instead of one per line (missions already show their own sticker).
  let noteCredit=0,noteAt=-Infinity,noteTimer:ReturnType<typeof setTimeout>|null=null,deliveryCheck=0;
  const creditNote=(earned:number)=>{noteCredit+=earned;if(noteTimer)return;const wait=Math.max(0,noteAt+60000-performance.now());
    noteTimer=setTimeout(()=>{noteTimer=null;noteAt=performance.now();phone.notify('Credit earned','+'+noteCredit+' Credit · '+profile.wallet.credit+' total','star');noteCredit=0;},wait);};window.addEventListener("storage",()=>{const saved=loadProfile();profile.wallet=saved.wallet;profile.progress=saved.progress;});
  // Missions, XP and crates (data/progress.ts): riding events count toward
  // missions; completions, level-ups and crate openings play on screen.
  const rewards=new RewardFx(economy,()=>profile.progress),missions=new MissionTracker(events,economy);
  economy.onGains=gains=>rewards.celebrate(gains);events.on(e=>{if(e.type==="banked")void economy.reward(e.eventId,e.points);});
  const camera = new ChaseCamera();
  const social = new SocialControls(events);
  let interactions = new WorldInteractions(park,profile), builder = new WarehouseBuilder(park), daylight = new Daylight(park), weather = new Weather(scene);
  // The rider's phone (D-pad Down): the app hub that replaced the quick wheel.
  const phone = new Phone(), phoneRig = new PhoneRig(phone.texture), messages = new MessageStore();
  let phoneAir = 0;
  interactions.openOptions=(title,options,sub)=>phone.sheet(title,options,sub);
  camera.mountFlourish=profile.settings.mountFlourish;
  const camcorder=new CamcorderFilter();
  const touchPad=new TouchPad();input.touch=touchPad;
  const applyCamera=()=>{touchPad.mode=profile.settings.touchControls;touchPad.size=profile.settings.touchSize/100;touchPad.opacity=profile.settings.touchOpacity/100;camera.view=profile.settings.cameraView;camera.firstPersonFov=profile.settings.firstPersonFov;camera.thirdPersonFov=profile.settings.thirdPersonFov;camera.motion=profile.settings.cameraMotion;camcorder.enabled=profile.settings.cameraFilter==='camcorder';camcorder.strength=profile.settings.filterStrength/100;};applyCamera();
  rider.applyProfile(profile);
  sim.grindAssist = true;
  sim.tricks.stance = profile.settings.stance;
  sim.tricks.controlStyle = profile.settings.controlStyle;
  audio.enabled = profile.settings.sound;
  // Sesh Music: one app-level player; the panel only observes it.
  music.setSoundEnabled(audio.enabled);
  void music.loadCatalog();
  // Held buttons that put the phone away must not become a hop, push or trick.
  phone.onClose = () => { input.clear(); pending = emptyInput(); releasePhoneThumbnails(); };
  phone.onOpen = () => { if (sim.emote && sim.emote.id !== 'sit') sim.emote = null; sim.running = false; };
  music.onNowPlaying = (track) => {
    if (!music.settings.notifications || (phone.ready && phone.view?.title === 'SESH MUSIC')) return;
    phone.notify('Now playing', track.title + ' · ' + track.artist, 'music');
  };
  const editor = new ParkEditor(renderer, scene);
  editor.getPark = () => park;
  const network=new FreeRide(scene,profile,()=>sim);
  network.onLost=()=>{input.clear();pending=emptyInput();accumulator=0;if(hud.started)hud.setPaused(true);};
  network.onJoined=()=>{input.clear();pending=emptyInput();accumulator=0;};
  events.on(e=>{if(e.type==='playerChat'){messages.add('room','You',e.message,true);if(network.status==='Connected')network.send({type:'chat',message:e.message});}});
  network.onChat=(name,message)=>{messages.add('room',name,message,false);if(!(phone.ready&&phone.view?.title==='MESSAGES'))phone.notify('New message',name+': '+message,'messages');};
  messages.onChange=()=>phone.refresh();
  const menu = new GameMenu(document.querySelector("#start")!, profile);
  // Cloud save starts once the account dialog exists to ask questions in.
  void cloud.start();
  network.prepare=async()=>{if(!hud.started||ACTIVE_MAP!=='outdoor')await menu.onRide('outdoor');};
  menu.networkChoices=()=>!network.endpoint?[{label:'PRIVATE FREE-RIDE / LOCAL TESTING',detail:'An internet room server is not connected to this build yet. Solo and shop visits are available.',action:()=>{}},{label:'PLAY SOLO',action:()=>menu.show('maps')}]:[
    {label:(network.lan?'LAN / ':'')+network.status,detail:network.lan?'Both players need this Windows release. Host LAN on one PC; Join LAN on the other. Two players per room.':network.lastError,action:()=>{}},
    ...(network.lan&&network.id?[{label:'COPY LAN ROOM CODE',action:()=>void copyText(network.code)}]:[]),
    ...(network.id?[{label:'COPY INVITE',action:()=>void copyText(location.origin+location.pathname+'#room='+encodeURIComponent(network.code))},{label:'LEAVE ROOM / PLAY SOLO',action:()=>network.leave()},...network.roster.map(p=>({label:p.name+(p.id===network.owner?' / OWNER':''),detail:p.connected?'Connected':'Reconnecting',action:()=>{if(p.id!==network.id){network.muted.has(p.id)?network.muted.delete(p.id):network.muted.add(p.id);}}})),...(network.owner===network.id?[{label:network.locked?'UNLOCK ROOM':'LOCK ROOM',action:()=>network.send({type:'lock',locked:!network.locked})},...network.roster.filter(p=>p.id!==network.id).map(p=>({label:'REMOVE '+p.name,action:()=>{if(confirm('Remove '+p.name+' from this room?'))network.send({type:'kick',id:p.id});}}))]:[])]:[
    ...(network.secret?[{label:'RECONNECT TO ROOM',action:()=>network.connect('resume')}]:[]),
    {label:'CREATE PRIVATE ROOM',action:()=>network.connect('create',prompt('Guest display name','Rider')||'Rider')},
    {label:'JOIN ROOM',action:()=>{const invite=prompt('Paste invite link or room code',new URLSearchParams(location.hash.slice(1)).get('room')||'');if(invite){const code=invite.includes('#room=')?decodeURIComponent(invite.split('#room=')[1]):invite;network.connect('join',prompt('Guest display name','Rider')||'Rider',code);}}}
    ])];
  network.onChange=()=>{if(menu.screen==='online'&&!menu.root.hidden)menu.show('online');};
  const mapFeatures=():MapFeature[]=>{
    const out:MapFeature[]=SPAWNS.map((sp,i)=>({kind:'spawn',x:sp.x,z:sp.z,label:String(i+1)}));
    for(const item of interactions.items)if(item.interactionType!=='bench')out.push({kind:item.interactionType,x:item.position.x,z:item.position.z});
    for(const b of park.benches)out.push({kind:'bench',x:b.x,z:b.z});
    for(const r of park.rails)if(!r.coping)out.push({kind:'rail',x:r.a.x,z:r.a.z,x2:r.b.x,z2:r.b.z});
    for(const d of shopForMap(ACTIVE_MAP)?.displays??[])out.push({kind:'shop',x:d.x,z:d.z,label:d.label});
    for(const r of network.remotes.values()){const p=r.model.root.position;out.push({kind:'friend',x:p.x,z:p.z,label:r.name});}
    return out;
  };
  const phoneMap=new PhoneMap({renderer,scene,features:mapFeatures,player:()=>({x:sim.position.x,z:sim.position.z,yaw:sim.yaw}),
    hide:()=>{const riderShown=rider.root.visible;rider.root.visible=false;weather.setVisible(false);for(const r of network.remotes.values())r.model.root.visible=false;return()=>{rider.root.visible=riderShown;weather.setVisible(true);for(const r of network.remotes.values())r.model.root.visible=true;};}});
  /** The phone comes out standing, sitting, or rolling on the ground; never in the air, a trick, a grind or a crash. */
  const phoneAllowed=()=>hud.started&&!hud.paused&&!menu.seshOpen&&!menu.shopOpen&&!destinationLoading&&!builder.placement&&!interactions.active&&
    sim.state!=='Bail'&&sim.grounded&&!sim.grind&&!sim.manual.active&&!sim.mantle&&!sim.dropIn.phase&&sim.getUpTimer<=0&&!sim.bodyFlip.active;
  const phoneDeps:PhoneDeps={phone,messages,map:phoneMap,economy,
    openCrate:id=>{const crates=profile.progress.crates,crate=crates.find(c=>c.id===id);if(crate)rewards.openCrate(crate,crates);},
    sim:()=>sim,profile:()=>profile,mapId:()=>ACTIVE_MAP,mapName:()=>MAPS.find(m=>m.id===ACTIVE_MAP)?.name??'Map',
    emote:id=>social.perform(id,sim),
    openSesh:screen=>{menu.openSesh(screen,ACTIVE_MAP as MapId);input.clear();pending=emptyInput();accumulator=0;},
    switchRide:async kind=>{const r=await economy.setRideable(kind,profile.equipmentRevision??0);if('profile' in r&&r.profile){Object.assign(profile,r.profile);menu.onChange();return '';}return ('error' in r&&r.error)||'Could not switch.';},
    ownsBoard:()=>ownsBoard(loadProfile().wallet,profile.longboard),
    items:()=>interactions,builder:()=>builder,
    compose:()=>social.openChat(),
    network:()=>network};
  installApps(phoneDeps);
  phone.homePage=()=>homePage(phoneDeps);
  // First person: taps land on the 3D phone's screen.
  renderer.domElement.addEventListener('pointerdown',e=>{
    if(!phone.ready||!phone.firstPerson)return;
    const r=renderer.domElement.getBoundingClientRect(),hit=phoneRig.screenPoint(new THREE.Vector2(((e.clientX-r.left)/r.width)*2-1,-((e.clientY-r.top)/r.height)*2+1));
    if(hit)phone.tap(hit.u*360,hit.v*720);
  });
  menu.economy=economy;menu.owner=()=>editor.owner;menu.onCloseShop=()=>{input.clear();pending=emptyInput();accumulator=0;};
  const shopPrompt=document.createElement("div");shopPrompt.className="world-prompt";shopPrompt.hidden=true;document.body.append(shopPrompt);
  const fidelity=new VisualFidelity(renderer);
  fidelity.apply(scene,profile.settings.fidelity);menu.previewScene.environment=fidelity.environment;
  let appearancePending=false;
  menu.onCloseSesh=()=>{hud.setPaused(true);input.clear();pending=emptyInput();accumulator=0;};
  menu.onCameraChange=(settings)=>{profile.settings.cameraView=settings.cameraView;profile.settings.firstPersonFov=settings.firstPersonFov;profile.settings.thirdPersonFov=settings.thirdPersonFov;profile.settings.phoneHand=settings.phoneHand;profile.settings.phoneNotifications=settings.phoneNotifications;profile.settings.cameraMotion=settings.cameraMotion;profile.settings.cameraFilter=settings.cameraFilter;profile.settings.filterStrength=settings.filterStrength;profile.settings.touchControls=settings.touchControls;profile.settings.touchSize=settings.touchSize;profile.settings.touchOpacity=settings.touchOpacity;applyCamera();};
  menu.touchPreview=(on)=>{menu.touchPreviewOn=on;touchPad.preview=on;};
  menu.controllerReport=()=>{
    const pad=input.pad,names=['A','B','X','Y','LB','RB','LT','RT','View','Menu','L3','R3','Up','Down','Left','Right','Home'];
    const buttons=riding.ridingButtons(profile.settings.stance,profile.settings.controlStyle);
    const held=Object.entries(frame.held).filter(([,v])=>v>.5).map(([k])=>k);
    const resolved=held.map(a=>a===buttons.push?'push':a===buttons.whip?'tailwhip':a==='brakeBars'?(profile.settings.controlStyle==='arcade'?'brake':'barspin / back'):a==='hop'?'confirm / jump on foot':a).join(', ');
    return {build:'alpha '+version,source:input.source,controller:pad?.id??'none',mapping:pad?.mapping||'(nonstandard)',index:pad?.index??-1,
      physicalButtons:pad?Array.from(pad.buttons).map((b,i)=>b.pressed?names[i]??('#'+i):'').filter(Boolean).join(' ')||'-':'-',
      sticks:pad?Array.from(pad.axes).slice(0,4).map(v=>v.toFixed(2)).join(' '):'-',
      preset:profile.settings.controlStyle==='arcade'?'Arcade':riding.presetName(profile.settings.stance),mappingRevision:profile.settings.controlsVersion,
      context:menu.root.hidden?(sim.walking?'on foot':'riding'):'menu',logicalHeld:held.join(' ')||'-',resolvedAction:resolved||'-',
      touchControls:profile.settings.touchControls+(touchPad.device?'':' (not a touch device)')};
  };
  rewards.equip=async(partId,variantId)=>{const r=await economy.equip({partId,variantId},profile.equipmentRevision??0);if('profile' in r&&r.profile){Object.assign(profile,r.profile);menu.onChange();return '';}return ('error' in r&&r.error)||'Could not equip.';};
  rewards.onClose=()=>{input.clear();pending=emptyInput();accumulator=0;};
  menu.onPurchased=item=>rewards.purchase(item);
  menu.onChange = () => {appearancePending=true;network.send({type:"appearance",generation:network.generation,appearance:profile});
    sim.grindAssist = true;
    sim.tricks.stance = profile.settings.stance;
    sim.tricks.controlStyle = profile.settings.controlStyle;
    audio.enabled = profile.settings.sound;
    music.setSoundEnabled(audio.enabled);
    camera.mountFlourish=profile.settings.mountFlourish;applyCamera();
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
    try{await loadingStage(id==="techno_gravity"?"Traveling to Techno Gravity Shop":id==="b_hill"?"Heading up B\u00a0Hill":"Loading your park",10);
    if(id==="techno_gravity"){const shop=await import("./park/shop");shop.installShop();}
    if (id === "outdoor") await latestPark();
    await loadingStage("Building the destination",40);
    setActiveLayout(id === "outdoor" ? publicLayout : null);
    setEditedHeightQuery(null);
    startSession(id, true);
    if (id === "outdoor" && publicLayout) applyLayout(publicLayout, false);
    // Hold the loading screen until the authored ramps, trees and clouds have
    // replaced the simple stand-ins, so they never flash on screen first.
    await loadingStage("Placing the ramps and trees",60);
    await Promise.race([Promise.allSettled(scene.userData.assetLoads ?? []), new Promise((resolve) => setTimeout(resolve, 20000))]);
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
  let musicEntered = false;
  hud.onStart = () => {
    startHopBlocked = input.previous.held.hop > 0.5;
    void audio.start();
    if (!musicEntered) { musicEntered = true; music.enterGame(); }
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
    void economy.track({}, id);
    if (force || ACTIVE_MAP !== id) {
      phone.stow();phoneRig.model.removeFromParent();phoneMap.reset();
      interactions.dispose();builder.dispose();
      sim.score.dispose();
      sim.contactEvents.free();
      world.free();
      scene.userData.parkGeneration++;
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
      weather.dispose();
      scene.clear();
      fidelity.disposeScene();
      selectPark(id);
      world = new RAPIER.World({ x: 0, y: -TUNE.gravity, z: 0 });
      world.timestep = TUNE.step;
      park = new Park(scene, world);
      sim = new Simulation(world, park, events);
      rider = new RiderModel(scene);
      rider.root.userData.weatherDynamic=true;
      interactions=new WorldInteractions(park,profile);builder=new WarehouseBuilder(park);daylight=new Daylight(park);weather=new Weather(scene);
      interactions.openOptions=(title,options,sub)=>phone.sheet(title,options,sub);
    }
    sim.reset(0, true);
    sim.rideable = profile.activeRideable;
    rider.applyProfile(profile);
    fidelity.apply(scene,profile.settings.fidelity);
    sim.grindAssist = true;
    sim.tricks.stance = profile.settings.stance;
    sim.tricks.controlStyle = profile.settings.controlStyle;
    history.replaceState(
      null,
      "",
      "?map="+id,
    );
    document.querySelector(".location")!.innerHTML =
      (OUTDOOR ? "VETERANS MEMORIAL PARK" : ACTIVE_MAP==="techno_gravity"?"TECHNO GRAVITY SHOP":ACTIVE_MAP==="b_hill"?"B HILL":"WAREHOUSE <b>01</b>") +
      '<span id="score">SESH 0 / LINE 0</span>';
    document.querySelector("#spawn")!.innerHTML = SPAWNS.map(
      (s, i) => `<option value="${i}">${s.name}</option>`,
    ).join("");
    document.querySelector('[data-action="map"]')!.textContent = "Parks";
    (document.querySelector('[data-action="hillstart"]') as HTMLElement).hidden = id !== "b_hill";
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
          case "restart":
            reset(true);
            break;
          case "hillstart":
            // Back to the top of B Hill; the personal D-pad marker is left alone.
            sim.spawnIndex = 0;
            reset();
            break;
          case "spot":
            sim.spawnIndex = Number(
              (document.querySelector("#spawn") as HTMLSelectElement).value,
            );
            reset();
            break;
          case "map":
          case "rides":
          case "shops":
          case "rider":
          case "scooter":
          case "online":
          case "settings":
            menu.openSesh(button.dataset.action==="map"?"maps":button.dataset.action!,ACTIVE_MAP as MapId);
            (document.querySelector("#pause") as HTMLElement).hidden=true;
            input.clear();pending=emptyInput();accumulator=0;
            break;
          case "music":
            // Sesh Music lives on the phone: resume and take it out, if the rider is steady.
            hud.setPaused(false);
            input.clear();pending=emptyInput();accumulator=0;
            if (phoneAllowed()) phone.open('music');
            else phone.notify('Phone', 'Land first, then press D-pad Down for Sesh Music.');
            break;
          case "sound":
            audio.enabled = !audio.enabled;
            music.setSoundEnabled(audio.enabled);
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
    const worldFrozen = hud.started && (hud.paused || menu.seshOpen || menu.shopOpen);
    if (!worldFrozen) {
    if(appearancePending&&sim.grounded&&!sim.grind&&!sim.manual.active){rider.applyProfile(profile);appearancePending=false;
      // Switching rideable takes effect on the ground, never mid-air or mid-grind,
      // and not while the current one sits in a rack.
      if(sim.rideable!==profile.activeRideable&&!interactions.stored){sim.rideable=profile.activeRideable;sim.board.reset();}}
    daylight.update(dt,profile.settings.daylight==='snow'?'day':profile.settings.daylight,sim.position,renderer);
    weather.update(dt,profile.settings.daylight,sim.position,profile.settings.fidelity,{camera:camera.camera.position,velocity:sim.velocity,yaw:sim.yaw,riding:!sim.walking&&!sim.sitting&&sim.rideable==='scooter',grounded:sim.grounded,landing:sim.landTimer});
    fidelity.update(sim.position,dt);
    waterEffects.update(dt, sim.elapsed);
    camera.rider=rider;rider.hideHead=camera.firstPersonActive&&camera.view==='first';
    // Phone: arm and head follow its raise; in first person the hand is placed from the eye below.
    phone.tick(dt);
    hud.phoneHint = phone.active ? 'PHONE · LS MOVE / A SELECT / B BACK / Y HOME / D-PAD DOWN PUT AWAY' : '';
    const phoneHand = profile.settings.phoneHand === 'left' ? 1 : 0, raise = phone.raise * phone.raise * (3 - 2 * phone.raise);
    const firstPersonPhone = camera.view === 'first' && camera.firstPersonActive && raise > 0;
    phone.firstPerson = firstPersonPhone;
    rider.phoneTilt = raise * (firstPersonPhone ? READ_TILT.first : READ_TILT.third);
    rider.phonePose = raise > 0 ? (r: RiderModel) => phoneRig.pose(r, raise, phoneHand, null) : null;
    camera.phonePitch = raise * READ_TILT.first;
    rider.update(sim, dt, alpha);
    interactions.online=!!network.id;interactions.render(rider);
    const cameraBlocked=menu.shopOpen||hud.paused||!hud.started||!social.chat.hidden||!!builder.placement;
    if(!cameraBlocked)camera.update(sim, frame, dt, alpha);
    if (firstPersonPhone && camera.firstPersonActive) { phoneRig.pose(rider, raise, phoneHand, camera.camera); rider.avatar.update(sim.elapsed); }
    phoneRig.attach(rider, phoneHand, raise);
    phoneRig.layer(rider, phoneHand, firstPersonPhone && camera.firstPersonActive);
    rider.hideHead=camera.firstPersonActive&&camera.view==='first';
    rider.avatar.setFirstPerson(rider.hideHead);
    }
    const overlayOpen=!menu.root.hidden||hud.paused;document.body.classList.toggle("ui-open",overlayOpen);
    // Menus, the music phone and radials are tapped directly; the virtual pad steps aside
    // (and releases everything) while they own input, except in the controller test view.
    touchPad.suspended=(overlayOpen||phone.active||!social.chat.hidden)&&!touchPad.preview;
    // Keep the last world pose/camera underneath translucent pause menus. Rendering
    // that unchanged scene also survives resize/context compositing without a screenshot.
    if (hud.started){if(!worldFrozen)network.render(camera.camera,dt);camcorder.render(renderer,scene,camera.camera,phone.firstPerson&&camera.firstPersonActive&&!worldFrozen?()=>phoneRig.renderCloseUp(renderer,scene,camera.camera,dt):undefined);if(menu.shopOpen||menu.seshOpen)menu.preview(renderer);}
    else {renderer.setClearColor(0x15161a);renderer.clear();menu.preview(renderer);}
    hud.update(sim, input, dt, fps, renderer.info.render.calls);
    const balance=document.querySelector("#score");if(balance)balance.textContent+=" / "+profile.wallet.credit+" Credit";
    rewards.showChip(hud.started&&!hud.paused&&!menu.seshOpen&&!menu.shopOpen);
    if(hud.started&&!hud.paused){missions.sample(sim,dt);if(phone.active)missions.first('phone');}
    // Phone-shop packages land in your parts when their time comes (also after a reload).
    deliveryCheck-=dt;if(deliveryCheck<=0){deliveryCheck=1;if(profile.wallet.packages.some(k=>k.arrives<=Date.now()))void economy.deliver().then(arrived=>{if(typeof arrived==='string')return;for(const k of arrived){const c=collectibles().find(x=>x.partId===k.partId&&x.variantId===k.variantId);rewards.delivered(c?c.name.replace(/^(Lazer|Mafioso|Sometimes Summer) /,'')+' / '+c.variantName:k.partId);phone.notify('Package delivered',(c?.name??k.partId)+' is in your parts','crate');}});}
    if(hud.started&&ACTIVE_MAP==='b_hill')missions.hillUpdate(routeProgress(sim.position.x,sim.position.z),B_HILL_LENGTH,sim.speed,!sim.walking&&sim.state!=='Bail');
    social.render(rider.head.getWorldPosition(new THREE.Vector3()), camera.camera, hud.started && !hud.paused);
  };
  renderer.setAnimationLoop(() => {
    const now = performance.now(),
      dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    fps += (1 / Math.max(dt, 0.001) - fps) * 0.04;
    if (testMode) return;
    touchPad.suspended=(!menu.root.hidden||hud.paused||phone.active||!social.chat.hidden)&&!touchPad.preview;
    input.poll();
    if(mobile.update(input)){audio.update(0,false,false,true);accumulator=0;return;}
    frame = input.consume();
    if(destinationLoading){audio.update(0,false,false,true);return;}
    if (editor.active) {
      editor.update(frame, dt);
      return;
    }
    missions.update(dt);
    if(rewards.open){rewards.update(frame,dt);audio.update(0,false,false,true);render(dt);return;}
    if(menu.shopOpen||menu.seshOpen){menu.update(frame,dt);audio.update(0,false,false,true);render(dt);return;}
    if (!hud.started) {
      menu.update(frame, dt);
      render(dt);
      return;
    }
    // Pausing puts the phone straight away: the Sesh menu is then the only input owner.
    if (frame.pressed.pause) {
      if (phone.active) phone.stow();
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
    // The phone owns controller input while it is out (the chat field, when
    // composing, owns it first). Gameplay receives nothing, so a rider coasts on.
    if (phone.active) {
      if (sim.state === "Bail") phone.stow();
      phoneAir = sim.grounded ? 0 : phoneAir + dt;
      if (phoneAir > 0.2 || sim.grind || sim.manual.active) phone.close();
      if (social.chat.hidden) { phone.update(frame, dt); frame = emptyInput(); }
    } else if (frame.pressed.menuDown && social.chat.hidden && phoneAllowed()) {
      phone.open();
      frame = emptyInput();
    }
    shopPrompt.hidden=true;
    if(sim.walking){const shop=shopForMap(ACTIVE_MAP);const nearest=shop?.displays.find(d=>Math.hypot(sim.position.x-d.x,sim.position.z-d.z)<1.6);if(shop&&nearest){shopPrompt.hidden=false;shopPrompt.textContent='B / Browse '+nearest.label+' / '+shop.name;if(frame.pressed.brakeBars){if(nearest.category==='longboard')menu.openBoardShop(shop.id);else menu.openShop(nearest.category,shop.id);input.clear();accumulator=0;render(dt);return;}}}
    if(builder.placement)frame=builder.update(sim,frame,dt);
    else {
      frame = social.update(sim, frame, dt);
      frame = interactions.update(sim,frame,dt,social.chat.hidden&&!phone.active);
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
      terrainHeight,
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
      camera, camcorder, touchPad,
      social,
      get builder(){return builder;},get interactions(){return interactions;},get daylight(){return daylight;},get weather(){return weather;},
      music, phone, phoneRig, phoneMap, messages, phoneAllowed: () => phoneAllowed(),
      renderer,
      fidelity,
      economy, cloud,
      rewards,
      missions,
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
