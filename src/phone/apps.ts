import * as THREE from 'three';
import { music, MUSIC_GENRES } from '../audio/music';
import type { Simulation } from '../physics/simulation';
import type { LocalProfile } from '../data/loadout';
import type { WorldInteractions } from '../park/interactions';
import { BUILD_ASSETS, type WarehouseBuilder } from '../editor/warehouse';
import { EMOTES } from '../ui/social';
import { CATEGORIES, selectedPart } from '../data/scooterParts';
import { LONGBOARD_CATEGORIES, longboardPart } from '../data/longboardParts';
import { AVATAR_PRESETS, type AvatarConfig } from '../avatar/config';
import { ThumbnailStudio } from '../avatar/thumbnails';
import { BODY, DISPLAY, INK, LIME, ORANGE, PAPER, TEAL, icon, type Block, type IconName, type Page, type Row, type Tile } from './canvas-ui';
import type { Phone, View } from './phone';
import type { PhoneMap } from './map';
import { fictionalNumber, type MessageStore } from './messages';
import { CRATE_NAME, collection, levelFor, missionBoard } from '../data/progress';

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
  network: () => { status: string; id: string; code: string; roster: { id: string; name: string; connected?: boolean }[] };
  map: PhoneMap;
  /** Opens a crate on screen (the phone is put away first). */
  openCrate: (id: string) => void;
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
        action: () => d.phone.close(() => d.emote(e.id)),
      }));
      return { blocks: [
        { type: 'title', text: 'EMOTES', sub: ok ? 'Pick one · the phone goes away' : 'Step off your ride to emote' },
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
      const pan = new THREE.Vector2(f.steer + f.rx + (f.held.menuRight > 0.5 ? 1 : 0) - (f.held.menuLeft > 0.5 ? 1 : 0), f.lean + f.ry - (f.held.marker > 0.5 ? 1 : 0));
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
function buildApp(d: PhoneDeps): View {
  return {
    title: 'BUILD',
    page: () => {
      if (d.mapId() !== 'warehouse') return { blocks: [
        { type: 'title', text: 'BUILD', sub: 'Warehouse only' },
        { type: 'text', text: 'Building is open in the Warehouse: place ramps, rails and boxes, then ride them. Pick the Warehouse from Maps.' },
        { type: 'list', rows: [{ id: 'maps', label: 'OPEN MAPS', action: () => d.phone.close(() => d.openSesh('maps')) }] },
      ] };
      const b = d.builder(), s = d.sim(), edit = b.editOptions(s), add = b.options(s);
      const rows: Row[] = [
        ...edit.map((o, i) => ({ id: 'edit-' + i, label: o.label.toUpperCase(), detail: 'Nearest placed object', action: () => d.phone.close(o.action) })),
        ...add.map((o, i) => { const a = BUILD_ASSETS[i]; return { id: 'add-' + i, label: o.label.toUpperCase(), detail: `${a[2]} × ${a[4]} m · ${a[3]} m tall`, action: () => d.phone.close(o.action) }; }),
        { id: 'reset', label: 'RESET WAREHOUSE…', detail: 'Clear everything you placed', action: () => d.phone.sheet('CLEAR YOUR LAYOUT?', [{ label: 'CANCEL', action: () => {} }, { label: 'CLEAR PLACED OBJECTS', action: () => b.reset() }]) },
      ];
      return { blocks: [
        { type: 'title', text: 'BUILD', sub: b.layout.objects.length + ' placed · LS move · RS/LB/RB turn · A place' },
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

export function installApps(d: PhoneDeps) {
  const apps: [string, string, IconName, string, (d: PhoneDeps) => View, (() => string | undefined)?][] = [
    ['music', 'MUSIC', 'music', ORANGE, musicApp],
    ['emotes', 'EMOTES', 'emote', LIME, emotesApp],
    ['rides', 'RIDES', 'ride', TEAL, ridesApp],
    ['rider', 'RIDER', 'rider', '#ffd23f', riderApp],
    ['map', 'MAP', 'map', '#7fd46b', mapApp],
    ['items', 'ITEMS', 'items', '#ff7ab8', itemsApp],
    ['build', 'BUILD', 'build', '#b8a07a', buildApp],
    ['messages', 'MESSAGES', 'messages', '#9b7bff', messagesApp, () => (d.messages.unreadTotal ? String(Math.min(9, d.messages.unreadTotal)) : undefined)],
    ['missions', 'MISSIONS', 'trophy', '#ffb938', missionsApp, () => { const n = d.profile().progress.crates.length; return n ? String(Math.min(9, n)) : undefined; }],
  ];
  for (const [id, label, ic, color, make, badge] of apps) d.phone.register({ id, label, icon: ic, color, open: () => make(d), badge });
}
