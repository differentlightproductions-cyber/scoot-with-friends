import {emptyWallet,validWallet,type AlphaWallet} from './credit';
import {BODY_BUILDS,type BodyBuild} from '../scooter/body-fit';
import {emptyPockets,validPockets,type Pockets} from './items';
﻿import { RIDERS } from "./riders";
import { PARTS, defaultScooter, type ScooterLoadout } from "./scooterParts";
import { defaultLongboard, validLongboard, type LongboardLoadout } from "./longboardParts";
import { ownsBoard, type RideableKind } from "./catalog";
import { CLOTHING, OUTFIT_SLOTS, defaultOutfit, type Outfit } from './outfits';
import { CONTROLS_VERSION } from "../input/riding";
export interface LocalProfile {
  version: 1 | 2 | 3;
  equipmentRevision?:number;
  wallet:AlphaWallet;
  outfit: Outfit;
  riderOutfits:Record<string,Outfit>;
  riderId: string;
  bodyBuild:BodyBuild;
  pockets:Pockets;
  outfitId: string;
  scooter: ScooterLoadout;
  /** The saved Sometimes Summer build; kept whether or not it is being ridden. */
  longboard: LongboardLoadout;
  /** What the rider takes out: switching never deletes the other build. */
  activeRideable: RideableKind;
  settings: {
    controlStyle: "pro" | "arcade";
    sound: boolean;
    grindAssist: boolean;
    /** The controls preset: "regular" is shown as Normal. See input/riding.ts. */
    stance: "regular" | "goofy";
    controlsVersion: number;
    daylight: 'day'|'sunset'|'night'|'sunrise';
    fidelity: 'low'|'medium'|'high';
    mountFlourish: boolean;
    characterQuality:'auto'|'low'|'medium'|'high';
    /** Personal camera; never networked. */
    cameraView: 'third'|'first';
    /** First-person HORIZONTAL field of view in degrees (converted per aspect). */
    firstPersonFov: number;
    cameraMotion: 'reduced'|'full';
  };
}
export const PROFILE_KEY = "lazer-profile-v1";
export function loadProfile(): LocalProfile {
  const profile: LocalProfile = {
    version: 3,
    wallet:emptyWallet(),
    outfit: defaultOutfit(),
    riderOutfits:{},
    riderId: RIDERS[0].id,
    bodyBuild:'regular',
    pockets:emptyPockets(),
    outfitId: RIDERS[0].outfitId,
    scooter: defaultScooter(),
    longboard: defaultLongboard(),
    activeRideable: "scooter",
    settings: {
      controlStyle: "pro",
      sound: true,
      grindAssist: true,
      stance: "regular",
      controlsVersion: CONTROLS_VERSION,
      daylight: 'day',
      mountFlourish: true,
      characterQuality:'auto',
      cameraView:'third',
      firstPersonFov:90,
      cameraMotion:'reduced',
      fidelity: typeof matchMedia==='function' && matchMedia('(pointer: coarse)').matches ? 'low' : 'high',
    },
  };
  try {
    const saved = JSON.parse(localStorage.getItem(PROFILE_KEY) || "null");
    if (!saved || ![1,2,3].includes(saved.version)) return profile;
    profile.wallet=validWallet(saved.wallet);
    profile.equipmentRevision=Number.isSafeInteger(saved.equipmentRevision)?saved.equipmentRevision:0;
    profile.pockets=validPockets(saved.pockets);
    if(BODY_BUILDS.includes(saved.bodyBuild))profile.bodyBuild=saved.bodyBuild;
    for(const slot of OUTFIT_SLOTS)if(CLOTHING.some(p=>p.category===slot&&p.id===saved.outfit?.[slot]))profile.outfit[slot]=saved.outfit[slot];
    if(['day','sunset','night','sunrise'].includes(saved.settings?.daylight))profile.settings.daylight=saved.settings.daylight;
    if(['low','medium','high'].includes(saved.settings?.fidelity))profile.settings.fidelity=saved.settings.fidelity;
    if(['auto','low','medium','high'].includes(saved.settings?.characterQuality))profile.settings.characterQuality=saved.settings.characterQuality;
    if(['third','first'].includes(saved.settings?.cameraView))profile.settings.cameraView=saved.settings.cameraView;
    if(Number.isFinite(saved.settings?.firstPersonFov))profile.settings.firstPersonFov=Math.min(110,Math.max(70,Math.round(saved.settings.firstPersonFov)));
    if(['reduced','full'].includes(saved.settings?.cameraMotion))profile.settings.cameraMotion=saved.settings.cameraMotion;
    const rider = RIDERS.find((r) => r.id === saved.riderId);
    for(const r of RIDERS){const entry=saved.riderOutfits?.[r.id];if(entry&&OUTFIT_SLOTS.every(s=>CLOTHING.some(c=>c.id===entry[s]&&c.category===s)))profile.riderOutfits[r.id]={...entry};}
    if (rider) {
      profile.riderId = rider.id;
      profile.outfitId = rider.outfitId;
    }
    for (const slot of Object.keys(
      profile.scooter,
    ) as (keyof ScooterLoadout)[]) {
      const s = saved.scooter?.[slot],
        category =
          slot === "frontWheel" || slot === "rearWheel" ? "wheels" : slot;
      const part = PARTS.find(
        (p) => p.id === s?.partId && p.category === category,
      );
      if (part?.variants.some((v) => v.id === s?.variantId))
        profile.scooter[slot] = { partId: s.partId, variantId: s.variantId };
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
  } catch {
    /* A missing or obsolete local profile falls back to playable defaults. */
  }
  return profile;
}
export function saveProfile(profile: LocalProfile, walletTransaction=false) {
  try {
    if(!walletTransaction){const saved=JSON.parse(localStorage.getItem(PROFILE_KEY)||"null");if(saved?.wallet)profile.wallet=validWallet(saved.wallet);}
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    return true;
  } catch {
    return false;
  }
}
