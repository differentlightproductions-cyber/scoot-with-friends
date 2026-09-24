import {emptyWallet,validWallet,type AlphaWallet} from './credit';
import {emptyPockets,validPockets,type Pockets} from './items';
﻿import { PARTS, defaultScooter, type ScooterLoadout } from "./scooterParts";
import { defaultLongboard, validLongboard, type LongboardLoadout } from "./longboardParts";
import { ownershipKey, ownsBoard, ownsSelection, type RideableKind } from "./catalog";
import { emptyProgress, validProgress, type Progress } from "./progress";
import { defaultAvatar, sanitizeAvatar, type AvatarConfig } from '../avatar/config';
import { CONTROLS_VERSION } from "../input/riding";
import { FP_FOV_DEFAULT, FP_FOV_MAX, FP_FOV_MIN, TP_FOV_DEFAULT, TP_FOV_MAX, TP_FOV_MIN } from "../camera/fov";
export interface LocalProfile {
  version: 1 | 2 | 3 | 4;
  equipmentRevision?:number;
  wallet:AlphaWallet;
  /** The rider (docs/AVATAR-DESIGN.md §9): a small configuration, never a mesh. */
  avatar: AvatarConfig;
  pockets:Pockets;
  scooter: ScooterLoadout;
  /** The saved Sometimes Summer build; kept whether or not it is being ridden. */
  longboard: LongboardLoadout;
  /** What the rider takes out: switching never deletes the other build. */
  activeRideable: RideableKind;
  /** XP, missions and unopened crates (data/progress.ts). */
  progress: Progress;
  settings: {
    controlStyle: "pro" | "arcade";
    sound: boolean;
    grindAssist: boolean;
    /** The controls preset: "regular" is shown as Normal. See input/riding.ts. */
    stance: "regular" | "goofy";
    controlsVersion: number;
    daylight: 'day'|'sunset'|'night'|'sunrise'|'snow';
    fidelity: 'low'|'medium'|'high';
    mountFlourish: boolean;
    /** Personal camera; never networked. */
    cameraView: 'third'|'first';
    /** First-person HORIZONTAL field of view in degrees (converted per aspect). */
    firstPersonFov: number;
    firstPersonViewVersion?: number;
    /** Third-person HORIZONTAL field of view at 16:9, in degrees (camera/fov.ts). */
    thirdPersonFov: number;
    /** Which hand holds the phone, in both views. */
    phoneHand: 'right'|'left';
    /** Small phone notifications (music, messages, saves). */
    phoneNotifications: boolean;
    cameraMotion: 'reduced'|'full';
    /** Presentation only; the 3D image, never the HUD or part previews. */
    cameraFilter: 'off'|'camcorder';
    /** 0..100, kept while the filter is off. */
    filterStrength: number;
    /** Mobile virtual controller: layout preferences only, never bindings or physics. */
    touchControls: 'auto'|'on'|'off';
    touchSize: number;
    touchOpacity: number;
  };
}
export const PROFILE_KEY = "lazer-profile-v1";
/** Called after every successful save (cloud sync listens). */
export const profileSaved = new Set<() => void>();
/**
 * A save from before the avatar keeps the spirit of its gear, once: body
 * build, headwear, top, bottoms and shoes (ids like "top-hoodie-red") map to
 * the nearest avatar items and colours; everything else is the default rider.
 */
function migrateRider(saved:any):AvatarConfig{
  const avatar=defaultAvatar(),part=(id:unknown)=>typeof id==='string'?id.split('-'):[];
  const color:Record<string,string>={black:'black',gray:'gray',forest:'green',red:'red',sand:'khaki',navy:'navy'};
  avatar.bodyType=({skinny:'slim',regular:'standard',chunky:'stocky'} as const)[saved?.bodyBuild as 'skinny'|'regular'|'chunky']??'standard';
  const [,head,...headColor]=part(saved?.outfit?.head),[,top,...topColor]=part(saved?.outfit?.top),[,bottom,...bottomColor]=part(saved?.outfit?.bottom),[,...shoes]=part(saved?.outfit?.shoes);
  if(head)avatar.headwear=head==='none'?'none':['helmet','vented','visor'].includes(head)?'helmet':head;
  if(headColor.length)avatar.headwearColor=color[headColor.join('-')]??avatar.headwearColor;
  if(top)avatar.top=top==='long'?'long-sleeve':top;
  if(topColor.length)avatar.topColor=color[topColor.at(-1)!]??avatar.topColor;
  if(bottom)avatar.bottom=bottom==='jeans'?'straight-jeans':bottom==='chinos'?'straight-jeans':bottom;
  if(bottomColor.length)avatar.bottomColor=bottom==='jeans'&&bottomColor[0]==='navy'?'denim':color[bottomColor[0]]??avatar.bottomColor;
  if(shoes.length){avatar.shoes=shoes[0]==='high'?'high-top':'skate';avatar.shoeColor=color[shoes.at(-1)!]??avatar.shoeColor;}
  return sanitizeAvatar(avatar);
}
export function loadProfile(): LocalProfile {
  const profile: LocalProfile = {
    version: 4,
    wallet:emptyWallet(),
    avatar: defaultAvatar(),
    pockets:emptyPockets(),
    scooter: defaultScooter(),
    longboard: defaultLongboard(),
    activeRideable: "scooter",
    progress: emptyProgress(),
    settings: {
      controlStyle: "pro",
      sound: true,
      grindAssist: true,
      stance: "regular",
      controlsVersion: CONTROLS_VERSION,
      daylight: 'day',
      mountFlourish: true,
      cameraView:'third',
      firstPersonFov:FP_FOV_DEFAULT,
      firstPersonViewVersion:2,
      thirdPersonFov:TP_FOV_DEFAULT,
      phoneHand:'right',
      phoneNotifications:true,
      cameraMotion:'reduced',
      cameraFilter:'off',
      filterStrength:65,
      touchControls:'auto',
      touchSize:100,
      touchOpacity:50,
      fidelity: typeof matchMedia==='function' && matchMedia('(pointer: coarse)').matches ? 'low' : 'high',
    },
  };
  let migrated = false;
  try {
    const saved = JSON.parse(localStorage.getItem(PROFILE_KEY) || "null");
    if (!saved || ![1,2,3,4].includes(saved.version)) return profile;
    profile.wallet=validWallet(saved.wallet);
    profile.progress=validProgress(saved.progress);
    profile.equipmentRevision=Number.isSafeInteger(saved.equipmentRevision)?saved.equipmentRevision:0;
    profile.pockets=validPockets(saved.pockets);
    profile.avatar=saved.avatar?sanitizeAvatar(saved.avatar):migrateRider(saved);
    if(['day','sunset','night','sunrise','snow'].includes(saved.settings?.daylight))profile.settings.daylight=saved.settings.daylight;
    if(['low','medium','high'].includes(saved.settings?.fidelity))profile.settings.fidelity=saved.settings.fidelity;
    if(['third','first'].includes(saved.settings?.cameraView))profile.settings.cameraView=saved.settings.cameraView;
    if(Number.isFinite(saved.settings?.firstPersonFov))profile.settings.firstPersonFov=Math.min(FP_FOV_MAX,Math.max(FP_FOV_MIN,Math.round(saved.settings.firstPersonFov)));
    // Version 2 widened the range (70-110 became 100-150): the old defaults (90, then 110) and anything below the new minimum move to the new default.
    if((saved.settings?.firstPersonViewVersion??0)<2&&(!Number.isFinite(saved.settings?.firstPersonFov)||saved.settings.firstPersonFov<=110))profile.settings.firstPersonFov=FP_FOV_DEFAULT;
    if(Number.isFinite(saved.settings?.thirdPersonFov))profile.settings.thirdPersonFov=Math.min(TP_FOV_MAX,Math.max(TP_FOV_MIN,Math.round(saved.settings.thirdPersonFov)));
    if(['right','left'].includes(saved.settings?.phoneHand))profile.settings.phoneHand=saved.settings.phoneHand;
    if(typeof saved.settings?.phoneNotifications==='boolean')profile.settings.phoneNotifications=saved.settings.phoneNotifications;
    if(['reduced','full'].includes(saved.settings?.cameraMotion))profile.settings.cameraMotion=saved.settings.cameraMotion;
    if(['off','camcorder'].includes(saved.settings?.cameraFilter))profile.settings.cameraFilter=saved.settings.cameraFilter;
    if(['auto','on','off'].includes(saved.settings?.touchControls))profile.settings.touchControls=saved.settings.touchControls;
    if(Number.isFinite(saved.settings?.touchSize))profile.settings.touchSize=Math.min(130,Math.max(80,Math.round(saved.settings.touchSize)));
    if(Number.isFinite(saved.settings?.touchOpacity))profile.settings.touchOpacity=Math.min(85,Math.max(20,Math.round(saved.settings.touchOpacity)));
    if(Number.isFinite(saved.settings?.filterStrength))profile.settings.filterStrength=Math.min(100,Math.max(0,Math.round(saved.settings.filterStrength)));
    for (const slot of Object.keys(
      profile.scooter,
    ) as (keyof ScooterLoadout)[]) {
      const s = saved.scooter?.[slot],
        category =
          slot === "frontWheel" || slot === "rearWheel" ? "wheels" : slot;
      const part = PARTS.find(
        (p) => p.id === s?.partId && p.category === category,
      );
      // A crate exclusive is only kept on the scooter while it is owned.
      if (part?.variants.some((v) => v.id === s?.variantId && (!v.exclusive || ownsSelection(profile.wallet, s))))
        profile.scooter[slot] = { partId: s.partId, variantId: s.variantId };
    }
    // Version 4: Lazer parts stopped being free (only a starter build is given).
    // A save from before keeps the Lazer parts it has on its scooter as that
    // starter, written back once so the grant is part of the save from now on.
    if (saved.version < 4 && !profile.wallet.starter) {
      for (const s of Object.values(profile.scooter)) {
        const part = PARTS.find((p) => p.id === s.partId), key = ownershipKey(s);
        if (part?.brandId === "lazer" && !part.variants.find((v) => v.id === s.variantId)?.exclusive && !profile.wallet.owned.includes(key)) profile.wallet.owned.push(key);
      }
      profile.wallet.starter = true;
      migrated = true;
    }
    profile.longboard = validLongboard(saved.longboard);
    // A board that is not fully owned (a stale or edited save) cannot be ridden.
    if (saved.activeRideable === "longboard" && ownsBoard(profile.wallet, profile.longboard))
      profile.activeRideable = "longboard";
    if (saved.settings?.controlStyle === "arcade")
      profile.settings.controlStyle = "arcade";
    // Controls version 2 swapped which preset is called Normal. A save from before
    // keeps its physical buttons: its old name maps to the other preset, once.
    const savedStance = saved.settings?.stance === "goofy" ? "goofy" : "regular";
    // Arcade bindings never depended on the preset, so an Arcade save keeps its stance.
    const legacyControls = !!saved.settings && saved.settings.controlsVersion !== CONTROLS_VERSION && saved.settings.controlStyle !== "arcade";
    profile.settings.stance = legacyControls ? (savedStance === "goofy" ? "regular" : "goofy") : savedStance;
    // Grind assist is always on: a stale saved Off from the old toggle is ignored.
    for (const key of ["sound", "mountFlourish"] as const)
      if (typeof saved.settings?.[key] === "boolean")
        profile.settings[key] = saved.settings[key];
    if (migrated) localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {
    /* A missing or obsolete local profile falls back to playable defaults. */
  }
  return profile;
}
export function saveProfile(profile: LocalProfile, walletTransaction=false) {
  try {
    // Credit and progress only change inside economy transactions: an ordinary
    // save keeps whatever those last wrote rather than a stale in-memory copy.
    if(!walletTransaction){const saved=JSON.parse(localStorage.getItem(PROFILE_KEY)||"null");if(saved?.wallet)profile.wallet=validWallet(saved.wallet);if(saved?.progress)profile.progress=validProgress(saved.progress);}
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    for (const listener of profileSaved) listener();
    return true;
  } catch {
    return false;
  }
}
