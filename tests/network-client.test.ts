import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {FreeRide} from '../src/network/client';
import {defaultAvatar} from '../src/avatar/config';
import {defaultScooter} from '../src/data/scooterParts';
import {defaultLongboard} from '../src/data/longboardParts';
import type {LocalProfile} from '../src/data/loadout';
import {WebSocket as ServerTestSocket} from 'ws';
import {once} from 'node:events';
import {createRooms} from '../server/rooms';
import {PROTOCOL,CONTENT} from '../src/network/protocol';

class Socket {
 static OPEN=1; static sockets:Socket[]=[];
 readyState=0; bufferedAmount=0; sent:any[]=[];
 onopen:()=>void=()=>{};onmessage:(event:{data:string})=>void=()=>{};
 onerror:()=>void=()=>{};onclose:(event:{code:number;reason:string})=>void=()=>{};
 constructor(readonly url:string){Socket.sockets.push(this);}
 open(){this.readyState=1;this.onopen();}
 send(text:string){this.sent.push(JSON.parse(text));}
 message(value:any){this.onmessage({data:JSON.stringify(value)});}
 close(code=1000,reason=''){this.readyState=3;this.onclose({code,reason});}
}

function rider(){
 const original={document:globalThis.document,window:globalThis.window,location:globalThis.location,sessionStorage:globalThis.sessionStorage,WebSocket:globalThis.WebSocket};
 const timers:Array<()=>void>=[];
 (globalThis as any).document={body:{append(){}},createElement:()=>({className:'',hidden:false,remove(){}})};
 (globalThis as any).window={__SWF_LAN__:true,setInterval:()=>0,setTimeout:(fn:()=>void)=>{timers.push(fn);return timers.length;}};
 (globalThis as any).location={hostname:'localhost',host:'localhost:5182'};
 (globalThis as any).sessionStorage={getItem:()=>null,setItem(){},removeItem(){}};
 (globalThis as any).WebSocket=Socket;
 Socket.sockets=[];
 const profile={avatar:defaultAvatar(),scooter:defaultScooter(),longboard:defaultLongboard(),activeRideable:'scooter',settings:{playfulContact:'full'},wallet:{receipts:Array.from({length:500},(_,i)=>`00000000-0000-4000-8000-${i.toString(16).padStart(12,'0')}`)},progress:{xp:50000}} as unknown as LocalProfile;
 const ride=new FreeRide(new THREE.Scene(),profile,()=>{throw Error('No pose expected');});
 return {ride,profile,timers,restore(){Object.assign(globalThis,original);}};
}

test('room handshake includes only validated appearance, even with a large saved profile',async()=>{
 const f=rider();try{
  await f.ride.connect('create','Rider');const socket=Socket.sockets[0];socket.open();
  const hello=socket.sent[0];
  assert.equal(hello.type,'create');assert.deepEqual(Object.keys(hello.appearance).sort(),['avatar','longboard','rideable','scooter']);
  assert.ok(JSON.stringify(f.profile).length>16384);
  assert.equal(JSON.stringify(hello).includes('receipts'),false);
  assert.ok(JSON.stringify(hello).length<16384);
 }finally{f.ride.leave();f.restore();}
});

test('server rejection keeps its reason and does not reconnect',async()=>{
 const f=rider();try{
  await f.ride.connect('create','Rider');const socket=Socket.sockets[0];socket.open();
  socket.message({type:'error',message:'Lobby full.'});
  assert.equal(f.ride.status,'Disconnected');assert.equal(f.ride.lastError,'Lobby full.');
  assert.equal(f.timers.length,0);
  await f.ride.connect('create','Rider');Socket.sockets[1].close(1009,'');
  assert.match(f.ride.lastError,/too large/i);assert.equal(f.timers.length,0);
 }finally{f.ride.leave();f.restore();}
});

test('failed preparation and cancelled preparation never open a socket',async()=>{
 const f=rider();try{
  f.ride.prepare=async()=>{throw Error('Missing map');};
  await f.ride.connect('create');assert.equal(f.ride.status,'Disconnected');assert.match(f.ride.lastError,/prepare/);assert.equal(Socket.sockets.length,0);
  let release!:()=>void;f.ride.prepare=()=>new Promise<void>(resolve=>{release=resolve;});
  const pending=f.ride.connect('create');f.ride.leave();release();await pending;
  assert.equal(f.ride.status,'Solo');assert.equal(Socket.sockets.length,0);
 }finally{f.ride.leave();f.restore();}
});

test('oversized handshake closes only its socket; server still accepts a room',async()=>{
 const service=createRooms({port:0,origins:['http://test.local']});
 let oversized:ServerTestSocket|undefined,valid:ServerTestSocket|undefined;
 try{
  await once(service.server,'listening');
  const port=(service.server.address() as {port:number}).port;
  oversized=new ServerTestSocket(`ws://127.0.0.1:${port}`,{origin:'http://test.local'});
  await once(oversized,'open');
  const closed=once(oversized,'close');
  oversized.send(JSON.stringify({type:'create',appearance:{receipts:'x'.repeat(17000)}}));
  assert.equal((await closed)[0],1009);

  valid=new ServerTestSocket(`ws://127.0.0.1:${port}`,{origin:'http://test.local'});
  await once(valid,'open');
  const welcomed=new Promise<any>(resolve=>valid!.on('message',raw=>{const message=JSON.parse(raw.toString());if(message.type==='welcome')resolve(message);}));
  valid.send(JSON.stringify({type:'create',protocol:PROTOCOL,content:CONTENT,mapRevision:'0'.repeat(64),name:'Rider',appearance:{avatar:defaultAvatar(),scooter:defaultScooter()}}));
  assert.ok((await welcomed).code);
 }finally{oversized?.terminate();valid?.terminate();service.close();}
});
