import {SHOPS,shopStock} from '../data/shops';
import {CreditEconomy,owns} from '../data/credit';
import {catalogEntry,completeBoardSelections,bundlePrice,ownsBoard} from '../data/catalog';
import {LONGBOARD_CATEGORIES,LONGBOARD_PARTS,longboardPart,type LongboardCategory} from '../data/longboardParts';
import { AVATAR_PRESETS, randomAvatar } from '../avatar/config';
import { RiderCreator, type Framing } from './creator';
import { creatorBackdrop, type BackdropMood } from './creator-backdrop';
import {inventoryBrands,inventoryItems,paginate,BOARD_BRAND_ID,type InventoryItem,type BrowseMode} from '../data/inventory';
import {AccountPanel,cloud} from './account';
/** Where saves go: this device, plus the account when signed in. */
const savedWhere=()=>cloud.account?'saved to this device and your account.':'saved on this device.';
import {collectibles,collection,levelFor,priceRarity,RARITY_COLOR,RARITY_LABEL,type Rarity} from '../data/progress';
import {dailyDeals,dealsRefreshIn,type Deal} from '../data/deals';
interface ChoiceExtra { rarity?: Rarity; tag?: string; badge?: string; meter?: [number, number]; poor?: boolean; sold?: boolean; primary?: boolean }
/** The product on the counter: rarity frame, colour swatch, price sticker. */
function productCard(name:string,variant:string,rarity:Rarity,color:number,price:number,was:number|undefined,note:string,sold=false){
  return `<div class="product-card rarity-${rarity}" style="--rarity:${RARITY_COLOR[rarity]}"><span class="pc-rarity">${RARITY_LABEL[rarity]}</span><i class="pc-swatch" style="--c:#${color.toString(16).padStart(6,'0')}"></i><div class="pc-name"><small>${(name.match(/^(Mafioso|Sometimes Summer|Lazer)/)?.[1]??'').toUpperCase()}</small><strong>${name.replace(/^(Mafioso|Sometimes Summer|Lazer) /,'')}</strong><em>${variant}</em></div>${sold?'<b class="pc-stamp">SOLD!</b>':`<b class="pc-price">${was?`<s>${was}</s>`:''}${price}<small>CREDIT</small></b>`}${note?`<p>${note}</p>`:''}</div>`;
}
import {loadProfile} from '../data/loadout';
import { LOCALES, onLocale, setLocale, t } from '../i18n';
import {display,DISPLAY_LABEL,DISPLAY_MODES,fullscreenSupported} from './display';
import {FP_FOV_DEFAULT,FP_FOV_MAX,FP_FOV_MIN,TP_FOV_DEFAULT,TP_FOV_MAX,TP_FOV_MIN,TP_FOV_STEP} from '../camera/fov';
import { version } from '../../package.json';
import * as THREE from "three";
import { MAPS, type MapId } from "../data/maps";
import {
  CATEGORIES,
  PARTS,
  STARTER_PICKS,
  defaultScooter,
  selectedPart,
  starterOptions,
  validStarter,
  type Category,
  type PartVariant,
  type ScooterLoadout,
  type ScooterPart,
} from "../data/scooterParts";
const STARTER_LABEL:Record<string,string>={griptape:'GRIP TAPE'};
import { saveProfile, type LocalProfile } from "../data/loadout";
import { RiderModel } from "../scooter/model";
import type { InputFrame } from "../input/input";
import { presetName } from "../input/riding";
import './theme.css';
import './shop.css';
import { cityForMap, liveSky } from '../park/liveSky';
const plural=(n:number,word:string)=>n+' '+(n===1?word:/[^aeiou]y$/.test(word)?word.slice(0,-1)+'ies':word+'s');
const PARK_MAPS=MAPS.filter(m=>m.id!=="techno_gravity").sort((a,b)=>Number(b.id==="outdoor")-Number(a.id==="outdoor"));
export class GameMenu {
  accountPanel = new AccountPanel();
  screen = "home";
  seshOpen=false;currentMap:MapId='outdoor';onCloseSesh=()=>{};
  private savedProfile:LocalProfile|null=null;private travelMap:MapId='outdoor';
  openSesh(screen:string,map:MapId){this.seshOpen=true;this.currentMap=map;this.savedProfile=this.profile;const latest=loadProfile();if((latest.equipmentRevision??0)>(this.profile.equipmentRevision??0)){this.profile.scooter=structuredClone(latest.scooter);this.profile.longboard=structuredClone(latest.longboard);this.profile.activeRideable=latest.activeRideable;this.profile.equipmentRevision=latest.equipmentRevision;this.onChange();}this.profile=structuredClone(this.profile);this.root.hidden=false;this.show(screen);}
  private applySesh():boolean{
    const latest=loadProfile();if((latest.equipmentRevision??0)!==(this.profile.equipmentRevision??0)){this.notice='Setup changed in another tab. Cancel and reopen before applying.';this.render();return false;}
    // Only a newly chosen part must be owned; what was already saved stays valid.
    for(const [slot,item] of Object.entries(this.profile.scooter) as [keyof ScooterLoadout,{partId:string;variantId:string}][]){const saved=latest.scooter[slot];if(!owns(latest.wallet,item)&&(saved.partId!==item.partId||saved.variantId!==item.variantId)){this.notice='An equipped item is not owned.';this.render();return false;}}
    const scooterChanged=JSON.stringify(latest.scooter)!==JSON.stringify(this.profile.scooter),boardChanged=JSON.stringify(latest.longboard)!==JSON.stringify(this.profile.longboard),customized=scooterChanged||boardChanged;
    if(this.profile.activeRideable==='longboard'&&!ownsBoard(latest.wallet,this.profile.longboard)){this.notice='Own every part of this board before riding it.';this.render();return false;}
    const nextRevision=(this.profile.equipmentRevision??0)+1;this.profile.equipmentRevision=nextRevision;
    if(!saveProfile(this.profile)){this.profile.equipmentRevision=nextRevision-1;this.saveFailed=true;this.notice='Could not save. Retry or cancel.';this.render();return false;}
    Object.assign(this.savedProfile!,structuredClone(this.profile));this.onChange();this.notice='Changes '+savedWhere();this.saveFailed=false;this.render();
    if(customized){this.presetSaved(scooterChanged&&boardChanged?'both':boardChanged?'longboard':'scooter');void this.economy.track({},undefined,['customize']);}return true;
  }
  /** The rider creator (src/ui/creator.ts) edits a draft avatar on the preview rider. */
  readonly creator=new RiderCreator({
    preview:config=>{this.previewRider.setAvatar(config);this.creatorFraming='';},
    save:config=>{
      const previous=this.profile.avatar;this.profile.avatar=structuredClone(config);
      if(this.seshOpen){if(this.applySesh())return '';this.profile.avatar=previous;return this.notice||'Could not save. Try again.';}
      if(!saveProfile(this.profile)){this.profile.avatar=previous;this.saveFailed=true;return 'Could not save. Try again.';}
      this.saveFailed=false;this.previewRider.applyProfile(this.profile);this.onChange();return '';
    },
    close:()=>this.show('rider'),
    resetView:()=>{this.creatorFraming='';this.pan.set(0,0,0);},
  });
  private creatorFraming:Framing|''='';
  /** Frames the preview on the face, the whole body or the shoes as the creator's focus moves. */
  private frameCreator(){
    const framing=this.creator.framing;if(framing===this.creatorFraming)return;this.creatorFraming=framing;
    this.pan.set(0,0,0);this.previewRider.root.updateMatrixWorld(true);
    if(framing==='face'){this.previewRider.avatar.headRoot.getWorldPosition(this.focusTarget);this.focusTarget.y-=.015;this.zoomTarget=1.45;this.orbitGoal=.28;}
    else if(framing==='feet'){this.previewRider.avatar.feet[1].getWorldPosition(this.focusTarget);this.focusTarget.y=.1;this.zoomTarget=1.25;this.orbitGoal=.75;}
    else{this.focusTarget.set(0,.95,0);this.zoomTarget=3.8;this.orbitGoal=.5;}
  }
  private orbitGoal:number|null=null;
  /** Deliberate draft edits in the Sesh menu that Apply has not saved yet. */
  private dirty(){if(!this.seshOpen||!this.savedProfile)return false;const pick=(p:LocalProfile)=>JSON.stringify([p.scooter,p.longboard,p.activeRideable,p.avatar,p.settings,p.pockets]);return pick(this.profile)!==pick(this.savedProfile);}
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
  /** The starter build being picked (never saved until claimed) and where to go after. */
  private starterDraft:ScooterLoadout|null=null;private starterCategory:Category='deck';private starterPage=0;
  private starterItems:{part:ScooterPart;variant:PartVariant}[]=[];private afterStarter:'ride'|'scooter'='ride';
  /** A new rider builds their one free Lazer scooter before anything else. */
  private needsStarter(){return !loadProfile().wallet.starter;}
  private startStarter(after:'ride'|'scooter'){this.afterStarter=after;this.starterDraft??=validStarter(this.profile.scooter)??validStarter(defaultScooter());this.show('starter');}
  private async claimStarter(){
    if(this.buying||!this.starterDraft)return;this.buying=true;this.notice='Building your scooter...';this.render();
    const result=await this.economy.claimStarter(this.starterDraft);this.buying=false;
    if(typeof result==='string'){this.notice=result;if(!this.needsStarter()){this.starterDraft=null;this.show(this.afterStarter==='ride'?'play':'scooter');}else this.render();return;}
    this.profile.wallet=result.wallet;this.profile.scooter=result.scooter;this.profile.activeRideable='scooter';this.profile.equipmentRevision=result.equipmentRevision;
    this.starterDraft=null;this.previewRider.applyProfile(this.profile);this.onChange();this.notice='Your starter scooter is yours. Every part on it is owned.';
    if(this.afterStarter==='ride')this.onRide('outdoor');else this.show('scooter');
  }
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
      if(result.profile){Object.assign(this.profile,result.profile);this.previewRider.applyProfile(this.profile);this.onChange();this.notice='Board '+savedWhere();this.saveFailed=false;this.presetSaved('longboard');}else{this.notice=result.error??'Could not save';this.saveFailed=true;}this.render();return;
    }
    const part=PARTS.find(p=>p.id===partId)!;
    if(this.seshOpen){if(part.category==='wheels'){this.profile.scooter.frontWheel={...selection};this.profile.scooter.rearWheel={...selection};}else this.profile.scooter[part.category]=selection;this.changed();this.render();return;}
    this.buying=true;this.notice='Saving equipment...';this.render();const result=await this.economy.equip(selection,this.profile.equipmentRevision??0);this.buying=false;if(request!==this.equipRequest)return;
    if(result.profile){Object.assign(this.profile,result.profile);this.previewRider.applyProfile(this.profile);this.onChange();this.notice='Equipped / '+savedWhere();this.saveFailed=false;this.presetSaved('scooter');}else{this.notice=result.error??'Could not save';this.saveFailed=true;}this.render();
  }

  category: Category = "deck";
  product = "";
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
    swatch?: number;
    extra?: ChoiceExtra;
  }[] = [];
  /** A purchase went through (the menu plays its own screen; this adds the fanfare). */
  onPurchased=(_item:{name:string;variant:string;rarity:Rarity;color:number})=>{};
  /** Today's deal the pending purchase came from, if any. */
  private pendingDeal:Deal|null=null;
  private pageTurn=(_step:number)=>{};
  constructor(
    public root: HTMLElement,
    public profile: LocalProfile,
  ) {
    onLocale(() => { if (!this.root.hidden) this.render(); });
    // DISPLAY (#60): the saved mode starts on the first click or key; leaving
    // fullscreen through the browser sets it back to Windowed.
    display.onLeft=()=>{this.profile.settings.displayMode='windowed';this.changed();if(!this.root.hidden)this.render();};
    display.onWaiting=(waiting)=>{if(!waiting&&/press any key to switch/.test(this.notice)){this.notice='';if(!this.root.hidden)this.render();}};
    void display.apply(profile.settings.displayMode);
    this.previewScene.background = new THREE.Color(0xc5cbc1);
    this.previewScene.add(this.focusBox);
    this.previewScene.add(this.isolatedProduct);
    this.focusBox.visible = false;
    let drag: { x: number; y: number; pan: boolean } | null = null;
    // In the creator only the stage turns the rider (the panel scrolls); elsewhere the right half does.
    const onStage=(e:{clientX:number;clientY:number})=>{const r=this.root.querySelector('.cr-stage')?.getBoundingClientRect();return !!r&&e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom;};
    window.addEventListener("pointerdown", (e) => {
      if (!this.root.hidden && (this.screen==='creator'?onStage(e)&&!(e.target as HTMLElement).closest?.('.creator,.cr-confirm'):e.clientX > innerWidth * 0.5)) {
        if(this.screen==='creator')this.orbitGoal=null;
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
        if(this.screen==='creator'){if(onStage(e))this.zoomTarget=THREE.MathUtils.clamp(this.zoomTarget*(1+e.deltaY*.0012),.55,5.5);return;}
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
    // A soft disc the rider stands on, fading into the painted backdrop (no hard edge).
    const fade = Object.assign(document.createElement('canvas'), { width: 256, height: 256 }), fg = fade.getContext('2d')!;
    const radial = fg.createRadialGradient(128, 128, 0, 128, 128, 128);
    radial.addColorStop(0, '#fff'); radial.addColorStop(0.55, '#fff'); radial.addColorStop(1, '#000');
    fg.fillStyle = radial; fg.fillRect(0, 0, 256, 256);
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(2.6, 48),
      new THREE.MeshStandardMaterial({ color: 0xb6beb2, roughness: 1, transparent: true, alphaMap: new THREE.CanvasTexture(fade), depthWrite: false }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.01;
    floor.name='Preview floor';
    this.previewScene.add(floor);
    this.previewRider = new RiderModel(this.previewScene);
    this.previewRider.applyProfile(profile);
    this.show("home");
  }
  /** Where a purchase started (deals on the shop front, or a brand's shelf). */
  private screenBeforePurchase='brand-items';
  private swatchOf(partId:string,variantId:string){return (PARTS.find(p=>p.id===partId)?.variants.find(v=>v.id===variantId)?.color??LONGBOARD_PARTS.find(p=>p.id===partId)?.variants.find(v=>v.id===variantId)?.color)??0x888888;}
  show(screen: string) {
    if(screen==='settings-touch' || (this.screen==='settings-touch'&&screen!=='settings-touch')){this.touchPreviewOn=screen==='settings-touch';this.touchPreview(this.touchPreviewOn);}
    if(screen==='purchase'&&this.screen!=='purchase')this.screenBeforePurchase=this.screen;
    // Returning to a screen restores where focus was, so a category keeps its place.
    if(screen!==this.screen){this.memory.set(this.memoryKey(this.screen),this.index);this.index=this.memory.get(this.memoryKey(screen))??0;}
    if(this.screen==='creator'&&screen!=='creator')this.leaveCreator();
    const entering=screen==='creator'&&this.screen!=='creator';
    this.screen = screen;
    if(entering){this.root.dataset.screen='creator';this.root.classList.toggle('sesh-overlay',this.seshOpen);this.creatorFraming='';this.previewScene.background=creatorBackdrop('dusk');this.creator.start(this.root,this.profile.avatar);return;}
    // A direction still held from the previous screen waits before repeating here.
    this.repeatTimer=Math.max(this.repeatTimer,.38);
    this.render();
  }
  private leaveCreator(){this.creator.stop();this.previewRider.setAvatar(this.profile.avatar);this.orbitGoal=null;this.focusKey='__creator';}
  private changed() {
    if(this.seshOpen){this.previewRider.applyProfile(this.profile);return;}
    this.saveFailed = !saveProfile(this.profile);
    this.previewRider.applyProfile(this.profile);
    this.onChange();
  }
  /** Rides screen X: customize the focused ride (the same physical X in either stance). */
  private customizeFocused(){
    const board=this.index===1||this.index===3;
    if(board)this.show('longboard');else if(this.needsStarter())this.startStarter('scooter');else this.show('scooter');
  }
  /** An unmissable "PRESET SAVED" stamp over the ride preview when a build is saved. */
  private presetSaved(kind:'scooter'|'longboard'|'both'){
    this.root.querySelector('.preset-stamp')?.remove();
    const el=document.createElement('div');el.className='preset-stamp';el.setAttribute('role','status');
    el.textContent=kind==='both'?'RIDE PRESETS SAVED':kind==='longboard'?'LONGBOARD PRESET SAVED':'SCOOTER PRESET SAVED';
    this.root.append(el);window.setTimeout(()=>el.classList.add('out'),1700);window.setTimeout(()=>el.remove(),2100);
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
    if(this.screen==='creator'){this.root.dataset.screen='creator';this.creator.render();return;}
    const parkMaps=PARK_MAPS;
    this.root.dataset.screen=this.screen;
    const add = (
      label: string,
      action: () => void,
      detail?: string,
      selected = false,
      extra?: ChoiceExtra,
    ) => this.choices.push({ label, action, detail, selected, extra });
    // Grid cells come first on a screen so their indices line up with the page's items.
    const cell=(label:string,action:()=>void,detail?:string,selected=false,swatch?:number,extra?:ChoiceExtra)=>this.choices.push({label,action,detail,selected,cell:true,swatch,extra});
    // Shop screens open with the wallet strip: Credit, level and the collection.
    let header='';
    const walletStrip=(w:{credit:number;owned:string[]})=>{const c=collection(w.owned),lv=levelFor(loadProfile().progress.xp);
      return `<div class="shop-strip"><span class="ss-credit"><i></i><b>${w.credit.toLocaleString('en-US')}</b><small>CREDIT</small></span><span class="ss-level">LV ${lv.level}</span><span class="ss-collect"><small>COLLECTION ${c.have}/${c.total}</small><i><s style="width:${Math.round(c.have/Math.max(1,c.total)*100)}%"></s></i></span></div>`;};
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
        if(this.needsStarter())add("BUILD YOUR SCOOTER",()=>this.startStarter('ride'),"Pick your first Lazer parts: they are yours to keep");
        else add("PLAY",()=>this.show("play"),"Find your next line");
        add("SHOPS",()=>this.show("shops"),"Visit, browse, and ride");
        add("RIDES",()=>this.show("rides"),"Ride and customize your scooter or longboard");
        add("RIDER",()=>this.show("rider"),"Your avatar: riders, body type, randomize");
        add("SETTINGS",()=>this.show("settings"),"Preferences and trick book");
        add("ACCOUNT",()=>{void this.accountPanel.open();},"Sign in / Create account");
        break;
      case "play":
        title="PLAY";subtitle="YOUR NEXT SESH";
        add("SOLO",()=>this.show("maps"),"Choose a park and ride");
        add("PRIVATE FREE-RIDE",()=>this.show("online"),"Invite friends to a private room");break;
      case "rides":{
        title="RIDES";subtitle="A RIDE IT / X CUSTOMIZE";
        const boardOwned=ownsBoard(loadProfile().wallet,this.profile.longboard),active=this.profile.activeRideable;
        // The two rides are the big choices: A rides the focused one, X (either
        // stance) customizes it. Focusing one only previews it; nothing is equipped.
        add('SCOOTER',()=>void this.ride('scooter'),(active==='scooter'?'Riding now':'A to ride it')+' · X to customize',active==='scooter',{primary:true});
        add('LONGBOARD',()=>void this.ride('longboard'),!boardOwned?'Buy a complete Sometimes Summer board at Techno Gravity first':(active==='longboard'?'Riding now':'A to ride it')+' · X to customize',active==='longboard',{primary:true});
        add('CUSTOMIZE SCOOTER',()=>this.needsStarter()?this.startStarter('scooter'):this.show('scooter'),this.needsStarter()?'Build your starter scooter first':'Your parts by brand / '+selectedPart(this.profile.scooter.deck).part.name);
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
        add("CLAMP GRAB", () => {}, "In the air, hold RT + RB: one hand stays on the bar and the other holds the clamp (Regular: right hand, Goofy: left hand). The buttons are the same in both stances. Release to return the hand; it also lets go just before landing. Works with spins and flips; not during bar spins or finger whips.");
        add("BODY TRICKS", () => {}, "Y in air = no-hander. RT + Y Superman; LT + Y deck grab; LT + LB + Y tuck. Bumpers + Y add can-can, one-foot, or no-foot.");
        add("WALKING / RECOVERY", () => {}, "Y dismounts or mounts. LS walks, LS click runs while carrying the scooter, A climbs, B sits at a bench. After a bail, press A to get up.");
        add("YOUR PHONE", () => {}, "Hold D-pad Down to take your phone out, standing or rolling on the ground: Music, Emotes, Rides, Rider, Map, Items, Build and Messages. LS moves, A opens, B goes back, Y home; hold D-pad Down again to put it away. Riding, you coast while you look.");
        add("ON-FOOT SOCIAL", () => {}, "Emotes are on the phone. Hold D-pad Right for chat; Enter sends, Esc/B cancels. Private room chat is shared with connected friends; solo chat stays local.");
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
        add('CUSTOMIZE RIDER',()=>this.show('creator'),'Face, hair, eyes, body, outfit and accessories');
        add('CHOOSE RIDER',()=>this.show('rider-presets'),'Sample riders and presets');
        add('RANDOMIZE RIDER',()=>{this.profile.avatar=randomAvatar();this.changed();this.render();},'A new random rider, same physics');
        add('BACKPACK',()=>{this.profile.pockets.backpack=!this.profile.pockets.backpack;this.changed();this.render();},this.profile.pockets.backpack?'Equipped / same inventory':'Off / Pockets');
        title = "RIDER";
        subtitle = "YOUR AVATAR / SAME PHYSICS. YOUR STYLE.";
        break;
      case "rider-presets":
        title='CHOOSE RIDER';subtitle='SAMPLE RIDERS / ALL UNLOCKED';
        for(const preset of AVATAR_PRESETS)add(preset.name.toUpperCase(),()=>{this.profile.avatar=structuredClone(preset.config);this.changed();this.render();},'Included',JSON.stringify(this.profile.avatar)===JSON.stringify(preset.config));
        break;
      case "shop":{
        const wallet=loadProfile().wallet;title=this.activeShop.name.toUpperCase();subtitle='TODAY\'S DEALS / NEW DROPS / '+wallet.credit+' CREDIT'+(wallet.testCredit?' + '+wallet.testCredit+' TEST':'');
        header=walletStrip(wallet);
        // Today's deals first: marked down until midnight, one of each.
        const hours=Math.ceil(dealsRefreshIn()/3600);
        for(const deal of dailyDeals(this.activeShop.id)){const entry=catalogEntry(deal.partId)!,variant=entry.variants.find(v=>v.id===deal.variantId)!,owned=owns(wallet,deal),color=PARTS.find(p=>p.id===deal.partId)?.variants.find(v=>v.id===deal.variantId)?.color??LONGBOARD_PARTS.find(p=>p.id===deal.partId)?.variants.find(v=>v.id===deal.variantId)?.color;
          cell(entry.name.replace(/^(Mafioso|Sometimes Summer) /,'').toUpperCase()+' / '+variant.name.toUpperCase(),()=>{if(owned)return;this.product=deal.partId;this.pendingVariant=deal.variantId;this.pendingDeal=deal;this.show('purchase');},
            owned?'Yours already':'Was '+deal.was+' · ends in '+hours+'h',false,color,{rarity:priceRarity(deal.was),badge:owned?'SOLD':'-'+deal.off+'%',tag:owned?'':String(deal.price),poor:!owned&&wallet.credit+wallet.testCredit<deal.price,sold:owned});}
        const brands=inventoryBrands(wallet,'shop',{shopId:this.activeShop.id}),collected=collection(wallet.owned).brands;
        for(const b of brands){const c=collected.find(x=>x.brand===b.brand);add(b.brand.toUpperCase(),()=>{this.browseBrand=b.brandId;this.catPage=0;this.show(b.rideable==='longboard'?'longboard':'brand');},plural(b.count,'colorway')+' left to collect / '+plural(b.categories.length,'category'),false,{meter:c?[c.have,c.total]:undefined});}
        if(!brands.length)add('ALL STOCK OWNED',()=>{},'Everything this shop sells is already yours. Equip it from Customization.');
        const exclusive=collectibles().filter(c=>c.exclusive),found=exclusive.filter(c=>wallet.owned.includes(c.partId+':'+c.variantId)).length;
        add('CRATE EXCLUSIVES',()=>{this.notice='Crates come from missions and level-ups: open them from MISSIONS on your phone.';this.render();},`${exclusive.length} colourways you can only pull from crates / ${found} found`,false,{badge:'CRATES ONLY',meter:[found,exclusive.length]});
        break;}
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
      case "starter":{
        const draft=this.starterDraft??=validStarter(defaultScooter())!;
        title='FIRST BUILD.';subtitle='STARTER SCOOTER / YOURS TO KEEP';
        for(const category of STARTER_PICKS){const {part,variant}=selectedPart(category==='wheels'?draft.frontWheel:draft[category]);
          cell(STARTER_LABEL[category]??category.toUpperCase(),()=>{this.starterCategory=category;this.starterPage=0;this.show('starter-pick');},part.name.replace(/^Lazer /,'')+' / '+variant.name,false,variant.color);}
        add(this.buying?'BUILDING...':'RIDE IT',()=>void this.claimStarter(),'Bearings, headset, brake and compression included',false,{primary:true});
        break;}
      case "starter-pick":{
        const draft=this.starterDraft??=validStarter(defaultScooter())!,current=this.starterCategory==='wheels'?draft.frontWheel:draft[this.starterCategory as Exclude<Category,'wheels'>];
        const {items,page,pages}=paginate(starterOptions(this.starterCategory),this.starterPage,8);this.starterPage=page;this.starterItems=items;
        title='STARTER / '+(STARTER_LABEL[this.starterCategory]??this.starterCategory.toUpperCase());subtitle='PICK ONE / FREE WITH YOUR FIRST SCOOTER'+(pages>1?' / PAGE '+(page+1)+' OF '+pages:'');
        for(const o of items){const on=current.partId===o.part.id&&current.variantId===o.variant.id;
          cell(o.part.name.replace(/^Lazer /,'').toUpperCase()+' / '+o.variant.name.toUpperCase(),()=>{const s={partId:o.part.id,variantId:o.variant.id};if(this.starterCategory==='wheels'){draft.frontWheel={...s};draft.rearWheel={...s};}else (draft as Record<string,{partId:string;variantId:string}>)[this.starterCategory]=s;this.show('starter');},on?'Picked':'Starter pick',on,o.variant.color);}
        pager(pages,page,p=>{this.starterPage=p;});
        break;}
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
          cell(category.toUpperCase(),()=>{this.browseCategory=category;this.category=category as Category;this.itemPage=0;this.show('brand-items');},mode==='shop'?count+' for sale':plural(count,'owned colorway')+' / on: '+on.part.name.replace(on.part.brand+' ',''));}
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
          const swatch=item.rideable==='scooter'?PARTS.find(p=>p.id===item.partId)?.variants.find(v=>v.id===item.variantId)?.color:undefined;
          const deal=mode==='shop'?dailyDeals(this.activeShop.id).find(d=>d.partId===item.partId&&d.variantId===item.variantId):undefined,price=deal?.price??item.price;
          const transit=mode==='shop'&&wallet.packages.some(k=>k.partId===item.partId&&k.variantId===item.variantId);
          cell(item.partName.toUpperCase()+' / '+item.variantName.toUpperCase(),()=>{if(transit){this.notice='Already on its way from your phone order.';this.render();return;}this.product=item.partId;this.pendingVariant=item.variantId;this.pendingDeal=deal??null;if(mode==='shop')this.show('purchase');else void this.equip(item.partId,item.variantId);},
            transit?'On its way (phone order)':mode==='shop'?RARITY_LABEL[item.rarity]+(deal?' · was '+deal.was:''):equipped?(this.seshOpen?'Chosen':'Equipped'):(this.seshOpen?'Owned / Choose':'Owned / Equip'),equipped,swatch,
            {rarity:item.rarity,tag:mode==='shop'?String(price):undefined,badge:deal?'-'+deal.off+'%':item.exclusive?'CRATE':undefined,poor:mode==='shop'&&wallet.credit+wallet.testCredit<price});}
        if(!items.length)add(mode==='shop'?'SOLD OUT FOR YOU':'NOTHING OWNED HERE',()=>this.back(),mode==='shop'?'You own every colorway in this category.':'Buy these at Techno Gravity.');
        pager(pages,page,p=>{this.itemPage=p;});
        break;}
      case 'purchase':{
        const p=catalogEntry(this.product)!,variant=p.variants.find(v=>v.id===this.pendingVariant)!;const wallet=loadProfile().wallet;
        const deal=this.pendingDeal&&this.pendingDeal.partId===p.id&&this.pendingDeal.variantId===variant.id?this.pendingDeal:null,price=deal?deal.price:p.creditPrice,rarity=priceRarity(p.creditPrice),after=wallet.credit+wallet.testCredit-price;
        title='ON THE COUNTER';subtitle=(deal?'DEAL -'+deal.off+'% / ':'')+RARITY_LABEL[rarity]+' / '+p.name.toUpperCase();
        header=walletStrip(wallet)+productCard(p.name,variant.name,rarity,this.swatchOf(p.id,variant.id),price,deal?.was,after<0?'Need '+(-after)+' more Credit':'Leaves you '+after+' Credit');
        const back=()=>this.show(this.shopRoot==='longboard'&&p.rideable==='longboard'?'brand-items':deal&&this.screenBeforePurchase==='shop'?'shop':'brand-items');
        add(after<0?'NOT ENOUGH CREDIT':this.buying?'SAVING...':'BUY IT / '+price+' CREDIT',()=>{if(this.buying||after<0)return;this.buying=true;this.render();void this.economy.buy({partId:p.id,variantId:variant.id},deal?this.activeShop.id:undefined,price).then(result=>{this.buying=false;this.notice=result==='ok'?'Saved on this device.':result;this.profile.wallet=loadProfile().wallet;
          if(result==='ok')this.onPurchased({name:p.name,variant:variant.name,rarity,color:this.swatchOf(p.id,variant.id)});
          if(result==='ok'||result==='Already owned')this.show('purchased');else back();});},after<0?'Land tricks and finish missions to earn Credit.':'Owned for good. Equip it any time.',false,{rarity,primary:after>=0});
        add('NOT NOW',back,'No charge');break;}
      case 'purchased':{
        const p=catalogEntry(this.product)!,variant=p.variants.find(v=>v.id===this.pendingVariant)!,wallet=loadProfile().wallet,rarity=priceRarity(p.creditPrice);
        const brand=collection(wallet.owned).brands.find(b=>p.name.startsWith(b.brand));
        title='IT\'S YOURS!';subtitle=brand?`${brand.brand.toUpperCase()} COLLECTION ${brand.have}/${brand.total}${brand.total>brand.have?' / '+(brand.total-brand.have)+' TO GO':' / COMPLETE!'}`:this.notice;
        header=walletStrip(wallet)+productCard(p.name,variant.name,rarity,this.swatchOf(p.id,variant.id),0,undefined,'',true);
        if(p.rideable==='scooter')add('EQUIP NOW',()=>{void this.equip(this.product,this.pendingVariant);this.show('brand-items');},'Swap it onto your scooter',false,{primary:true});
        else add('BUILD YOUR BOARD',()=>this.show('longboard'),'Equip it from the board builder',false,{primary:true});
        add('KEEP SHOPPING',()=>this.show(this.screenBeforePurchase==='shop'?'shop':'brand-items'),'More drops, more deals');break;}
      case 'test-controller':{
        title=t('settings.option.test_controller');subtitle=t('settings.test.subtitle');
        add(t('settings.test.copy'),()=>{const text=JSON.stringify(this.controllerReport(),null,2);void navigator.clipboard?.writeText(text).then(()=>{this.notice=t('settings.test.copied');this.render();},()=>{this.notice=t('settings.test.unavailable');this.render();});},t('settings.test.copy.desc'));
        add(t('settings.test.show_touch'),()=>{this.touchPreviewOn=!this.touchPreviewOn;this.touchPreview(this.touchPreviewOn);this.render();},t('settings.test.show_touch.desc'));
        break;}
      case 'leave-sesh':{title='UNSAVED CHANGES';subtitle='APPLY THEM OR LEAVE THEM BEHIND';
        add('APPLY & CLOSE',()=>{this.applySesh();if(!this.dirty())this.closeSesh();},'Saves this setup on this device.');
        add('DISCARD CHANGES',()=>this.closeSesh(),'Keeps the setup you had when you paused.');
        add('STAY',()=>this.show(this.leaveReturn),'Keep editing.');break;}
      case "settings":
        title=t('settings.title');subtitle=t('settings.subtitle');
        add('🌐 '+t('settings.language')+(this.profile.settings.language==='en-US'?'':' · LANGUAGE'),()=>this.show('settings-language'),t('settings.language.desc'),false,{primary:true});
        add(t('settings.help'),()=>this.show("guide"),t('settings.help.desc'));
        add(t('settings.riding'),()=>this.show('settings-riding'),t('settings.riding.desc'));
        add(t('settings.camera'),()=>this.show('settings-camera'),t('settings.camera.desc'));
        add(t('settings.graphics'),()=>this.show('settings-graphics'),t('settings.graphics.desc'));
        add(t('settings.time'),()=>this.show('settings-time'),t('settings.time.desc'));
        add(t('settings.gameplay'),()=>this.show('settings-gameplay'),t('settings.gameplay.desc'));
        add(t('settings.audio'),()=>this.show('settings-audio'),t('settings.audio.desc'));
        add(t('settings.phone'),()=>this.show('settings-phone'),t('settings.phone.desc'));
        add(t('settings.touch'),()=>this.show('settings-touch'),t('settings.touch.desc'));
        if(this.owner())add(t('settings.owner_credit'),()=>this.show('test-credit'),t('settings.owner_credit.desc'));
        break;
      case 'settings-language':
        title=t('language.title');subtitle=t('language.subtitle');
        for (const language of LOCALES) add(language.native,()=>{
          this.profile.settings.language=language.code;
          if(this.savedProfile)this.savedProfile.settings.language=language.code;
          this.saveFailed=!saveProfile(this.savedProfile??this.profile);
          setLocale(language.code);
          this.render();
        },language.english,this.profile.settings.language===language.code);
        break;
      case 'settings-riding':
        title=t('settings.riding');subtitle=t('settings.title')+' / '+t('settings.riding');
        add(t('settings.option.held_item'),()=>{const a=['pushDeck','leftModifier','rightModifier'] as const;this.profile.pockets.useAction=a[(a.indexOf(this.profile.pockets.useAction)+1)%3];this.changed();this.render();},({pushDeck:'X / keyboard X',leftModifier:'LB / left Shift',rightModifier:'RB / E'})[this.profile.pockets.useAction]+' / '+t('settings.option.on_foot'));
        add(t('settings.option.mount_camera')+' '+t(this.profile.settings.mountFlourish?'common.on':'common.off'),()=>{this.profile.settings.mountFlourish=!this.profile.settings.mountFlourish;this.changed();this.render();});
        add(t('settings.option.controls')+' '+t('settings.value.'+this.profile.settings.controlStyle),()=>{this.profile.settings.controlStyle=this.profile.settings.controlStyle==='pro'?'arcade':'pro';this.changed();this.render();});
        add(t('settings.option.preset')+' '+t('settings.value.'+this.profile.settings.stance),()=>{this.profile.settings.stance=this.profile.settings.stance==='regular'?'goofy':'regular';this.changed();this.render();});
        add(t('settings.option.test_controller'),()=>this.show('test-controller'),t('settings.riding.desc'));
        break;
      case 'settings-gameplay':
        title=t('settings.gameplay');subtitle=t('settings.title')+' / '+t('settings.gameplay');
        add(t('gameplay.replay_history',{seconds:this.profile.settings.replayHistory}),()=>{const lengths=[15,30,45,60] as const;this.profile.settings.replayHistory=lengths[(lengths.indexOf(this.profile.settings.replayHistory)+1)%lengths.length];this.changed();this.render();},t('gameplay.replay_history.desc'));
        add(t('gameplay.playful_contact',{mode:t('playful.'+this.profile.settings.playfulContact)}),()=>{const modes=['full','friends','off'] as const;this.profile.settings.playfulContact=modes[(modes.indexOf(this.profile.settings.playfulContact)+1)%modes.length];this.changed();this.render();},t('gameplay.playful_contact.desc'));
        break;
      case 'settings-graphics':
        title=t('settings.graphics');subtitle=t('settings.title')+' / '+t('settings.graphics');
        add(t('settings.graphics')+' '+t('settings.value.'+this.profile.settings.fidelity),()=>{const levels=['low','medium','high'] as const;this.profile.settings.fidelity=levels[(levels.indexOf(this.profile.settings.fidelity)+1)%3];this.changed();this.render();},t('settings.graphics.desc'));
        add(t('settings.option.display')+' '+t('settings.value.'+this.profile.settings.displayMode),()=>{
          const next=DISPLAY_MODES[(DISPLAY_MODES.indexOf(this.profile.settings.displayMode)+1)%DISPLAY_MODES.length];
          this.profile.settings.displayMode=next;this.changed();
          void display.apply(next).then(ok=>{
            if(next!=='windowed'&&!fullscreenSupported())this.notice=t('settings.detail.display_unsupported');
            else if(!ok)this.notice=t('settings.detail.display_waiting',{mode:t('settings.value.'+next)});
            else this.notice='';
            this.render();
          });
          this.render();
        },t('settings.detail.display_'+this.profile.settings.displayMode));
        break;
      case 'settings-time':
        title=t('settings.time');subtitle=t('settings.title')+' / '+t('settings.time');
        {
        // Live mode (#48) shows what the city's sky is doing; picking a time or a weather by hand turns it off.
        const city=cityForMap(this.currentMap),live=this.profile.settings.liveSky?liveSky.current(city):null;
        const status=live?t('settings.detail.live_'+live.source,{clock:live.clock,weather:t('settings.value.'+live.weather)}):'';
        add(t('settings.option.match_now',{city:city.short,mode:t(live?'common.on':'common.off')}),()=>{this.profile.settings.liveSky=!this.profile.settings.liveSky;this.changed();this.render();},
          live?status:t('settings.detail.match_now',{city:city.name}));
        add(t('settings.option.time_of_day')+' '+(live?t('settings.value.live')+' · '+t('settings.value.'+live.phase):t('settings.value.'+this.profile.settings.daylight)),()=>{
          const phases=['day','sunset','night','sunrise'] as const,from=live?live.phase:this.profile.settings.daylight;this.profile.settings.liveSky=false;this.profile.settings.daylight=phases[(phases.indexOf(from)+1)%phases.length];this.changed();this.render();
        },t(live?'settings.detail.time_live':'settings.detail.time_manual'));
        add(t('settings.option.weather')+' '+(live?t('settings.value.live')+' · '+t('settings.value.'+live.weather):t('settings.value.'+this.profile.settings.weather)),()=>{
          const kinds=['sunny','fall','snow','rain'] as const,from=live?live.weather:this.profile.settings.weather;this.profile.settings.liveSky=false;this.profile.settings.weather=kinds[(kinds.indexOf(from)+1)%kinds.length];this.changed();this.render();
        },t(live?'settings.detail.weather_live':'settings.detail.weather_manual'));
        }
        add(t('settings.option.headlamp')+' '+t(this.profile.settings.flashlight?'common.on':'common.off'),()=>{this.profile.settings.flashlight=!this.profile.settings.flashlight;this.changed();this.render();},t('settings.detail.headlamp'));
        break;
      case 'settings-camera':
        title=t('settings.camera');subtitle=t('settings.title')+' / '+t('settings.camera');
        // Camera settings take effect at once, in the Sesh too, and are saved straight away.
        const camera=(edit:(c:LocalProfile['settings'])=>void)=>{edit(this.profile.settings);if(this.savedProfile){edit(this.savedProfile.settings);saveProfile(this.savedProfile);this.onCameraChange(this.savedProfile.settings);}else{this.saveFailed=!saveProfile(this.profile);this.onCameraChange(this.profile.settings);}this.render();};
        add(t('settings.option.camera_view')+' '+t('settings.value.'+this.profile.settings.cameraView),()=>camera(c=>{c.cameraView=c.cameraView==='first'?'third':'first';}),t('settings.detail.camera_view'));
        add(t('settings.option.first_fov',{degrees:this.profile.settings.firstPersonFov}),()=>camera(c=>{c.firstPersonFov=c.firstPersonFov>=FP_FOV_MAX?FP_FOV_MIN:c.firstPersonFov+5;}),t('settings.detail.first_fov',{min:FP_FOV_MIN,max:FP_FOV_MAX,default:FP_FOV_DEFAULT}));
        add(t('settings.option.third_fov',{degrees:this.profile.settings.thirdPersonFov}),()=>camera(c=>{c.thirdPersonFov=c.thirdPersonFov>=TP_FOV_MAX?TP_FOV_MIN:Math.min(TP_FOV_MAX,c.thirdPersonFov+TP_FOV_STEP);}),t('settings.detail.third_fov',{min:TP_FOV_MIN,max:TP_FOV_MAX,default:TP_FOV_DEFAULT}));
        add(t('settings.option.camera_motion')+' '+t('settings.value.'+this.profile.settings.cameraMotion),()=>camera(c=>{c.cameraMotion=c.cameraMotion==='reduced'?'full':'reduced';}),t('settings.detail.camera_motion'));
        add(t('settings.option.camera_filter')+' '+(this.profile.settings.cameraFilter==='camcorder'?t('settings.value.camcorder'):t('common.off')),()=>camera(c=>{c.cameraFilter=c.cameraFilter==='camcorder'?'off':'camcorder';}),t('settings.detail.camera_filter'));
        if(this.profile.settings.cameraFilter==='camcorder')add(t('settings.option.filter_strength',{percent:this.profile.settings.filterStrength}),()=>camera(c=>{c.filterStrength=c.filterStrength>=100?0:c.filterStrength+5;}),t('settings.detail.filter_strength'));
        break;
      case 'settings-phone':{
        title=t('settings.phone');subtitle=t('settings.title')+' / '+t('settings.phone');
        const phone=(edit:(c:LocalProfile['settings'])=>void)=>{edit(this.profile.settings);if(this.savedProfile){edit(this.savedProfile.settings);saveProfile(this.savedProfile);this.onCameraChange(this.savedProfile.settings);}else{this.saveFailed=!saveProfile(this.profile);this.onCameraChange(this.profile.settings);}this.render();};
        add(t('settings.option.phone_hand')+' '+t('settings.value.'+this.profile.settings.phoneHand),()=>phone(c=>{c.phoneHand=c.phoneHand==='right'?'left':'right';}),t('settings.detail.phone_hand'));
        add(t('settings.option.notifications')+' '+t(this.profile.settings.phoneNotifications?'common.on':'common.off'),()=>phone(c=>{c.phoneNotifications=!c.phoneNotifications;}),t('settings.detail.notifications'));
        break;}
      case 'settings-touch':{
        title=t('settings.touch');subtitle=t('settings.title')+' / '+t('settings.touch');
        const touch=(edit:(c:LocalProfile['settings'])=>void)=>{edit(this.profile.settings);if(this.savedProfile){edit(this.savedProfile.settings);saveProfile(this.savedProfile);this.onCameraChange(this.savedProfile.settings);}else{this.saveFailed=!saveProfile(this.profile);this.onCameraChange(this.profile.settings);}this.render();};
        add(t('settings.option.touch_controls')+' '+(this.profile.settings.touchControls==='auto'?t('settings.value.auto'):t('common.'+this.profile.settings.touchControls)),()=>touch(c=>{c.touchControls=c.touchControls==='auto'?'on':c.touchControls==='on'?'off':'auto';}),t('settings.detail.touch_controls'));
        const sizes=[80,100,130] as const, size=this.profile.settings.touchSize<=90?'small':this.profile.settings.touchSize<=110?'medium':'large';
        add(t('settings.option.touch_size')+' '+t('settings.value.'+size),()=>touch(c=>{c.touchSize=sizes[size==='small'?1:size==='medium'?2:0];}),t('settings.detail.touch_size'));
        const opacities=[25,50,75] as const;
        add(t('settings.option.touch_opacity')+' '+this.profile.settings.touchOpacity+'%',()=>touch(c=>{c.touchOpacity=opacities[(opacities.findIndex(n=>n>=c.touchOpacity)+1)%opacities.length]??25;}),t('settings.detail.touch_opacity'));
        add(t('settings.option.touch_left_handed')+' '+t(this.profile.settings.touchLeftHanded?'common.on':'common.off'),()=>touch(c=>{c.touchLeftHanded=!c.touchLeftHanded;}),t('settings.detail.touch_left_handed'));
        if(typeof navigator.vibrate==='function')add(t('settings.option.touch_haptics')+' '+t(this.profile.settings.touchHaptics?'common.on':'common.off'),()=>touch(c=>{c.touchHaptics=!c.touchHaptics;}),t('settings.detail.touch_haptics'));
        add(t('settings.option.touch_reset'),()=>touch(c=>{c.touchControls='auto';c.touchSize=100;c.touchOpacity=50;c.touchLeftHanded=false;c.touchHaptics=false;}),t('settings.detail.touch_reset'));
        break;}
      case 'settings-audio':
        title=t('settings.audio');subtitle=t('settings.title')+' / '+t('settings.audio');
        add(t('pause.sound')+' '+t(this.profile.settings.sound?'common.on':'common.off'), () => {
          this.profile.settings.sound = !this.profile.settings.sound;
          this.changed();
          this.render();
        });
        break;
    }
    if(this.seshOpen && (["rider","scooter","settings","rides","brand","brand-items","longboard"].includes(this.screen)||this.screen.startsWith('settings-')))add(this.screen.startsWith('settings')?t('settings.apply'):"APPLY / SAVE CHANGES",()=>this.applySesh(),this.screen.startsWith('settings')?t(this.dirty()?'settings.unsaved':'settings.nothing'):this.dirty()?"Unsaved choices. Appearance refreshes when safely grounded.":"Nothing to apply yet.");
    if (this.screen !== "home"&&this.screen!=="leave-sesh")
      add(
        !this.seshOpen && this.screen === "rider"
          ? "SAVE & BACK"
          : this.screen.startsWith('settings')||this.screen==='test-controller'?t('common.back'):"BACK",
        () => this.back(),
      );
    this.index=Math.min(this.index,Math.max(0,this.choices.length-1));
    this.cellCount=this.choices.filter(c=>c.cell).length;
    const x=(c:(typeof this.choices)[number])=>c.extra??{};
    const button=(c:(typeof this.choices)[number],i:number)=>`<button ${this.screen === "home" && i === 0 ? 'id="ride"' : ""} data-menu-index="${i}" class="${c.cell?"menu-cell ":""}${/PAGE/.test(c.label)&&!c.cell?"menu-page ":""}${i === this.index ? "selected " : ""}${c.selected ? "chosen " : ""}${x(c).rarity?"rarity-"+x(c).rarity+" ":""}${x(c).poor?"poor ":""}${x(c).sold?"sold ":""}${x(c).primary?"menu-primary ":""}">${this.screen==="maps"&&i<parkMaps.length?`<img class="map-list-thumb" src="${parkMaps[i].preview}" alt="${parkMaps[i].name}">`:""}${c.swatch===undefined?"":`<i class="colorway-swatch" style="--swatch:#${c.swatch.toString(16).padStart(6,"0")}"></i>`}${x(c).badge?`<em class="menu-badge">${x(c).badge}</em>`:""}<span>${c.label}</span>${c.selected ? "<b>✓</b>" : ""}${c.detail ? `<small>${c.detail}</small>` : ""}${x(c).tag?`<b class="price-tag">${x(c).tag}</b>`:""}${x(c).meter?`<i class="menu-meter"><s style="width:${Math.round(x(c).meter![0]/Math.max(1,x(c).meter![1])*100)}%"></s></i>`:""}</button>`;
    const cells=this.choices.slice(0,this.cellCount).map(button).join(""),rows=this.choices.slice(this.cellCount).map((c,i)=>button(c,i+this.cellCount)).join("");
    const localizedSettings=this.screen.startsWith('settings')||this.screen==='test-controller';
    const saveNote=localizedSettings?(this.saveFailed?t('settings.save_failed'):this.notice||t(cloud.account?'settings.saved_account':'settings.saved_device')+' '+t('settings.cash_unavailable')):this.saveFailed ? "Could not save. Retry before leaving." : (this.notice||(cloud.account?'Progress saves to your account. ':'Progress saves on this device. Sign in to sync it. ')+'Cash purchases unavailable in this alpha.');
    const controls=localizedSettings?t('settings.controls_hint'):"D-PAD / LS SELECT · A CONFIRM · B BACK";
    const controlsMore=localizedSettings?t('settings.controls_more'):"RS ROTATE / ZOOM · LB+RS PAN · DRAG / WHEEL · KEYBOARD W/S, ENTER, ESC";
    this.root.innerHTML = `<section class="game-menu"><div class="eyebrow">${subtitle}</div><h1${Math.max(...String(title).split(/\s+/).map((w)=>w.length))>10?' class="long-title"':''}>${title}</h1>${header}<nav>${cells?`<div class="menu-grid">${cells}</div>`:""}${rows}</nav><p class="menu-save-note">${saveNote}</p><p class="menu-controls">${controls}${this.choices.some(c=>c.label==='NEXT PAGE ›')?' · LT / RT PAGE':''}<br>${controlsMore}</p><div id="connection"></div><small class="build-number">SCOOT WITH FRIENDS · ALPHA ${version}</small></section>${this.showsPreview()&&!this.shopOpen?`<div class="preview-frame" data-mood="${this.backdropMood()}" aria-hidden="true"><i class="pf-tape"></i><i class="pf-tape"></i><b class="pf-label">${this.backdropMood()==='shop'?'ON THE BENCH':this.backdropMood()==='sunrise'?'RIDER CAM':'LIVE'}</b></div>`:''}${this.screen === "maps" ? `<aside class="map-preview"><img src="${PARK_MAPS[Math.min(this.index, PARK_MAPS.length - 1)].preview}" alt="Park preview"><div class="eyebrow" id="map-type"></div><h2 id="map-name"></h2><p id="map-description"></p></aside>` : ""}`;
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
    if(this.screen==='starter-pick'&&this.index<this.cellCount){const o=this.starterItems[this.index];if(o)return {partId:o.part.id,variantId:o.variant.id};}
    if(this.screen==='brand-items'&&this.index<this.cellCount){const item=this.visibleItems[this.index];if(item)return {partId:item.partId,variantId:item.variantId};}
    if(['purchase','purchased'].includes(this.screen)&&this.product)return {partId:this.product,variantId:this.pendingVariant};
    return undefined;
  }
  private highlight() {
    const ridesBoard=this.screen==='rides'&&(this.index===1||this.index===3);
    const boardBrowse=this.browseBrand===BOARD_BRAND_ID&&['brand-items','purchase','purchased'].includes(this.screen);
    const boardScreen=["longboard","board-complete","board-purchase"].includes(this.screen)||boardBrowse||ridesBoard;
    let category:string=this.screen==='starter-pick'?this.starterCategory:this.screen==='brand-items'?this.browseCategory:this.category;
    if(this.screen==='brand'&&this.index<this.cellCount)category=this.visibleCategories[this.index]??category;
    const active=!boardScreen&&["brand","brand-items","purchase","purchased","starter-pick"].includes(this.screen);
    // The starter screens preview the draft build (with the focused pick on it).
    const starterScreen=(this.screen==='starter'||this.screen==='starter-pick')&&!!this.starterDraft;
    const focused=this.focusedSelection(),entry=focused&&catalogEntry(focused.partId);
    this.previewRider.board.visible=boardScreen;
    // Browsing only ever changes the inspection model. The draft/saved profile is
    // never mutated, and leaving a focused row restores the current draft.
    const previewKey=entry?.rideable==='scooter'?focused!.partId+':'+focused!.variantId+(starterScreen?':'+JSON.stringify(this.starterDraft):''):starterScreen?'starter:'+JSON.stringify(this.starterDraft):'';
    if(previewKey&&previewKey!==this.previewKey){const preview=structuredClone(this.profile);if(starterScreen)preview.scooter=structuredClone(this.starterDraft!);if(entry?.rideable==='scooter'){if(entry!.category==="wheels"){preview.scooter.frontWheel={...focused!};preview.scooter.rearWheel={...focused!};}else (preview.scooter as Record<string,{partId:string;variantId:string}>)[entry!.category]={...focused!};}this.previewRider.applyProfile(preview);this.previewing=true;}
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
    if(this.screen==='creator'){this.creator.select();return;}
    this.choices[this.index]?.action();
  }
  private closeShop(){this.shopOpen=false;this.root.classList.remove('shop-overlay');this.root.hidden=true;this.onCloseShop();}
  back() {
    if(this.buying)return;
    if(this.screen==='creator'){this.creator.back();return;}
    if(this.seshOpen&&["rides","rider","settings","maps","shops","online"].includes(this.screen)){if(this.dirty()){this.leaveReturn=this.screen;this.show('leave-sesh');return;}this.closeSesh();return;}
    if(this.screen==='leave-sesh'){this.show(this.leaveReturn);return;}
    if(this.screen.startsWith('settings-')||this.screen==='test-controller'){this.show('settings');return;}
    if(this.seshOpen&&this.screen==="travel"){this.show("maps");return;}
    if(this.shopOpen&&this.screen===this.shopRoot){this.closeShop();return;}
    if(this.shopOpen&&(this.screen==="longboard"||this.screen==="shop")){if(this.screen==="shop")this.closeShop();else this.show("shop");return;}
    if(["purchase","purchased"].includes(this.screen)){this.show('brand-items');return;}
    if(this.screen==='brand-items'){this.show(this.browseBrand===BOARD_BRAND_ID?'longboard':'brand');return;}
    if(this.screen==='brand'){this.show(this.shopOpen?'shop':'scooter');return;}
    if(this.screen==="board-complete"){this.show("longboard");return;}
    if(this.screen==="board-purchase"){this.show("board-complete");return;}
    if(this.screen==="longboard"){this.show("rides");return;}
    if(this.screen==="starter-pick"){this.show("starter");return;}
    if(this.screen==="starter"){this.starterDraft=null;this.previewRider.applyProfile(this.profile);this.show(this.afterStarter==='ride'?'home':'rides');return;}
    this.show(
      this.screen==='maps'?'play':this.screen==='tricks'?'guide':this.screen==='guide'?'settings':this.screen==='scooter'?'rides':this.screen==='rider-presets'?'rider':"home",
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
    else if(this.touchPreviewOn&&this.screen!=='settings-touch'){this.touchPreviewOn=false;this.touchPreview(false);}
    if(this.accountPanel.dialog.open){this.accountPanel.update(input,dt);return;}
    if(this.screen==='creator'){
      this.creator.update(input,dt);this.frameCreator();
      // RS turns the rider, the triggers zoom (LT out, RT in).
      if(Math.abs(input.rx)>.05)this.orbitGoal=null;
      if(this.orbitGoal!==null)this.orbit+=(this.orbitGoal-this.orbit)*(1-Math.exp(-6*dt));
      this.orbit-=input.rx*dt*2.2;
      const zoom=(input.held.brake-input.held.pumpGrind)*dt*1.8+input.ry*dt*1.2;
      if(zoom)this.zoomTarget=THREE.MathUtils.clamp(this.zoomTarget+zoom*this.zoomTarget,.55,5.5);
      this.focus.lerp(this.focusTarget,1-Math.exp(-7*dt));
      this.zoom+=(this.zoomTarget-this.zoom)*(1-Math.exp(-7*dt));
      return;
    }
    this.cooldown = Math.max(0, this.cooldown - dt);
    const vertical=input.held.marker>.5?-1:input.held.menuDown>.5?1:Math.abs(input.lean)>.5?Math.sign(input.lean):0;
    const horizontal=vertical?0:input.held.menuLeft>.5?-1:input.held.menuRight>.5?1:Math.abs(input.steer)>.6?Math.sign(input.steer):0;
    // Time-based repeat: one step on press, then a pause, then a steady rate.
    const key=vertical?'v'+vertical:horizontal?'h'+horizontal:'';
    if(!key){this.repeatKey='';this.repeatTimer=0;}
    else if(key!==this.repeatKey){this.repeatKey=key;this.repeatTimer=.38;this.move(vertical,horizontal);}
    else if((this.repeatTimer-=dt)<=0){this.repeatTimer=.11;this.move(vertical,horizontal);}
    if (input.pressed.hop) this.select();
    else if (input.pressed.pushDeck && this.screen==='rides') this.customizeFocused();
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
  /** Screens with the 3D rider/ride preview on the right. */
  showsPreview(){return !["maps","shops","play","online","settings","guide","tricks","leave-sesh"].includes(this.screen)&&!this.screen.startsWith('settings-');}
  /** The painted set for the current screen (see creator-backdrop.ts). */
  backdropMood():BackdropMood{
    const s=this.screen;
    if(['rides','scooter','brand','brand-items','purchase','purchased','longboard','board-complete','board-purchase','shop','shops'].includes(s))return 'shop';
    if(['rider','rider-presets'].includes(s))return 'sunrise';
    if(s==='maps'||s==='play'||s==='travel'||s==='online')return 'noon';
    if(s.startsWith('settings')||s==='test-controller'||s==='test-credit')return 'night';
    if(s==='guide'||s==='tricks')return 'sunrise';
    return 'dusk';
  }
  preview(renderer: THREE.WebGLRenderer) {
    this.previewRider.posePreviewHands(performance.now()/1000);
    const scooter=["rides","scooter","brand","brand-items","purchase","purchased","longboard","board-complete","board-purchase","shop"].includes(this.screen);
    this.previewRider.rider.visible=!scooter;
    const floor=this.previewScene.getObjectByName('Preview floor');if(floor)floor.visible=!this.shopOpen;
    const compact=true,stage=this.screen==='creator'?this.root.querySelector('.cr-stage')?.getBoundingClientRect():undefined;
    let x=compact?Math.round(innerWidth*.40):0,w=compact?Math.round(innerWidth*.55):innerWidth,h=compact?Math.round(innerHeight*.62):innerHeight,y=compact?Math.round(innerHeight*.20):0;
    if(stage&&stage.width>0){x=Math.round(stage.left);w=Math.round(stage.width);h=Math.round(stage.height);y=Math.round(innerHeight-stage.bottom);}
    // Each part of the menu has its own painted set; it covers the stage without stretching (keeps the horizon band).
    const mood=this.backdropMood();
    if(this.previewScene.background!==creatorBackdrop(mood))this.previewScene.background=creatorBackdrop(mood);
    const backdrop=this.previewScene.background;
    if(backdrop instanceof THREE.Texture){const a=w/Math.max(1,h);if(a>=1){backdrop.repeat.set(1,1/a);backdrop.offset.set(0,(1-1/a)*.42);}else{backdrop.repeat.set(a,1);backdrop.offset.set((1-a)*.5,0);}}
    if(floor instanceof THREE.Mesh)(floor.material as THREE.MeshStandardMaterial).color.setHex(({dusk:0x7a5a6c,noon:0xb58d66,night:0x3a3350,shop:0x6e4428,sunrise:0x9a82b8} as Record<BackdropMood,number>)[mood]);
    const center=this.focus.clone().add(this.pan);
    const distance=this.zoom*(scooter&&!this.shopOpen?.66:1);
    this.previewCamera.aspect=w/h;
    this.previewCamera.position.set(this.focus.x+this.pan.x+Math.sin(this.orbit)*distance,this.focus.y+this.pan.y+distance*.22,this.focus.z+this.pan.z+Math.cos(this.orbit)*distance);
    this.previewCamera.lookAt(center);this.previewCamera.updateProjectionMatrix();
    if(compact){renderer.setViewport(x,y,w,h);renderer.setScissor(x,y,w,h);renderer.setScissorTest(true);}
    if(this.showsPreview())renderer.render(this.previewScene,this.previewCamera);
    if(compact){renderer.setScissorTest(false);renderer.setViewport(0,0,innerWidth,innerHeight);}
  }
}
