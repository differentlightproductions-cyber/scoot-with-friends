import * as THREE from 'three';
import { music, MUSIC_GENRES } from '../audio/music';
import type { Simulation } from '../physics/simulation';
import type { LocalProfile } from '../data/loadout';
import type { WorldInteractions } from '../park/interactions';
import type { FreeRide } from '../network/client';
import type { SocialClient } from '../network/social';
import { friendsApp } from './friends';
import { SNAP_MODES, matchAsset, type WarehouseBuilder } from '../editor/warehouse';
import { BUILD_CATALOG, BUILD_GROUPS, BUILD_LIMITS, type BuildGroup } from '../data/builds';
import { EMOTES } from '../ui/social';
import { CATEGORIES, selectedPart } from '../data/scooterParts';
import { LONGBOARD_CATEGORIES, longboardPart } from '../data/longboardParts';
import { AVATAR_PRESETS, type AvatarConfig } from '../avatar/config';
import { ThumbnailStudio } from '../avatar/thumbnails';
import { BODY, DISPLAY, INK, LIME, ORANGE, PAPER, TEAL, icon, type Block, type IconName, type Page, type Row, type Tile } from './canvas-ui';
import type { Phone, View } from './phone';
import type { PhoneMap } from './map';
import { fictionalNumber, type MessageStore } from './messages';
import { CRATE_NAME, RARITY_COLOR, RARITY_LABEL, collectibles, collection, levelFor, missionBoard, trickBook } from '../data/progress';
import { DELIVERY, type CreditEconomy, type Package } from '../data/credit';
import { dailyDeals, type Deal } from '../data/deals';
import { inventoryBrands, inventoryItems, type InventoryItem } from '../data/inventory';
import { BUCHANAN, DISTRICTS, PUEBLO, SPOTS, districtOf, type DistrictId, type Spot } from '../data/world';

/** What the apps reach in the game. Every app is a front end to an existing system. */
export interface PhoneDeps {
  phone: Phone;
  sim: () => Simulation;
  profile: () => LocalProfile;
  mapId: () => string;
  mapName: () => string;
  /** The existing emote system (multiplayer events included). */
  emote: (id: string) => void;
  /** Opens a Sesh menu screen (canonical customisation lives there). */
  openSesh: (screen: string) => void;
  switchRide: (kind: 'scooter' | 'longboard') => Promise<string>;
  ownsBoard: () => boolean;
  items: () => WorldInteractions;
  builder: () => WarehouseBuilder;
  /** Opens the chat field (typing) for the room / local chat. */
  compose: () => void;
  messages: MessageStore;
  network: () => FreeRide;
  social: () => SocialClient;
  teleportToPlayer: (id: string) => boolean;
  map: PhoneMap;
  /** Opens a crate on screen (the phone is put away first). */
  openCrate: (id: string) => void;
  /** The one economy (data/credit.ts): the SHOP app orders through it. */
  economy: CreditEconomy;
  /** Replays (#41): capture the rolling history into the editor, or open the saved ones. */
  replays: { capture: () => boolean; library: () => void; seconds: () => number };
  /** Loads a spot's district (if it is not the current one) and puts the rider at the spot. */
  fastTravel: (spot: Spot) => Promise<void>;
}

const time = (s: number) => (Number.isFinite(s) && s > 0 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00');
const GENRE_COLOURS: Record<string, string> = { Rock: '#e0493a', 'Hip-Hop': '#f5b73b', Punk: '#ff4fa3', Electronic: '#1ecbe1', Chill: '#7fd46b', 'AI Music': '#9b7bff' };
const onFoot = (s: Simulation) => s.walking && !s.sitting;

// ---- MUSIC --------------------------------------------------------------------
function musicApp(d: PhoneDeps): View {
  const covers = new Map<string, HTMLImageElement>();
  const cover = (url?: string) => {
    if (!url) return null;
    let img = covers.get(url);
    if (!img) { img = new Image(); img.onload = () => d.phone.refresh(); img.src = url; covers.set(url, img); }
    return img.complete && img.naturalWidth ? img : null;
  };
  /** X play/pause, LB/RB skip, on every music page. */
  const shortcuts = (f: Parameters<NonNullable<View['input']>>[0]) => {
    if (f.pressed.pushDeck) { void music.togglePlay(); return true; }
    if (f.pressed.leftModifier) { music.previous(); return true; }
    if (f.pressed.rightModifier) { music.next(); return true; }
    return false;
  };
  const toggle = (key: 'enabled' | 'resumeOnEnter' | 'pauseWhenHidden' | 'notifications', label: string, detail: string): Row => ({
    id: 'set-' + key, label, detail, value: music.settings[key] ? 'ON' : 'OFF', action: () => music.setSetting(key, !music.settings[key]),
  });
  const volume = (): Block => ({
    type: 'slider', id: 'volume', label: music.settings.muted ? 'VOLUME (MUTED)' : 'VOLUME', value: music.settings.volume,
    text: Math.round(music.settings.volume * 100) + '%', adjust: step => music.setVolume(music.settings.volume + step * 0.05), set: v => music.setVolume(v),
  });
  const tracks: View = {
    title: 'SESH MUSIC', input: shortcuts, live: true,
    page: () => {
      const channel = music.channelTracks();
      return {
        blocks: [
          { type: 'title', text: 'TRACKS', sub: channel.length + ' in ' + music.settings.genre },
          { type: 'list', rows: [{
            id: 'genre', label: 'CHANNEL', value: music.settings.genre, adjust: step => {
              const i = MUSIC_GENRES.indexOf(music.settings.genre);
              music.setGenre(MUSIC_GENRES[(i + step + MUSIC_GENRES.length) % MUSIC_GENRES.length]);
            }, action: () => { const i = MUSIC_GENRES.indexOf(music.settings.genre); music.setGenre(MUSIC_GENRES[(i + 1) % MUSIC_GENRES.length]); },
          }] },
          channel.length
            ? { type: 'list', rows: channel.map(t => ({ id: 'track-' + t.id, label: t.title, detail: music.unavailable.has(t.id) ? 'Unavailable' : [t.artist, t.genre].filter(Boolean).join(' · '), chosen: music.current?.id === t.id, action: () => music.select(t.id) })) }
            : { type: 'text', text: music.catalogLoaded ? 'No tracks on this channel yet.' : 'Loading music…', muted: true },
        ],
      };
    },
  };
  const settings: View = {
    title: 'SESH MUSIC', input: shortcuts,
    page: () => ({ blocks: [
      { type: 'title', text: 'SETTINGS', sub: 'Sesh Music' },
      volume(),
      { type: 'list', rows: [
        toggle('enabled', 'MUSIC', 'Background music in the sesh'),
        { id: 'mute', label: 'MUTE', value: music.settings.muted ? 'ON' : 'OFF', action: () => music.toggleMute() },
        toggle('resumeOnEnter', 'RESUME ON ENTER', 'Pick up where you left off'),
        toggle('pauseWhenHidden', 'PAUSE WHEN HIDDEN', 'When the tab is in the background'),
        toggle('notifications', 'NOW PLAYING POP-UPS', 'Small notification on each new track'),
      ] },
    ] }),
  };
  return {
    title: 'SESH MUSIC', input: shortcuts, live: true,
    page: () => {
      const t = music.current, status = music.status, playing = status === 'playing' || status === 'loading';
      const statusText = status === 'loading' ? 'Loading…' : status === 'playing' ? 'Playing' : status === 'paused' ? 'Paused'
        : status === 'blocked' ? 'Tap Play to allow audio' : status === 'error' ? music.errorMessage || 'Track unavailable' : status === 'empty' ? 'No music added yet' : 'Ready';
      const blocks: Block[] = [
        { type: 'title', text: 'NOW PLAYING', sub: music.settings.genre === 'All' ? 'All channels' : music.settings.genre + ' channel' },
        { type: 'card', title: t?.title ?? (music.catalogLoaded ? 'Nothing queued' : 'Loading music…'), lines: [[t?.artist, t?.genre].filter(Boolean).join(' · ') || ' ', statusText], art: GENRE_COLOURS[t?.genre ?? ''] ?? ORANGE, picture: cover(t?.cover) },
        { type: 'progress', value: music.duration ? music.position / music.duration : 0, left: time(music.position), right: music.duration ? time(music.duration) : '--:--' },
        { type: 'buttons', buttons: [
          { id: 'prev', icon: 'prev', label: 'Previous', action: () => music.previous() },
          { id: 'play', icon: playing ? 'pause' : 'play', label: playing ? 'Pause' : 'Play', big: true, action: () => void music.togglePlay() },
          { id: 'next', icon: 'next', label: 'Next', action: () => music.next() },
        ] },
        volume(),
        { type: 'list', rows: [
          { id: 'shuffle', label: 'SHUFFLE', value: music.settings.shuffle ? 'ON' : 'OFF', action: () => music.setSetting('shuffle', !music.settings.shuffle) },
          { id: 'repeat', label: 'REPEAT', value: music.settings.repeat.toUpperCase(), action: () => music.cycleRepeat() },
          { id: 'tracks', label: 'TRACKS & CHANNELS', detail: music.tracks.length + ' tracks', action: () => d.phone.push(tracks) },
          { id: 'msettings', label: 'MUSIC SETTINGS', action: () => d.phone.push(settings) },
        ] },
        { type: 'text', text: 'X play/pause · LB/RB skip · keeps playing when the phone is away', muted: true },
      ];
      return { blocks, initial: 'play' };
    },
  };
}

// ---- EMOTES -------------------------------------------------------------------
const EMOTE_ICONS: Record<string, IconName> = { wave: 'wave', nod: 'nod', shake: 'shake', point: 'point', clap: 'clap', celebrate: 'star', sit: 'bench', laugh: 'laugh', facepalm: 'facepalm', cheer: 'cheer', shrug: 'shrug' };
const EMOTE_COLOURS = [LIME, TEAL, ORANGE, '#ffd23f', '#ff7ab8', '#9b7bff'];
function emotesApp(d: PhoneDeps): View {
  return {
    title: 'EMOTES',
    page: () => {
      const ok = onFoot(d.sim());
      const tiles: Tile[] = EMOTES.map((e, i) => ({
        id: 'emote-' + e.id, label: e.label.toUpperCase(), icon: EMOTE_ICONS[e.id] ?? 'emote', color: EMOTE_COLOURS[i % EMOTE_COLOURS.length], disabled: !ok,
        // One-hand and head emotes play with the phone still in hand; two-hand and
        // full-body ones put it away first.
        action: () => e.phoneCompatible ? d.emote(e.id) : d.phone.close(() => d.emote(e.id)),
      }));
      return { blocks: [
        { type: 'title', text: 'EMOTES', sub: ok ? 'One-hand emotes keep your phone out' : 'Step off your ride to emote' },
        { type: 'grid', cols: 3, tiles },
      ] };
    },
  };
}

// ---- RIDES --------------------------------------------------------------------
function ridesApp(d: PhoneDeps): View {
  let notice = '';
  const setup: View = {
    title: 'RIDES',
    page: () => {
      const p = d.profile(), board = p.activeRideable === 'longboard';
      const rows: Row[] = board
        ? LONGBOARD_CATEGORIES.map(c => { const sel = p.longboard[c as keyof typeof p.longboard]; let name = '—'; try { const lp = longboardPart(sel as never); name = lp.part.name + (lp.variant.name ? ' · ' + lp.variant.name : ''); } catch { /* unknown part */ } return { id: 'part-' + c, label: c.toUpperCase(), detail: name }; })
        : CATEGORIES.map(c => { const sel = c === 'wheels' ? p.scooter.frontWheel : p.scooter[c]; const sp = selectedPart(sel); return { id: 'part-' + c, label: c.toUpperCase(), detail: sp.part.name + (sp.variant.name ? ' · ' + sp.variant.name : '') }; });
      return { blocks: [{ type: 'title', text: 'CURRENT SETUP', sub: board ? 'Longboard' : 'Scooter' }, { type: 'list', rows }] };
    },
  };
  return {
    title: 'RIDES',
    page: () => {
      const p = d.profile(), active = p.activeRideable, owns = d.ownsBoard();
      const deck = selectedPart(p.scooter.deck);
      let boardName = 'Not owned yet';
      try { if (owns) boardName = longboardPart(p.longboard.deck).variant.name + ' build'; } catch { /* keep default */ }
      const blocks: Block[] = [
        { type: 'title', text: 'RIDES', sub: active === 'longboard' ? 'Riding the longboard' : 'Riding the scooter' },
        { type: 'card', title: active === 'longboard' ? 'LONGBOARD' : 'SCOOTER', icon: active === 'longboard' ? 'board' : 'ride', art: active === 'longboard' ? TEAL : ORANGE,
          lines: active === 'longboard' ? [boardName, 'Sometimes Summer'] : [deck.part.name, deck.variant.name] },
        { type: 'list', rows: [
          { id: 'ride-scooter', label: 'SCOOTER', detail: active === 'scooter' ? 'Riding now' : 'Switch on the ground', chosen: active === 'scooter', action: () => void switchTo('scooter') },
          { id: 'ride-board', label: 'LONGBOARD', detail: !owns ? 'Buy a complete board at Techno Gravity' : active === 'longboard' ? 'Riding now' : 'Switch on the ground', chosen: active === 'longboard', disabled: !owns, action: () => void switchTo('longboard') },
          { id: 'setup', label: 'CURRENT SETUP', detail: 'Every part on your ride', action: () => d.phone.push(setup) },
          { id: 'custom-scooter', label: 'CUSTOMIZE SCOOTER', detail: 'Opens the Sesh builder', action: () => d.phone.close(() => d.openSesh('scooter')) },
          { id: 'custom-board', label: 'CUSTOMIZE LONGBOARD', detail: 'Opens the Sesh builder', action: () => d.phone.close(() => d.openSesh('longboard')) },
        ] },
      ];
      if (notice) blocks.push({ type: 'text', text: notice, muted: true });
      return { blocks };
    },
  };
  async function switchTo(kind: 'scooter' | 'longboard') {
    if (d.profile().activeRideable === kind) return;
    notice = 'Switching…';
    d.phone.refresh();
    const error = await d.switchRide(kind);
    notice = error || (kind === 'longboard' ? 'Longboard ready. It swaps in on the ground.' : 'Scooter ready. It swaps in on the ground.');
    d.phone.refresh();
  }
}

// ---- RIDER --------------------------------------------------------------------
let studio: ThumbnailStudio | null = null;
const faces = new Map<string, HTMLImageElement>();
/** Frees the rider-picture renderer (the phone was put away). */
export function releasePhoneThumbnails() { studio?.release(); }
function riderPicture(d: PhoneDeps, config: AvatarConfig) {
  studio ??= new ThumbnailStudio();
  const url = studio.get(config, 'head', () => d.phone.refresh());
  if (!url) return null;
  let img = faces.get(url);
  if (!img) { img = new Image(); img.onload = () => d.phone.refresh(); img.src = url; faces.set(url, img); if (faces.size > 8) faces.delete(faces.keys().next().value!); }
  return img.complete && img.naturalWidth ? img : null;
}
function riderApp(d: PhoneDeps): View {
  return {
    title: 'RIDER',
    page: () => {
      const a = d.profile().avatar, preset = AVATAR_PRESETS.find(p => JSON.stringify(p.config) === JSON.stringify(a));
      const words = (v: string) => v.replace(/-/g, ' ');
      return { blocks: [
        { type: 'title', text: 'RIDER', sub: preset ? preset.name : 'Your custom rider' },
        { type: 'card', title: preset?.name.toUpperCase() ?? 'CUSTOM RIDER', art: TEAL, icon: 'rider', picture: riderPicture(d, a), lines: [words(a.hairStyle) + ' hair · ' + words(a.bodyType), words(a.top) + ' · ' + words(a.shoes)] },
        { type: 'list', rows: [
          { id: 'customize', label: 'CUSTOMIZE RIDER', detail: 'Face, hair, eyes, outfit, accessories', action: () => d.phone.close(() => d.openSesh('creator')) },
          { id: 'presets', label: 'CHOOSE RIDER', detail: 'Sample riders and presets', action: () => d.phone.close(() => d.openSesh('rider-presets')) },
        ] },
      ] };
    },
  };
}

// ---- MAP ----------------------------------------------------------------------
function mapApp(d: PhoneDeps): View {
  return {
    title: 'MAP', live: true,
    input: (f, dt) => {
      if (f.pressed.brakeBars || f.pressed.body) return false;
      const pan = new THREE.Vector2(f.steer, f.lean); // LS only: the D-pad stays with taking the phone out and away
      const zoom = (f.held.rightModifier > 0.5 ? 1 : 0) - (f.held.leftModifier > 0.5 ? 1 : 0) + f.held.pumpGrind - f.held.brake;
      d.map.input(pan, zoom, f.pressed.hop, dt);
      return true;
    },
    page: () => ({ blocks: [
      { type: 'image', height: 470, draw: (g, x, y, w, h) => d.map.draw(g, x, y, w, h, d.mapId(), d.mapName()) },
      { type: 'text', text: 'LS pan · LB/RB zoom · A centre on you · ★ starts · V vending · $ shop · W water · R rack', muted: true },
    ] }),
  };
}

// ---- SPOTS (fast travel) -------------------------------------------------------
// Boulder City as one world (data/world.ts): the districts where they sit on the
// city's streets, and the named spots to fast travel to.
const DISTRICT_COLOR: Record<DistrictId, string> = { veterans: LIME, church: ORANGE, b_hill: TEAL };
function drawCity(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, here: DistrictId | null) {
  g.save();
  g.fillStyle = '#2b2620'; g.beginPath(); g.roundRect(x, y, w, h, 14); g.fill(); g.clip();
  // World bounds with a margin, fitted into the panel with north up.
  const x0 = -820, x1 = 180, z0 = -820, z1 = 190, k = Math.min((w - 24) / (x1 - x0), (h - 24) / (z1 - z0));
  const ox = x + (w - (x1 - x0) * k) / 2, oy = y + (h - (z1 - z0) * k) / 2;
  const at = (wx: number, wz: number) => [ox + (wx - x0) * k, oy + (wz - z0) * k] as const;
  const road = (pts: [number, number][], width: number, color: string) => {
    g.beginPath(); pts.forEach(([px, pz], i) => { const [sx, sy] = at(px, pz); if (i) g.lineTo(sx, sy); else g.moveTo(sx, sy); });
    g.lineWidth = width; g.strokeStyle = color; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke();
  };
  road(PUEBLO, 5, '#8a7d69'); road(BUCHANAN, 8, '#cfc3ad');
  g.save(); const [bx, by] = at(BUCHANAN[1][0], -250); g.translate(bx + 10, by); g.rotate(-Math.PI / 2);
  g.font = `800 9px ${BODY}`; g.fillStyle = '#cfc3ad'; g.textAlign = 'center'; g.fillText('BUCHANAN BLVD', 0, 0); g.restore();
  for (const dist of DISTRICTS) {
    const [cx, cy] = at(dist.origin.x, dist.origin.z), dw = Math.max(26, dist.size[0] * k), dh = Math.max(22, dist.size[1] * k);
    g.fillStyle = DISTRICT_COLOR[dist.id]; g.strokeStyle = INK; g.lineWidth = 3;
    g.beginPath(); g.roundRect(cx - dw / 2, cy - dh / 2, dw, dh, 6); g.fill(); g.stroke();
    if (dist.id === here) { g.strokeStyle = PAPER; g.lineWidth = 3; g.setLineDash([5, 4]); g.beginPath(); g.roundRect(cx - dw / 2 - 6, cy - dh / 2 - 6, dw + 12, dh + 12, 9); g.stroke(); g.setLineDash([]); }
    g.font = `13px ${DISPLAY}`; g.textAlign = dist.origin.x < -200 ? 'left' : 'right'; g.fillStyle = PAPER;
    const lx = dist.origin.x < -200 ? cx - dw / 2 : cx - dw / 2 - 8, ly = dist.origin.x < -200 ? cy + dh / 2 + 16 : cy + 4;
    g.fillText(dist.name.toUpperCase().replace('THE ', ''), lx, ly);
    if (dist.id === here) { g.font = `800 10px ${BODY}`; g.fillStyle = LIME; g.fillText('YOU ARE HERE', lx, ly + 13); }
  }
  // North arrow.
  g.fillStyle = PAPER; g.font = `12px ${DISPLAY}`; g.textAlign = 'center'; g.fillText('N', x + w - 20, y + 20);
  g.beginPath(); g.moveTo(x + w - 20, y + 25); g.lineTo(x + w - 25, y + 36); g.lineTo(x + w - 15, y + 36); g.closePath(); g.fill();
  g.font = `800 10px ${BODY}`; g.textAlign = 'left'; g.fillStyle = '#cfc3ad'; g.fillText('BOULDER CITY, NV', x + 12, y + 20);
  g.restore();
}
function spotsApp(d: PhoneDeps): View {
  return {
    title: 'SPOTS',
    page: () => {
      const here = districtOf(d.mapId());
      return { blocks: [
        { type: 'image', height: 236, draw: (g, x, y, w, h) => drawCity(g, x, y, w, h, here?.id ?? null) },
        { type: 'title', text: 'FAST TRAVEL', sub: 'Pick a spot · your ride, rider and music come too' },
        { type: 'list', rows: SPOTS.map(s => ({
          id: 'spot-' + s.id, label: s.label, detail: s.detail + (s.map === d.mapId() ? ' · this district' : ''), value: 'GO',
          action: () => d.phone.sheet(s.label, [{ label: 'FAST TRAVEL', action: () => d.phone.close(() => void d.fastTravel(s)) }, { label: 'CANCEL', action: () => {} }], s.detail),
        })) },
        { type: 'text', text: 'One Boulder City: riding the streets between districts is on the way. For now each spot loads its district.', muted: true },
      ] };
    },
  };
}

// ---- ITEMS --------------------------------------------------------------------
function itemsApp(d: PhoneDeps): View {
  const item = (id: string): View => ({
    title: 'ITEMS',
    page: () => {
      const w = d.items(), group = w.itemGroups().find(g => g.items.some(i => i.id === id));
      if (!group) return { blocks: [{ type: 'title', text: 'GONE', sub: 'Used up or discarded' }] };
      const held = group.items.find(i => i.id === d.profile().pockets.held) ?? group.items[0], walking = onFoot(d.sim());
      return { blocks: [
        { type: 'title', text: group.label.toUpperCase(), sub: '×' + group.items.length + (group.held ? ' · in your hand' : '') },
        { type: 'list', rows: [
          { id: 'hold', label: group.held ? 'IN HAND' : 'HOLD', detail: 'Carry it; ' + useButton(d) + ' uses it', chosen: group.held, action: () => w.hold(held.id) },
          { id: 'use', label: held.state === 'empty' ? 'EMPTY' : 'USE NOW', detail: walking ? 'Drink or eat it' : 'Step off your ride first', disabled: held.state === 'empty' || !walking, action: () => d.phone.close(() => w.use(d.sim(), held.id)) },
          { id: 'stow', label: 'STOW', detail: 'Back in your pocket', disabled: !group.held, action: () => w.hold(null) },
          { id: 'discard', label: 'DISCARD…', action: () => d.phone.sheet('DISCARD?', [{ label: 'KEEP IT', action: () => {} }, { label: 'DISCARD ' + group.label.toUpperCase(), action: () => w.discard(held.id) }]) },
        ] },
      ] };
    },
  });
  return {
    title: 'ITEMS',
    page: () => {
      const p = d.profile(), groups = d.items().itemGroups(), heldItem = p.pockets.entries.find(i => i.id === p.pockets.held);
      return { blocks: [
        { type: 'title', text: p.pockets.backpack ? 'BACKPACK' : 'POCKETS', sub: heldItem ? 'Holding ' + heldItem.kind : 'Nothing in hand' },
        groups.length
          ? { type: 'list', rows: groups.map(g => ({ id: 'group-' + g.items[0].id, label: g.label.toUpperCase(), detail: '×' + g.items.length + (g.held ? ' · in hand' : ''), chosen: g.held, action: () => d.phone.push(item(g.items[0].id)) })) }
          : { type: 'text', text: 'Empty. The vending machines around the park are free: walk up and press B.', muted: true },
      ] };
    },
  };
}
const useButton = (d: PhoneDeps) => ({ pushDeck: 'X', leftModifier: 'LB', rightModifier: 'RB' } as Record<string, string>)[d.profile().pockets.useAction] ?? 'X';

// ---- BUILD --------------------------------------------------------------------
// The Warehouse build mode (editor/warehouse.ts): a catalog by category, the
// placed pieces to move, duplicate or delete, undo / redo, save and clear.
function buildApp(d: PhoneDeps): View {
  const m = (v: number) => (Math.round(v * 10) / 10).toString();
  const category = (group: BuildGroup): View => ({
    title: group,
    page: () => {
      const b = d.builder();
      return { blocks: [
        { type: 'title', text: group, sub: b.used + ' / ' + BUILD_LIMITS.budget + ' budget used' },
        { type: 'list', rows: BUILD_CATALOG.filter(a => a.group === group).map(a => ({ id: 'add-' + a.id, label: a.label.toUpperCase(), detail: `${m(a.width)} × ${m(a.length)} m · ${m(a.height)} m tall`, value: a.cost + ' PTS', action: () => d.phone.close(() => d.builder().add(a, d.sim())) })) },
      ] };
    },
  });
  const piece = (id: string): View => ({
    title: 'PIECE',
    page: () => {
      const b = d.builder(), o = b.layout.objects.find(v => v.id === id);
      if (!o) return { blocks: [{ type: 'title', text: 'GONE', sub: 'This piece is no longer placed' }] };
      const name = (matchAsset(o)?.label ?? o.type).toUpperCase(), editable = b.canEdit(id);
      return { blocks: [
        { type: 'title', text: name, sub: `${m(o.x)}, ${m(o.z)} · ${Math.round(((o.rotation * 180) / Math.PI + 360) % 360)}°${editable ? '' : ' · placed by another rider'}` },
        ...(editable ? [{ type: 'list', rows: [
          { id: 'move', label: 'MOVE / ROTATE', detail: 'Pick it up and place it again', action: () => d.phone.close(() => d.builder().move(id)) },
          { id: 'dup', label: 'DUPLICATE', detail: 'A copy beside it, ready to place', action: () => d.phone.close(() => d.builder().duplicate(id)) },
          { id: 'del', label: 'DELETE', detail: b.isShared ? 'Remove your room piece' : 'UNDO brings it back', action: () => { d.builder().deletePiece(id); d.phone.back(); } },
        ] } as Block] : []),
      ] };
    },
  });
  const placed: View = {
    title: 'PLACED',
    page: () => {
      const list = d.builder().placed(d.sim());
      return { blocks: [
        { type: 'title', text: 'PLACED', sub: list.length ? 'Nearest first' : 'Nothing placed yet' },
        { type: 'list', rows: list.map(({ o, asset, distance }) => ({ id: 'piece-' + o.id, label: (asset?.label ?? o.type).toUpperCase(), detail: m(distance) + ' m away' + (d.builder().canEdit(o.id) ? '' : ' · other rider'), action: () => d.phone.push(piece(o.id)) })) },
      ] };
    },
  };
  return {
    title: 'BUILD',
    page: () => {
      if (d.mapId() !== 'warehouse') return { blocks: [
        { type: 'title', text: 'BUILD', sub: 'Warehouse only' },
        { type: 'text', text: 'Building is open in the Warehouse: place ramps, rails and boxes, then ride them. Pick the Warehouse from Maps.' },
        { type: 'list', rows: [{ id: 'maps', label: 'OPEN MAPS', action: () => d.phone.close(() => d.openSesh('maps')) }] },
      ] };
      const b = d.builder(), count = b.layout.objects.length, owned = b.layout.objects.filter(o => b.canEdit(o.id)).length;
      const rows: Row[] = [
        ...BUILD_GROUPS.map(g => ({ id: 'cat-' + g, label: 'ADD ' + g, detail: BUILD_CATALOG.filter(a => a.group === g).map(a => a.label).slice(0, 3).join(' · ') + '…', action: () => d.phone.push(category(g)) })),
        { id: 'placed', label: 'EDIT PLACED', detail: 'Move, rotate, duplicate or delete', value: String(count), disabled: !count, action: () => d.phone.push(placed) },
        { id: 'undo', label: 'UNDO', disabled: !b.canUndo, action: () => b.undo() },
        { id: 'redo', label: 'REDO', disabled: !b.canRedo, action: () => b.redo() },
        { id: 'snap', label: 'SNAP', detail: 'Y also switches while placing', value: SNAP_MODES[b.snap].name, action: () => { b.snap = (b.snap + 1) % SNAP_MODES.length; } },
        ...(b.isShared ? [{ id: 'other-builds', label: 'OTHER PLAYER BUILDS', detail: b.otherBuilds === 'ghost' ? 'Visible, no collision' : 'Visible, solid', value: b.otherBuilds.toUpperCase(), action: () => b.setOtherBuilds(b.otherBuilds === 'solid' ? 'ghost' : 'solid') }] : []),
        ...(!b.isShared ? [{ id: 'save', label: 'SAVE BUILD', detail: 'Saved to your profile (also after every edit)', action: () => b.save() }] : []),
        { id: 'clear', label: b.isShared ? 'CLEAR MY ROOM PIECES…' : 'CLEAR BUILD…', detail: b.isShared ? 'Remove your pieces from this room' : 'Reset the Warehouse to empty', disabled: !(b.isShared ? owned : count), action: () => d.phone.sheet(b.isShared ? 'CLEAR YOUR ROOM PIECES?' : 'CLEAR THE WHOLE BUILD?', [{ label: 'KEEP IT', action: () => {} }, { label: 'CLEAR ' + (b.isShared ? owned : count) + ' PIECES', action: () => b.reset() }], b.isShared ? 'Other riders keep their pieces' : 'UNDO can bring it back until you leave') },
      ];
      return { blocks: [
        { type: 'title', text: 'BUILD', sub: `${b.isShared ? 'ROOM · ' : ''}${count} / ${BUILD_LIMITS.pieces} pieces · ${b.used} / ${BUILD_LIMITS.budget} budget` },
        ...(b.isShared ? [{ type: 'text', text: 'Room pieces are shared until the lobby ends. Your personal saved build stays in Solo.', muted: true } as Block] : []),
        ...(b.notice || b.saveError ? [{ type: 'text', text: b.saveError || b.notice } as Block] : []),
        { type: 'list', rows },
      ] };
    },
  };
}

// ---- MISSIONS -------------------------------------------------------------------
function missionsApp(d: PhoneDeps): View {
  const fmt = (n: number) => n.toLocaleString('en-US');
  return {
    title: 'MISSIONS', live: true,
    page: () => {
      const p = d.profile(), prog = p.progress, { level, into, need } = levelFor(prog.xp), board = missionBoard(prog), owned = collection(p.wallet.owned);
      const blocks: Block[] = [
        { type: 'image', height: 96, draw: (g, x, y, w) => {
          g.fillStyle = INK; g.beginPath(); g.roundRect(x, y, w, 90, 14); g.fill();
          g.textAlign = 'left'; g.font = `15px ${DISPLAY}`; g.fillStyle = LIME; g.fillText('LEVEL', x + 16, y + 28);
          g.font = `44px ${DISPLAY}`; g.fillStyle = PAPER; g.fillText(String(level), x + 14, y + 72);
          const bx = x + 96, bw = w - 112;
          g.font = `800 12px ${BODY}`; g.fillStyle = '#cfd4d8'; g.fillText(`${fmt(into)} / ${fmt(need)} XP`, bx, y + 34);
          g.textAlign = 'right'; g.fillStyle = '#ffd23f'; g.fillText(`${fmt(p.wallet.credit)} CREDIT`, x + w - 16, y + 34); g.textAlign = 'left';
          g.fillStyle = '#ffffff22'; g.beginPath(); g.roundRect(bx, y + 46, bw, 14, 7); g.fill();
          const grad = g.createLinearGradient(bx, 0, bx + bw, 0); grad.addColorStop(0, LIME); grad.addColorStop(1, '#ffd23f');
          g.fillStyle = grad; g.beginPath(); g.roundRect(bx, y + 46, Math.max(14, bw * into / need), 14, 7); g.fill();
          g.font = `700 11px ${BODY}`; g.fillStyle = '#9aa3a9'; g.fillText(`Collection ${owned.have}/${owned.total} · ${prog.crates.length} crate${prog.crates.length === 1 ? '' : 's'} waiting`, bx, y + 78);
        } },
      ];
      // One row per crate tier, rarest first, so a stack of crates stays short.
      const stacks = (['legend', 'signature', 'pro', 'street'] as const).map(tier => ({ tier, crates: prog.crates.filter(c => c.tier === tier) })).filter(s => s.crates.length);
      if (stacks.length) {
        blocks.push({ type: 'title', text: 'CRATES', sub: 'Parts or Credit inside. No dupes.' });
        blocks.push({ type: 'list', rows: stacks.map(({ tier, crates }) => ({ id: 'crates-' + tier, label: CRATE_NAME[tier].toUpperCase() + (crates.length > 1 ? ' ×' + crates.length : ''), detail: 'From ' + crates[0].source, value: 'OPEN', action: () => d.phone.close(() => d.openCrate(crates[0].id)) })) });
      }
      // Starter missions teach the game: the next few still to do, one-time pay.
      const todo = board.starter.filter(m => !m.done);
      if (todo.length) {
        blocks.push({ type: 'title', text: 'STARTER', sub: `${board.starter.length - todo.length}/${board.starter.length} done · one-time rewards` });
        blocks.push({ type: 'list', rows: todo.slice(0, 6).map(m => ({ id: 'starter-' + m.id, label: m.title.toUpperCase(), detail: m.goal > 1 ? `${m.how} · ${m.value}/${m.goal}` : m.how, value: '+' + m.reward.credit })) });
      }
      blocks.push({ type: 'title', text: 'DAILY', sub: board.bonus ? 'All done. New ones at midnight.' : 'All three = a Pro Crate' });
      blocks.push({ type: 'list', rows: board.daily.map(m => ({ id: 'daily-' + m.id, label: m.title.toUpperCase(), detail: `${fmt(m.value)} / ${fmt(m.goal)} · +${m.reward.credit} Credit · +${m.reward.xp} XP`, value: m.done ? 'DONE' : Math.floor(m.value / m.goal * 100) + '%' })) });
      blocks.push({ type: 'title', text: 'CAREER', sub: 'Stage II and up drop crates.' });
      const career = board.career.slice().sort((a, b) => Number(a.complete) - Number(b.complete) || b.value / b.goal - a.value / a.goal);
      blocks.push({ type: 'list', rows: career.map(m => ({ id: 'career-' + m.id, label: m.title.toUpperCase(), detail: m.complete ? 'Every stage complete' : `${fmt(m.value)} / ${fmt(m.goal)} · stage ${m.stage + 1} of ${m.stages} · +${m.reward.credit} Credit${m.reward.crate ? ' · ' + CRATE_NAME[m.reward.crate] : ''}`, value: m.complete ? 'DONE' : Math.floor(m.value / m.goal * 100) + '%' })) });
      blocks.push({ type: 'text', text: owned.brands.map(b => `${b.brand} ${b.have}/${b.total}`).join(' · '), muted: true });
      return { blocks, initial: stacks.length ? 'crates-' + stacks[0].tier : undefined };
    },
  };
}

// ---- TRICKS (trick tracker, #59) ----------------------------------------------------
/**
 * Every trick this account has landed, as an organized tally: Tailwhips 120,
 * Barspins 523... grouped by kind, most landed first. A trick done inside a
 * combo counts for each of its parts; the combos themselves have their own list.
 */
function tricksApp(d: PhoneDeps): View {
  const fmt = (n: number) => n.toLocaleString('en-US');
  let combosShown = 10;
  return {
    title: 'TRICKS', live: true,
    page: () => {
      const book = trickBook(d.profile().progress), t = book.totals;
      const blocks: Block[] = [
        { type: 'image', height: 104, draw: (g, x, y, w) => {
          g.fillStyle = INK; g.beginPath(); g.roundRect(x, y, w, 98, 14); g.fill();
          const cells: [string, number][] = [['TRICKS LANDED', t.tricks], ['COMBOS', t.combos], ['DIFFERENT', t.different]];
          cells.forEach(([label, value], i) => {
            const cx = x + 14 + (i * (w - 28)) / 3;
            g.textAlign = 'left'; g.font = `800 10px ${BODY}`; g.fillStyle = i === 1 ? LIME : '#9aa3a9'; g.fillText(label, cx, y + 26);
            g.font = `30px ${DISPLAY}`; g.fillStyle = PAPER; g.fillText(fmt(value), cx, y + 60);
          });
          g.font = `700 11px ${BODY}`; g.fillStyle = '#cfd4d8';
          g.fillText(`Best line ${t.bestLine} tricks · ${fmt(t.bestLinePoints)} pts · ${fmt(t.perfect)} perfect`, x + 14, y + 86);
        } },
      ];
      if (!book.groups.length) blocks.push({ type: 'text', text: 'Land some tricks and they are counted here: every Tailwhip, Barspin and 360, and every combo.', muted: true });
      for (const group of book.groups) {
        const total = group.rows.reduce((n, r) => n + r.count, 0);
        blocks.push({ type: 'title', text: group.title, sub: `${fmt(total)} landed` });
        blocks.push({ type: 'list', rows: group.rows.map(r => ({ id: 'tally-' + r.label, label: r.label.toUpperCase(), value: fmt(r.count) })) });
      }
      if (book.combos.length) {
        blocks.push({ type: 'title', text: 'COMBO TRICKS', sub: `${fmt(t.comboTricks)} landed · more than one trick at once` });
        blocks.push({ type: 'list', rows: [
          ...book.combos.slice(0, combosShown).map(c => ({ id: 'combo-' + c.name, label: c.name.toUpperCase(), value: fmt(c.count) })),
          ...(book.combos.length > combosShown ? [{ id: 'more', label: 'SHOW MORE', detail: `${book.combos.length - combosShown} more combos`, action: () => { combosShown += 20; } }] : []),
        ] });
      }
      return { blocks };
    },
  };
}

// ---- SHOP -----------------------------------------------------------------------
/**
 * The phone shop: Techno Gravity's stock and today's deals, ordered from
 * anywhere. An order is paid at once and arrives as a package DELIVERY.seconds
 * later (main.ts delivers it into your parts); walking into the shop is still
 * the instant way. Same economy, prices and deals as the shop counter.
 */
function shopApp(d: PhoneDeps): View {
  const shopId = DELIVERY.shopId, fmt = (n: number) => n.toLocaleString('en-US');
  const wallet = () => d.profile().wallet;
  const ordered = (s: { partId: string; variantId: string }) => wallet().packages.some(k => k.partId === s.partId && k.variantId === s.variantId);
  const look = (s: { partId: string; variantId: string }) => collectibles().find(c => c.partId === s.partId && c.variantId === s.variantId);
  const eta = (k: Package) => time(Math.max(0, (k.arrives - Date.now()) / 1000));
  const nameOf = (s: { partId: string; variantId: string }) => { const c = look(s); return c ? c.name.replace(/^(Lazer|Mafioso|Sometimes Summer) /, '') + ' / ' + c.variantName : s.partId; };
  // A box in the part's colour, taped in its rarity.
  const box = (s: { partId: string; variantId: string }, label: string): Block => ({ type: 'image', height: 118, draw: (g, x, y, w) => {
    const c = look(s), colour = '#' + (c?.color ?? 0x888888).toString(16).padStart(6, '0'), rarity = RARITY_COLOR[c?.rarity ?? 'common'];
    g.fillStyle = INK; g.beginPath(); g.roundRect(x, y, w, 112, 14); g.fill();
    const bx = x + w / 2 - 46, by = y + 22;
    g.fillStyle = '#c89a5c'; g.beginPath(); g.roundRect(bx, by, 92, 66, 6); g.fill();
    g.fillStyle = '#a97c45'; g.fillRect(bx, by, 92, 14);
    g.fillStyle = rarity; g.fillRect(bx + 38, by, 16, 66);
    g.fillStyle = colour; g.beginPath(); g.arc(bx + 46, by + 42, 15, 0, Math.PI * 2); g.fill();
    g.strokeStyle = INK; g.lineWidth = 3; g.stroke();
    g.textAlign = 'center'; g.font = `11px ${DISPLAY}`; g.fillStyle = rarity; g.fillText(label, x + w / 2, y + 106); g.textAlign = 'left';
  } });
  let status = '';
  const done = (k: Package): View => ({ title: 'SHOP', live: true, page: () => {
    const still = wallet().packages.find(p => p.id === k.id);
    return { blocks: [
      { type: 'title', text: still ? 'ORDERED!' : 'DELIVERED!', sub: nameOf(k) },
      box(k, still ? 'ON ITS WAY · ' + eta(still) : 'IN YOUR PARTS'),
      { type: 'text', text: still ? 'Paid ' + fmt(k.price) + ' Credit. It lands in your parts when the timer runs out, even if you close the game.' : 'Equip it from RIDES or the pause menu.', muted: true },
      { type: 'list', rows: [{ id: 'more', label: 'KEEP SHOPPING', action: () => d.phone.back() }] },
    ] };
  } });
  const confirm = (item: InventoryItem, deal?: Deal): View => ({ title: 'SHOP', page: () => {
    const price = deal?.price ?? item.price, w = wallet(), afford = w.credit + w.testCredit >= price;
    return { blocks: [
      { type: 'title', text: item.partName.toUpperCase(), sub: item.brand + ' · ' + item.variantName },
      box(item, RARITY_LABEL[item.rarity] + (deal ? ' · -' + deal.off + '%' : '')),
      { type: 'list', rows: [
        { id: 'order', label: afford ? 'ORDER IT' : 'NOT ENOUGH CREDIT', detail: 'Delivered in ' + DELIVERY.seconds + ' s · you have ' + fmt(w.credit), value: fmt(price) + ' CR', disabled: !afford,
          action: afford ? async () => {
            status = 'Ordering...'; d.phone.refresh();
            const r = await d.economy.order({ partId: item.partId, variantId: item.variantId }, price);
            if (typeof r === 'string') { status = r; d.phone.refresh(); return; }
            status = ''; d.phone.notify('Order placed', nameOf(item) + ' · arrives in ' + DELIVERY.seconds + ' s', 'crate'); d.phone.replace(done(r.pkg));
          } : undefined },
        { id: 'cancel', label: 'NOT NOW', action: () => d.phone.back() },
      ] },
      ...(status ? [{ type: 'text' as const, text: status, muted: true }] : []),
    ] };
  } });
  const row = (item: InventoryItem): Row => {
    const deal = dailyDeals(shopId).find(x => x.partId === item.partId && x.variantId === item.variantId);
    return { id: 'item-' + item.partId + ':' + item.variantId, label: item.partName.toUpperCase(), detail: item.variantName + ' · ' + RARITY_LABEL[item.rarity] + (deal ? ' · -' + deal.off + '%' : ''), value: fmt(deal?.price ?? item.price), action: () => { status = ''; d.phone.push(confirm(item, deal)); } };
  };
  const category = (brandId: string, brand: string, cat: string): View => ({ title: 'SHOP', page: () => ({ blocks: [
    { type: 'title', text: cat.toUpperCase(), sub: brand },
    { type: 'list', rows: inventoryItems(wallet(), 'shop', { shopId, brandId, category: cat }).filter(i => !ordered(i)).map(row) },
  ] }) });
  const brand = (brandId: string, name: string): View => ({ title: 'SHOP', page: () => {
    const items = inventoryItems(wallet(), 'shop', { shopId, brandId }).filter(i => !ordered(i));
    const cats = [...new Set(items.map(i => i.category))];
    return { blocks: [
      { type: 'title', text: name.toUpperCase(), sub: items.length + ' colourways to collect' },
      { type: 'list', rows: cats.map(c => ({ id: 'cat-' + c, label: c.toUpperCase(), detail: items.filter(i => i.category === c).length + ' for sale', action: () => d.phone.push(category(brandId, name, c)) })) },
    ] };
  } });
  return { title: 'SHOP', live: true, page: () => {
    const w = wallet(), blocks: Block[] = [
      { type: 'image', height: 64, draw: (g, x, y, width) => {
        g.fillStyle = INK; g.beginPath(); g.roundRect(x, y, width, 58, 12); g.fill();
        g.textAlign = 'left'; g.font = `15px ${DISPLAY}`; g.fillStyle = LIME; g.fillText('PHONE SHOP', x + 14, y + 25);
        g.font = `700 11px ${BODY}`; g.fillStyle = '#9aa3a9'; g.fillText('Techno Gravity stock · delivered', x + 14, y + 44);
        g.textAlign = 'right'; g.font = `15px ${DISPLAY}`; g.fillStyle = '#ffd23f'; g.fillText(fmt(w.credit) + ' CR', x + width - 14, y + 34); g.textAlign = 'left';
      } },
    ];
    if (w.packages.length) {
      blocks.push({ type: 'title', text: 'ON ITS WAY', sub: w.packages.length + ' package' + (w.packages.length > 1 ? 's' : '') });
      blocks.push({ type: 'list', rows: w.packages.map(k => ({ id: 'pkg-' + k.id, label: nameOf(k).toUpperCase(), detail: 'Paid ' + fmt(k.price) + ' Credit', value: eta(k), action: () => d.phone.push(done(k)) })) });
    }
    const deals = dailyDeals(shopId).filter(x => !ordered(x));
    const dealItems = deals.map(x => inventoryItems(w, 'shop', { shopId }).find(i => i.partId === x.partId && i.variantId === x.variantId)).filter((i): i is InventoryItem => !!i);
    if (dealItems.length) { blocks.push({ type: 'title', text: "TODAY'S DEALS", sub: 'Same deals as the shop counter' }); blocks.push({ type: 'list', rows: dealItems.map(row) }); }
    const brands = inventoryBrands(w, 'shop', { shopId });
    blocks.push({ type: 'title', text: 'BROWSE', sub: brands.length ? 'Every brand Techno Gravity stocks' : 'You own everything they sell' });
    blocks.push({ type: 'list', rows: brands.map(b => ({ id: 'brand-' + b.brandId, label: b.brand.toUpperCase(), detail: b.count + ' colourways · ' + b.categories.length + ' categories', action: () => d.phone.push(brand(b.brandId, b.brand)) })) });
    return { blocks };
  } };
}

// ---- MESSAGES -----------------------------------------------------------------
function messagesApp(d: PhoneDeps): View {
  const thread = (id: string, name: string): View => ({
    title: 'MESSAGES', live: true,
    page: () => {
      d.messages.read(id);
      const list = d.messages.threads.get(id) ?? [];
      return { blocks: [
        { type: 'title', text: name.toUpperCase(), sub: id === 'room' ? (d.network().status === 'Connected' ? 'Everyone in your room' : 'Local: riders near you') : 'Direct' },
        { type: 'bubbles', items: list.slice(-14), empty: 'Nothing yet. Say hi.' },
        { type: 'list', rows: [{ id: 'compose', label: 'NEW MESSAGE', detail: 'Type, then Enter to send', action: () => d.compose() }] },
      ], initial: 'compose' };
    },
  });
  return {
    title: 'MESSAGES', live: true,
    page: () => {
      const net = d.network(), online = net.status === 'Connected';
      const room = d.messages.threads.get('room') ?? [], last = room.at(-1), unread = d.messages.unread.get('room') ?? 0;
      const rows: Row[] = [{ id: 'room', label: online ? 'ROOM CHAT' : 'LOCAL CHAT', detail: last ? (last.mine ? 'You: ' : last.from + ': ') + last.text : 'No messages yet', value: unread ? unread + ' NEW' : undefined, action: () => d.phone.push(thread('room', online ? 'Room chat' : 'Local chat')) }];
      if (online) for (const p of net.roster) if (p.id !== net.id) rows.push({ id: 'contact-' + p.id, label: p.name.toUpperCase(), detail: fictionalNumber(p.id) + (p.connected === false ? ' · reconnecting' : ''), action: () => d.phone.push(thread('room', 'Room chat')) });
      const blocks: Block[] = [
        { type: 'title', text: 'MESSAGES', sub: 'Your number ' + d.messages.number },
        { type: 'list', rows },
      ];
      if (!online) blocks.push({ type: 'text', text: 'Join a Private Free-ride room to text your crew. Everyone gets a made-up 702-555 number; real numbers are never used.', muted: true });
      return { blocks };
    },
  };
}

/** The home screen: a clock widget over the dusk wallpaper, then the app grid. */
export function homePage(d: PhoneDeps): Page {
  const tiles: Tile[] = d.phone.apps.map(a => ({ id: 'app-' + a.id, label: a.label, icon: a.icon, color: a.color, badge: a.badge?.(), action: () => d.phone.push(a.open()) }));
  const now = new Date();
  return {
    wallpaper: 'dusk',
    blocks: [
      { type: 'image', height: 132, frame: false, draw: (g, x, y, w) => {
        g.textAlign = 'left'; g.font = `54px ${DISPLAY}`; g.lineWidth = 7; g.strokeStyle = INK;
        const clock = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M/i, '');
        g.strokeText(clock, x + 2, y + 62); g.fillStyle = PAPER; g.fillText(clock, x + 2, y + 62);
        g.font = `800 14px ${BODY}`; g.fillStyle = LIME; g.fillText(now.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' }).toUpperCase(), x + 4, y + 86);
        const t = music.current;
        if (t) {
          g.fillStyle = '#0b0c0dcc'; g.beginPath(); g.roundRect(x, y + 98, w, 30, 15); g.fill();
          icon(g, music.status === 'playing' ? 'music' : 'pause', x + 18, y + 113, 18, LIME);
          g.font = `700 13px ${BODY}`; g.fillStyle = '#fff';
          let line = t.title + ' · ' + t.artist;
          while (line.length > 3 && g.measureText(line).width > w - 44) line = line.slice(0, -2);
          g.fillText(line, x + 34, y + 118);
        }
      } },
      { type: 'grid', cols: 3, tiles },
    ],
  };
}

// ---- REPLAYS --------------------------------------------------------------------
function replaysApp(d: PhoneDeps): View {
  return {
    title: 'REPLAYS',
    page: () => ({ blocks: [
      { type: 'title', text: 'REPLAYS', sub: `Always recording the last ${d.replays.seconds()} s` },
      { type: 'list', rows: [
        { id: 'capture', label: 'CAPTURE REPLAY', detail: `The last ${d.replays.seconds()} s, into the Replay Editor`, action: () => d.phone.close(() => d.replays.capture()) },
        { id: 'saved', label: 'SAVED REPLAYS', detail: 'Watch, edit, rename or delete', action: () => d.phone.close(() => d.replays.library()) },
        { id: 'history', label: 'REPLAY HISTORY', detail: 'How much is kept: Settings / Gameplay', value: `${d.replays.seconds()} S`, action: () => d.phone.close(() => d.openSesh('settings-gameplay')) },
      ] },
    ] }),
  };
}

export function installApps(d: PhoneDeps) {
  const apps: [string, string, IconName, string, (d: PhoneDeps) => View, (() => string | undefined)?][] = [
    ['music', 'MUSIC', 'music', ORANGE, musicApp],
    ['emotes', 'EMOTES', 'emote', LIME, emotesApp],
    ['rides', 'RIDES', 'ride', TEAL, ridesApp],
    ['rider', 'RIDER', 'rider', '#ffd23f', riderApp],
    ['map', 'MAP', 'map', '#7fd46b', mapApp],
    ['spots', 'SPOTS', 'star', '#ffd23f', spotsApp],
    ['items', 'ITEMS', 'items', '#ff7ab8', itemsApp],
    ['build', 'BUILD', 'build', '#b8a07a', buildApp],
    ['friends', 'FRIENDS', 'rider', TEAL, friendsApp],
    ['messages', 'MESSAGES', 'messages', '#9b7bff', messagesApp, () => (d.messages.unreadTotal ? String(Math.min(9, d.messages.unreadTotal)) : undefined)],
    ['tricks', 'TRICKS', 'chart', '#c6ff00', tricksApp],
    ['missions', 'MISSIONS', 'trophy', '#ffb938', missionsApp, () => { const n = d.profile().progress.crates.length; return n ? String(Math.min(9, n)) : undefined; }],
    ['shop', 'SHOP', 'crate', '#35b6ff', shopApp, () => { const n = d.profile().wallet.packages.length; return n ? String(Math.min(9, n)) : undefined; }],
    ['replays', 'REPLAYS', 'play', '#ff5a1f', replaysApp],
  ];
  for (const [id, label, ic, color, make, badge] of apps) d.phone.register({ id, label, icon: ic, color, open: () => make(d), badge });
}
