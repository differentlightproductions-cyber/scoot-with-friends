import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyPockets,receiveItem,consumeItem,validPockets} from '../src/data/items.ts';
test('Pockets preserve identities, held and consumed states across migration and backpack changes',()=>{
 const p=emptyPockets(),a=receiveItem(p,'Soda')!,b=receiveItem(p,'Chips')!;
 assert.equal(p.held,a.id);assert.notEqual(a.id,b.id);
 a.state='opened';const interrupted=validPockets(JSON.parse(JSON.stringify(p)));
 assert.equal(interrupted.entries[0].state,'opened');
 assert.equal(consumeItem(interrupted,a.id),true);assert.equal(consumeItem(interrupted,a.id),false);
 interrupted.backpack=true;interrupted.held=null;
 const saved=validPockets(JSON.parse(JSON.stringify(interrupted)));saved.backpack=false;
 assert.equal(saved.entries.length,2);assert.equal(saved.entries[0].state,'empty');
 assert.equal(receiveItem(saved,'Water')?.id,'item-3');
});
test('Inventory migration rejects duplicates and invalid items without losing good entries',()=>{
 const p=validPockets({entries:[{id:'item-2',kind:'Soda',state:'empty'},{id:'item-2',kind:'Soda',state:'sealed'},{id:'bad',kind:'fake' as any,state:'sealed'}],held:'missing'});
 assert.equal(p.entries.length,1);assert.equal(p.held,null);assert.equal(p.nextId,3);
 for(let i=0;i<50;i++)receiveItem(p,'Water');assert.equal(p.entries.length,48);
});
