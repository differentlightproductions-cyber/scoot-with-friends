import test from 'node:test';import assert from 'node:assert/strict';
import {SHOPS,shopStock,shopBoardStock,shopForMap} from '../src/data/shops';import {MAPS} from '../src/data/maps';
test('shop destination and physical displays share a scoped catalog',()=>{
 const shop=shopForMap('techno_gravity')!;assert.equal(shop.name,'Techno Gravity Shop');assert.equal(MAPS.find(m=>m.id===shop.mapId)?.name,shop.name);
 assert.equal(new Set(SHOPS.map(s=>s.id)).size,SHOPS.length);
 for(const d of shop.displays){
  if(d.category==='longboard'){const boards=shopBoardStock(shop.id);assert(boards.length);assert(boards.every(p=>shop.stock.includes(p.id)));continue;}
  const stock=shopStock(shop.id,d.category);assert(stock.length);assert(stock.every(p=>p.category===d.category&&shop.stock.includes(p.id)));}
 assert.deepEqual(shopBoardStock('unknown-shop'),[]);
 assert.deepEqual(shopStock('unknown-shop'),[]);
});