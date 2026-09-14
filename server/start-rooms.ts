import {createRooms} from './rooms';
const service=createRooms({port:Number(process.env.ROOM_PORT??8787),host:process.env.ROOM_HOST??'127.0.0.1',capacity:Number(process.env.ROOM_CAPACITY??2),origins:(process.env.ROOM_ORIGINS??'http://127.0.0.1:5182,http://localhost:5182').split(',')});
service.server.on('listening',()=>console.log('Private room service ready. /health available.'));
process.on('SIGINT',service.close);process.on('SIGTERM',service.close);
