import test from 'node:test';import assert from 'node:assert/strict';import {WebSocket} from 'ws';import {once} from 'node:events';import {createRooms} from '../server/rooms';import {defaultScooter} from '../src/data/scooterParts';import {defaultAvatar} from '../src/avatar/config';import {PROTOCOL,CONTENT} from '../src/network/protocol';
import {BUILD_BOUNDS} from '../src/data/builds';
const hello={protocol:PROTOCOL,content:CONTENT,mapRevision:'0'.repeat(64),name:'Tester',appearance:{avatar:defaultAvatar(),scooter:defaultScooter()}};
const delay=(ms:number)=>new Promise(r=>setTimeout(r,ms));
test('private room identity, permissions, limits, isolation, reconnect and eight simulated connections',async()=>{
 const service=createRooms({port:0,grace:100,origins:['http://test.local']});await once(service.server,'listening');const port=(service.server.address() as any).port;const clients:WebSocket[]=[];
 const connect=async()=>{const ws=new WebSocket('ws://127.0.0.1:'+port,{origin:'http://test.local'});clients.push(ws);const inbox:any[]=[];ws.on('message',raw=>inbox.push(JSON.parse(raw.toString())));await once(ws,'open');return {ws,inbox,send:(m:any)=>ws.send(JSON.stringify(m)),wait:async(type:string)=>{for(let i=0;i<200;i++){const at=inbox.findIndex(m=>m.type===type);if(at>=0)return inbox.splice(at,1)[0];await delay(5);}throw Error('Missing '+type);}};}; 
 try{
 const host=await connect();host.send({...hello,type:'create'});const joined=await host.wait('welcome');assert(joined.secret!==joined.code);assert(joined.id);
 const friend=await connect();friend.send({...hello,type:'join',code:joined.code,name:'Friend'});const f=await friend.wait('welcome');assert.notEqual(f.id,joined.id);
 friend.send({type:'lock',locked:true});assert.match((await friend.wait('error')).message,/owner/);assert.equal([...service.rooms.values()][0].locked,false);
 const other=await connect();other.send({...hello,type:'create',name:'Elsewhere'});await other.wait('welcome');host.send({type:'chat',id:f.id,message:'<img src=x> safe text'});const chat=await friend.wait('chat');assert.equal(chat.id,joined.id);assert.equal(chat.message,'<img src=x> safe text');await delay(30);assert(!other.inbox.some(m=>m.type==='chat'));
 friend.send({type:'pose',generation:f.generation,seq:0,pose:{position:[0,1,0],state:'Grounded'}});await delay(30);assert.equal([...service.rooms.values()][0].players.get(f.id)!.pose,null);
 const replacement=await connect();replacement.send({...hello,type:'resume',code:joined.code,secret:f.secret});assert.equal((await replacement.wait('welcome')).id,f.id);await delay(30);assert.equal(friend.ws.readyState,WebSocket.CLOSED);
 const riders=[host,replacement];for(let i=2;i<8;i++){const c=await connect();c.send({...hello,type:'join',code:joined.code,name:'Simulated '+i});await c.wait('welcome');riders.push(c);assert.equal([...service.rooms.values()][0].players.size,i+1);}
 const full=await connect();full.send({...hello,type:'join',code:joined.code});assert.match((await full.wait('error')).message,/full/);
 const channel={angle:0,velocity:0,mismatch:0};const pose={position:[0,1,0],yaw:0,pitch:0,roll:0,speed:0,elapsed:0,charge:0,compression:0,getUpTimer:0,landTimer:0,landingCompression:0,popTimer:0,pushTimer:0,rampLean:0,steer:0,bodyFlip:{angle:0,velocity:0},airWeight:{shift:0},manual:{pitch:0},dropIn:{phase:null},tricks:{stance:'regular',naturalDirection:1,poseBlend:0,poseSide:0,fingerTime:0,fingerHand:0,deck:channel,bars:channel,bri:channel,kickless:channel},state:'Grounded'};
 riders.forEach((r,i)=>r.send({type:'pose',generation:joined.generation,seq:0,pose:{...pose,position:[i,1,0],...(i===0?{walking:true,swim:{time:1,stroke:2,speed:1,out:null}}:i===1?{walking:true,mantle:{kind:'vault',time:.2,duration:.5,edge:[1,2,3],forward:[0,0,1]}}:i===2?{flipYaw0:1,flipRoll0:.2,jumpOn:true,grinding:true,diveFlip:{angle:.3,dir:1,side:0,sideDir:0,twist:0,twistDir:0}}:{})}}));
 for(let i=0;i<200;i++){if(host.inbox.some(m=>m.type==='snapshot'&&m.players.length===8))break;await delay(5);}
 assert(host.inbox.some(m=>m.type==='snapshot'&&m.players.length===8),'all eight rider poses arrive in one snapshot');
 const states=host.inbox.find(m=>m.type==='snapshot'&&m.players.length===8).players.map((p:any)=>p.pose);
 assert.equal(states[0].swim.stroke,2);assert.equal(states[1].mantle.kind,'vault');assert.equal(states[2].flipYaw0,1);assert.equal(states[2].jumpOn,true);assert.equal(states[2].grinding,true);assert.equal(states[2].diveFlip.angle,.3);
 riders.forEach(r=>r.inbox.splice(0));const loadStart=performance.now();
 for(let tick=1;tick<=40;tick++){riders.forEach((r,i)=>r.send({type:'pose',generation:joined.generation,seq:tick,pose:{...pose,position:[i+tick*.01,1,0]}}));await delay(50);}
 const duration=(performance.now()-loadStart)/1000;
 const received=riders.map(r=>r.inbox.filter(m=>m.type==='snapshot'&&m.players.length===8));
 assert(received.every(messages=>messages.length>=20),'all eight clients receive regular eight-rider snapshots under load');
 const bytes=received.reduce((total,messages)=>total+messages.reduce((sum,message)=>sum+Buffer.byteLength(JSON.stringify(message)),0),0);
 console.log(`Eight simulated riders: ${received.map(messages=>messages.length).join('/')} complete snapshots in ${duration.toFixed(2)} s, ${(bytes/duration/1024).toFixed(1)} KiB/s aggregate downstream`);
 host.send({type:'map',map:'warehouse',mapRevision:hello.mapRevision});const warehouse=await host.wait('map');
 host.send({type:'ready',generation:warehouse.generation,mapRevision:hello.mapRevision});await host.wait('ready');await host.wait('builds');
 replacement.send({type:'ready',generation:warehouse.generation,mapRevision:hello.mapRevision});await replacement.wait('ready');assert.deepEqual((await replacement.wait('builds')).pieces,[]);
 host.send({type:'build',generation:warehouse.generation,action:'create',asset:'bank',x:0,z:0,rotation:0});const placed=(await replacement.wait('build')).piece;assert.equal(placed.owner,joined.id);assert.equal(placed.asset,'bank');
 host.send({type:'build',generation:warehouse.generation,action:'create',asset:'unknown',x:0,z:0,rotation:0});assert.match((await host.wait('error')).message,/Invalid build/);
 host.send({type:'build',generation:warehouse.generation,action:'create',asset:'bank',x:BUILD_BOUNDS.x,z:0,rotation:0});assert.match((await host.wait('error')).message,/outside/);
 replacement.send({type:'build',generation:warehouse.generation,action:'delete',id:placed.id});assert.match((await replacement.wait('error')).message,/own build/);
 host.send({type:'build',generation:warehouse.generation,action:'move',id:placed.id,x:2,z:0,rotation:0});assert.equal((await replacement.wait('build')).piece.x,2);
 const late=await connect();late.send({...hello,type:'resume',code:joined.code,secret:f.secret});await late.wait('welcome');late.send({type:'ready',generation:warehouse.generation,mapRevision:hello.mapRevision});await late.wait('ready');assert.equal((await late.wait('builds')).pieces[0].id,placed.id);
 late.send({type:'build',generation:warehouse.generation,action:'create',asset:'flat-rail',x:5,z:0,rotation:0});const friendPiece=(await late.wait('build')).piece;assert.equal(friendPiece.owner,f.id);
 host.send({type:'build',generation:warehouse.generation,action:'clear'});const remaining=(await late.wait('builds')).pieces;assert.deepEqual(remaining.map((p:any)=>p.id),[friendPiece.id]);
 host.send({type:'map',map:'outdoor',mapRevision:hello.mapRevision});await host.wait('map');assert.equal([...service.rooms.values()][0].builds.size,0);
 host.send({type:'leave'});await delay(30);assert.equal([...service.rooms.values()][0].owner,f.id);
 }finally{clients.forEach(c=>c.terminate());service.close();}
});
