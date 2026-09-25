import test from 'node:test';
import assert from 'node:assert/strict';
import {RoomPlayful} from '../server/playful';
import {createRooms} from '../server/rooms';
import {WebSocket} from 'ws';
import {once} from 'node:events';
import {defaultAvatar} from '../src/avatar/config';
import {defaultScooter} from '../src/data/scooterParts';
import {PROTOCOL,CONTENT} from '../src/network/protocol';

function fixture(friend=false){
 const events:any[]=[];
 const a={id:'a',friendId:'fa',ws:true,ready:true,pose:{position:[0,0,0],yaw:0,speed:4,walking:true,grounded:true,state:'Walking'}};
 const b={...a,id:'b',friendId:'fb',pose:{...a.pose,position:[0,0,1]}};
 const players=new Map([['a',a],['b',b]]),service=new RoomPlayful(()=>friend,e=>events.push(e));
 for(const id of players.keys()){service.join(id);service.contact(id,'full');}
 const shove=()=>service.request(a,{type:'ShoveRequest',target:'b',source:'spoofed',strength:'ragdoll',direction:[100,100]},players);
 return {a,b,players,service,events,shove};
}
test('room contact derives sender/direction/strength, protects spawn and recovery and limits repeated shoves',()=>{
 const f=fixture();f.shove();assert.equal(f.events[0].strength,'cosmetic');assert.equal(f.events[0].source,'a');assert.deepEqual(f.events[0].direction,[0,0,1]);
 f.shove();assert.equal(f.events.length,1);
 f.service.update(3.1,f.players);f.shove();assert.equal(f.events.at(-1).strength,'stumble');
 f.service.update(1.3,f.players);f.shove();assert.equal(f.events.at(-1).strength,'cosmetic');
 f.service.update(1.3,f.players);f.shove();assert.equal(f.events.at(-1).strength,'stumble');
 f.service.spawned('b');f.service.update(1.3,f.players);f.shove();assert.equal(f.events.at(-1).strength,'cosmetic');
});
test('receiver off and friends-only are cosmetic unless mutual friendship is verified',()=>{
 for(const friend of [false,true])for(const contact of ['off','friends']){
  const f=fixture(friend);f.service.update(4,f.players);f.service.contact('b',contact);f.shove();assert.equal(f.events[0].strength,contact==='friends'&&friend?'stumble':'cosmetic');
 }
});
test('throws validate finite launch near rider, rate limit and server-detect an impact once',()=>{
 const f=fixture();f.service.update(4,f.players);
 const event={type:'ThrowItem',source:'b',item:'can',from:[0,1.3,0],velocity:[0,0,10]};
 for(const bad of [{...event,item:'script'}, {...event,from:[999,0,0]}, {...event,velocity:[0,NaN,0]}, {...event,velocity:[0,100,0]}])f.service.request(f.a,bad,f.players);
 assert.equal(f.events.length,0);f.service.request(f.a,event,f.players);f.service.request(f.a,event,f.players);
 assert.equal(f.events.length,1);assert.equal(f.events[0].source,'a');
 for(let i=0;i<10;i++)f.service.update(.05,f.players);
 assert.equal(f.events.filter(e=>e.type==='ItemImpact').length,1);assert.equal(f.events[1].target,'b');assert.equal(f.events[1].strength,'flinch');
 f.service.request(f.a,{type:'ItemImpact',target:'b',strength:'ragdoll'},f.players);assert.equal(f.events.length,2);
});
test('remote targets, unloaded/disconnected players and mounted throwers cannot be abused',()=>{
 const f=fixture();f.service.update(4,f.players);
 f.service.request(f.a,{type:'ShoveRequest',target:'outside-room'},f.players);
 f.b.pose.position=[0,0,100];f.shove();f.b.pose.position=[0,0,-1];f.shove();f.b.pose.position=[0,0,1];
 f.b.ready=false;f.shove();f.b.ready=true;f.b.ws=false;f.shove();f.b.ws=true;
 f.a.pose.walking=false;f.shove();assert.equal(f.events.length,0);
});

test('socket routing rejects old-map contacts, isolates rooms and ignores forged sender/impact',async()=>{
 const service=createRooms({port:0,origins:['http://test.local']});await once(service.server,'listening');const clients:WebSocket[]=[];
 const delay=(ms:number)=>new Promise(r=>setTimeout(r,ms));
 const hello={protocol:PROTOCOL,content:CONTENT,mapRevision:'0'.repeat(64),name:'Tester',appearance:{avatar:defaultAvatar(),scooter:defaultScooter()}};
 const connect=async(type:string,code?:string)=>{const ws=new WebSocket('ws://127.0.0.1:'+(service.server.address() as any).port,{origin:'http://test.local'});clients.push(ws);const inbox:any[]=[];ws.on('message',r=>inbox.push(JSON.parse(r.toString())));await once(ws,'open');ws.send(JSON.stringify({...hello,type,code}));for(let i=0;i<100&&!inbox.some(e=>e.type==='welcome');i++)await delay(10);const welcome=inbox.find(e=>e.type==='welcome');assert(welcome);return {ws,inbox,welcome,send:(m:any)=>ws.send(JSON.stringify(m))};};
 try{
  const a=await connect('create'),b=await connect('join',a.welcome.code),other=await connect('create');const room=service.rooms.get(a.welcome.code)!;
  room.players.get(a.welcome.id)!.pose=fixture().a.pose;room.players.get(b.welcome.id)!.pose=fixture().b.pose;
  const event={type:'ShoveRequest',target:b.welcome.id,source:other.welcome.id};
  a.send({type:'playful',generation:'obsolete',event});a.send({type:'playful',generation:a.welcome.generation,event:{type:'ItemImpact',target:b.welcome.id}});await delay(70);
  assert(!b.inbox.some(e=>e.type==='playful'));
  a.send({type:'playful',generation:a.welcome.generation,event});await delay(70);
  const got=b.inbox.find(e=>e.type==='playful');assert(got);assert.equal(got.event.source,a.welcome.id);assert.equal(got.event.strength,'cosmetic');assert(!other.inbox.some(e=>e.type==='playful'));
  a.send({type:'map',map:'warehouse',mapRevision:hello.mapRevision});await delay(40);a.send({type:'playful',generation:a.welcome.generation,event});await delay(50);assert.equal(b.inbox.filter(e=>e.type==='playful').length,1);
 }finally{clients.forEach(c=>c.terminate());service.close();}
});
