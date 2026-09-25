const {createInterface}=require('node:readline/promises');
const {networkInterfaces}=require('node:os');
const {once}=require('node:events');
const {createRooms,privateAddress,LAN_ORIGIN}=require('./lan-runtime.cjs');
async function main(){
 const hosting=process.argv[2]==='host';
 let service;
 if(hosting){
  service=createRooms({host:'0.0.0.0',port:8787,capacity:8,origins:[LAN_ORIGIN]});
  await once(service.server,'listening');
  process.on('SIGINT',service.close);process.on('SIGTERM',service.close);
  process.env.SWF_LAN_HOST='127.0.0.1';
  console.log('\nLAN host ready (up to 8 players). Give your friends one of these local addresses:');
  for(const entries of Object.values(networkInterfaces()))for(const entry of entries??[])if(entry.family==='IPv4'&&!entry.internal){try{console.log('  '+privateAddress(entry.address));}catch{}}
  console.log('\nAllow Node through Windows Firewall on your PRIVATE network if asked.\nIn the game: Play > Private Free-ride > Create Private Room.\nCopy the room code to your friend. Keep this window open.');
 }else{
  const prompt=createInterface({input:process.stdin,output:process.stdout});
  try{process.env.SWF_LAN_HOST=privateAddress(await prompt.question('Host PC local IPv4 address: '));}finally{prompt.close();}
  try{const response=await fetch(`http://${process.env.SWF_LAN_HOST}:8787/health`,{signal:AbortSignal.timeout(5000)});if(!response.ok||!(await response.json()).ok)throw Error();}
  catch{throw Error('Cannot reach the host. Check the address, Host LAN window, private-network firewall permission, and Wi-Fi client isolation.');}
  console.log('\nLAN host found. In the game: Play > Private Free-ride > Join Room.\nPaste the room code supplied by your friend. Keep this window open.');
 }
 // Never expose owner publishing privileges through a LAN launcher.
 delete process.env.SWF_ADMIN;
 require('./server.cjs');
}
main().catch(error=>{console.error('\nLAN could not start: '+error.message);process.exitCode=1;});
