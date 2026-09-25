import {loadingStage,finishLoading,loadingFailed} from './ui/loading';
import { version } from "../package.json";
import * as riding from "./input/riding";
import { copyText } from "./core/secure";
import { TouchPad } from "./input/touchpad";
import { WheelTracks } from "./park/tracks";
import { WithFriends } from "./social/friends";
import { VETERANS_LOCALS } from "./social/npcs";
import type { ThrowableKind } from "./social/playful";
import { CamcorderFilter } from "./render/camcorder";
import {shopForMap} from './data/shops';
import {FreeRide,capture} from './network/client';
import {SocialClient} from './network/social';
import {teleportNear} from './network/teleport';
import {appearance as riderAppearance} from './network/protocol';
import {ReplayBuffer} from './replay/buffer';
import {ReplayEditor} from './replay/editor';
import {CreditEconomy} from './data/credit';
import { ParkEditor } from "./editor/editor";
import { buildObject, deformGroundLayers } from "./editor/assets";
import {
  activeLayout,
  CATALOG,
  setActiveLayout,
  setEditedHeightQuery,
  validateLayout,
  type ParkLayout,
} from "./editor/layout";
import { modules as outdoorRamps } from "./park/outdoor";
import { Minimap } from "./ui/minimap";
import { NowPlaying } from "./ui/now-playing";
import { buildBaseAssets } from "./editor/base-assets";
import { WaterEffects, inWater } from "./park/water";
import { Doves } from "./park/doves";
import { DesertWind } from "./park/dust";
import { PAVILIONS } from "./park/memorial";
import { Underwater } from "./park/underwater";
import "./style.css";
import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { Events } from "./core/events";
import { TUNE } from "./core/config";
import { Input, emptyInput, InputFrame } from "./input/input";
import { OUTDOOR, Park, SPAWNS, selectPark, terrainHeight, terrainSurface } from "./park/park";
import { Simulation } from "./physics/simulation";
import { RiderModel } from "./scooter/model";
import { ChaseCamera } from "./camera/chase";
import { AudioEngine } from "./audio/audio";
import { HUD } from "./ui/hud";
import { EMOTES, SocialControls } from "./ui/social";
import { GameMenu } from "./ui/menu";
import { loadProfile, saveProfile } from "./data/loadout";
import {setLocale,t} from './i18n';
import {applyUiPalette} from './ui/palette';
import {networkPlayful} from './network/playful';
import type { MapId } from "./data/maps";
import { VisualFidelity } from './render/fidelity';
import { WorldInteractions } from './park/interactions';
import { WarehouseBuilder } from './editor/warehouse';
import { Daylight } from './park/daylight';
import { Weather } from './park/weather';
import { ACTIVE_MAP } from './park/park';
import { cityForMap, liveSky } from './park/liveSky';
import {MobileGate} from './ui/mobile';
import { music } from './audio/music';
import { Phone } from './phone/phone';
import { HoldButton } from './phone/hold';
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
  setLocale(profile.settings.language);
  applyUiPalette(profile.settings.uiPalette);
  if(ACTIVE_MAP==="techno_gravity"){const shop=await import("./park/shop");shop.installShop();setActiveLayout(shop.shopLayout);selectPark("techno_gravity");}
  if(ACTIVE_MAP==="church"){const church=await import("./park/church");church.installChurch();setActiveLayout(church.churchLayout);selectPark("church");}
  const events = new Events(),
    hud = new HUD(events),
    input = new Input(),
    audio = new AudioEngine();
  await loadingStage("Preparing the park",40);
  await RAPIER.init();
  const scene = new THREE.Scene();
  scene.userData.parkGeneration=0;
  const waterEffects = new WaterEffects(scene);
  // The eye under the lake (#62): murky water, motes and bubbles, and muffled sound.
  const underwater = new Underwater(scene);
  underwater.onChange = (under) => audio.setUnderwater(under);
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
    noteTimer=setTimeout(()=>{noteTimer=null;noteAt=performance.now();phone.notify('Coins earned','+'+noteCredit+' Coins · '+profile.wallet.credit+' total','star');noteCredit=0;},wait);};window.addEventListener("storage",()=>{const saved=loadProfile();profile.wallet=saved.wallet;profile.progress=saved.progress;});
  // Missions, XP and crates (data/progress.ts): riding events count toward
  // missions; completions, level-ups and crate openings play on screen.
  const rewards=new RewardFx(economy,()=>profile.progress),missions=new MissionTracker(events,economy);
  economy.onGains=gains=>rewards.celebrate(gains);events.on(e=>{if(e.type==="banked")void economy.reward(e.eventId,e.points);});
  const camera = new ChaseCamera();
  const social = new SocialControls(events);
  /** Weather for the loaded map; its lightning schedules thunder in the audio engine. */
  function makeWeather(){ const w = new Weather(scene); w.onThunder = (delay, strength, km) => audio.thunder(delay, strength, km);
    // Dust devils run on open desert and the ballfield (Veterans), or the lots off B Hill's road (#74).
    if (ACTIVE_MAP === "outdoor") w.desert = new DesertWind(scene, terrainHeight, (x, z) => terrainSurface(x, z) === "sand" || x < -118 || x > 118 || z < -128 || z > 66);
    else if (ACTIVE_MAP === "b_hill") w.desert = new DesertWind(scene, terrainHeight, (x, z) => terrainSurface(x, z) === "dirt");
    return w; }
  let interactions = new WorldInteractions(park,profile), builder = new WarehouseBuilder(park, () => profile), daylight = new Daylight(park), weather = makeWeather();
  // Wheel marks in lawns, ballfield sand and snow (#46); rebuilt with each park.
  let tracks = new WheelTracks(scene);
  // "With Friends" (#47): the park's locals and small things to throw; Veterans only for now.
  let playful: WithFriends | null = null;
  function makeFriends() {
    if (ACTIVE_MAP !== "outdoor") return null;
    const f = new WithFriends(scene, terrainHeight);
    // Acorns under the lawn's trees, rocks by the paths, a paper ball and cans by the benches and the DIY lot.
    const scatter: [number, number, ThrowableKind][] = [[-31.5, 1.5, "acorn"], [-29, 5.5, "acorn"], [-32, 4, "pinecone"], [-83, 11, "rock"], [-85.5, 5, "acorn"], [-44.5, -119, "can"], [-47.5, -123, "rock"], [-45, -124.5, "paper"], [30, -42, "acorn"], [33, -38.5, "rock"], [-22, -34, "paper"], [-25.5, -39.5, "can"]];
    f.populate(VETERANS_LOCALS, capture(sim), profile, scatter);
    // Trash cans (#58): B beside one throws litter away; someone else's counts toward Clean-Up Crew.
    f.bins = interactions.bins;
    f.onBinned = (fromOthers) => {
      events.emit({ type: "worldInteraction", interaction: "bin", item: "litter" });
      if (fromOthers) { missions.litter(); hud.feedback("LITTER BINNED · CLEAN-UP CREW", "good"); } else hud.feedback("BINNED", "good");
    };
    f.local.onHit = (hit) => {
      const item=t('item.'+(hit.item??'acorn'));
      hud.feedback(hit.kind==='shove'?t('playful.shoved'):t(hit.strength==='cosmetic'?'playful.bounce':'playful.bonk',{item}), "warn");
    };
    return f;
  }
  // Mourning doves (#71): a few in the pines and on the pavilion roofs, now and then down on the lawn. Veterans only.
  let doves: Doves | null = null;
  function makeDoves() {
    if (ACTIVE_MAP !== "outdoor") return null;
    const branches = (scene.userData.treePerches as THREE.Vector3[] | undefined) ?? [];
    const perches = branches.filter((_, i) => i % 3 === 0), tables: THREE.Vector3[] = [];
    for (const [x, z] of PAVILIONS) {
      // The roof's peak and the middle of each eave; the picnic table's top for snacks left out.
      perches.push(new THREE.Vector3(x, 5.02, z), ...[[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => new THREE.Vector3(x + dx * 3.45, 3.56, z + dz * 3.45)));
      tables.push(new THREE.Vector3(x + 1.1, 0.79, z + 0.6));
    }
    // Anything a splat can land on: roofs, benches, ramps, the ground.
    const down = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
    const below = (x: number, y: number, z: number) => {
      // A picnic table's collider is one block; its real top and bench seats are lower.
      for (const t of tables) { const dx = Math.abs(x - t.x); if (y > t.y && Math.abs(z - t.z) < 0.95 && dx < 0.85) return dx < 0.45 ? t.y : dx > 0.55 ? 0.475 : terrainHeight(x, z); }
      down.origin = { x, y, z }; const hit = world.castRay(down, 40, true); return hit ? y - hit.timeOfImpact : terrainHeight(x, z);
    };
    const d = new Doves(scene, audio, {
      ground: terrainHeight,
      perches,
      landing(near) {
        for (let i = 0; i < 16; i++) {
          const a = Math.random() * Math.PI * 2, r = 6 + Math.random() * 22, x = near.x + Math.cos(a) * r, z = near.z + Math.sin(a) * r;
          if (terrainSurface(x, z) === "grass" && !inWater(x, z) && below(x, 3, z) - terrainHeight(x, z) < 0.05) return new THREE.Vector3(x, terrainHeight(x, z), z);
        }
        return null;
      },
      litter: () => playful?.litterObjects() ?? [],
      below,
    });
    d.tables = tables;
    d.onSnackEmpty = (at) => playful?.leaveLitter("wrapper", at);
    d.onPoopHit = () => hud.feedback(t("doves.hit"), "warn");
    return d;
  }
  /** Chips eaten out in the park leave crumbs the doves come down for. */
  function ate(kind: string, at: THREE.Vector3) { if (kind === "Chips") doves?.addCrumbs(at); }
  // The rider's phone (D-pad Down): the app hub that replaced the quick wheel.
  const phone = new Phone(), phoneRig = new PhoneRig(phone.texture), messages = new MessageStore();
  let phoneAir = 0;
  // Hold D-pad Down to take the phone out or put it away; taps navigate inside it.
  const phoneHold = new HoldButton();
  // A ring fills while D-pad Down is held, so the half-second hold reads as a hold.
  const holdRing = document.createElement('div');
  holdRing.id = 'phone-hold'; holdRing.hidden = true; holdRing.setAttribute('aria-hidden', 'true'); holdRing.innerHTML = '<i></i>';
  document.querySelector('#app')!.append(holdRing);
  interactions.openOptions=(title,options,sub)=>phone.sheet(title,options,sub);
  camera.mountFlourish=profile.settings.mountFlourish;
  const camcorder=new CamcorderFilter();
  const touchPad=new TouchPad();input.touch=touchPad;
  const applyCamera=()=>{touchPad.mode=profile.settings.touchControls;touchPad.size=profile.settings.touchSize/100;touchPad.opacity=profile.settings.touchOpacity/100;touchPad.leftHanded=profile.settings.touchLeftHanded;touchPad.haptics=profile.settings.touchHaptics;camera.view=profile.settings.cameraView;camera.firstPersonFov=profile.settings.firstPersonFov;camera.thirdPersonFov=profile.settings.thirdPersonFov;camera.motion=profile.settings.cameraMotion;camcorder.enabled=profile.settings.cameraFilter==='camcorder';camcorder.strength=profile.settings.filterStrength/100;};applyCamera();
  rider.applyProfile(profile);
  sim.grindAssist = true;
  sim.tricks.stance = profile.settings.stance;
  sim.tricks.controlStyle = profile.settings.controlStyle;
  audio.enabled = profile.settings.sound;
  // The mix (#71): master, effects, ambience and UI levels; music keeps its own level under the same master.
  const applyVolumes = () => { const v = profile.settings.volumes; audio.setVolumes({ master: v.master / 100, effects: v.effects / 100, ui: v.ui / 100, ambience: v.ambience / 100 }); music.setMaster(v.master / 100); };
  applyVolumes();
  // Sesh Music: one app-level player; the panel only observes it.
  music.setSoundEnabled(audio.enabled);
  void music.loadCatalog();
  // Held buttons that put the phone away must not become a hop, push or trick.
  phone.onClose = () => { input.clear(); pending = emptyInput(); releasePhoneThumbnails(); };
  // Taking the phone out ends an emote that needs the phone hand; a one-hand emote on the other hand plays on.
  phone.onOpen = () => { const e = sim.emote, phoneHand = profile.settings.phoneHand === 'left' ? 1 : 0; if (e && e.id !== 'sit' && !(EMOTES.find(x => x.id === e.id)?.phoneCompatible && e.hand !== phoneHand)) sim.emote = null; sim.running = false; };
  music.onNowPlaying = (track) => {
    if (!music.settings.notifications || (phone.ready && phone.view?.title === 'SESH MUSIC')) return;
    phone.notify('Now playing', track.title + ' · ' + track.artist, 'music');
  };
  const editor = new ParkEditor(renderer, scene);
  editor.getPark = () => park;
  const network=new FreeRide(scene,profile,()=>sim);
  const updateNetworkPlayful=networkPlayful(network,()=>playful,profile,()=>sim);
  const friends=new SocialClient(()=>network.endpoint);
  network.socialCredential=friends.credential;
  friends.onState=()=>phone.refresh();
  friends.onInvite=invite=>phone.notify('Lobby invite',invite.name+' invited you. Open Friends to join.','rider');
  friends.onAccepted=code=>phone.close(()=>void network.connect('join',friends.name,code));
  friends.connect();
  /** The rolling replay history (#41); a new map starts a new one. */
  const replayBuffer=new ReplayBuffer();
  network.onLost=()=>{input.clear();pending=emptyInput();accumulator=0;if(hud.started)hud.setPaused(true);};
  const syncRoomBuilds=()=>builder.setShared(network.status==='Connected'&&network.map==='warehouse'&&ACTIVE_MAP==='warehouse',network.id,m=>network.send({type:'build',generation:network.generation,...m}));
  let showRoomConfirmation=false;
  network.onJoined=()=>{input.clear();pending=emptyInput();accumulator=0;syncRoomBuilds();if(showRoomConfirmation){showRoomConfirmation=false;hud.setPaused(false);menu.root.hidden=false;menu.show('online');}};
  network.onBuilds=pieces=>builder.applySharedSnapshot(pieces);
  network.onBuild=message=>builder.applySharedChange(message);
  events.on(e=>{if(e.type==='playerChat'){messages.add('room','You',e.message,true);if(network.status==='Connected')network.send({type:'chat',message:e.message});}});
  network.onChat=(name,message)=>{messages.add('room',name,message,false);if(!(phone.ready&&phone.view?.title==='MESSAGES'))phone.notify('New message',name+': '+message,'messages');};
  messages.onChange=()=>phone.refresh();
  const menu = new GameMenu(document.querySelector("#start")!, profile);
  // Cloud save starts once the account dialog exists to ask questions in.
  if(new URLSearchParams(location.search).has('account_reset')||new URLSearchParams(location.search).has('account_verify'))void menu.accountPanel.open();
  else void cloud.start();
  network.prepare=async()=>{showRoomConfirmation=menu.screen==='online'&&!menu.root.hidden;if(!hud.started||ACTIVE_MAP!=='outdoor')await menu.onRide('outdoor');};
  menu.networkChoices=()=>!network.endpoint?[{label:'PRIVATE FREE-RIDE / LOCAL TESTING',detail:'An internet room server is not connected to this build yet. Solo and shop visits are available.',action:()=>{}},{label:'PLAY SOLO',action:()=>menu.show('maps')}]:[
    {label:network.status==='Connected'?'ROOM CONNECTED':(network.lan?'LAN / ':'')+network.status,detail:network.status==='Connected'?'Your private room is ready. Share an invite, then enter the park.':network.lastError||(network.lan?'All riders need this Windows release. Host LAN on one PC; Join LAN on the others. Up to eight players per room.':''),action:()=>{}},
    ...(network.status==='Connected'?[{label:'ENTER PARK',action:()=>{menu.root.hidden=true;hud.setPaused(false);input.clear();pending=emptyInput();accumulator=0;}},{label:'COPY ROOM CODE',detail:network.code,action:()=>void copyText(network.code)}]:[]),
    ...(network.lan&&network.id?[{label:'COPY LAN ROOM CODE',action:()=>void copyText(network.code)}]:[]),
    ...(network.id?[{label:'COPY INVITE',action:()=>void copyText(location.origin+location.pathname+'#room='+encodeURIComponent(network.code))},{label:'LEAVE ROOM / PLAY SOLO',action:()=>network.leave()},...network.roster.map(p=>({label:p.name+(p.id===network.owner?' / OWNER':''),detail:p.connected?'Connected':'Reconnecting',action:()=>{if(p.id!==network.id){network.muted.has(p.id)?network.muted.delete(p.id):network.muted.add(p.id);}}})),...(network.owner===network.id?[{label:network.locked?'UNLOCK ROOM':'LOCK ROOM',action:()=>network.send({type:'lock',locked:!network.locked})},...network.roster.filter(p=>p.id!==network.id).map(p=>({label:'REMOVE '+p.name,action:()=>{if(confirm('Remove '+p.name+' from this room?'))network.send({type:'kick',id:p.id});}}))]:[])]:[
    ...(network.secret?[{label:'RECONNECT TO ROOM',action:()=>network.connect('resume')}]:[]),
    {label:'CREATE PRIVATE ROOM',action:()=>network.connect('create',prompt('Guest display name','Rider')||'Rider')},
    {label:'JOIN ROOM',action:()=>{const invite=prompt('Paste invite link or room code',new URLSearchParams(location.hash.slice(1)).get('room')||'');if(invite){const code=invite.includes('#room=')?decodeURIComponent(invite.split('#room=')[1]):invite;network.connect('join',prompt('Guest display name','Rider')||'Rider',code);}}}
    ])];
  network.onChange=()=>{phone.refresh();syncRoomBuilds();if(showRoomConfirmation&&network.lastError&&network.status!=='Connecting'&&network.status!=='Loading'){showRoomConfirmation=false;hud.setPaused(false);menu.root.hidden=false;}if(menu.screen==='online'&&!menu.root.hidden)menu.show('online');};
  const mapFeatures=():MapFeature[]=>{
    const out:MapFeature[]=SPAWNS.map((sp,i)=>({kind:'spawn',x:sp.x,z:sp.z,label:String(i+1)}));
    for(const item of interactions.items)if(item.interactionType!=='bench')out.push({kind:item.interactionType,x:item.position.x,z:item.position.z});
    for(const b of park.benches)out.push({kind:'bench',x:b.x,z:b.z});
    for(const r of park.rails)if(!r.coping)out.push({kind:'rail',x:r.a.x,z:r.a.z,x2:r.b.x,z2:r.b.z});
    for(const d of shopForMap(ACTIVE_MAP)?.displays??[])out.push({kind:'shop',x:d.x,z:d.z,label:d.label});
    // Ramps and features: the built wood park on Veterans, plus any laid-out or placed ramp pieces.
    if(ACTIVE_MAP==='outdoor')for(const m of outdoorRamps)out.push({kind:'ramp',x:(m.x0+m.x1)/2,z:(m.z0+m.z1)/2,label:m.kind});
    const ramps:readonly string[]=CATALOG.Ramps;
    for(const o of activeLayout?.objects??[])if(ramps.includes(o.type))out.push({kind:'ramp',x:o.x,z:o.z,label:o.type});
    for(const r of network.remotes.values()){const p=r.model.root.position;out.push({kind:'friend',x:p.x,z:p.z,label:r.name});}
    return out;
  };
  const mapRide=()=>sim.walking||sim.sitting?'foot' as const:sim.rideable==='longboard'?'longboard' as const:'scooter' as const;
  const phoneMap=new PhoneMap({renderer,scene,features:mapFeatures,player:()=>({x:sim.position.x,z:sim.position.z,yaw:sim.yaw,ride:mapRide()}),
    hide:()=>{const riderShown=rider.root.visible;rider.root.visible=false;weather.setVisible(false);for(const r of network.remotes.values())r.model.root.visible=false;return()=>{rider.root.visible=riderShown;weather.setVisible(true);for(const r of network.remotes.values())r.model.root.visible=true;};}});
  builder.onChange=()=>phoneMap.invalidate();
  /** The phone comes out standing, sitting, or rolling on the ground; never in the air, a trick, a grind or a crash. */
  const minimap=new Minimap(document.querySelector('#app')!,phoneMap),minimapView=new THREE.Vector3();
  const nowPlaying=new NowPlaying(music,document.querySelector('#app')!,document.querySelector('#pause .np-player')!);
  const phoneAllowed=()=>hud.started&&!hud.paused&&!menu.seshOpen&&!menu.shopOpen&&!destinationLoading&&!builder.placement&&!interactions.active&&
    sim.state!=='Bail'&&sim.grounded&&!sim.grind&&!sim.manual.active&&!sim.mantle&&!sim.dropIn.phase&&sim.getUpTimer<=0&&!sim.bodyFlip.active;
  const phoneDeps:PhoneDeps={phone,messages,map:phoneMap,economy,
    openCrate:(id,all=false)=>menu.onOpenCrate(id,all),
    sim:()=>sim,profile:()=>profile,mapId:()=>ACTIVE_MAP,mapName:()=>MAPS.find(m=>m.id===ACTIVE_MAP)?.name??'Map',
    emote:id=>social.perform(id,sim,profile.settings.phoneHand==='left'?1:0),
    openSesh:screen=>{menu.openSesh(screen,ACTIVE_MAP as MapId);input.clear();pending=emptyInput();accumulator=0;},
    switchRide:async kind=>{const r=await economy.setRideable(kind,profile.equipmentRevision??0);if('profile' in r&&r.profile){Object.assign(profile,r.profile);menu.onChange();return '';}return ('error' in r&&r.error)||'Could not switch.';},
    ownsBoard:()=>ownsBoard(loadProfile().wallet,profile.longboard),
    items:()=>interactions,builder:()=>builder,
    compose:()=>social.openChat(),
    network:()=>network,social:()=>friends,
    teleportToPlayer:id=>{
      const remote=network.remotes.get(id),sample=remote?.samples.at(-1);
      if(network.status!=='Connected'||!network.roster.some(p=>p.id===id&&p.connected)||!sample||performance.now()-sample.at>1000)return false;
      const moved=teleportNear(sim,sample.state.position,sample.state.yaw);
      if(moved){input.clear();pending=emptyInput();accumulator=0;camera.reset();}
      return moved;
    },
    replays:{capture:()=>captureReplay(),library:()=>{input.clear();void replay.openLibrary();},seconds:()=>profile.settings.replayHistory},
    // Fast travel (#43): the spot's district loads if it is not this one, then the rider is placed at the spot.
    fastTravel:async spot=>{if(ACTIVE_MAP!==spot.map)await menu.onRide(spot.map);if(ACTIVE_MAP!==spot.map)return;sim.spawnIndex=Math.min(spot.spawn,SPAWNS.length-1);reset();}};
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
  menu.onCameraChange=(settings)=>{profile.settings.cameraView=settings.cameraView;profile.settings.firstPersonFov=settings.firstPersonFov;profile.settings.thirdPersonFov=settings.thirdPersonFov;profile.settings.phoneHand=settings.phoneHand;profile.settings.phoneNotifications=settings.phoneNotifications;profile.settings.cameraMotion=settings.cameraMotion;profile.settings.cameraFilter=settings.cameraFilter;profile.settings.filterStrength=settings.filterStrength;profile.settings.touchControls=settings.touchControls;profile.settings.touchSize=settings.touchSize;profile.settings.touchOpacity=settings.touchOpacity;profile.settings.touchLeftHanded=settings.touchLeftHanded;profile.settings.touchHaptics=settings.touchHaptics;profile.settings.volumes={...settings.volumes};applyVolumes();applyCamera();};
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
  rewards.preview=(partId,variantId,container)=>container.replaceChildren(menu.renderPartPreview(renderer,{partId,variantId}));
  rewards.onClose=()=>{input.clear();pending=emptyInput();accumulator=0;if(!menu.root.hidden&&menu.screen==='crates')menu.show('crates');};
  menu.overlayOwnsInput=()=>rewards.open;
  menu.onOpenCrate=(id,all=false)=>{if(rewards.open)return;const crates=[...profile.progress.crates],crate=crates.find(c=>c.id===id);if(!crate)return;input.clear();pending=emptyInput();accumulator=0;if(all)void rewards.openAll(crates);else rewards.openCrate(crate);};
  menu.onPurchased=item=>rewards.purchase(item);
  menu.onChange = () => {setLocale(profile.settings.language);applyUiPalette(profile.settings.uiPalette);appearancePending=true;network.send({type:"appearance",generation:network.generation,appearance:riderAppearance(profile)});network.send({type:'playful-contact',generation:network.generation,contact:profile.settings.playfulContact});
    sim.grindAssist = true;
    sim.tricks.stance = profile.settings.stance;
    sim.tricks.controlStyle = profile.settings.controlStyle;
    audio.enabled = profile.settings.sound;
    music.setSoundEnabled(audio.enabled);
    applyVolumes();
    camera.mountFlourish=profile.settings.mountFlourish;applyCamera();
    fidelity.apply(scene,profile.settings.fidelity);
    menu.previewScene.environment=fidelity.environment;
    document.querySelector("#sound")!.textContent = audio.enabled
      ? t('common.on')
      : t('common.off');
  };
  document.querySelector("#sound")!.textContent = audio.enabled ? t('common.on') : t('common.off');
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
  let destinationLoading:Promise<void>|null=null;
  const loadDestination = async (id:MapId) => {
    // Callers must await a real load, never receive a false "ready" while another map loads.
    while(destinationLoading)await destinationLoading;
    const loading=(async()=>{input.clear();
    try{await loadingStage(id==="techno_gravity"?"Traveling to Techno Gravity Shop":id==="b_hill"?"Heading up B\u00a0Hill":id==="church"?"Heading to the Church":"Loading your park",10);
    if(id==="techno_gravity"){const shop=await import("./park/shop");shop.installShop();}
    if(id==="church"){const church=await import("./park/church");church.installChurch();}
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
    weather.prepare();
    await renderer.compileAsync(scene,camera.camera);
    await loadingStage("Ready to ride",100);finishLoading();
    }catch(error){loadingFailed();throw error;}finally{input.clear();pending=emptyInput();accumulator=0;}
    })();
    destinationLoading=loading;
    try{await loading;}finally{if(destinationLoading===loading)destinationLoading=null;}
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
  // The first-swim moment plays once, even before the mission save catches up.
  let firstSwimShown = false;
  events.on((e) => {
    audio.event(e);
    if (e.type === "splash") waterEffects.splash(e.x, e.z);
    // Diving or jumping in takes the first-person view under for a moment; wading in does not.
    if (e.type === "swim" && e.phase === "enter") {
      // The ride waits at the water's edge; the first swim gets its moment.
      interactions.parkAtShore(sim, e.shore[0], e.shore[1], e.yaw);
      if (!profile.progress.firsts.includes("swim") && !firstSwimShown) { firstSwimShown = true; rewards.firstSwim(); if (sim.swim) sim.swim.celebrate = 1.8; }
      missions.first("swim");
    }
    if (e.type === "swim" && e.trick?.clean && e.trick.rotations >= 1) missions.first("water-flip");
    if (e.type === "swim" && e.phase === "enter" && e.trick?.clean && !e.fromRide) {
      // Water missions (data/progress.ts, WATER group), read off the entry.
      const t = e.trick, name = t.name;
      if (name === "Cannonball") missions.first("water:cannonball");
      if (t.entry === "head") missions.first("water:dive");
      if ((t.height ?? 0) >= 3.5) missions.first("water:tower");
      if (t.board && t.rotations >= 0.9) missions.first("water:board");
      if (/\d{3} *(Twist)?$/.test(name) && t.rotations >= 0.9) missions.first("water:twist");
      if (name.startsWith("Swan Dive")) missions.first("water:swan");
      if (t.rotations >= 1.8) missions.first("water:double");
    }
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
    replayBuffer.clear();
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
      playful?.dispose();playful=null;doves?.dispose();doves=null;
      scene.clear();
      fidelity.disposeScene();
      selectPark(id);
      world = new RAPIER.World({ x: 0, y: -TUNE.gravity, z: 0 });
      world.timestep = TUNE.step;
      park = new Park(scene, world);
      sim = new Simulation(world, park, events);
      rider = new RiderModel(scene);
      rider.root.userData.weatherDynamic=true;
      interactions=new WorldInteractions(park,profile);builder=new WarehouseBuilder(park,()=>profile);builder.onChange=()=>phoneMap.invalidate();daylight=new Daylight(park);weather=makeWeather();tracks=new WheelTracks(scene);playful=makeFriends();doves=makeDoves();interactions.onAte=ate;
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
      (OUTDOOR ? "VETERANS MEMORIAL PARK" : ACTIVE_MAP==="techno_gravity"?"TECHNO GRAVITY SHOP":ACTIVE_MAP==="b_hill"?"B HILL":ACTIVE_MAP==="church"?"THE CHURCH":"WAREHOUSE <b>01</b>") +
      '<span id="score">SESH 0 / LINE 0</span>';
    document.querySelector("#spawn")!.innerHTML = SPAWNS.map(
      (s, i) => `<option value="${i}">${s.name}</option>`,
    ).join("");
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
          case "capture-replay":
            hud.setPaused(false);
            captureReplay();
            break;
          case "replays":
            hud.setPaused(false);
            input.clear();
            void replay.openLibrary();
            break;
          // The Sesh menu's Now Playing controls: the same MusicService as the phone.
          case "music-prev": music.previous(); break;
          case "music-toggle": music.togglePlay(); break;
          case "music-next": music.next(); break;
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
          // Parks, shops, rides, rider and music moved to the phone and the main menu (#65).
          case "scooter":
          case "online":
          case "settings":
            menu.openSesh(button.dataset.action!,ACTIVE_MAP as MapId);
            (document.querySelector("#pause") as HTMLElement).hidden=true;
            input.clear();pending=emptyInput();accumulator=0;
            break;
          case "sound":
            audio.enabled = !audio.enabled;
            music.setSoundEnabled(audio.enabled);
            profile.settings.sound = audio.enabled;
            saveProfile(profile);
            document.querySelector("#sound")!.textContent = audio.enabled
              ? t('common.on')
              : t('common.off');
            break;
        }
      }),
    );
  window.addEventListener("keydown", (e) => {
    if (e.code === "Enter" && !hud.started && !e.repeat && !rewards.open && !menu.accountPanel.dialog.open && !menu.root.hidden && !(e.target instanceof HTMLElement && e.target.closest('button,input,textarea,select,[contenteditable="true"]'))) menu.select();
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
  // Replays (#41): the rolling history is recorded as rider state every frame
  // of live play (render below); the editor owns input and the screen while open.
  const replay=new ReplayEditor({scene,renderer,camera,profile:()=>profile,sim:()=>sim,mapId:()=>ACTIVE_MAP,
    mapName:id=>MAPS.find(m=>m.id===id)?.name??'Map',
    loadMap:async id=>{await menu.onRide(id as MapId);},
    draw:(dt,view,focus,yaw)=>{
      const live=profile.settings.liveSky?liveSky.current(cityForMap(ACTIVE_MAP)):null;
      daylight.update(dt,live?.phase??profile.settings.daylight,focus,renderer,{flashlight:profile.settings.flashlight,yaw,sidereal:live?.sidereal,live:!!live});
      weather.update(dt,live?.weather??profile.settings.weather,focus,profile.settings.fidelity,{camera:view.position,live:live?.conditions});
      camcorder.render(renderer,scene,view);
    },
    setLiveHidden:hidden=>{
      rider.root.visible=!hidden;for(const r of network.remotes.values()){r.model.root.visible=!hidden;r.label.hidden=hidden;}
      document.body.classList.toggle('replay-open',hidden);
      if(hidden&&phone.active)phone.stow();
    }});
  /** Opens the last 15-60 s in the Replay Editor; the live history carries on untouched. */
  function captureReplay(){
    const clip=replayBuffer.snapshot({map:ACTIVE_MAP,layout:null,rideable:sim.rideable,appearance:riderAppearance({...profile,rideable:sim.rideable})});
    if(clip.frames.length<15){phone.notify('Replays','Ride a little first: nothing to replay yet.');return false;}
    input.clear();pending=emptyInput();accumulator=0;
    replay.openCapture(clip);
    return true;
  }
  window.addEventListener("resize", () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.resize();
    replay.resize(camera.camera.aspect);
  });
  await loadingStage("Ready",100);finishLoading();
  let last = performance.now(),
    accumulator = 0,
    fps = 60,
    frame = emptyInput(),
    testMode = false;
  const lampAt=new THREE.Vector3(),lampDir=new THREE.Vector3();
  const render = (dt: number, alpha = 1) => {
    const worldFrozen = hud.started && (hud.paused || !menu.root.hidden || menu.seshOpen || menu.shopOpen || rewards.open);
    if (!worldFrozen) {
    if(appearancePending&&sim.grounded&&!sim.grind&&!sim.manual.active){rider.applyProfile(profile);appearancePending=false;
      // Switching rideable takes effect on the ground, never mid-air or mid-grind,
      // and not while the current one sits in a rack.
      if(sim.rideable!==profile.activeRideable&&!interactions.stored){sim.rideable=profile.activeRideable;sim.board.reset();}}
    // "Match Boulder City now" (#48) swaps in the city's real time and weather, and turns the stars to the real hour.
    const live=profile.settings.liveSky?liveSky.current(cityForMap(ACTIVE_MAP)):null;
    daylight.update(dt,live?.phase??profile.settings.daylight,sim.position,renderer,{flashlight:profile.settings.flashlight,yaw:sim.yaw,sidereal:live?.sidereal,live:!!live});
    weather.update(dt,live?.weather??profile.settings.weather,sim.position,profile.settings.fidelity,{camera:camera.camera.position,velocity:sim.velocity,yaw:sim.yaw,riding:!sim.walking&&!sim.sitting&&sim.rideable==='scooter',grounded:sim.grounded,landing:sim.landTimer,live:live?.conditions});
    tracks.update(dt,sim,weather.snowDepth,weather.wetness);
    audio.weather(weather.rain);
    fidelity.update(sim.position,dt);
    waterEffects.update(dt, sim.elapsed);
    if (sim.swim && !sim.swim.out) waterEffects.swimmer(sim.position.x, sim.position.z, Math.hypot(sim.velocity.x, sim.velocity.z) > 0.6, dt);
    camera.rider=rider;rider.hideHead=camera.firstPersonActive&&camera.view==='first';
    // Phone: arm and head follow its raise; in first person the hand is placed from the eye below.
    phone.tick(dt);
    hud.phoneHint = phone.active ? 'PHONE · LS MOVE · A SELECT · B BACK · Y HOME · HOLD D-PAD DOWN PUT AWAY' : '';
    const phoneHand = profile.settings.phoneHand === 'left' ? 1 : 0, raise = phone.raise * phone.raise * (3 - 2 * phone.raise);
    const firstPersonPhone = camera.view === 'first' && camera.firstPersonActive && raise > 0;
    phone.firstPerson = firstPersonPhone;
    rider.phoneTilt = raise * (firstPersonPhone ? READ_TILT.first : READ_TILT.third);
    rider.phonePose = raise > 0 ? (r: RiderModel) => phoneRig.pose(r, raise, phoneHand, null) : null;
    camera.phonePitch = raise * READ_TILT.first;
    rider.update(sim, dt, alpha);
    if(hud.started){replayBuffer.history=profile.settings.replayHistory;replayBuffer.record(sim.elapsed,()=>capture(sim),camera.view==='first'&&camera.firstPersonActive?'first':'third');}
    interactions.online=!!network.id;interactions.render(rider);playful?.render(dt,sim.elapsed,rider.hands[0]);
    const cameraBlocked=menu.shopOpen||hud.paused||!hud.started||!social.chat.hidden||!!builder.placement;
    if(!cameraBlocked)camera.update(sim, frame, dt, alpha);
    // Sounds placed in the world (doves) are heard from the camera (#71).
    audio.setListener(camera.camera.position,camera.camera.getWorldDirection(lampDir),camera.camera.up);
    // The headlamp (#64): worn and lit only at night with the setting on; the beam
    // leaves the lamp on the head (or the eye in first person, so the trick camera carries it).
    {const lampOn=profile.settings.flashlight&&daylight.nightLevel>.02;rider.avatar.setHeadlamp(lampOn);
     if(lampOn){const eye=camera.view==='first'&&camera.firstPersonActive;
      if(eye)daylight.aimLamp(lampAt.copy(camera.camera.position),camera.camera.getWorldDirection(lampDir));
      else{const housing=rider.avatar.headlamp.housing;housing.updateWorldMatrix(true,false);daylight.aimLamp(housing.getWorldPosition(lampAt),housing.getWorldDirection(lampDir));}}}
    // Placing a build piece: the build camera frames the ghost instead.
    if(builder.placement)builder.frame(camera.camera,dt);
    if (firstPersonPhone && camera.firstPersonActive) { phoneRig.pose(rider, raise, phoneHand, camera.camera); rider.avatar.update(sim.elapsed); }
    phoneRig.attach(rider, phoneHand, raise);
    phoneRig.layer(rider, phoneHand, firstPersonPhone && camera.firstPersonActive);
    rider.hideHead=camera.firstPersonActive&&camera.view==='first';
    rider.avatar.setFirstPerson(rider.hideHead);
    }
    // Under the lake (#62): the basin's ripples and caustics move on; with the eye under, the water closes in.
    {const light=1-.85*daylight.nightLevel;(scene.userData.lakeBasin as {update(dt:number,sky?:THREE.Color,light?:number):void}|undefined)?.update(dt,(scene.userData.sky as {horizon?:THREE.Color}|undefined)?.horizon,light);
     underwater.update(camera.camera,dt,light,ACTIVE_MAP==='outdoor'&&hud.started);}
    const overlayOpen=!menu.root.hidden||hud.paused||rewards.open;document.body.classList.toggle("ui-open",overlayOpen);
    // Menus, the music phone and radials are tapped directly; the virtual pad steps aside
    // (and releases everything) while they own input, except in the controller test view.
    touchPad.suspended=(overlayOpen||phone.active||!social.chat.hidden)&&!touchPad.preview;
    // Keep the last world pose/camera underneath translucent pause menus. Rendering
    // that unchanged scene also survives resize/context compositing without a screenshot.
    if (hud.started){if(!worldFrozen)network.render(camera.camera,dt);camcorder.render(renderer,scene,camera.camera,phone.firstPerson&&camera.firstPersonActive&&!worldFrozen?()=>phoneRig.renderCloseUp(renderer,scene,camera.camera,dt):undefined);if(menu.shopOpen||menu.seshOpen)menu.preview(renderer);}
    else {renderer.setClearColor(0x15161a);renderer.clear();menu.preview(renderer);}
    hud.update(sim, input, dt, fps, renderer.info.render.calls);
    const balance=document.querySelector("#score");if(balance)balance.textContent+=" / "+profile.wallet.credit+" Coins";
    rewards.showChip(hud.started&&!hud.paused&&!menu.seshOpen&&!menu.shopOpen);
    // Minimap: only over live riding, never over menus, the phone, loading or building.
    camera.camera.getWorldDirection(minimapView);
    const liveHud=hud.started&&!hud.paused&&menu.root.hidden&&!menu.seshOpen&&!menu.shopOpen&&!destinationLoading&&!phone.active&&!editor.active&&!rewards.open;
    minimap.update(dt,liveHud&&!builder.placement,ACTIVE_MAP,Math.atan2(minimapView.x,minimapView.z),mapRide());
    nowPlaying.update(liveHud);
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
    touchPad.suspended=(!menu.root.hidden||hud.paused||phone.active||!social.chat.hidden||rewards.open)&&!touchPad.preview;
    input.poll();
    if(mobile.update(input)){audio.update(0,false,false,true);accumulator=0;return;}
    frame = input.consume();
    if(destinationLoading){audio.update(0,false,false,true);return;}
    if (editor.active) {
      editor.update(frame, dt);
      return;
    }
    missions.update(dt);
    if(replay.open){replay.update(frame,dt);audio.update(0,false,false,true);replay.draw(dt);return;}
    if(rewards.open){rewards.update(frame,dt);audio.update(0,false,false,true);render(dt);return;}
    if(menu.shopOpen||menu.seshOpen){menu.update(frame,dt);audio.update(0,false,false,true);render(dt);return;}
    if (!hud.started || !menu.root.hidden) {
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
    frame = phoneStep(frame, dt);
    shopPrompt.hidden=true;
    if(sim.walking){const shop=shopForMap(ACTIVE_MAP);const nearest=shop?.displays.find(d=>Math.hypot(sim.position.x-d.x,sim.position.z-d.z)<1.6);if(shop&&nearest){shopPrompt.hidden=false;shopPrompt.textContent='B / Browse '+nearest.label+' / '+shop.name;if(frame.pressed.brakeBars){if(nearest.category==='longboard')menu.openBoardShop(shop.id);else menu.openShop(nearest.category,shop.id);input.clear();accumulator=0;render(dt);return;}}}
    if(builder.placement)frame=builder.update(sim,frame,dt);
    else {
      frame = social.update(sim, frame, dt);
      if(playful){
        updateNetworkPlayful();
        playful.rules.contact=profile.settings.playfulContact;
        const held=profile.pockets.entries.find(i=>i.id===profile.pockets.held);
        const heldEmpty:ThrowableKind|null=held?.state==='empty'?({Chips:'wrapper',Soda:'can',Water:'bottle','Sports drink':'sports','Party Popper':'popper'} as Partial<Record<string,ThrowableKind>>)[held.kind]??null:null;
        frame=playful.update(dt,frame,sim,social.chat.hidden&&!phone.active,heldEmpty,()=>{if(held)interactions.discard(held.id);});
      }
      doves?.update(dt,{rider:sim.position,speed:sim.walking?0:Math.hypot(sim.velocity.x,sim.velocity.z),night:daylight.nightLevel,rain:weather.rain});
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
  /**
   * The phone's share of one frame of input: hold D-pad Down to take it out or
   * put it away; while it is out it owns every button and gameplay gets an
   * empty frame. Returns what gameplay receives.
   */
  function phoneStep(frame: InputFrame, dt: number): InputFrame {
    const phoneHeld = phoneHold.update(frame.held.menuDown > 0.5 && social.chat.hidden, dt);
    holdRing.hidden = phoneHold.progress < 0.25 || (!phone.active && !phoneAllowed());
    if (!holdRing.hidden) holdRing.style.setProperty('--p', phoneHold.progress.toFixed(3));
    if (phone.active) {
      if (sim.state === "Bail") phone.stow();
      phoneAir = sim.grounded ? 0 : phoneAir + dt;
      if (phoneAir > 0.2 || sim.grind || sim.manual.active) phone.close();
      if (phoneHeld) phone.close();
      else if (social.chat.hidden) phone.update(frame, dt);
      return emptyInput();
    }
    if (phoneHeld && phoneAllowed()) {
      phone.open();
      return emptyInput();
    }
    if (frame.held.menuDown > 0.5 || frame.released.menuDown) {
      // The press belongs to the hold gesture, never to gameplay.
      frame.held.menuDown = 0; frame.pressed.menuDown = false; frame.released.menuDown = false;
    }
    return frame;
  }
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
      friends,
      teleportToPlayer:phoneDeps.teleportToPlayer,
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
      get tracks() { return tracks; },
      /** With Friends playful interactions (#47): locals, throwables, shoves. */
      get playful() { return playful; },
      /** Mourning doves (#71). */
      get doves() { return doves; },
      audio,
      social,
      get builder(){return builder;},get interactions(){return interactions;},get daylight(){return daylight;},get weather(){return weather;},underwater,
      music, phone, phoneRig, phoneMap, messages, phoneAllowed: () => phoneAllowed(),
      replay, replayBuffer, captureReplay: () => captureReplay(),
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
      /** The main loop's phone input step, for tests. */
      phoneStep: (values: Partial<InputFrame>, dt = 1 / 60) => phoneStep({ ...emptyInput(), ...values, held: { ...emptyInput().held, ...values.held }, pressed: { ...emptyInput().pressed, ...values.pressed }, released: { ...emptyInput().released, ...values.released } }, dt),
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
