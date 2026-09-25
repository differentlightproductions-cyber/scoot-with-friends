/** What the vending machines sell. */
export const VENDING_KINDS=['Soda','Water','Sports drink','Chips'] as const;
/**
 * Novelty items (#55): silly things a level-up can hand you instead of a crate.
 * Held and used like a drink (X by default): a squeak, a kazoo tune, a wave of the
 * foam finger, a confetti pop (the popper is then empty, so it is litter), bubbles.
 */
export const NOVELTY_KINDS=['Rubber Duck','Kazoo','Foam Finger','Party Popper','Bubble Wand'] as const;
export const ITEM_KINDS=[...VENDING_KINDS,...NOVELTY_KINDS] as const;
export type ItemKind=typeof ITEM_KINDS[number];
export type NoveltyKind=typeof NOVELTY_KINDS[number];
export const isNovelty=(kind:ItemKind):kind is NoveltyKind=>(NOVELTY_KINDS as readonly string[]).includes(kind);
/** Novelties that are used up (a popper pops once); the rest can be used again and again. */
export const SINGLE_USE:ReadonlySet<ItemKind>=new Set<ItemKind>(['Party Popper']);
export interface PocketItem{id:string;kind:ItemKind;state:'sealed'|'opened'|'empty'}
export interface Pockets{nextId:number;entries:PocketItem[];held:string|null;backpack:boolean;useAction:'pushDeck'|'leftModifier'|'rightModifier'}
export const emptyPockets=():Pockets=>({nextId:1,entries:[],held:null,backpack:false,useAction:'pushDeck'});
export function validPockets(raw:Partial<Pockets>|null):Pockets{const p=emptyPockets();if(!raw)return p;const ids=new Set<string>();p.entries=(Array.isArray(raw.entries)?raw.entries:[]).filter(i=>i&&typeof i.id==='string'&&!ids.has(i.id)&&!!ids.add(i.id)&&ITEM_KINDS.includes(i.kind)&&['sealed','opened','empty'].includes(i.state)).slice(0,48).map(i=>({...i}));p.nextId=Math.max(1,...p.entries.map(i=>(Number(i.id.split('-')[1])||0)+1),Number(raw.nextId)||1);p.held=p.entries.some(i=>i.id===raw.held)?raw.held!:null;p.backpack=!!raw.backpack;if(['pushDeck','leftModifier','rightModifier'].includes(raw.useAction!))p.useAction=raw.useAction!;return p;}
export function receiveItem(p:Pockets,kind:ItemKind){if(p.entries.length>=48)return null;const item:PocketItem={id:'item-'+p.nextId++,kind,state:'sealed'};p.entries.push(item);if(!p.held)p.held=item.id;return item;}
export const itemLabel=(i:PocketItem)=>i.state==='empty'?(i.kind==='Chips'?'Empty wrapper':i.kind==='Soda'?'Empty can':i.kind==='Party Popper'?'Popped popper':'Empty bottle'):i.kind+(i.state==='opened'&&!isNovelty(i.kind)?' (opened)':'');
export function consumeItem(p:Pockets,id:string){const i=p.entries.find(i=>i.id===id);if(!i||i.state==='empty')return false;i.state='empty';return true;}
