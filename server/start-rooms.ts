import {createRooms} from './rooms';
const port=Number(process.env.ROOM_PORT??process.env.PORT??8787);
if(!Number.isInteger(port)||port<1||port>65535)throw Error('ROOM_PORT or PORT must be a valid TCP port.');
const service=createRooms({port,host:process.env.ROOM_HOST??'127.0.0.1',capacity:Number(process.env.ROOM_CAPACITY??8),origins:(process.env.ROOM_ORIGINS??'http://127.0.0.1:5182,http://localhost:5182').split(',')});
service.server.on('listening',()=>console.log('Private room service ready. /health available.'));
process.on('SIGINT',service.close);process.on('SIGTERM',service.close);
