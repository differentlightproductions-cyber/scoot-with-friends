const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const root=path.join(__dirname,'game');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.wasm':'application/wasm','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.woff':'font/woff','.mp3':'audio/mpeg'};
const server=http.createServer((req,res)=>{let file;try{file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));}catch{res.writeHead(400).end();return;}
 if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 if(file===root)file=path.join(root,'index.html');
 fs.stat(file,(error,stat)=>{if(error||!stat.isFile()){res.writeHead(404).end('Not found');return;}
 res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});fs.createReadStream(file).pipe(res);});
});
let port=5188;server.on('error',e=>{if(e.code==='EADDRINUSE'&&port<5200)server.listen(++port,'127.0.0.1');else{console.error('Unable to start the game:',e.message);process.exitCode=1;}});
server.on('listening',()=>{const url='http://127.0.0.1:'+server.address().port;console.log('\nScoot with Friends\n\nOpening '+url+'\nKeep this window open while playing. Close it to stop.\n');if(!process.env.SWF_NO_OPEN)spawn('cmd.exe',['/c','start','',url],{windowsHide:true});});
server.listen(port,'127.0.0.1');process.on('SIGINT',()=>server.close(()=>process.exit()));
