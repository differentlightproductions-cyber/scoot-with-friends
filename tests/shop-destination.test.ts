import test from 'node:test';import assert from 'node:assert/strict';
import {SHOPS,shopStock,shopForMap} from '../src/data/shops';import {MAPS} from '../src/data/maps';
test('shop destination and physical displays share a scoped catalog',()=>{
 const shop=shopForMap('techno_gravity')!;assert.equal(shop.name,'Techno Gravity Shop');assert.equal(MAPS.find(m=>m.id===shop.mapId)?.name,shop.name);
 assert.equal(new Set(SHOPS.map(s=>s.id)).size,SHOPS.length);
 for(const d of shop.displays){const stock=shopStock(shop.id,d.category);assert(stock.length);assert(stock.every(p=>p.category===d.category&&shop.stock.includes(p.id)));}
 assert.deepEqual(shopStock('unknown-shop'),[]);
});