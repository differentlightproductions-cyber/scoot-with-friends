import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFileSync,unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {WebSocket} from 'ws';
import {createRooms} from '../server/rooms';
import {defaultAvatar} from '../src/avatar/config';
import {defaultScooter} from '../src/data/scooterParts';
import {PROTOCOL,CONTENT} from '../src/network/protocol';

const origin='http://test.local',credential=()=>randomBytes(32).toString('hex'),delay=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const roomHello={protocol:PROTOCOL,content:CONTENT,mapRevision:'0'.repeat(64),appearance:{avatar:defaultAvatar(),scooter:defaultScooter()}};
type Peer={ws:WebSocket;inbox:any[];send:(data:any)=>void;wait:(check:(data:any)=>boolean)=>Promise<any>};
async function fixture(socialFile=''){
 const service=createRooms({port:0,origins:[origin],socialFile});await once(service.server,'listening');
 const port=(service.server.address() as any).port,peers:Peer[]=[];
 const connect=async():Promise<Peer>=>{
  const ws=new WebSocket(`ws://127.0.0.1:${port}`,{origin});const inbox:any[]=[];ws.on('message',data=>inbox.push(JSON.parse(data.toString())));await once(ws,'open');
  const peer={ws,inbox,send:(data:any)=>ws.send(JSON.stringify(data)),wait:async(check:(data:any)=>boolean)=>{for(let i=0;i<200;i++){const at=inbox.findIndex(check);if(at>=0)return inbox.splice(at,1)[0];await delay(5);}throw Error('Social message timeout');}};peers.push(peer);return peer;
 };
 return {connect,close:()=>{peers.forEach(p=>p.ws.terminate());service.close();}};
}
async function social(peer:Peer,secret:string,name:string){peer.send({type:'social-auth',protocol:PROTOCOL,content:CONTENT,credential:secret,name});return peer.wait(m=>m.type==='social-state');}

test('social identity, mutual requests, presence and durable friend links never store credentials',async()=>{
 const file=join(tmpdir(),'swf-social-'+randomUUID()+'.json'),a=credential(),b=credential();
 let f=await fixture(file);
 try{
  const old=await f.connect();old.send({type:'social-auth',protocol:1,content:CONTENT,credential:credential(),name:'Old'});await old.wait(m=>m.type==='social-error'&&/Incompatible/.test(m.message));
  const alice=await f.connect(),bob=await f.connect();const as=await social(alice,a,'Alice'),bs=await social(bob,b,'Bob');
  assert.notEqual(as.friendId,bs.friendId);assert.match(as.friendId,/^[a-f0-9]{64}$/);assert.equal(as.persistent,true);
  alice.send({type:'friend-request',friendId:bs.friendId});
  await bob.wait(m=>m.type==='social-state'&&m.requests.some((r:any)=>r.id===as.friendId));
  bob.send({type:'friend-accept',friendId:as.friendId});
  await alice.wait(m=>m.type==='social-state'&&m.friends.some((r:any)=>r.id===bs.friendId&&r.online));
  await bob.wait(m=>m.type==='social-state'&&m.friends.some((r:any)=>r.id===as.friendId&&r.online));
  const stored=readFileSync(file,'utf8');assert(!stored.includes(a)&&!stored.includes(b),'credentials stay out of social file');
 }finally{f.close();}
 f=await fixture(file);
 try{
  const alice=await f.connect(),bob=await f.connect();const as=await social(alice,a,'Alice'),bs=await social(bob,b,'Bob');
  assert(as.friends.some((r:any)=>r.id===bs.friendId));assert(bs.friends.some((r:any)=>r.id===as.friendId));
  bob.ws.close();await alice.wait(m=>m.type==='social-state'&&m.friends.some((r:any)=>r.id===bs.friendId&&!r.online));
  const again=await f.connect();await social(again,b,'Bob');await alice.wait(m=>m.type==='social-state'&&m.friends.some((r:any)=>r.id===bs.friendId&&r.online));
 }finally{f.close();unlinkSync(file);}
});

test('room invites require authenticated membership and friendship; recipient chooses to join',async()=>{
 const f=await fixture(),a=credential(),b=credential(),c=credential();
 try{
  const alice=await f.connect(),bob=await f.connect(),carol=await f.connect();
  const as=await social(alice,a,'Alice'),bs=await social(bob,b,'Bob');await social(carol,c,'Carol');
  alice.send({type:'friend-request',friendId:bs.friendId});await bob.wait(m=>m.type==='social-state'&&m.requests.some((r:any)=>r.id===as.friendId));
  bob.send({type:'friend-accept',friendId:as.friendId});await alice.wait(m=>m.type==='social-state'&&m.friends.some((r:any)=>r.id===bs.friendId));
  const host=await f.connect();host.send({...roomHello,type:'create',name:'Alice',socialCredential:a});const welcome=await host.wait(m=>m.type==='welcome');
  const outsider=await f.connect();outsider.send({...roomHello,type:'join',code:welcome.code,name:'Carol',socialCredential:c});await outsider.wait(m=>m.type==='welcome');
  const roster=await host.wait(m=>m.type==='roster'&&m.players.length===2);assert.equal(roster.players[0].friendId,as.friendId);
  outsider.send({type:'invite',generation:welcome.generation,friendId:bs.friendId});await outsider.wait(m=>m.type==='social-error'&&/Only friends/.test(m.message));
  alice.send({type:'invite',friendId:bs.friendId});await alice.wait(m=>m.type==='social-error'&&/Unknown social action/.test(m.message));
  host.send({type:'invite',generation:welcome.generation,friendId:bs.friendId});
  await host.wait(m=>m.type==='invite-sent'&&m.friendId===bs.friendId);
  const invited=await bob.wait(m=>m.type==='social-state'&&m.invites.length===1);assert.equal(invited.invites[0].from,as.friendId);assert.equal('code' in invited.invites[0],false);
  bob.send({type:'invite-accept',id:invited.invites[0].id});const accepted=await bob.wait(m=>m.type==='invite-accepted');assert.equal(accepted.code,welcome.code);
  const friendRoom=await f.connect();friendRoom.send({...roomHello,type:'join',code:accepted.code,name:'Bob',socialCredential:b});await friendRoom.wait(m=>m.type==='welcome');
  friendRoom.send({type:'leave'});await host.wait(m=>m.type==='roster'&&m.players.length===2);
  host.send({type:'invite',generation:welcome.generation,friendId:bs.friendId});const again=await bob.wait(m=>m.type==='social-state'&&m.invites.length===1);
  host.send({type:'lock',locked:true});await host.wait(m=>m.type==='roster'&&m.locked===true);
  bob.send({type:'invite-accept',id:again.invites[0].id});await bob.wait(m=>m.type==='social-error'&&/unavailable/.test(m.message));
  host.send({type:'lock',locked:false});await host.wait(m=>m.type==='roster'&&m.locked===false);
  host.send({type:'invite',generation:welcome.generation,friendId:bs.friendId});await bob.wait(m=>m.type==='social-state'&&m.invites.length===1);
  bob.send({type:'friend-remove',friendId:as.friendId});await bob.wait(m=>m.type==='social-state'&&m.friends.length===0&&m.invites.length===0);
  host.send({type:'invite',generation:welcome.generation,friendId:bs.friendId});await host.wait(m=>m.type==='social-error'&&/Only friends/.test(m.message));
 }finally{f.close();}
});

test('eight riders behind one IP can open both social and room sockets',async()=>{
 const f=await fixture();
 try{
  let code='';for(let i=0;i<8;i++){
   const secret=credential(),presence=await f.connect();await social(presence,secret,'Rider '+i);
   const room=await f.connect();room.send({...roomHello,type:i===0?'create':'join',code,name:'Rider '+i,socialCredential:secret});
   const welcome=await room.wait(m=>m.type==='welcome');code=welcome.code;
  }
 }finally{f.close();}
});
