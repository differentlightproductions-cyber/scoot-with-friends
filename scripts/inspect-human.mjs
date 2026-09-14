import {readFileSync} from 'node:fs';
const root='assets-source/humans/',p=[],faces=[];let group='';const groups={};
for(const line of readFileSync(root+'base.obj','utf8').split(/\r?\n/)){const a=line.split(/\s+/);if(a[0]==='v')p.push(a.slice(1).map(Number));if(a[0]==='g')group=a[1];if(a[0]==='f'){(groups[group]??=[]).push(...a.slice(1).map(s=>Number(s.split('/')[0])-1));}}
const rig=JSON.parse(readFileSync(root+'default.mhskel'));
const avg=ids=>ids.reduce((a,i)=>a.map((n,k)=>n+p[i][k]/ids.length),[0,0,0]);
console.log('body',groups.body.length,'bounds',...[0,1,2].map(k=>[Math.min(...groups.body.map(i=>p[i][k])),Math.max(...groups.body.map(i=>p[i][k]))]));
for(const n of ['root','head','spine01','spine02','spine04','neck01','upperarm01.L','upperarm02.L','lowerarm01.L','lowerarm02.L','wrist.L','upperleg01.L','upperleg02.L','lowerleg01.L','lowerleg02.L','foot.L','eye.L','oculi01.L']){const b=rig.bones[n];console.log(n,avg(rig.joints[b.head]),avg(rig.joints[b.tail]));}
