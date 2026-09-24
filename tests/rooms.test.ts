import test from 'node:test';import assert from 'node:assert/strict';import {WebSocket} from 'ws';import {once} from 'node:events';import {createRooms} from '../server/rooms';import {defaultScooter} from '../src/data/scooterParts';import {defaultAvatar} from '../src/avatar/config';import {PROTOCOL,CONTENT} from '../src/network/protocol';
const hello={protocol:PROTOCOL,content:CONTENT,mapRevision:'0'.repeat(64),name:'Tester',appearance:{avatar:defaultAvatar(),scooter:defaultScooter()}};
const delay=(ms:number)=>new Promise(r=>setTimeout(r,ms));
test('private room identity, permissions, limits, isolation, reconnect and eight simulated connections',async()=>{
 const service=createRooms({port:0,capacity:8,grace:100,origins:['http://test.local']});await once(service.server,'listening');const port=(service.server.address() as any).port;const clients:WebSocket[]=[];
 const connect=async()=>{const ws=new WebSocket('ws://127.0.0.1:'+port,{origin:'http://test.local'});clients.push(ws);const inbox:any[]=[];ws.on('message',raw=>inbox.push(JSON.parse(raw.toString())));await once(ws,'open');return {ws,inbox,send:(m:any)=>ws.send(JSON.stringify(m)),wait:async(type:string)=>{for(let i=0;i<200;i++){const at=inbox.findIndex(m=>m.type===type);if(at>=0)return inbox.splice(at,1)[0];await delay(5);}throw Error('Missing '+type);}};}; 
 try{
 const host=await connect();host.send({...hello,type:'create'});const joined=await host.wait('welcome');assert(joined.secret!==joined.code);assert(joined.id);
 const friend=await connect();friend.send({...hello,type:'join',code:joined.code,name:'Friend'});const f=await friend.wait('welcome');assert.notEqual(f.id,joined.id);
 friend.send({type:'lock',locked:true});assert.match((await friend.wait('error')).message,/owner/);assert.equal([...service.rooms.values()][0].locked,false);
 const other=await connect();other.send({...hello,type:'create',name:'Elsewhere'});await other.wait('welcome');host.send({type:'chat',id:f.id,message:'<img src=x> safe text'});const chat=await friend.wait('chat');assert.equal(chat.id,joined.id);assert.equal(chat.message,'<img src=x> safe text');await delay(30);assert(!other.inbox.some(m=>m.type==='chat'));
 friend.send({type:'pose',generation:f.generation,seq:0,pose:{position:[0,1,0],state:'Grounded'}});await delay(30);assert.equal([...service.rooms.values()][0].players.get(f.id)!.pose,null);
 const replacement=await connect();replacement.send({...hello,type:'resume',code:joined.code,secret:f.secret});assert.equal((await replacement.wait('welcome')).id,f.id);await delay(30);assert.equal(friend.ws.readyState,WebSocket.CLOSED);
 for(let i=2;i<8;i++){const c=await connect();c.send({...hello,type:'join',code:joined.code,name:'Simulated '+i});await c.wait('welcome');}assert.equal([...service.rooms.values()][0].players.size,8);
 const full=await connect();full.send({...hello,type:'join',code:joined.code});assert.match((await full.wait('error')).message,/full/);
 host.send({type:'leave'});await delay(30);assert.equal([...service.rooms.values()][0].owner,f.id);
 }finally{clients.forEach(c=>c.terminate());service.close();}
});
