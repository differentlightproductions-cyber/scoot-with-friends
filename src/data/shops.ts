import { PARTS, type Category } from './scooterParts';
import type { MapId } from './maps';
export interface ShopDefinition {
  id: string; mapId: MapId; name: string; description: string;
  stock: readonly string[];
  displays: readonly {x:number;z:number;category:Category;label:string}[];
}
export const SHOPS: readonly ShopDefinition[] = [{
  id:'techno_gravity', mapId:'techno_gravity', name:'Techno Gravity Shop',
  description:'A local scooter shop with Lazer and Mafioso parts. Walk inside to browse, then ride the frontage and DIY alley mini-ramp.',
  stock:PARTS.filter(p=>['lazer','mafioso'].includes(p.brandId)).map(p=>p.id),
  displays:[
    {x:-4.7,z:-.3,category:'wheels',label:'Wheels / pairs'}, {x:-4.7,z:2.5,category:'clamp',label:'Clamps'},
    {x:4.8,z:3,category:'bars',label:'Handlebars'}, {x:-4.7,z:5,category:'deck',label:'Decks'},
    {x:4.8,z:.2,category:'fork',label:'Forks'}, {x:4.8,z:5.5,category:'grips',label:'Grips'},
    {x:0,z:6.8,category:'bearings',label:'Bearings / hardware'}
  ]
}];
export const shopForMap=(mapId:string)=>SHOPS.find(s=>s.mapId===mapId);
export const shopStock=(shopId:string,category?:Category)=>{
  const shop=SHOPS.find(s=>s.id===shopId);
  return PARTS.filter(p=>shop?.stock.includes(p.id)&&(!category||p.category===category));
};
