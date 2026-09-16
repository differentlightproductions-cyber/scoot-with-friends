import {SHOPS,shopStock} from '../data/shops';
import {CreditEconomy,owns} from '../data/credit';
import {catalogEntry,completeBoardSelections,bundlePrice,ownsBoard} from '../data/catalog';
import {LONGBOARD_CATEGORIES,LONGBOARD_PARTS,longboardPart,type LongboardCategory} from '../data/longboardParts';
import {BODY_BUILDS} from '../scooter/body-fit';
import {AccountPanel} from './account';
import {loadProfile} from '../data/loadout';
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
const PARK_MAPS=MAPS.filter(m=>m.id!=="techno_gravity").sort((a,b)=>Number(b.id==="outdoor")-Number(a.id==="outdoor"));
export class GameMenu {
  accountPanel = new AccountPanel();
  screen = "home";
  seshOpen=false;currentMap:MapId='outdoor';onCloseSesh=()=>{};
  private savedProfile:LocalProfile|null=null;private travelMap:MapId='outdoor';
  openSesh(screen:string,map:MapId){this.seshOpen=true;this.currentMap=map;this.savedProfile=this.profile;const latest=loadProfile();if((latest.equipmentRevision??0)>(this.profile.equipmentRevision??0)){this.profile.scooter=structuredClone(latest.scooter);this.profile.longboard=structuredClone(latest.longboard);this.profile.activeRideable=latest.activeRideable;this.profile.equipmentRevision=latest.equipmentRevision;this.onChange();}this.profile=structuredClone(this.profile);this.root.hidden=false;this.show(screen);}
  private applySesh(){
    const latest=loadProfile();if((latest.equipmentRevision??0)!==(this.profile.equipmentRevision??0)){this.notice='Setup changed in another tab. Cancel and reopen before applying.';this.render();return;}
    for(const item of Object.values(this.profile.scooter))if(!owns(latest.wallet,item)){this.notice='An equipped item is not owned.';this.render();return;}
    if(this.profile.activeRideable==='longboard'&&!ownsBoard(latest.wallet,this.profile.longboard)){this.notice='Own every part of this board before riding it.';this.render();return;}
    const nextRevision=(this.profile.equipmentRevision??0)+1;this.profile.equipmentRevision=nextRevision;
    if(!saveProfile(this.profile)){this.profile.equipmentRevision=nextRevision-1;this.saveFailed=true;this.notice='Could not save. Retry or cancel.';this.render();return;}
    Object.assign(this.savedProfile!,structuredClone(this.profile));this.onChange();this.notice='Changes saved on this device.';this.saveFailed=false;this.render();
  }
  private closeSesh(){this.profile=this.savedProfile!;this.savedProfile=null;this.seshOpen=false;this.root.hidden=true;this.root.classList.remove('sesh-overlay');this.onCloseSesh();}

  shopOpen=false;onCloseShop=()=>{};owner=()=>false;economy=new CreditEconomy();notice='';private pendingVariant='';private buying=false;
  activeShop=SHOPS[0];
  /** Browsing the Sometimes Summer wall opens the board builder in shop mode. */
  openBoardShop(shopId='techno_gravity'){this.activeShop=SHOPS.find(s=>s.id===shopId)??SHOPS[0];this.shopOpen=true;this.root.hidden=false;this.show('longboard');}
  boardCategory:LongboardCategory='deck';
  openShop(category:Category,shopId='techno_gravity'){this.activeShop=SHOPS.find(s=>s.id===shopId)??SHOPS[0];this.shopOpen=true;this.root.hidden=false;this.category=category;this.show('parts');}
  private async equip(partId:string,variantId:string){
    if(this.buying)return;const selection={partId,variantId};if(!owns(loadProfile().wallet,selection))return;
    const entry=catalogEntry(partId);
    if(entry?.rideable==='longboard'){
      if(this.seshOpen){this.profile.longboard[entry.category as LongboardCategory]=selection;this.changed();this.render();return;}
      this.buying=true;this.notice='Saving board?';this.render();const result=await this.economy.equip(selection,this.profile.equipmentRevision??0);this.buying=false;
      if(result.profile){Object.assign(this.profile,result.profile);this.previewRider.applyProfile(this.profile);this.onChange();this.notice='Board saved on this device.';this.saveFailed=false;}else{this.notice=result.error??'Could not save';this.saveFailed=true;}this.render();return;
    }
    const part=PARTS.find(p=>p.id===partId)!;
    if(this.seshOpen){if(part.category==='wheels'){this.profile.scooter.frontWheel={...selection};this.profile.scooter.rearWheel={...selection};}else this.profile.scooter[part.category]=selection;this.changed();this.render();return;}
    this.buying=true;this.notice='Saving equipment?';this.render();const result=await this.economy.equip(selection,this.profile.equipmentRevision??0);this.buying=false;
    if(result.profile){Object.assign(this.profile,result.profile);this.previewRider.applyProfile(this.profile);this.onChange();this.notice='Equipped / saved on this device.';this.saveFailed=false;}else{this.notice=result.error??'Could not save';this.saveFailed=true;}this.render();
  }

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
  focusBox = new THREE.Box3Helper(new THREE.Box3(), 0xb9c9c5);
  isolatedProduct = new THREE.Group();
  private focusKey = "";
  private saveFailed = false;
  onRide = (_map: MapId) => {};
  onChange = () => {};
  onEditor = () => {};
  networkChoices=():{label:string;detail?:string;action:()=>void}[]=>[];
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
    this.previewScene.add(this.isolatedProduct);
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
          this.shopOpen?.06:.8,
          7,
        );
      },
      { passive: true },
    );
    this.previewScene.add(new THREE.HemisphereLight(0xffffff, 0x777777, 2.4));
    const light = new THREE.DirectionalLight(0xffffff, 3);
    light.position.set(-3, 5, 4);
    this.previewScene.add(light);
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(5, 48),
      new THREE.MeshStandardMaterial({ color: 0xb6beb2, roughness: 1 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.01;
    floor.name='Preview floor';
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
    if(this.seshOpen){this.previewRider.applyProfile(this.profile);return;}
    this.saveFailed = !saveProfile(this.profile);
    this.previewRider.applyProfile(this.profile);
    this.onChange();
  }
  /** Switch the ridden rideable; the other build stays saved untouched. */
  private async ride(kind:'scooter'|'longboard'){
    if(this.buying)return;
    if(kind==='longboard'&&!ownsBoard(loadProfile().wallet,this.profile.longboard)){this.notice='Own a complete Sometimes Summer board first. Techno Gravity sells them.';this.render();return;}
    if(this.seshOpen){this.profile.activeRideable=kind;this.changed();this.render();return;}
    this.buying=true;this.render();const result=await this.economy.setRideable(kind,this.profile.equipmentRevision??0);this.buying=false;
    if(result.profile){Object.assign(this.profile,result.profile);this.onChange();this.notice=kind==='longboard'?'Riding the longboard.':'Riding the scooter.';}else this.notice=result.error??'Could not save';this.render();
  }
  private selected(category: Category) {
    return this.profile.scooter[
      category === "wheels" ? "frontWheel" : category
    ];
  }
  private render() {
    this.root.classList.toggle('shop-overlay',this.shopOpen);this.root.classList.toggle('sesh-overlay',this.seshOpen);
    const parkMaps=PARK_MAPS;
    this.root.dataset.screen=this.screen;
    const add = (
      label: string,
      action: () => void,
      detail?: string,
      selected = false,
    ) => this.choices.push({ label, action, detail, selected });
    this.choices = [];
    let title = "FIND YOUR FLOW.",
      subtitle = "YOUR NEXT SESH STARTS HERE";
    switch (this.screen) {
      case "online":
        title="PRIVATE FREE-RIDE";subtitle="UNRANKED ALPHA / VETERANS MEMORIAL PARK";for(const c of this.networkChoices())add(c.label,c.action,c.detail);break;
      case "home":
        add("PLAY",()=>this.show("play"),"Find your next line");
        add("SHOPS",()=>this.show("shops"),"Visit, browse, and ride");
        add("CUSTOMIZATION",()=>this.show("customization"),"Character, clothing, and scooter");
        add("SETTINGS",()=>this.show("settings"),"Preferences and trick book");
        add("ACCOUNT",()=>{void this.accountPanel.open();},"Sign in / Create account");
        break;
      case "play":
        title="PLAY";subtitle="YOUR NEXT SESH";
        add("SOLO",()=>this.show("maps"),"Choose a park and ride");
        add("PRIVATE FREE-RIDE",()=>this.show("online"),"Invite friends to a private room");break;
      case "customization":
        title="CUSTOMIZATION";subtitle="MAKE IT YOURS";
        add("RIDER",()=>this.show("characters"),RIDERS.find(r=>r.id===this.profile.riderId)?.name);
        add("SCOOTER",()=>this.show("scooter"),"Parts and authored colorways");
        add("LONGBOARD",()=>this.show("longboard"),"Sometimes Summer / "+(ownsBoard(loadProfile().wallet,this.profile.longboard)?longboardPart(this.profile.longboard.deck).variant.name+' build':'available at Techno Gravity'));
        add("RIDE / "+this.profile.activeRideable.toUpperCase(),()=>void this.ride(this.profile.activeRideable==='scooter'?'longboard':'scooter'),'Switch what you take out. Both builds stay saved.');break;
      case "guide":
        title="HELP & CONTROLS";subtitle="LEARN YOUR NEXT TRICK";
        add("TRICK BOOK",()=>this.show("tricks"),"Inputs, combinations, and riding controls");break;
      case "tricks":
        add('CAMERA / STATIONARY TRICKS',()=>{},'On foot: RS looks around. On scooter: RS always preloads and tricks, even stopped. No setup toggle. R3/V recenters; L3/F runs on foot.');
        add("CREDIT / ALPHA ECONOMY",()=>{},"Every 100 banked points earns 1 Credit. Buy authored parts at Techno Gravity. Cash is unavailable. Saves stay on this device.");
        title = "TRICK BOOK";
        subtitle = "READ THE MOVEMENT, THEN MAKE IT YOURS";
        add("BUNNY HOP / TUCK", () => {}, "RS fully down to crouch, then return it 90% up to pop. A neutral release stands up; holding a tuck reduces drag at speed and helps on downhills.");
        add("TAILWHIP / BARSPIN", () => {}, "Pro: stance whip button / B. Arcade: B whip / X bars. Tap once or hold for continuous rotations.");
        add("HEEL / FINGER WHIP", () => {}, "LT + whip = heelwhip. RT + whip = fingerwhip. LT + RT + whip = opposite fingerwhip.");
        add("BRI / INWARD BRI", () => {}, "RS down → lower-left → left = Bri. Down → lower-right → right = Inward. A complete circle still works. Finish the scoop near a ramp lip for an upward pop.");
        add("KICKLESS / REWIND", () => {}, "During an active whip: tap the opposite-direction bumper to Rewind, or hold it for Kickless. Regular natural whip: LB; Goofy: RB. Heelwhips swap those sides. Attempts can fail if landed unfinished. RS up remains an alternate Kickless flick.");
        add("FRONTFLIP / BACKFLIP", () => {}, "During any valid air, hold LT + RT and move LS forward/back. Diagonal LS adds spin. Release eases rotation; countersteer brakes it. Natural ramp air and scooter trick combinations also permit flips.");
        add('SUPERMAN / GRABS',()=>{},'In the air, hold RT + Y for Superman (one trigger). LT + Y grabs the deck. LT + LB + Y tucks no-hands. RS charged takeoffs still work with a body-trick chord held.');
        add("FASTPLANT FRONTFLIP", () => {}, "At a reachable ramp/drop edge with enough speed and space, hold RT + LS forward and press physical A. The back foot plants, pushes once, then releases. Flat ground and midair cannot plant.");
        add("SPINS / FAKIE", () => {}, "Use LS while airborne to spin and shift your weight. Land rolling backward to enter fakie; hold it to build score.");
        add("GRINDS / MANUALS", () => {}, "RT asks for a close rail catch. Hold RS gently 20–50% down/up for manual/nose manual, then balance. A deeper down stroke loads a hop out. LB + RS remains an alternate manual input.");
        add("BODY TRICKS", () => {}, "Y in air = no-hander. RT + Y Superman; LT + Y deck grab; LT + LB + Y tuck. Bumpers + Y add can-can, one-foot, or no-foot.");
        add("WALKING / RECOVERY", () => {}, "Y dismounts or mounts. LS walks, LS click runs while carrying the scooter, A climbs, B sits at a bench. After a bail, press A to get up.");
        add("ON-FOOT SOCIAL", () => {}, "Hold D-pad Left and choose with RS, release to emote or build in the Warehouse. Hold D-pad Right for local chat. Enter sends; Esc/B cancels. Private room chat is shared with connected friends; solo chat stays local.");
        add("COPING STALL", () => {}, "Hold LT while riding into spine coping to brake into a stall. Shift with LS left/right, then lean forward or back to drop in.");
        break;
      case 'travel':
        title='TRAVEL TO '+MAPS.find(m=>m.id===this.travelMap)!.name;subtitle='YOUR OWNED GEAR TRAVELS WITH YOU';
        add('TRAVEL',()=>{const target=this.travelMap;this.closeSesh();this.onRide(target);},'Unapplied setup edits are discarded. Current attempt ends.');add('CANCEL',()=>this.show('maps'));break;
      case "shops":
        title='SHOPS';subtitle='LOCAL SHOPS / PLACES TO RIDE';
        for(const shop of SHOPS)add(shop.name,()=>{if(this.seshOpen){this.travelMap=shop.mapId;this.show('travel');}else this.onRide(shop.mapId);},shop.description,this.currentMap===shop.mapId);
        break;
      case "maps":
        title = "MAP SELECT";
        subtitle = "CHOOSE YOUR PARK";
        for (const map of PARK_MAPS)
          add(map.name, () => {if(this.seshOpen){this.travelMap=map.id;this.show('travel');}else this.onRide(map.id);}, map.type,this.seshOpen&&map.id===this.currentMap);

        break;
      case "rider":
        add('BACKPACK',()=>{this.profile.pockets.backpack=!this.profile.pockets.backpack;this.changed();this.render();},this.profile.pockets.backpack?'Equipped / same inventory':'Off / Pockets');
        add('BODY BUILD',()=>this.show('body-build'),this.profile.bodyBuild.toUpperCase());
        title = "RIDER";
        subtitle = "SAME PHYSICS. YOUR STYLE.";
        for(const slot of OUTFIT_SLOTS)add(slot.toUpperCase(),()=>{this.outfitSlot=slot;this.show('clothing');},clothing(this.profile.outfit,slot).name);
        add('CHANGE CHARACTER',()=>this.show('characters'),RIDERS.find(r=>r.id===this.profile.riderId)?.name);
        break;
      case "characters":
        title="CHOOSE YOUR RIDER";subtitle="THREE RIDERS. YOUR STYLE.";
        for (const rider of RIDERS)
          add(
            rider.name,
            () => {
              this.profile.riderOutfits[this.profile.riderId]={...this.profile.outfit};
              const defaults=rider.id==='rider-02'?{head:'head-none-black',top:'top-hoodie-gray',bottom:'bottom-chinos-sand',shoes:'shoes-high-top-navy'}:rider.id==='rider-03'?{head:'head-none-black',top:'top-tee-forest',bottom:'bottom-shorts-black',shoes:'shoes-skate-gray'}:{head:'head-helmet-red',top:'top-tee-sand',bottom:'bottom-chinos-forest',shoes:'shoes-low-top-black'};
              this.profile.outfit={...(this.profile.riderOutfits[rider.id]??defaults)};
              this.profile.riderId = rider.id;
              this.profile.outfitId = rider.outfitId;
              this.changed();
              this.show("rider");
            },
            rider.description,
            this.profile.riderId === rider.id,
          );
        break;
      case 'body-build':
        title='BODY BUILD';subtitle='COSMETIC FIT / SAME RIDING';
        for(const build of BODY_BUILDS)add(build.toUpperCase(),()=>{this.profile.bodyBuild=build;this.changed();this.render();},undefined,this.profile.bodyBuild===build);
        break;
      case "clothing":
        title=this.outfitSlot.toUpperCase();subtitle='AUTHORED GEAR / ALL UNLOCKED';
        for(const item of CLOTHING.filter(p=>p.category===this.outfitSlot))add(item.name,()=>{
          this.profile.outfit[this.outfitSlot]=item.id;this.changed();this.render();
        },'Included',this.profile.outfit[this.outfitSlot]===item.id);
        break;
      case "longboard":{
        title="SOMETIMES SUMMER";subtitle=(this.shopOpen?this.activeShop.name.toUpperCase()+' / ':'')+'DROP-THROUGH LONGBOARD / '+loadProfile().wallet.credit+' CREDIT';
        const wallet=loadProfile().wallet,ownsIt=ownsBoard(wallet,this.profile.longboard);
        add(this.profile.activeRideable==='longboard'?'RIDING THE LONGBOARD':'RIDE THE LONGBOARD',()=>void this.ride(this.profile.activeRideable==='longboard'?'scooter':'longboard'),ownsIt?(this.profile.activeRideable==='longboard'?'Select to switch back to the scooter':'Both builds stay saved'):'Own a complete board first',this.profile.activeRideable==='longboard');
        add('COMPLETE BOARD',()=>{if(this.shopOpen)this.show('board-complete');else{this.notice='Complete boards are sold at Techno Gravity.';this.render();}},ownsIt?'Owned':'Deck, trucks, wheels and hardware together');
        for(const category of LONGBOARD_CATEGORIES)add(category.toUpperCase(),()=>{this.boardCategory=category;this.show('board-variants');},longboardPart(this.profile.longboard[category]).variant.name+' / '+longboardPart(this.profile.longboard[category]).part.name.replace('Sometimes Summer ',''));
        break;}
      case "board-complete":{
        title='COMPLETE BOARD';subtitle='CHOOSE THE DECK GRAPHIC / STARTER TRUCKS, WHEELS AND HARDWARE';
        const wallet=loadProfile().wallet;
        for(const variant of LONGBOARD_PARTS.find(p=>p.category==='deck')!.variants){
          const {missing,price}=bundlePrice(completeBoardSelections(variant.id,this.profile.longboard),s=>owns(wallet,s));
          add(variant.name.toUpperCase(),()=>{if(!missing.length){void this.equip('ss-drop-through-deck',variant.id);return;}this.pendingVariant=variant.id;this.show('board-purchase');},missing.length?price+' Credit for '+missing.length+' parts':'Owned / Equip',this.profile.longboard.deck.variantId===variant.id);
        }
        break;}
      case "board-purchase":{
        const wallet=loadProfile().wallet,{missing,price}=bundlePrice(completeBoardSelections(this.pendingVariant,this.profile.longboard),s=>owns(wallet,s));
        title='CONFIRM PURCHASE';subtitle='Sometimes Summer '+longboardPart({partId:'ss-drop-through-deck',variantId:this.pendingVariant}).variant.name+' complete / '+missing.length+' parts';
        add(this.buying?'SAVING?':'BUY / '+price+' CREDIT',()=>{if(this.buying)return;this.buying=true;this.render();const deck=this.pendingVariant;void this.economy.buyCompleteBoard(deck).then(async result=>{this.buying=false;this.profile.wallet=loadProfile().wallet;if(result==='ok'){await this.equip('ss-drop-through-deck',deck);this.notice='Board purchased and saved. Ride it from Customization.';}else this.notice=result;this.show('longboard');});},wallet.credit+' earned Credit'+(wallet.testCredit?' + '+wallet.testCredit+' test Credit':''));
        add('CANCEL',()=>this.show('board-complete'),'No charge');break;}
      case "board-variants":{
        const part=LONGBOARD_PARTS.find(p=>p.category===this.boardCategory)!,wallet=loadProfile().wallet;
        title=part.name;subtitle=part.set==='pair'?'SOLD AS A PAIR':part.set==='set-of-4'?'SOLD AS A SET OF FOUR':part.set==='set-of-8'?'SOLD AS A SET OF EIGHT':'CHOOSE AN AUTHORED COLORWAY';
        for(const variant of part.variants){
          const selection={partId:part.id,variantId:variant.id},owned=owns(wallet,selection);
          add(variant.name,()=>{this.product=part.id;this.pendingVariant=variant.id;if(owned)void this.equip(part.id,variant.id);else if(this.shopOpen)this.show('purchase');else{this.notice='Visit Techno Gravity to purchase this part.';this.render();}},owned?'Owned / Equip':part.creditPrice+' Credit',this.profile.longboard[this.boardCategory].variantId===variant.id);
        }
        break;}
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
        subtitle = (this.shopOpen?this.activeShop.name.toUpperCase():"AUTHORED PARTS")+" / "+loadProfile().wallet.credit+" CREDIT";
        for (const part of (this.shopOpen?shopStock(this.activeShop.id,this.category):PARTS.filter((p) => p.category === this.category)))
          add(
            part.name,
            () => {
              this.product = part.id;
              this.show("variants");
            },
            part.brandId.toUpperCase()+' / '+part.variants.length+' colorways / '+(part.creditPrice??0)+' Credit',
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
            () => {this.pendingVariant=variant.id;if(owns(loadProfile().wallet,{partId:part.id,variantId:variant.id}))this.equip(part.id,variant.id);else if(this.seshOpen){this.notice='Visit Techno Gravity to purchase this part.';this.render();}else this.show('purchase');},
            owns(loadProfile().wallet,{partId:part.id,variantId:variant.id})?'Owned / Equip':String(part.creditPrice)+' Credit',
            this.selected(this.category).partId === part.id &&
              this.selected(this.category).variantId === variant.id,
          );
        break;
      }
      case 'purchase':{
        const p=catalogEntry(this.product)!,variant=p.variants.find(v=>v.id===this.pendingVariant)!;title='CONFIRM PURCHASE';const wallet=loadProfile().wallet;subtitle=p.name+' / '+variant.name;
        add(this.buying?'SAVING?':'BUY / '+p.creditPrice+' CREDIT',()=>{if(this.buying)return;this.buying=true;this.render();void this.economy.buy({partId:p.id,variantId:variant.id}).then(result=>{this.buying=false;this.notice=result==='ok'?'Purchased. Saved on this device.':result;this.profile.wallet=loadProfile().wallet;this.show(result==='ok'||result==='Already owned'?'purchased':p.rideable==='longboard'?'board-variants':'variants');});},wallet.credit+' earned Credit'+(wallet.testCredit?' + '+wallet.testCredit+' test Credit':''));
        add('CANCEL',()=>this.show(p.rideable==='longboard'?'board-variants':'variants'),'No charge');break;}
      case 'purchased':{const back=catalogEntry(this.product)?.rideable==='longboard'?'board-variants':'variants';title='PART ADDED';subtitle=this.notice;add('EQUIP NOW',()=>{void this.equip(this.product,this.pendingVariant);this.show(back);});add('KEEP IN INVENTORY',()=>this.show(back));break;}
      case "settings":
        title="SETTINGS";subtitle="MAKE YOURSELF AT HOME";
        add("HELP & CONTROLS",()=>this.show("guide"),"Trick book and controller guide");
        add('USE HELD ITEM',()=>{const a=['pushDeck','leftModifier','rightModifier'] as const;this.profile.pockets.useAction=a[(a.indexOf(this.profile.pockets.useAction)+1)%3];this.changed();this.render();},({pushDeck:'X / keyboard X',leftModifier:'LB / left Shift',rightModifier:'RB / E'})[this.profile.pockets.useAction]+' / on foot');
        if(this.owner())add('OWNER / ALPHA TEST CREDIT',()=>this.show('test-credit'),'Local testing only; separate from earned Credit.');

        add('CHARACTER QUALITY '+this.profile.settings.characterQuality.toUpperCase(),()=>{
          const levels=['auto','low','medium','high'] as const;this.profile.settings.characterQuality=levels[(levels.indexOf(this.profile.settings.characterQuality)+1)%4];this.changed();this.render();
        },'Auto follows the graphics preset. Override to prioritize your rider.');
        add('TIME OF DAY '+this.profile.settings.daylight.toUpperCase(),()=>{
          const phases=['day','sunset','night','sunrise'] as const;this.profile.settings.daylight=phases[(phases.indexOf(this.profile.settings.daylight)+1)%4];this.changed();this.render();
        });
        add('MOUNT CAMERA '+(this.profile.settings.mountFlourish?'ON':'OFF'),()=>{this.profile.settings.mountFlourish=!this.profile.settings.mountFlourish;this.changed();this.render();});
        add('GRAPHICS '+this.profile.settings.fidelity.toUpperCase(),()=>{
          const levels=['low','medium','high'] as const;this.profile.settings.fidelity=levels[(levels.indexOf(this.profile.settings.fidelity)+1)%3];this.changed();this.render();
        },'Visual detail, resolution and shadows; riding stays identical.');
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
        subtitle = "KEEP THE SESH FEELING RIGHT";
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
    if(this.seshOpen && ["rider","scooter","settings","customization"].includes(this.screen))add("APPLY / SAVE CHANGES",()=>this.applySesh(),"Appearance refreshes when safely grounded; no points awarded.");
    if (this.screen !== "home")
      add(
        !this.seshOpen && (this.screen === "scooter" || this.screen === "rider")
          ? "SAVE & BACK"
          : this.seshOpen&&["rider","scooter","settings"].includes(this.screen)?"CANCEL / BACK":"BACK",
        () => this.back(),
      );
    this.root.innerHTML = `<section class="game-menu"><div class="eyebrow">${subtitle}</div><h1>${title}</h1><nav>${this.choices.map((c, i) => `<button ${this.screen === "home" && i === 0 ? 'id="ride"' : ""} data-menu-index="${i}" class="${i === this.index ? "selected " : ""}${c.selected ? "chosen" : ""}">${this.screen==="maps"&&i<parkMaps.length?`<img class="map-list-thumb" src="${parkMaps[i].preview}" alt="${parkMaps[i].name}">`:""}<span>${c.label}</span>${c.selected ? "<b>✓</b>" : ""}${c.detail ? `<small>${c.detail}</small>` : ""}</button>`).join("")}</nav><p class="menu-save-note">${this.saveFailed ? "Could not save. Retry before leaving." : (this.notice||'Selections save on this device. Cash purchases unavailable in this alpha.')}</p><p class="menu-controls">D-PAD / LS SELECT · A CONFIRM · B BACK<br>RS ROTATE / ZOOM · LB+RS PAN · DRAG / WHEEL · KEYBOARD W/S, ENTER, ESC</p><div id="connection"></div><small class="build-number">SCOOT WITH FRIENDS · ALPHA ${version}</small></section>${this.screen === "maps" ? `<aside class="map-preview"><img src="${PARK_MAPS[Math.min(this.index, 1)].preview}" alt="Park preview"><div class="eyebrow" id="map-type"></div><h2 id="map-name"></h2><p id="map-description"></p></aside>` : ""}`;
    this.root
      .querySelectorAll<HTMLButtonElement>("[data-menu-index]")
      .forEach((button, i) => {
        button.onclick = () => {
          this.index = i;
          this.select();
        };
        button.onpointermove = (event) => {
          if(event.pointerType!=="mouse"||(!event.movementX&&!event.movementY)||this.index===i)return;
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
    const active = ["scooter", "parts", "variants","purchase","purchased"].includes(this.screen);
    const boardScreen=["longboard","board-variants","board-complete","board-purchase"].includes(this.screen)||(["purchase","purchased"].includes(this.screen)&&catalogEntry(this.product)?.rideable==='longboard');
    this.previewRider.board.visible=boardScreen;
    if(boardScreen){
      const preview=structuredClone(this.profile.longboard);
      if(this.screen==="board-variants"){const part=LONGBOARD_PARTS.find(p=>p.category===this.boardCategory)!;const variant=part.variants[this.index];if(variant)preview[this.boardCategory]={partId:part.id,variantId:variant.id};}
      if(this.screen==="board-complete"){const variant=LONGBOARD_PARTS.find(p=>p.category==='deck')!.variants[this.index];if(variant)preview.deck={partId:'ss-drop-through-deck',variantId:variant.id};}
      if(this.screen==="board-purchase")preview.deck={partId:'ss-drop-through-deck',variantId:this.pendingVariant};
      this.previewRider.setLongboard(preview);
      this.previewRider.scooter.visible=false;this.focusBox.visible=false;this.isolatedProduct.clear();
      if(this.focusKey!=='board'){this.focusKey='board';this.pan.set(0,0,0);this.zoomTarget=1.5;}
      this.focusTarget.set(0,.08,0);
    }
    if(!boardScreen&&["parts","variants","purchase","purchased"].includes(this.screen)){const part=this.screen==="parts"?PARTS.filter(p=>p.category===this.category)[this.index]:PARTS.find(p=>p.id===this.product);if(part){const variant=this.screen==="variants"?part.variants[this.index]:part.variants.find(v=>v.id===this.pendingVariant)??part.variants[0];if(variant){const preview=structuredClone(this.profile),selection={partId:part.id,variantId:variant.id};if(part.category==="wheels"){preview.scooter.frontWheel=selection;preview.scooter.rearWheel=selection;}else preview.scooter[part.category]=selection;this.previewRider.applyProfile(preview);}}}
    const key = active ? category : "";
    if (boardScreen) {}
    else if (key !== this.focusKey) {
      this.focusKey = key;
      this.pan.set(0, 0, 0);
      this.zoomTarget = active ? 2.2 : 3.7;
    }
    if(!boardScreen){
    this.focusBox.visible = active;
    this.isolatedProduct.clear();this.previewRider.scooter.visible=!this.shopOpen;
    this.previewRider.scooter.traverse(o=>{if(o instanceof THREE.Mesh)o.visible=true;});
    if(active){
      const bounds=new THREE.Box3();this.previewRider.root.updateMatrixWorld(true);
      this.previewRider.scooter.traverse(o=>{if(!(o instanceof THREE.Mesh))return;
        let rear=false;for(let parent:THREE.Object3D|null=o;parent&&parent!==this.previewRider.scooter;parent=parent.parent)rear ||= parent.userData.slot==='rearWheel';
        const selected=PARTS.some(p=>p.id===o.userData.part&&p.category===category)&&!rear;
        if(selected){o.geometry.computeBoundingBox();if(o.geometry.boundingBox)bounds.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));
          // Selected hardware may be nested inside a wheel mesh. Render only
          // its geometry, independently of the hidden assembled parent.
          if(this.shopOpen){const copy=new THREE.Mesh(o.geometry,o.material);copy.matrixAutoUpdate=false;copy.matrix.copy(o.matrixWorld);copy.userData.part=o.userData.part;this.isolatedProduct.add(copy);}
        }
      });
      if(!bounds.isEmpty()){
        const size=bounds.getSize(new THREE.Vector3()),padding=THREE.MathUtils.clamp(size.length()*.018,.0008,.012);
        this.focusBox.box.copy(bounds).expandByScalar(padding);bounds.getCenter(this.focusTarget);
        if(this.shopOpen)this.zoomTarget=Math.max(.075,size.length()*1.85);
      }else this.focusBox.visible=false;
    }else this.focusTarget.set(0,.83,0);
    }
    this.root
      .querySelectorAll("[data-menu-index]")
      .forEach((el, i) => {el.classList.toggle("selected", i === this.index);if(i===this.index){el.setAttribute('aria-current','true');el.scrollIntoView({block:'nearest'});}else el.removeAttribute('aria-current');});
    if (this.screen === "maps") {
      const map = PARK_MAPS[Math.min(this.index, 1)];
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
    if(this.buying)return;
    if(this.seshOpen&&["customization","settings","maps","shops","online"].includes(this.screen)){this.closeSesh();return;}
    if(this.seshOpen&&this.screen==="travel"){this.show("maps");return;}
    if(this.shopOpen&&(this.screen==="parts"||this.screen==="longboard")){this.shopOpen=false;this.root.classList.remove('shop-overlay');this.root.hidden=true;this.onCloseShop();return;}
    if(["purchase","purchased"].includes(this.screen)){this.show(catalogEntry(this.product)?.rideable==='longboard'?'board-variants':'variants');return;}
    if(["board-variants","board-complete"].includes(this.screen)){this.show("longboard");return;}
    if(this.screen==="board-purchase"){this.show("board-complete");return;}
    if(this.screen==="longboard"){this.show("customization");return;}
    this.show(
      this.screen==='maps'?'play':this.screen==='tricks'?'guide':this.screen==='guide'?'settings':['rider','scooter','characters'].includes(this.screen)?'customization':['clothing','body-build'].includes(this.screen) ? 'rider' : this.screen === "variants"
        ? "parts"
        : this.screen === "parts"
          ? "scooter"
          : "home",
    );
  }
  update(input: InputFrame, dt: number) {
    if(this.accountPanel.dialog.open){this.accountPanel.update(input,dt);return;}
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
    this.zoom = THREE.MathUtils.clamp(this.zoom + input.ry * dt * 1.5, this.shopOpen?.06:.8, 7);
    if (Math.abs(input.ry) > 0.05) this.zoomTarget = this.zoom;
  }
  preview(renderer: THREE.WebGLRenderer) {
    this.previewRider.posePreviewHands();
    const scooter=["scooter","parts","variants","purchase","purchased","longboard","board-variants","board-complete","board-purchase"].includes(this.screen);
    this.previewRider.rider.visible=!scooter;
    const floor=this.previewScene.getObjectByName('Preview floor');if(floor)floor.visible=!this.shopOpen;
    const compact=true;
    const x=compact?Math.round(innerWidth*.40):0,w=compact?Math.round(innerWidth*.55):innerWidth,h=compact?Math.round(innerHeight*.62):innerHeight,y=compact?Math.round(innerHeight*.20):0;
    const center=this.focus.clone().add(this.pan);
    const distance=this.zoom*(scooter&&!this.shopOpen?.66:1);
    this.previewCamera.aspect=w/h;
    this.previewCamera.position.set(this.focus.x+this.pan.x+Math.sin(this.orbit)*distance,this.focus.y+this.pan.y+distance*.22,this.focus.z+this.pan.z+Math.cos(this.orbit)*distance);
    this.previewCamera.lookAt(center);this.previewCamera.updateProjectionMatrix();
    if(compact){renderer.setViewport(x,y,w,h);renderer.setScissor(x,y,w,h);renderer.setScissorTest(true);}
    if(!["maps","shops","play","online","settings","guide","tricks"].includes(this.screen))renderer.render(this.previewScene,this.previewCamera);
    if(compact){renderer.setScissorTest(false);renderer.setViewport(0,0,innerWidth,innerHeight);}
  }
}
