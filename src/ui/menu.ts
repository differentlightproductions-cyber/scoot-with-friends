import {SHOPS,shopStock} from '../data/shops';
import {CreditEconomy,owns} from '../data/credit';
import {catalogEntry,completeBoardSelections,bundlePrice,ownsBoard} from '../data/catalog';
import {LONGBOARD_CATEGORIES,LONGBOARD_PARTS,longboardPart,type LongboardCategory} from '../data/longboardParts';
import {BODY_BUILDS} from '../scooter/body-fit';
import {inventoryBrands,inventoryItems,paginate,BOARD_BRAND_ID,type InventoryItem,type BrowseMode} from '../data/inventory';
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
import { presetName } from "../input/riding";
const plural=(n:number,word:string)=>n+' '+(n===1?word:/[^aeiou]y$/.test(word)?word.slice(0,-1)+'ies':word+'s');
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
  /** Deliberate draft edits in the Sesh menu that Apply has not saved yet. */
  private dirty(){if(!this.seshOpen||!this.savedProfile)return false;const pick=(p:LocalProfile)=>JSON.stringify([p.scooter,p.longboard,p.activeRideable,p.outfit,p.riderId,p.bodyBuild,p.settings,p.pockets]);return pick(this.profile)!==pick(this.savedProfile);}
  private leaveReturn='rides';
  private closeSesh(){this.profile=this.savedProfile!;this.savedProfile=null;this.seshOpen=false;this.root.hidden=true;this.root.classList.remove('sesh-overlay');this.onCloseSesh();}

  shopOpen=false;onCloseShop=()=>{};owner=()=>false;economy=new CreditEconomy();notice='';private pendingVariant='';private buying=false;
  activeShop=SHOPS[0];
  /** Browsing the Sometimes Summer wall opens the board builder in shop mode. */
  openBoardShop(shopId='techno_gravity'){this.activeShop=SHOPS.find(s=>s.id===shopId)??SHOPS[0];this.shopOpen=true;this.shopRoot='longboard';this.browseBrand=BOARD_BRAND_ID;this.root.hidden=false;this.show('longboard');}
  boardCategory:LongboardCategory='deck';
  /** A shop display opens straight onto the first brand that has something new in its category. */
  openShop(category:Category,shopId='techno_gravity'){this.activeShop=SHOPS.find(s=>s.id===shopId)??SHOPS[0];this.shopOpen=true;this.shopRoot='shop';this.root.hidden=false;this.category=category;this.browseCategory=category;this.itemPage=0;
    const brand=inventoryBrands(loadProfile().wallet,'shop',{shopId:this.activeShop.id,rideable:'scooter'}).find(b=>b.categories.includes(category));
    if(brand){this.browseBrand=brand.brandId;this.memory.set(this.memoryKey('brand'),0);this.show('brand-items');}else{this.notice='Nothing new in '+category+' here. Every '+category+' part this shop carries is already yours.';this.show('shop');}}
  /** Browsing state: brand, category and page, shared by Customization (owned) and shops (not owned). */
  browseBrand='lazer';browseCategory='deck';catPage=0;itemPage=0;private shopRoot='shop';
  private visibleItems:InventoryItem[]=[];private visibleCategories:string[]=[];private cellCount=0;
  private memory=new Map<string,number>();private repeatKey='';private repeatTimer=0;private equipRequest=0;private previewing=false;
  private browseMode():BrowseMode{return this.shopOpen?'shop':'owned';}
  private memoryKey(screen:string){return screen+'/'+(['brand','brand-items'].includes(screen)?this.browseBrand:'')+'/'+(screen==='brand-items'?this.browseCategory:'');}
  private brandName(){return this.browseBrand===BOARD_BRAND_ID?'Sometimes Summer':PARTS.find(p=>p.brandId===this.browseBrand)?.brand??this.browseBrand;}
  private equippedSelection(item:{rideable:string;category:string}){return item.rideable==='longboard'?this.profile.longboard[item.category as LongboardCategory]:this.selected(item.category as Category);}
  private async equip(partId:string,variantId:string){
    if(this.buying)return;const selection={partId,variantId};if(!owns(loadProfile().wallet,selection))return;const request=++this.equipRequest;
    const entry=catalogEntry(partId);
    if(entry?.rideable==='longboard'){
      if(this.seshOpen){this.profile.longboard[entry.category as LongboardCategory]=selection;this.changed();this.render();return;}
      this.buying=true;this.notice='Saving board...';this.render();const result=await this.economy.equip(selection,this.profile.equipmentRevision??0);this.buying=false;if(request!==this.equipRequest)return;
      if(result.profile){Object.assign(this.profile,result.profile);this.previewRider.applyProfile(this.profile);this.onChange();this.notice='Board saved on this device.';this.saveFailed=false;}else{this.notice=result.error??'Could not save';this.saveFailed=true;}this.render();return;
    }
    const part=PARTS.find(p=>p.id===partId)!;
    if(this.seshOpen){if(part.category==='wheels'){this.profile.scooter.frontWheel={...selection};this.profile.scooter.rearWheel={...selection};}else this.profile.scooter[part.category]=selection;this.changed();this.render();return;}
    this.buying=true;this.notice='Saving equipment...';this.render();const result=await this.economy.equip(selection,this.profile.equipmentRevision??0);this.buying=false;if(request!==this.equipRequest)return;
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
  onCameraChange = (_settings: LocalProfile['settings']) => {};
  /** Live controller information for the Test Controller view (set by main). */
  controllerReport = (): Record<string, unknown> => ({});
  touchPreviewOn = false;
  touchPreview = (_on: boolean) => {};
  networkChoices=():{label:string;detail?:string;action:()=>void}[]=>[];
  private choices: {
    label: string;
    detail?: string;
    action: () => void;
    selected?: boolean;
    cell?: boolean;
  }[] = [];
  private pageTurn=(_step:number)=>{};
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
    // Returning to a screen restores where focus was, so a category keeps its place.
    if(screen!==this.screen){this.memory.set(this.memoryKey(this.screen),this.index);this.index=this.memory.get(this.memoryKey(screen))??0;}
    this.screen = screen;
    // A direction still held from the previous screen waits before repeating here.
    this.repeatTimer=Math.max(this.repeatTimer,.38);
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
    // Grid cells come first on a screen so their indices line up with the page's items.
    const cell=(label:string,action:()=>void,detail?:string,selected=false)=>this.choices.push({label,action,detail,selected,cell:true});
    const pager=(pages:number,page:number,set:(page:number)=>void)=>{if(pages<2)return;
      add('‹ PREVIOUS PAGE',()=>{set((page+pages-1)%pages);this.render();},'Page '+(page+1)+' of '+pages+' / LT');
      add('NEXT PAGE ›',()=>{set((page+1)%pages);this.render();},'Page '+(page+1)+' of '+pages+' / RT');};
    this.pageTurn=(step:number)=>{const next=this.choices.find(c=>c.label===(step<0?'‹ PREVIOUS PAGE':'NEXT PAGE ›'));if(next){next.action();this.index=0;this.highlight();}};
    this.choices = [];
    let title = "FIND YOUR FLOW.",
      subtitle = "YOUR NEXT SESH STARTS HERE";
    switch (this.screen) {
      case "online":
        title="PRIVATE FREE-RIDE";subtitle="UNRANKED ALPHA / VETERANS MEMORIAL PARK";for(const c of this.networkChoices())add(c.label,c.action,c.detail);break;
      case "home":
        add("PLAY",()=>this.show("play"),"Find your next line");
        add("SHOPS",()=>this.show("shops"),"Visit, browse, and ride");
        add("RIDES",()=>this.show("rides"),"Ride and customize your scooter or longboard");
        add("RIDER",()=>this.show("rider"),"Character, clothing and body build");
        add("SETTINGS",()=>this.show("settings"),"Preferences and trick book");
        add("ACCOUNT",()=>{void this.accountPanel.open();},"Sign in / Create account");
        break;
      case "play":
        title="PLAY";subtitle="YOUR NEXT SESH";
        add("SOLO",()=>this.show("maps"),"Choose a park and ride");
        add("PRIVATE FREE-RIDE",()=>this.show("online"),"Invite friends to a private room");break;
      case "rides":{
        title="RIDES";subtitle="SWITCH WHAT YOU RIDE / CUSTOMIZE EACH BUILD";
        const boardOwned=ownsBoard(loadProfile().wallet,this.profile.longboard),active=this.profile.activeRideable;
        add('SCOOTER',()=>void this.ride('scooter'),active==='scooter'?'Riding now':'Select to ride your scooter. Both builds stay saved.',active==='scooter');
        add('LONGBOARD',()=>void this.ride('longboard'),!boardOwned?'Buy a complete Sometimes Summer board at Techno Gravity first':active==='longboard'?'Riding now':'Select to ride your board. Both builds stay saved.',active==='longboard');
        add('CUSTOMIZE SCOOTER',()=>this.show('scooter'),'Your parts by brand / '+selectedPart(this.profile.scooter.deck).part.name);
        add('CUSTOMIZE LONGBOARD',()=>this.show('longboard'),boardOwned?'Sometimes Summer / '+longboardPart(this.profile.longboard.deck).variant.name+' build':'Your board parts by category');
        break;}
      case "guide":
        title="HELP & CONTROLS";subtitle="LEARN YOUR NEXT TRICK";
        add("TRICK BOOK",()=>this.show("tricks"),"Inputs, combinations, and riding controls");break;
      case "tricks":
        add('CAMERA / STATIONARY TRICKS',()=>{},'On foot: RS looks around. On scooter: RS always preloads and tricks, even stopped. No setup toggle. R3/V recenters; L3/F runs on foot.');
        add("CREDIT / ALPHA ECONOMY",()=>{},"Every 100 banked points earns 1 Credit. Buy authored parts at Techno Gravity. Cash is unavailable. Saves stay on this device.");
        title = "TRICK BOOK";
        subtitle = "READ THE MOVEMENT, THEN MAKE IT YOURS";
        add("BUNNY HOP / TUCK", () => {}, "RS fully down to crouch, then return it 90% up to pop. A neutral release stands up; holding a tuck reduces drag at speed and helps on downhills.");
        add("TAILWHIP / BARSPIN", () => {}, "Normal: X tailwhip / B barspin / A push. Goofy: A tailwhip / B barspin / X push. Arcade: B whip / X bars. Tap once or hold for continuous rotations.");
        add("HEEL / FINGER WHIP", () => {}, "LT + whip = heelwhip. RT + whip = fingerwhip. LT + RT + whip = opposite fingerwhip.");
        add("BRI / INWARD BRI", () => {}, "RS down → lower-left → left = Bri. Down → lower-right → right = Inward. A complete circle still works. Finish the scoop near a ramp lip for an upward pop.");
        add("KICKLESS / REWIND", () => {}, "During an active whip: tap the opposite-direction bumper to Rewind, or hold it for Kickless. Normal natural whip: LB; Goofy: RB. Heelwhips swap those sides. Attempts can fail if landed unfinished. RS up remains an alternate Kickless flick.");
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
      case "shop":{
        const wallet=loadProfile().wallet;title=this.activeShop.name.toUpperCase();subtitle='PICK A BRAND / '+wallet.credit+' CREDIT'+(wallet.testCredit?' + '+wallet.testCredit+' TEST':'');
        const brands=inventoryBrands(wallet,'shop',{shopId:this.activeShop.id});
        for(const b of brands)add(b.brand.toUpperCase(),()=>{this.browseBrand=b.brandId;this.catPage=0;this.show(b.rideable==='longboard'?'longboard':'brand');},plural(b.count,'colorway')+' you do not own yet / '+plural(b.categories.length,'category'));
        if(!brands.length)add('ALL STOCK OWNED',()=>{},'Everything this shop sells is already yours. Equip it from Customization.');
        add('LAZER',()=>{},'Every Lazer part is free and already in your Customization.');break;}
      case "longboard":{
        const wallet=loadProfile().wallet,ownsIt=ownsBoard(wallet,this.profile.longboard),mode=this.browseMode();this.browseBrand=BOARD_BRAND_ID;
        title="SOMETIMES SUMMER";subtitle=(this.shopOpen?this.activeShop.name.toUpperCase()+' / NOT OWNED YET / '+wallet.credit+' CREDIT':'DROP-THROUGH LONGBOARD / OWNED PARTS');
        const items=inventoryItems(wallet,mode,{shopId:this.activeShop.id,brandId:BOARD_BRAND_ID});
        this.visibleCategories=[...new Set(items.map(i=>i.category))];
        for(const category of this.visibleCategories){const count=items.filter(i=>i.category===category).length,on=longboardPart(this.profile.longboard[category as LongboardCategory]);
          cell(category.toUpperCase(),()=>{this.browseCategory=category;this.boardCategory=category as LongboardCategory;this.itemPage=0;this.show('brand-items');},mode==='shop'?count+' for sale':count+' owned / on: '+on.variant.name);}
        if(!this.visibleCategories.length)add(mode==='shop'?'ALL BOARD PARTS OWNED':'NO BOARD PARTS YET',()=>{},mode==='shop'?'Every Sometimes Summer part is already yours.':'Techno Gravity sells complete boards and parts.');
        add(this.profile.activeRideable==='longboard'?'RIDING THE LONGBOARD':'RIDE THE LONGBOARD',()=>void this.ride(this.profile.activeRideable==='longboard'?'scooter':'longboard'),ownsIt?(this.profile.activeRideable==='longboard'?'Select to switch back to the scooter':'Both builds stay saved'):'Own a complete board first',this.profile.activeRideable==='longboard');
        add('COMPLETE BOARD',()=>{if(this.shopOpen)this.show('board-complete');else{this.notice='Complete boards are sold at Techno Gravity.';this.render();}},ownsIt?'Owned':'Deck, trucks, wheels and hardware together');
        break;}
      case "board-complete":{
        title='COMPLETE BOARD';subtitle='CHOOSE THE DECK GRAPHIC / STARTER TRUCKS, WHEELS AND HARDWARE';
        const wallet=loadProfile().wallet;
        for(const variant of LONGBOARD_PARTS.find(p=>p.category==='deck')!.variants){
          const {missing,price}=bundlePrice(completeBoardSelections(variant.id,this.profile.longboard),s=>owns(wallet,s));
          cell(variant.name.toUpperCase(),()=>{if(!missing.length){void this.equip('ss-drop-through-deck',variant.id);return;}this.pendingVariant=variant.id;this.show('board-purchase');},missing.length?price+' Credit for '+missing.length+' parts':'Owned / Equip',this.profile.longboard.deck.variantId===variant.id);
        }
        break;}
      case "board-purchase":{
        const wallet=loadProfile().wallet,{missing,price}=bundlePrice(completeBoardSelections(this.pendingVariant,this.profile.longboard),s=>owns(wallet,s));
        title='CONFIRM PURCHASE';subtitle='Sometimes Summer '+longboardPart({partId:'ss-drop-through-deck',variantId:this.pendingVariant}).variant.name+' complete / '+missing.length+' parts';
        add(this.buying?'SAVING...':'BUY / '+price+' CREDIT',()=>{if(this.buying)return;this.buying=true;this.render();const deck=this.pendingVariant;void this.economy.buyCompleteBoard(deck).then(async result=>{this.buying=false;this.profile.wallet=loadProfile().wallet;if(result==='ok'){await this.equip('ss-drop-through-deck',deck);this.notice='Board purchased and saved. Ride it from Customization.';}else this.notice=result;this.show('longboard');});},wallet.credit+' earned Credit'+(wallet.testCredit?' + '+wallet.testCredit+' test Credit':''));
        add('CANCEL',()=>this.show('board-complete'),'No charge');break;}
      case "scooter":{
        const wallet=loadProfile().wallet;title="SCOOTER";subtitle="YOUR PARTS BY BRAND / BUY MORE AT TECHNO GRAVITY";
        for(const b of inventoryBrands(wallet,'owned',{rideable:'scooter'}))add(b.brand.toUpperCase(),()=>{this.browseBrand=b.brandId;this.catPage=0;this.show('brand');},plural(b.count,'owned colorway')+' / '+plural(b.categories.length,'category'));
        break;}
      case "brand":{
        const wallet=loadProfile().wallet,mode=this.browseMode();
        const items=inventoryItems(wallet,mode,{shopId:this.activeShop.id,brandId:this.browseBrand});
        const {items:categories,page,pages}=paginate([...new Set(items.map(i=>i.category))],this.catPage,8);this.catPage=page;this.visibleCategories=categories;
        title=this.brandName().toUpperCase();subtitle=(mode==='shop'?'NOT OWNED YET / '+wallet.credit+' CREDIT':'OWNED PARTS / PICK A CATEGORY')+(pages>1?' / PAGE '+(page+1)+' OF '+pages:'');
        for(const category of categories){const count=items.filter(i=>i.category===category).length,on=selectedPart(this.selected(category as Category));
          cell(category.toUpperCase(),()=>{this.browseCategory=category;this.category=category as Category;this.itemPage=0;this.show('brand-items');},mode==='shop'?count+' for sale':count+' owned / on: '+on.part.name.replace(on.part.brand+' ',''));}
        if(!categories.length)add(mode==='shop'?'ALL OWNED':'NOTHING OWNED YET',()=>{},mode==='shop'?'Every '+this.brandName()+' part here is already yours.':'Buy '+this.brandName()+' parts at Techno Gravity.');
        pager(pages,page,p=>{this.catPage=p;});
        break;}
      case "brand-items":{
        const wallet=loadProfile().wallet,mode=this.browseMode();
        const all=inventoryItems(wallet,mode,{shopId:this.activeShop.id,brandId:this.browseBrand,category:this.browseCategory});
        const {items,page,pages}=paginate(all,this.itemPage,8);this.itemPage=page;this.visibleItems=items;
        title=this.brandName().toUpperCase()+' / '+this.browseCategory.toUpperCase();
        subtitle=(mode==='shop'?'NOT OWNED YET / '+wallet.credit+' CREDIT':this.seshOpen?'OWNED / CHOOSE, THEN APPLY':'OWNED / SELECT TO EQUIP')+(pages>1?' / PAGE '+(page+1)+' OF '+pages:'')+(this.browseCategory==='wheels'&&this.browseBrand!==BOARD_BRAND_ID?' / FRONT AND REAR':'');
        for(const item of items){const on=this.equippedSelection(item),equipped=on.partId===item.partId&&on.variantId===item.variantId;
          cell(item.partName.toUpperCase(),()=>{this.product=item.partId;this.pendingVariant=item.variantId;if(mode==='shop')this.show('purchase');else void this.equip(item.partId,item.variantId);},
            item.variantName+' / '+(mode==='shop'?item.price+' Credit':equipped?(this.seshOpen?'Chosen':'Equipped'):(this.seshOpen?'Owned / Choose':'Owned / Equip')),equipped);}
        if(!items.length)add(mode==='shop'?'SOLD OUT FOR YOU':'NOTHING OWNED HERE',()=>this.back(),mode==='shop'?'You own every colorway in this category.':'Buy these at Techno Gravity.');
        pager(pages,page,p=>{this.itemPage=p;});
        break;}
      case 'purchase':{
        const p=catalogEntry(this.product)!,variant=p.variants.find(v=>v.id===this.pendingVariant)!;title='CONFIRM PURCHASE';const wallet=loadProfile().wallet;subtitle=p.name+' / '+variant.name;
        add(this.buying?'SAVING...':'BUY / '+p.creditPrice+' CREDIT',()=>{if(this.buying)return;this.buying=true;this.render();void this.economy.buy({partId:p.id,variantId:variant.id}).then(result=>{this.buying=false;this.notice=result==='ok'?'Purchased. Saved on this device.':result;this.profile.wallet=loadProfile().wallet;this.show(result==='ok'||result==='Already owned'?'purchased':'brand-items');});},wallet.credit+' earned Credit'+(wallet.testCredit?' + '+wallet.testCredit+' test Credit':''));
        add('CANCEL',()=>this.show('brand-items'),'No charge');break;}
      case 'purchased':{title='PART ADDED';subtitle=this.notice;add('EQUIP NOW',()=>{void this.equip(this.product,this.pendingVariant);this.show('brand-items');});add('KEEP IN INVENTORY',()=>this.show('brand-items'));break;}
      case 'test-controller':{
        title='TEST CONTROLLER';subtitle='PRESS BUTTONS AND MOVE THE STICKS';
        add('COPY DIAGNOSTICS',()=>{const text=JSON.stringify(this.controllerReport(),null,2);void navigator.clipboard?.writeText(text).then(()=>{this.notice='Diagnostics copied (no account or personal data).';this.render();},()=>{this.notice='Clipboard unavailable.';this.render();});},'Controller id, mapping, source, preset and live buttons. No personal data.');
        add('SHOW TOUCH CONTROLS HERE',()=>{this.touchPreview(!this.touchPreviewOn);this.render();},'Preview and test the on-screen controller.');
        break;}
      case 'leave-sesh':{title='UNSAVED CHANGES';subtitle='APPLY THEM OR LEAVE THEM BEHIND';
        add('APPLY & CLOSE',()=>{this.applySesh();if(!this.dirty())this.closeSesh();},'Saves this setup on this device.');
        add('DISCARD CHANGES',()=>this.closeSesh(),'Keeps the setup you had when you paused.');
        add('STAY',()=>this.show(this.leaveReturn),'Keep editing.');break;}
      case "settings":
        title="SETTINGS";subtitle="MAKE YOURSELF AT HOME";
        add("HELP & CONTROLS",()=>this.show("guide"),"Trick book and controller guide");
        add('USE HELD ITEM',()=>{const a=['pushDeck','leftModifier','rightModifier'] as const;this.profile.pockets.useAction=a[(a.indexOf(this.profile.pockets.useAction)+1)%3];this.changed();this.render();},({pushDeck:'X / keyboard X',leftModifier:'LB / left Shift',rightModifier:'RB / E'})[this.profile.pockets.useAction]+' / on foot');
        if(this.owner())add('OWNER / ALPHA TEST CREDIT',()=>this.show('test-credit'),'Local testing only; separate from earned Credit.');

        add('CHARACTER QUALITY '+this.profile.settings.characterQuality.toUpperCase(),()=>{
          const levels=['auto','low','medium','high'] as const;this.profile.settings.characterQuality=levels[(levels.indexOf(this.profile.settings.characterQuality)+1)%4];this.changed();this.render();
        },'Auto follows the graphics preset. Override to prioritize your rider.');
        add('TIME OF DAY '+this.profile.settings.daylight.toUpperCase(),()=>{
          const phases=['day','sunset','night','sunrise','snow'] as const;this.profile.settings.daylight=phases[(phases.indexOf(this.profile.settings.daylight)+1)%5];this.changed();this.render();
        },'Day, golden hours, Night, or visual Snow. Riding surfaces and physics stay unchanged.');
        // Camera settings take effect at once, in the Sesh too, and are saved straight away.
        const camera=(edit:(c:LocalProfile['settings'])=>void)=>{edit(this.profile.settings);if(this.savedProfile){edit(this.savedProfile.settings);saveProfile(this.savedProfile);this.onCameraChange(this.savedProfile.settings);}else{this.saveFailed=!saveProfile(this.profile);this.onCameraChange(this.profile.settings);}this.render();};
        add('CAMERA VIEW '+(this.profile.settings.cameraView==='first'?'FIRST PERSON':'THIRD PERSON'),()=>camera(c=>{c.cameraView=c.cameraView==='first'?'third':'first';}),'Personal view only. Riding, tricks and what other players see are unchanged.');
        add('FIRST PERSON FOV '+this.profile.settings.firstPersonFov+'°',()=>camera(c=>{c.firstPersonFov=c.firstPersonFov>=110?70:c.firstPersonFov+5;}),'Horizontal field of view, 70° to 110°. Default 90°.');
        add('CAMERA MOTION '+this.profile.settings.cameraMotion.toUpperCase(),()=>camera(c=>{c.cameraMotion=c.cameraMotion==='reduced'?'full':'reduced';}),'Reduced filters head bob and rig shake; spins, flips and crouches still come through.');
        add("CAMERA FILTER "+(this.profile.settings.cameraFilter==='camcorder'?"'90s CAMCORDER":'OFF'),()=>camera(c=>{c.cameraFilter=c.cameraFilter==='camcorder'?'off':'camcorder';}),'Lo-res picture, soft edges, and faded camcorder-style color. Gameplay stays smooth.');
        if(this.profile.settings.cameraFilter==='camcorder')add('FILTER STRENGTH '+this.profile.settings.filterStrength+'%',()=>camera(c=>{c.filterStrength=c.filterStrength>=100?0:c.filterStrength+5;}),'0% looks unfiltered. Default 65%.');
        add('TOUCH CONTROLS '+this.profile.settings.touchControls.toUpperCase(),()=>camera(c=>{c.touchControls=c.touchControls==='auto'?'on':c.touchControls==='on'?'off':'auto';}),'Phones and tablets only. Auto shows them when no controller is in use.');
        add('TOUCH CONTROL SIZE '+this.profile.settings.touchSize+'%',()=>camera(c=>{c.touchSize=c.touchSize>=130?80:c.touchSize+10;}),'80% to 130%. Layout only: stick response and gestures are unchanged.');
        add('TOUCH CONTROL OPACITY '+this.profile.settings.touchOpacity+'%',()=>camera(c=>{c.touchOpacity=c.touchOpacity>=85?20:Math.min(85,c.touchOpacity+15);}),'20% to 85%. Appearance only; hit areas stay the same.');
        add('RESET TOUCH LAYOUT',()=>camera(c=>{c.touchControls='auto';c.touchSize=100;c.touchOpacity=50;}),'Auto, 100% size, 50% opacity.');
        add('TEST CONTROLLER',()=>this.show('test-controller'),'See each button, stick, source and the action it resolves to.');
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
        add("CONTROLS PRESET " + presetName(this.profile.settings.stance).toUpperCase(), () => {
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
        break;
    }
    if(this.seshOpen && ["rider","scooter","settings","rides","brand","brand-items","longboard"].includes(this.screen))add("APPLY / SAVE CHANGES",()=>this.applySesh(),this.dirty()?"Unsaved choices. Appearance refreshes when safely grounded.":"Nothing to apply yet.");
    if (this.screen !== "home"&&this.screen!=="leave-sesh")
      add(
        !this.seshOpen && this.screen === "rider"
          ? "SAVE & BACK"
          : "BACK",
        () => this.back(),
      );
    this.index=Math.min(this.index,Math.max(0,this.choices.length-1));
    this.cellCount=this.choices.filter(c=>c.cell).length;
    const button=(c:(typeof this.choices)[number],i:number)=>`<button ${this.screen === "home" && i === 0 ? 'id="ride"' : ""} data-menu-index="${i}" class="${c.cell?"menu-cell ":""}${/PAGE/.test(c.label)&&!c.cell?"menu-page ":""}${i === this.index ? "selected " : ""}${c.selected ? "chosen" : ""}">${this.screen==="maps"&&i<parkMaps.length?`<img class="map-list-thumb" src="${parkMaps[i].preview}" alt="${parkMaps[i].name}">`:""}<span>${c.label}</span>${c.selected ? "<b>✓</b>" : ""}${c.detail ? `<small>${c.detail}</small>` : ""}</button>`;
    const cells=this.choices.slice(0,this.cellCount).map(button).join(""),rows=this.choices.slice(this.cellCount).map((c,i)=>button(c,i+this.cellCount)).join("");
    this.root.innerHTML = `<section class="game-menu"><div class="eyebrow">${subtitle}</div><h1>${title}</h1><nav>${cells?`<div class="menu-grid">${cells}</div>`:""}${rows}</nav><p class="menu-save-note">${this.saveFailed ? "Could not save. Retry before leaving." : (this.notice||'Selections save on this device. Cash purchases unavailable in this alpha.')}</p><p class="menu-controls">D-PAD / LS SELECT · A CONFIRM · B BACK${this.choices.some(c=>c.label==='NEXT PAGE ›')?' · LT / RT PAGE':''}<br>RS ROTATE / ZOOM · LB+RS PAN · DRAG / WHEEL · KEYBOARD W/S, ENTER, ESC</p><div id="connection"></div><small class="build-number">SCOOT WITH FRIENDS · ALPHA ${version}</small></section>${this.screen === "maps" ? `<aside class="map-preview"><img src="${PARK_MAPS[Math.min(this.index, PARK_MAPS.length - 1)].preview}" alt="Park preview"><div class="eyebrow" id="map-type"></div><h2 id="map-name"></h2><p id="map-description"></p></aside>` : ""}`;
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
  /** The row or cell the preview should show, without touching the draft or saved loadout. */
  private focusedSelection(){
    if(this.screen==='brand-items'&&this.index<this.cellCount){const item=this.visibleItems[this.index];if(item)return {partId:item.partId,variantId:item.variantId};}
    if(['purchase','purchased'].includes(this.screen)&&this.product)return {partId:this.product,variantId:this.pendingVariant};
    return undefined;
  }
  private highlight() {
    const ridesBoard=this.screen==='rides'&&(this.index===1||this.index===3);
    const boardBrowse=this.browseBrand===BOARD_BRAND_ID&&['brand-items','purchase','purchased'].includes(this.screen);
    const boardScreen=["longboard","board-complete","board-purchase"].includes(this.screen)||boardBrowse||ridesBoard;
    let category:string=this.screen==='brand-items'?this.browseCategory:this.category;
    if(this.screen==='brand'&&this.index<this.cellCount)category=this.visibleCategories[this.index]??category;
    const active=!boardScreen&&["brand","brand-items","purchase","purchased"].includes(this.screen);
    const focused=this.focusedSelection(),entry=focused&&catalogEntry(focused.partId);
    this.previewRider.board.visible=boardScreen;
    // Browsing only ever changes the inspection model. The draft/saved profile is
    // never mutated, and leaving a focused row restores the current draft.
    const previewKey=entry?.rideable==='scooter'?focused!.partId+':'+focused!.variantId:'';
    if(previewKey&&previewKey!==this.previewKey){const preview=structuredClone(this.profile);if(entry!.category==="wheels"){preview.scooter.frontWheel={...focused!};preview.scooter.rearWheel={...focused!};}else (preview.scooter as Record<string,{partId:string;variantId:string}>)[entry!.category]={...focused!};this.previewRider.applyProfile(preview);this.previewing=true;}
    else if(!previewKey&&this.previewing){this.previewRider.applyProfile(this.profile);this.previewing=false;}
    this.previewKey=previewKey;
    if(boardScreen){
      const preview=structuredClone(this.profile.longboard);
      let boardCategory=this.screen==='longboard'?(this.index<this.cellCount?this.visibleCategories[this.index]:'deck')??'deck':this.browseCategory;
      if(entry?.rideable==='longboard')preview[entry.category as LongboardCategory]={...focused!};
      if(this.screen==="board-complete"){const variant=LONGBOARD_PARTS.find(p=>p.category==='deck')!.variants[this.index];if(variant)preview.deck={partId:'ss-drop-through-deck',variantId:variant.id};boardCategory='deck';}
      if(this.screen==="board-purchase"){preview.deck={partId:'ss-drop-through-deck',variantId:this.pendingVariant};boardCategory='deck';}
      this.previewRider.setLongboard(preview);
      this.previewRider.scooter.visible=false;this.focusBox.visible=false;this.isolatedProduct.clear();
      // Graphics and grip read best with the board stood on its tail, art facing
      // out, so orbiting spins it round; hardware reads best lying on its wheels.
      const stand=['deck','grip'].includes(boardCategory),board=this.previewRider.board;
      board.rotation.set(stand?-Math.PI/2:0,0,0);board.position.set(0,stand?.49:0,0);
      const key=stand?'board-stand':'board';
      if(this.focusKey!==key){this.focusKey=key;this.pan.set(0,0,0);this.zoomTarget=stand?(this.shopOpen?1.6:2.4):1.5;if(stand)this.orbit=0;}
      if(stand)this.focusTarget.set(0,.49,0);else this.focusTarget.set(0,.08,0);
    }
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
      .forEach((el, i) => {el.classList.toggle("selected", i === this.index);if(i===this.index){el.setAttribute('aria-current','true');this.reveal(el as HTMLElement);}else el.removeAttribute('aria-current');});
    if (this.screen === "maps") {
      const map = PARK_MAPS[Math.min(this.index, PARK_MAPS.length - 1)];
      (this.root.querySelector(".map-preview img") as HTMLImageElement).src =
        map.preview;
      this.root.querySelector("#map-type")!.textContent = map.type;
      this.root.querySelector("#map-name")!.textContent = map.name;
      this.root.querySelector("#map-description")!.textContent =
        map.description;
    }
  }
  private previewKey='';
  /**
   * Controller focus is logical: scroll only the menu's own scroll containers so
   * the focused row is visible. Never scrolls the page, and works on phones where
   * no native touch scroll ever happens.
   */
  private reveal(el:HTMLElement){
    for(let box=el.parentElement;box&&box!==this.root.parentElement;box=box.parentElement){
      const style=getComputedStyle(box);if(!/(auto|scroll)/.test(style.overflowY)||box.scrollHeight<=box.clientHeight+1)continue;
      const r=el.getBoundingClientRect(),b=box.getBoundingClientRect(),margin=8;
      if(r.top<b.top+margin)box.scrollTop-=b.top+margin-r.top;else if(r.bottom>b.bottom-margin)box.scrollTop+=r.bottom-(b.bottom-margin);
    }
  }
  select() {
    this.choices[this.index]?.action();
  }
  private closeShop(){this.shopOpen=false;this.root.classList.remove('shop-overlay');this.root.hidden=true;this.onCloseShop();}
  back() {
    if(this.buying)return;
    if(this.seshOpen&&["rides","rider","settings","maps","shops","online"].includes(this.screen)){if(this.dirty()){this.leaveReturn=this.screen;this.show('leave-sesh');return;}this.closeSesh();return;}
    if(this.screen==='leave-sesh'){this.show(this.leaveReturn);return;}
    if(this.seshOpen&&this.screen==="travel"){this.show("maps");return;}
    if(this.shopOpen&&this.screen===this.shopRoot){this.closeShop();return;}
    if(this.shopOpen&&(this.screen==="longboard"||this.screen==="shop")){if(this.screen==="shop")this.closeShop();else this.show("shop");return;}
    if(["purchase","purchased"].includes(this.screen)){this.show('brand-items');return;}
    if(this.screen==='brand-items'){this.show(this.browseBrand===BOARD_BRAND_ID?'longboard':'brand');return;}
    if(this.screen==='brand'){this.show(this.shopOpen?'shop':'scooter');return;}
    if(this.screen==="board-complete"){this.show("longboard");return;}
    if(this.screen==="board-purchase"){this.show("board-complete");return;}
    if(this.screen==="longboard"){this.show("rides");return;}
    this.show(
      this.screen==='maps'?'play':this.screen==='tricks'?'guide':this.screen==='guide'?'settings':this.screen==='scooter'?'rides':['characters','clothing','body-build'].includes(this.screen)?'rider':['clothing','body-build'].includes(this.screen) ? 'rider' : "home",
    );
  }
  /** One focus step. Grid cells move by column/row; the rows below move one at a time. */
  private move(vertical:number,horizontal:number){
    const count=this.choices.length;if(!count)return;
    const cells=this.cellCount,grid=this.root.querySelector('.menu-grid');
    const columns=grid?Math.max(1,getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length):1;
    if(horizontal){
      if(this.index<cells)this.index=(this.index+horizontal+cells)%cells;
      else if(this.choices.some(c=>c.label==='NEXT PAGE ›'))this.pageTurn(horizontal);
      else return;
    }else if(this.index<cells){
      const next=this.index+vertical*columns;
      if(next<0)this.index=count-1;
      else if(next>=cells)this.index=vertical>0&&Math.floor(this.index/columns)<Math.floor((cells-1)/columns)?cells-1:cells<count?cells:0;
      else this.index=next;
    }else{
      const next=this.index+vertical;
      this.index=next<cells&&vertical<0?(cells?cells-1:(next+count)%count):(next+count)%count;
    }
    this.highlight();
  }
  update(input: InputFrame, dt: number) {
    if(this.screen==='test-controller'){let pre=this.root.querySelector<HTMLElement>('#controller-test');if(!pre){pre=document.createElement('pre');pre.id='controller-test';this.root.querySelector('nav')?.after(pre);}pre.textContent=JSON.stringify(this.controllerReport(),null,1).replace(/[{}"]/g,'');}
    else if(this.touchPreviewOn)this.touchPreview(false);
    if(this.accountPanel.dialog.open){this.accountPanel.update(input,dt);return;}
    this.cooldown = Math.max(0, this.cooldown - dt);
    const vertical=input.held.marker>.5?-1:input.held.menuDown>.5?1:Math.abs(input.lean)>.5?Math.sign(input.lean):0;
    const horizontal=vertical?0:input.held.menuLeft>.5?-1:input.held.menuRight>.5?1:Math.abs(input.steer)>.6?Math.sign(input.steer):0;
    // Time-based repeat: one step on press, then a pause, then a steady rate.
    const key=vertical?'v'+vertical:horizontal?'h'+horizontal:'';
    if(!key){this.repeatKey='';this.repeatTimer=0;}
    else if(key!==this.repeatKey){this.repeatKey=key;this.repeatTimer=.38;this.move(vertical,horizontal);}
    else if((this.repeatTimer-=dt)<=0){this.repeatTimer=.11;this.move(vertical,horizontal);}
    if (input.pressed.hop) this.select();
    else if (input.pressed.brakeBars || input.pressed.pause) this.back();
    else if(input.pressed.brake)this.pageTurn(-1);
    else if(input.pressed.pumpGrind)this.pageTurn(1);
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
    const scooter=["rides","scooter","brand","brand-items","purchase","purchased","longboard","board-complete","board-purchase","shop"].includes(this.screen);
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
    if(!["maps","shops","play","online","settings","guide","tricks","leave-sesh"].includes(this.screen))renderer.render(this.previewScene,this.previewCamera);
    if(compact){renderer.setScissorTest(false);renderer.setViewport(0,0,innerWidth,innerHeight);}
  }
}
