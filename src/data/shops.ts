import { PARTS, type Category } from './scooterParts';
import type { MapId } from './maps';
import { LONGBOARD_BRAND, LONGBOARD_PARTS } from './longboardParts';
export interface ShopDefinition {
  id: string; mapId: MapId; name: string; description: string;
  stock: readonly string[];
  displays: readonly {x:number;z:number;category:Category|'longboard';label:string}[];
}
export const SHOPS: readonly ShopDefinition[] = [{
  id:'techno_gravity', mapId:'techno_gravity', name:'Techno Gravity Shop',
  description:'A local scooter shop with Lazer and Mafioso parts and Sometimes Summer longboards. Walk inside to browse, then ride the frontage and DIY alley mini-ramp.',
  stock:[...PARTS.filter(p=>['lazer','mafioso'].includes(p.brandId)).map(p=>p.id),...LONGBOARD_PARTS.filter(p=>p.brandId===LONGBOARD_BRAND.id).map(p=>p.id)],
  displays:[
    {x:-4.7,z:-.3,category:'wheels',label:'Wheels / pairs'}, {x:-4.7,z:2.5,category:'clamp',label:'Clamps'},
    {x:4.8,z:3,category:'bars',label:'Handlebars'}, {x:-4.7,z:5,category:'deck',label:'Decks'},
    {x:4.8,z:.2,category:'fork',label:'Forks'}, {x:4.8,z:5.5,category:'grips',label:'Grips'},
    {x:0,z:6.8,category:'bearings',label:'Bearings / hardware'},
    {x:-6.9,z:-2.6,category:'longboard',label:'Sometimes Summer longboards'}
  ]
}];
export const shopForMap=(mapId:string)=>SHOPS.find(s=>s.mapId===mapId);
export const shopStock=(shopId:string,category?:Category)=>{
  const shop=SHOPS.find(s=>s.id===shopId);
  return PARTS.filter(p=>shop?.stock.includes(p.id)&&(!category||p.category===category));
};
/** Longboard parts a shop carries, for its longboard display and board shop. */
export const shopBoardStock=(shopId:string)=>{
  const shop=SHOPS.find(s=>s.id===shopId);
  return LONGBOARD_PARTS.filter(p=>shop?.stock.includes(p.id));
};
