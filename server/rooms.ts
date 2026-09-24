import {createServer} from 'node:http';
import {randomBytes,randomUUID} from 'node:crypto';
import {WebSocketServer,WebSocket} from 'ws';
import {PROTOCOL,CONTENT,appearance,pose} from '../src/network/protocol';
import {BUILD_BOUNDS,BUILD_LIMITS,buildAsset} from '../src/data/builds';
const token=()=>randomBytes(24).toString('base64url');
type Player={id:string;name:string;secret:string;ws:WebSocket|null;appearance:any;pose:any;seq:number;expiry:number;ready?:boolean;loadDeadline?:number};
type BuildPiece={id:string;owner:string;asset:string;x:number;z:number;rotation:number};
type Room={map?:string;mapRevision:string;code:string;owner:string;locked:boolean;generation:string;players:Map<string,Player>;builds:Map<string,BuildPiece>};
export function createRooms({port=8787,host='127.0.0.1',capacity=8,grace=30000,origins=['http://127.0.0.1:5182','http://localhost:5182']}={}){
 capacity=Number.isFinite(capacity)?Math.max(1,Math.min(8,Math.floor(capacity))):8;
 const rooms=new Map<string,Room>(),attempts=new Map<string,{at:number,n:number}>();
 const server=createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.writeHead(req.url==='/health'?200:404);res.end(JSON.stringify(req.url==='/health'?{ok:true,rooms:rooms.size,protocol:PROTOCOL}:{}));});
 const wss=new WebSocketServer({server,maxPayload:16384,perMessageDeflate:false});
 const send=(ws:WebSocket|null,data:any)=>{if(ws?.readyState!==WebSocket.OPEN)return;if(ws.bufferedAmount>=262144){if(data.type!=='snapshot')ws.close(1013,'Slow connection');return;}ws.send(JSON.stringify(data));};
 const broadcast=(r:Room,msg:any)=>r.players.forEach(p=>send(p.ws,msg));
 const roster=(r:Room)=>({type:'roster',owner:r.owner,locked:r.locked,generation:r.generation,players:[...r.players.values()].map(p=>({id:p.id,name:p.name,appearance:p.appearance,connected:!!p.ws}))});
 const remove=(r:Room,p:Player)=>{r.players.delete(p.id);for(const [id,piece]of r.builds)if(piece.owner===p.id){r.builds.delete(id);broadcast(r,{type:'build',generation:r.generation,action:'delete',id});}if(r.owner===p.id)r.owner=[...r.players.values()].find(x=>x.ws)?.id??[...r.players.keys()][0]??'';if(!r.players.size)rooms.delete(r.code);else broadcast(r,roster(r));};
 wss.on('connection',(ws,req)=>{
  if(!origins.includes(req.headers.origin??'')||wss.clients.size>128){ws.close(1008,'Connection unavailable');return;}
  const ip=req.socket.remoteAddress??'unknown';let room:Room|null=null,player:Player|null=null,windowAt=Date.now(),messages=0,chatAt=0;
  const authTimeout=setTimeout(()=>{if(!player)ws.close(1008,'Join timeout');},10000);
  const error=(message:string)=>send(ws,{type:'error',message});
  ws.on('message',raw=>{try{
   const now=Date.now();if(now-windowAt>1000){windowAt=now;messages=0;}if(++messages>50){ws.close(1008,'Rate limit');return;}
   const m=JSON.parse(raw.toString());if(!m||typeof m.type!=='string')return;
   if(!player){
    let rate=attempts.get(ip);if(!rate||now-rate.at>60000){rate={at:now,n:0};attempts.set(ip,rate);}if(++rate.n>12){error('Too many attempts. Try again shortly.');return;}
    if(m.protocol!==PROTOCOL||m.content!==CONTENT||!/^([a-f0-9]{64})$/.test(m.mapRevision??'')){error('Incompatible game build. Refresh both clients.');return;}
    if(m.type==='resume'){
     room=rooms.get(m.code)??null;player=room?[...room.players.values()].find(p=>p.secret===m.secret&&p.expiry>now)??null:null;
     if(!room||!player){player=null;error('Reconnect expired. Join again.');return;}player.ws?.close(4001,'Replaced');player.ws=ws;player.expiry=Infinity;
    }else{
     const name=typeof m.name==='string'?m.name.trim():'';const looks=appearance(m.appearance);if(!/^[\p{L}\p{N} _-]{1,24}$/u.test(name)||!looks){error('Check your guest name or equipment.');return;}
     if(m.type==='create'){if(rooms.size>=32){error('Server full');return;}room={map:'outdoor',mapRevision:m.mapRevision,code:token(),owner:'',locked:false,generation:randomUUID(),players:new Map(),builds:new Map()};rooms.set(room.code,room);}else if(m.type==='join')room=rooms.get(m.code)??null;else return;
     if(!room||(room.map==='outdoor'&&room.mapRevision!==m.mapRevision)||room.locked){error('Room unavailable or locked.');return;}
     if(room.players.size>=capacity){error('Lobby full.');return;}
     player={id:randomUUID(),name,secret:token(),ws,appearance:looks,pose:null,seq:-1,expiry:Infinity};room.players.set(player.id,player);if(!room.owner)room.owner=player.id;
    }
    player.ready=(room.map??'outdoor')==='outdoor';player.loadDeadline=Date.now()+30000;
    send(ws,{type:'welcome',id:player.id,secret:player.secret,code:room.code,map:room.map??'outdoor',mapRevision:room.mapRevision,generation:room.generation,protocol:PROTOCOL});broadcast(room,roster(room));return;
   }
   if(!room||player.ws!==ws)return;
   if(m.type==='map'){
    if(room.owner!==player.id){error('Room owner required');return;}
    if(!['outdoor','techno_gravity','b_hill','church','warehouse'].includes(m.map)||!/^([a-f0-9]{64})$/.test(m.mapRevision??'')){error('Unsupported room destination');return;}
    room.map=m.map;room.mapRevision=m.mapRevision;room.generation=randomUUID();room.builds.clear();
    for(const p of room.players.values()){p.pose=null;p.ready=false;p.loadDeadline=Date.now()+30000;p.seq=-1;}
    broadcast(room,{type:'map',map:room.map,mapRevision:room.mapRevision,generation:room.generation});return;
   }
   if(m.type==='ready'){
    if(m.generation!==room.generation)return;
    if(m.mapRevision!==room.mapRevision){error('Map content differs. Leave and refresh before rejoining.');return;}
    player.ready=true;send(ws,{type:'ready',generation:room.generation});if(room.map==='warehouse')send(ws,{type:'builds',generation:room.generation,pieces:[...room.builds.values()]});broadcast(room,roster(room));return;
   }
   if(m.type==='leave'){remove(room,player);player=null;room=null;ws.close();return;}
   if(m.type==='chat'){if(now-chatAt<800)return;chatAt=now;if(typeof m.message==='string'&&m.message.trim()&&m.message.length<=120)broadcast(room,{type:'chat',id:player.id,message:m.message.trim(),event:randomUUID()});return;}
   if(m.type==='lock'||m.type==='kick'){if(room.owner!==player.id){error('Room owner required');return;}if(m.type==='lock')room.locked=!!m.locked;else{const target=room.players.get(m.id);if(target&&target!==player){remove(room,target);target.ws?.close(4003,'Removed from room');}}broadcast(room,roster(room));return;}
   if(m.generation!==room.generation)return;
   if(m.type==='build'){
    if(room.map!=='warehouse'||player.ready!==true){error('Builds require a ready Warehouse room.');return;}
    if(m.action==='clear'){for(const [id,piece]of room.builds)if(piece.owner===player.id)room.builds.delete(id);broadcast(room,{type:'builds',generation:room.generation,pieces:[...room.builds.values()]});return;}
    if(m.action==='delete'||m.action==='move'){
     const piece=room.builds.get(m.id);if(!piece||piece.owner!==player.id){error('Only your own build can be changed.');return;}
     if(m.action==='delete'){room.builds.delete(piece.id);broadcast(room,{type:'build',generation:room.generation,action:'delete',id:piece.id});return;}
    }
    if(m.action!=='create'&&m.action!=='move')return;
    const asset=m.action==='create'?buildAsset(m.asset):buildAsset(room.builds.get(m.id)!.asset);
    if(!asset||![m.x,m.z,m.rotation].every((n:any)=>typeof n==='number'&&Number.isFinite(n))||Math.abs(m.rotation)>100000){error('Invalid build piece.');return;}
    const c=Math.abs(Math.cos(m.rotation)),s=Math.abs(Math.sin(m.rotation));
    if(Math.abs(m.x)+(asset.width*c+asset.length*s)/2>BUILD_BOUNDS.x||Math.abs(m.z)+(asset.width*s+asset.length*c)/2>BUILD_BOUNDS.z){error('Build is outside the Warehouse.');return;}
    if(m.action==='create'&&(room.builds.size>=BUILD_LIMITS.pieces||[...room.builds.values()].reduce((sum,p)=>sum+(buildAsset(p.asset)?.cost??0),0)+asset.cost>BUILD_LIMITS.budget)){error('Room build limit reached.');return;}
    const piece:BuildPiece={id:m.action==='create'?randomUUID():m.id,owner:player.id,asset:asset.id,x:m.x,z:m.z,rotation:m.rotation};room.builds.set(piece.id,piece);
    broadcast(room,{type:'build',generation:room.generation,action:'upsert',piece});return;
   }
   if(m.type==='appearance'){const a=appearance(m.appearance);if(a){player.appearance=a;broadcast(room,roster(room));}return;}
   if(m.type==='pose'&&player.ready!==false&&Number.isSafeInteger(m.seq)&&m.seq>player.seq){const state=pose(m.pose);if(state){player.seq=m.seq;player.pose=state;}}
  }catch{error('Invalid message');}});
  ws.on('close',()=>{clearTimeout(authTimeout);if(player&&room&&player.ws===ws){player.ws=null;player.expiry=Date.now()+grace;broadcast(room,roster(room));}});
 });
 const tick=setInterval(()=>{const now=Date.now();for(const r of rooms.values()){
  for(const p of r.players.values())if(p.expiry<now||(p.ready===false&&(p.loadDeadline??Infinity)<now)){p.ws?.close(4003,'Map loading timed out');remove(r,p);}
  if(r.players.size)broadcast(r,{type:'snapshot',generation:r.generation,time:performance.now(),players:[...r.players.values()].filter(p=>p.pose&&p.ws).map(p=>({id:p.id,seq:p.seq,pose:p.pose}))});
 }for(const [ip,b]of attempts)if(now-b.at>60000)attempts.delete(ip);},50);
 const alive=new WeakSet<WebSocket>();wss.on('connection',ws=>{alive.add(ws);ws.on('pong',()=>alive.add(ws));});
 const heartbeat=setInterval(()=>{for(const ws of wss.clients){if(!alive.has(ws)){ws.terminate();continue;}alive.delete(ws);ws.ping();}},15000);
 server.listen(port,host);
 const close=()=>{clearInterval(tick);clearInterval(heartbeat);for(const ws of wss.clients){ws.close(1001,'Server stopping');const timeout=setTimeout(()=>ws.terminate(),1500);timeout.unref();}wss.close();server.close();};
 return {server,rooms,close};
}
