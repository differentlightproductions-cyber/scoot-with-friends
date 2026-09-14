import {emptyWallet,validWallet,type AlphaWallet} from './credit';
﻿import { RIDERS } from "./riders";
import { PARTS, defaultScooter, type ScooterLoadout } from "./scooterParts";
import { CLOTHING, OUTFIT_SLOTS, defaultOutfit, type Outfit } from './outfits';
export interface LocalProfile {
  version: 1 | 2 | 3;
  wallet:AlphaWallet;
  outfit: Outfit;
  riderOutfits:Record<string,Outfit>;
  riderId: string;
  outfitId: string;
  scooter: ScooterLoadout;
  settings: {
    controlStyle: "pro" | "arcade";
    sound: boolean;
    grindAssist: boolean;
    stance: "regular" | "goofy";
    daylight: 'day'|'sunset'|'night'|'sunrise';
    fidelity: 'low'|'medium'|'high';
    mountFlourish: boolean;
    characterQuality:'auto'|'low'|'medium'|'high';
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
    outfitId: RIDERS[0].outfitId,
    scooter: defaultScooter(),
    settings: {
      controlStyle: "pro",
      sound: true,
      grindAssist: true,
      stance: "regular",
      daylight: 'day',
      mountFlourish: true,
      characterQuality:'auto',
      fidelity: typeof matchMedia==='function' && matchMedia('(pointer: coarse)').matches ? 'low' : 'high',
    },
  };
  try {
    const saved = JSON.parse(localStorage.getItem(PROFILE_KEY) || "null");
    if (!saved || ![1,2,3].includes(saved.version)) return profile;
    profile.wallet=validWallet(saved.wallet);
    for(const slot of OUTFIT_SLOTS)if(CLOTHING.some(p=>p.category===slot&&p.id===saved.outfit?.[slot]))profile.outfit[slot]=saved.outfit[slot];
    if(['day','sunset','night','sunrise'].includes(saved.settings?.daylight))profile.settings.daylight=saved.settings.daylight;
    if(['low','medium','high'].includes(saved.settings?.fidelity))profile.settings.fidelity=saved.settings.fidelity;
    if(['auto','low','medium','high'].includes(saved.settings?.characterQuality))profile.settings.characterQuality=saved.settings.characterQuality;
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
    if (saved.settings?.controlStyle === "arcade")
      profile.settings.controlStyle = "arcade";
    if (saved.settings?.stance === "goofy") profile.settings.stance = "goofy";
    for (const key of ["sound", "grindAssist", "mountFlourish"] as const)
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
