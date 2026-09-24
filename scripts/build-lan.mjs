import {build} from 'esbuild';
await build({entryPoints:['server/lan.ts'],outfile:'dist/lan/lan-runtime.cjs',bundle:true,platform:'node',target:'node22',format:'cjs',external:['bufferutil','utf-8-validate']});
