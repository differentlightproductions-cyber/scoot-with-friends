import {build} from 'esbuild';
await build({entryPoints:['server/start-rooms.ts'],outfile:'dist/rooms/start.mjs',bundle:true,platform:'node',target:'node22',format:'esm',packages:'external'});
