export const ITEM_KINDS=['Soda','Water','Sports drink','Chips'] as const;
export type ItemKind=typeof ITEM_KINDS[number];
export interface PocketItem{id:string;kind:ItemKind;state:'sealed'|'opened'|'empty'}
export interface Pockets{nextId:number;entries:PocketItem[];held:string|null;backpack:boolean;useAction:'pushDeck'|'leftModifier'|'rightModifier'}
export const emptyPockets=():Pockets=>({nextId:1,entries:[],held:null,backpack:false,useAction:'pushDeck'});
export function validPockets(raw:Partial<Pockets>|null):Pockets{const p=emptyPockets();if(!raw)return p;const ids=new Set<string>();p.entries=(Array.isArray(raw.entries)?raw.entries:[]).filter(i=>i&&typeof i.id==='string'&&!ids.has(i.id)&&!!ids.add(i.id)&&ITEM_KINDS.includes(i.kind)&&['sealed','opened','empty'].includes(i.state)).slice(0,48).map(i=>({...i}));p.nextId=Math.max(1,...p.entries.map(i=>(Number(i.id.split('-')[1])||0)+1),Number(raw.nextId)||1);p.held=p.entries.some(i=>i.id===raw.held)?raw.held!:null;p.backpack=!!raw.backpack;if(['pushDeck','leftModifier','rightModifier'].includes(raw.useAction!))p.useAction=raw.useAction!;return p;}
export function receiveItem(p:Pockets,kind:ItemKind){if(p.entries.length>=48)return null;const item:PocketItem={id:'item-'+p.nextId++,kind,state:'sealed'};p.entries.push(item);if(!p.held)p.held=item.id;return item;}
export const itemLabel=(i:PocketItem)=>i.state==='empty'?(i.kind==='Chips'?'Empty wrapper':i.kind==='Soda'?'Empty can':'Empty bottle'):i.kind+(i.state==='opened'?' (opened)':'');
export function consumeItem(p:Pockets,id:string){const i=p.entries.find(i=>i.id===id);if(!i||i.state==='empty')return false;i.state='empty';return true;}
