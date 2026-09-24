const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const root=path.join(__dirname,'game');const publicOrigin='https://scoot-with-friends.nicsoundcloud22.chatgpt.site';
// Play on Phone: also serve the game to phones and tablets on the home network (never the owner tools).
const phone=process.env.SWF_PHONE==='1';if(phone)delete process.env.SWF_ADMIN;
const lanAddresses=()=>{const out=[];for(const list of Object.values(require('node:os').networkInterfaces()))for(const e of list??[])if(e.family==='IPv4'&&!e.internal&&/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(e.address))out.push(e.address);return out;};
let owner=null;try{if(process.env.SWF_ADMIN==='1'&&!phone)owner=JSON.parse(fs.readFileSync(path.join(__dirname,'owner-private.json'),'utf8'));}catch{}
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.wasm':'application/wasm','.json':'application/json','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.woff':'font/woff','.mp3':'audio/mpeg'};
const server=http.createServer(async(req,res)=>{
 const localOrigin='http://127.0.0.1:'+server.address().port;
 const port=server.address().port,local=req.headers.host==='127.0.0.1:'+port||req.headers.host==='localhost:'+port;
 // Only this PC's own names (and, for Play on Phone, its private network addresses) are served.
 if(!local&&!(phone&&lanAddresses().some(a=>req.headers.host===a+':'+port))){res.writeHead(403).end();return;}
 const pathname=new URL(req.url,localOrigin).pathname;
 const json=(value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify(value));};
 if(pathname==='/local-admin'){json({enabled:!!owner});return;}
 if(phone&&local&&pathname==='/phone'){const {qrSvg}=require('./qr.cjs'),urls=lanAddresses().map(a=>'http://'+a+':'+port+'/');res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(phonePage(urls,qrSvg));return;}
 if(process.env.SWF_LAN_HOST&&pathname==='/api/public-park'){json({layout:null,revision:null,offline:true});return;}
 if(pathname==='/api/public-park'&&req.method==='GET'){try{const r=await fetch(publicOrigin+pathname,{signal:AbortSignal.timeout(4000)});if(!r.ok)throw Error();json(await r.json());}catch{json({layout:null,revision:null,offline:true});}return;}
 if(pathname==='/local-publish'&&req.method==='POST'){
  if(!owner||!['http://127.0.0.1:'+server.address().port,'http://localhost:'+server.address().port].includes(req.headers.origin)||req.headers['content-type']!=='application/json'){json({error:'Owner launcher required.'},403);return;}
  let body='',size=0;for await(const chunk of req){size+=chunk.length;if(size>2000000){json({error:'Park is too large.'},413);req.destroy();return;}body+=chunk;}
  try{JSON.parse(body);const r=await fetch(publicOrigin+'/api/public-park',{method:'PUT',headers:{'content-type':'application/json',authorization:'Bearer '+owner.publishKey},body,signal:AbortSignal.timeout(20000)});const result=await r.json();json(result,r.status);}catch{json({error:'Could not reach the public game. Your local park is still saved.'},503);}return;
 }
 let file;try{file=path.resolve(root,'.'+decodeURIComponent(pathname));}catch{res.writeHead(400).end();return;}
 if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 if(file===root)file=path.join(root,'index.html');
 if(process.env.SWF_LAN_HOST&&file===path.join(root,'index.html')){res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});res.end(fs.readFileSync(file,'utf8').replace('<head>','<head><script>window.__SWF_LAN__=true;</script>'));return;}
 fs.stat(file,(error,stat)=>{if(error||!stat.isFile()){res.writeHead(404).end('Not found');return;}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});fs.createReadStream(file).pipe(res);});
});
const closeLan=process.env.SWF_LAN_HOST?require('./lan-runtime.cjs').attachLanRelay(server,process.env.SWF_LAN_HOST):()=>{};
process.on('SIGINT',closeLan);process.on('SIGTERM',()=>{closeLan();server.close();});
const bind=phone?'0.0.0.0':'127.0.0.1';
let port=owner?5199:5188;server.on('error',e=>{if(e.code==='EADDRINUSE'&&port<5220)server.listen(++port,bind);else{console.error('Unable to start the game:',e.message);process.exitCode=1;}});
server.on('listening',()=>{const url='http://127.0.0.1:'+server.address().port;
 if(phone){const urls=lanAddresses().map(a=>'http://'+a+':'+server.address().port+'/');
  console.log('\nScoot with Friends — Play on Phone\n');
  if(!urls.length)console.log('No home-network connection found. Connect this PC to your Wi-Fi or router, then run Play on Phone again.\n');
  else{console.log('On your phone (same Wi-Fi), scan this code with the camera or type the address:\n');try{console.log(require('./qr.cjs').qrTerminal(urls[0]));}catch{}console.log('\n  '+urls.join('\n  ')+'\n');}
  console.log('Allow Node on your PRIVATE network if Windows asks. This PC can play too: '+url+'\nKeep this window open while playing. Close it to stop.\n');
  if(!process.env.SWF_NO_OPEN)spawn('cmd.exe',['/c','start','',url+'/phone'],{windowsHide:true});return;}
 console.log('\nScoot with Friends'+(owner?' — Owner Edition':'')+'\n\nOpening '+url+'\nKeep this window open while playing. Close it to stop.\n');if(!process.env.SWF_NO_OPEN)spawn('cmd.exe',['/c','start','',url],{windowsHide:true});});
function phonePage(urls,qrSvg){const esc=s=>s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);
 return '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Play on Phone</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#15161a;color:#f4f1e8;font:600 16px system-ui,sans-serif}main{display:grid;gap:14px;justify-items:center;padding:28px;border:3px solid #0b0c0d;border-radius:18px;background:#202327;box-shadow:8px 8px 0 #ff5a1f;max-width:560px;text-align:center}h1{margin:0;font:900 34px Impact,sans-serif;letter-spacing:1px;color:#c6ff00}.qr{background:#fff;padding:10px;border-radius:10px}.qr svg{display:block;width:min(70vw,340px);height:auto}code{font-size:20px;color:#1ecbe1}p{margin:0;color:#c9d2dc;line-height:1.5}a{color:#c6ff00}</style><main><h1>PLAY ON PHONE</h1>'+(urls.length?'<p>Phone and PC on the same Wi-Fi. Open the camera and scan:</p><div class="qr">'+qrSvg(urls[0],8)+'</div>'+urls.map(u=>'<code>'+esc(u)+'</code>').join('')+'<p>Touch controls appear on the phone. Turn it sideways and tap Enable Game.<br>If it does not load, allow Node on your PRIVATE network in Windows Firewall, and check the router does not isolate Wi-Fi clients.</p>':'<p>No home-network connection found. Connect this PC to Wi-Fi or Ethernet and run Play on Phone again.</p>')+'<p><a href="/">Play on this PC too</a></p></main>';}
server.listen(port,bind);process.on('SIGINT',()=>server.close(()=>process.exit()));
