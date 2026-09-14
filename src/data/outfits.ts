export type OutfitSlot = 'head' | 'top' | 'bottom' | 'shoes';
export interface ClothingItem { id:string; category:OutfitSlot; name:string; model:string; color:number }
export const OUTFIT_SLOTS:OutfitSlot[]=['head','top','bottom','shoes'];
const palette={Black:0x252d33,Gray:0xa5a7a2,Forest:0x42634e,Red:0xb84836,Sand:0xd9c9a2,Navy:0x304665};
export const CLOTHING:ClothingItem[]=[];
for(const [category,model,label,colors] of [
 ['head','none','No Hat',['Black']],['head','helmet','Classic Helmet',['Black','Red','Sand']],
 ['head','vented','Vented Helmet',['Gray','Forest']],['head','visor','Visor Helmet',['Navy','Red']],
 ['head','beanie','Beanie',['Black','Forest']],['head','cap','Cap',['Sand','Navy']],
 ['top','tee','T-Shirt',['Sand','Black','Forest','Red']],['top','long-sleeve','Long Sleeve',['Gray','Navy','Red']],
 ['top','hoodie','Hoodie',['Black','Gray','Forest','Red']],['bottom','jeans','Jeans',['Navy','Black']],
 ['bottom','chinos','Chinos',['Sand','Forest']],['bottom','shorts','Shorts',['Gray','Black']],
 ['shoes','low-top','Low-Top Skate Shoes',['Black','Sand']],['shoes','high-top','High-Top Shoes',['Navy','Red']],
 ['shoes','skate','Athletic Skate Shoes',['Gray','Forest']],
] as [OutfitSlot,string,string,(keyof typeof palette)[]][]){
 for(const color of colors)CLOTHING.push({id:`${category}-${model}-${color.toLowerCase()}`,category,model,name:model==='none'?label:`${color} ${label}`,color:palette[color]});
}
export type Outfit = Record<OutfitSlot,string>;
export const defaultOutfit=():Outfit=>({head:'head-helmet-red',top:'top-tee-sand',bottom:'bottom-chinos-forest',shoes:'shoes-low-top-black'});
export function clothing(outfit:Outfit,slot:OutfitSlot){return CLOTHING.find(p=>p.id===outfit[slot]&&p.category===slot)??CLOTHING.find(p=>p.id===defaultOutfit()[slot])!;}
