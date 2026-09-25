import {Vector3} from 'three';
import type {FreeRide} from './client';
import type {WithFriends} from '../social/friends';
import type {LocalProfile} from '../data/loadout';
import type {Simulation} from '../physics/simulation';

/** Thin adapter: reuse the local props/targets; room events never enter NPC logic. */
export function networkPlayful(network:FreeRide,getPlayful:()=>WithFriends|null,profile:LocalProfile,sim:()=>Simulation){
  let contact='';
  network.onPlayful=e=>{
    const f=getPlayful();if(!f||!e)return;
    if(e.type==='ThrowItem'){
      if(e.source!==network.id)f.networkThrow(e.item,e.source,e.from,e.velocity);
    }else if(e.target===network.id&&(e.type==='ItemImpact'||e.type==='ShoveRequest')){
      f.local.receive({kind:e.type==='ItemImpact'?'throw':'shove',item:e.item,source:e.source,strength:e.strength,from:new Vector3(...e.from),direction:new Vector3(...e.direction)});
      // Existing reaction pose is replicated by the usual rider snapshot.
      if(e.strength!=='cosmetic'&&sim().walking&&!sim().emote)sim().emote={id:'shrug',time:0,duration:.6};
    }
  };
  return ()=>{
    const f=getPlayful();if(!f)return;
    const connected=network.status==='Connected';
    const next=connected?network.generation+profile.settings.playfulContact:'';
    if(next&&next!==contact)network.send({type:'playful-contact',generation:network.generation,contact:profile.settings.playfulContact});contact=next;
    f.onNetworkEvent=event=>{if(connected)network.send({type:'playful',generation:network.generation,event});};
    f.remotes=connected?[...network.remotes].filter(([,r])=>r.samples.length&&performance.now()-r.samples.at(-1)!.at<1000).map(([id,r])=>({id,kind:'remote' as const,position:r.model.root.position,radius:.4,height:1.75,receive:()=>false})):[];
  };
}
