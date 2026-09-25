import {WebSocket, WebSocketServer} from 'ws';
import type {Server} from 'node:http';
export {createRooms} from './rooms';

export const LAN_ORIGIN='http://swf-lan.local';
export function privateAddress(value:string){
 const parts=value.trim().split('.');
 if(parts.length!==4||parts.some(p=>!/^\d{1,3}$/.test(p)||Number(p)>255))throw Error('Enter the host PC IPv4 address, for example 192.168.1.25.');
 const [a,b]=parts.map(Number);
 if(!(a===10||a===192&&b===168||a===172&&b>=16&&b<=31||a===127||a===169&&b===254))throw Error('Use a local network address, not an internet address.');
 return parts.map(Number).join('.');
}

// The page stays on localhost (a secure browser context). Only Node connects
// across the LAN; no browser security flags or certificates are required.
export function attachLanRelay(server:Server,target:string,roomPort=8787){
 const host=privateAddress(target);
 const relay=new WebSocketServer({noServer:true,maxPayload:16384,perMessageDeflate:false});
 const upstreams=new Set<WebSocket>();
 server.on('upgrade',(req,socket,head)=>{
  const port=(server.address() as any)?.port;
  const allowed=[`http://127.0.0.1:${port}`,`http://localhost:${port}`];
  if(req.url!=='/lan-room'||!allowed.includes(req.headers.origin??'')||!allowed.includes('http://'+req.headers.host)||relay.clients.size>=8){socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;}
  relay.handleUpgrade(req,socket,head,client=>{
   const upstream=new WebSocket(`ws://${host}:${roomPort}`,{origin:LAN_ORIGIN,maxPayload:262144,handshakeTimeout:5000,perMessageDeflate:false});
   upstreams.add(upstream);
   // A browser sends its join immediately. Hold only a small bounded handshake
   // queue until the upstream socket is ready, never an unbounded pose backlog.
   const pending:string[]=[];let bytes=0;
   client.on('message',(data,binary)=>{
    if(binary){client.close(1003,'Text messages required');return;}
    const text=data.toString();
    if(upstream.readyState===WebSocket.CONNECTING){bytes+=Buffer.byteLength(text);if(bytes>32768){client.close(1009,'Join queue full');upstream.terminate();}else pending.push(text);return;}
    if(upstream.readyState===WebSocket.OPEN){if(upstream.bufferedAmount>65536){client.close(1013,'Connection too slow');return;}upstream.send(text);}
   });
   upstream.on('open',()=>{if(client.readyState!==WebSocket.OPEN){upstream.close();return;}for(const text of pending)upstream.send(text);pending.length=0;});
   upstream.on('message',(data,binary)=>{if(client.readyState===WebSocket.OPEN){if(client.bufferedAmount>262144){client.close(1013,'Connection too slow');return;}client.send(data,{binary});}});
   upstream.on('error',()=>client.close(1013,'LAN host unavailable'));
   upstream.on('close',(code,reason)=>{upstreams.delete(upstream);if(client.readyState===WebSocket.OPEN)client.close(code===1005||code===1006?1013:code,reason.toString().slice(0,100));});
   client.on('error',()=>upstream.terminate());
   client.on('close',()=>upstream.terminate());
  });
 });
 return ()=>{for(const socket of upstreams)socket.terminate();for(const socket of relay.clients)socket.terminate();relay.close();};
}
