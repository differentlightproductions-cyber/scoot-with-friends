import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createServer} from 'node:http';
import {WebSocket} from 'ws';
import {createRooms,attachLanRelay,privateAddress,LAN_ORIGIN} from '../server/lan';
import {defaultScooter} from '../src/data/scooterParts';
import {defaultAvatar} from '../src/avatar/config';
import {PROTOCOL,CONTENT} from '../src/network/protocol';

test('LAN accepts only local IPv4 targets',()=>{
 for(const ip of ['192.168.1.25','10.0.0.2','172.16.0.1','127.0.0.1'])assert.equal(privateAddress(ip),ip);
 for(const ip of ['example.com','8.8.8.8','192.168.0.256','127.0.0.1:80','127.0.0.1/path','172.32.1.1'])assert.throws(()=>privateAddress(ip));
});

test('two localhost relays join, chat, isolate, reconnect, and reject foreign web origins',async()=>{
 const service=createRooms({port:0,origins:[LAN_ORIGIN]});await once(service.server,'listening');
 const roomPort=(service.server.address() as any).port;
 const pages=[createServer(),createServer()];
 const stops=pages.map(page=>attachLanRelay(page,'127.0.0.1',roomPort));
 for(const page of pages){page.listen(0,'127.0.0.1');await once(page,'listening');}
 const sockets:WebSocket[]=[];
 const connect=async(index:number)=>{
  const port=(pages[index].address() as any).port;
  const ws=new WebSocket(`ws://127.0.0.1:${port}/lan-room`,{origin:`http://127.0.0.1:${port}`});sockets.push(ws);
  const inbox:any[]=[];ws.on('message',data=>inbox.push(JSON.parse(data.toString())));await once(ws,'open');
  return {ws,send:(data:any)=>ws.send(JSON.stringify(data)),wait:async(type:string)=>{for(let i=0;i<200;i++){const at=inbox.findIndex(m=>m.type===type);if(at>=0)return inbox.splice(at,1)[0];await new Promise(r=>setTimeout(r,5));}throw Error('Missing '+type);},inbox};
 };
 const hello={protocol:PROTOCOL,content:CONTENT,mapRevision:'0'.repeat(64),name:'LAN rider',appearance:{avatar:defaultAvatar(),scooter:defaultScooter()}};
 try{
  const host=await connect(0);host.send({...hello,type:'create'});const a=await host.wait('welcome');
  const friend=await connect(1);friend.send({...hello,type:'join',code:a.code});const b=await friend.wait('welcome');assert.notEqual(a.id,b.id);
  host.send({type:'chat',message:'Hello LAN'});assert.equal((await friend.wait('chat')).id,a.id);
  const replacement=await connect(1);replacement.send({...hello,type:'resume',code:a.code,secret:b.secret});assert.equal((await replacement.wait('welcome')).id,b.id);
  const other=await connect(0);other.send({...hello,type:'create'});await other.wait('welcome');replacement.send({type:'chat',message:'Only our room'});await host.wait('chat');await new Promise(r=>setTimeout(r,30));assert(!other.inbox.some(m=>m.type==='chat'));
  const port=(pages[0].address() as any).port;
  const foreign=new WebSocket(`ws://127.0.0.1:${port}/lan-room`,{origin:'https://foreign.example'});sockets.push(foreign);
  const [error]=await once(foreign,'error');assert.match(error.message,/403/);
  friend.ws.terminate();assert.equal([...service.rooms.values()][0].players.size,2);
 }finally{sockets.forEach(ws=>ws.terminate());stops.forEach(stop=>stop());pages.forEach(page=>page.close());service.close();}
});
