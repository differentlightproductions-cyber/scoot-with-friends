import {Vector3} from 'three';
import {PlayfulRules, THROW_STRENGTH, shoveStrength, type PlayfulContact, type PlayfulHit, type PlayfulTarget, type ThrowableKind} from '../src/social/playful';

type Rider = {id:string;friendId:string;pose:any;ready?:boolean;ws:unknown};
const vector = (v:unknown, limit:number):v is [number,number,number] => Array.isArray(v)&&v.length===3&&v.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=limit);
/** Server owns contact decisions. Rider positions remain client-reported, as in free ride. */
export class RoomPlayful {
  private rules = new Map<string,PlayfulRules>();
  private lastThrow = new Map<string,number>();
  private lastShove = new Map<string,number>();
  private throws:{source:string;item:ThrowableKind;position:Vector3;velocity:Vector3;age:number}[]=[];
  private clock=0;
  constructor(private friends:(a:string,b:string)=>boolean,private emit:(event:any)=>void){}
  join(id:string){if(!this.rules.has(id)){const r=new PlayfulRules();r.contact='off';r.spawned(id);this.rules.set(id,r);}}
  remove(id:string){this.rules.delete(id);this.lastThrow.delete(id);for(const key of this.lastShove.keys())if(key.startsWith(id+'>')||key.endsWith('>'+id))this.lastShove.delete(key);this.throws=this.throws.filter(t=>t.source!==id);}
  spawned(id:string){this.rules.get(id)?.spawned(id);}
  contact(id:string,value:unknown){if(['full','friends','off'].includes(value as string))this.rules.get(id)!.contact=value as PlayfulContact;}
  private target(p:Rider):PlayfulTarget|null {
    return p.ws&&p.ready!==false&&p.pose&&p.pose.state!=='Bail'?{id:p.id,kind:'local',position:new Vector3(...p.pose.position as [number,number,number]),radius:.4,height:1.75,receive:()=>true}:null;
  }
  private hit(source:Rider,target:Rider,hit:PlayfulHit){
    const t=this.target(target),r=this.rules.get(target.id);if(!t||!r)return;
    const strength=r.allow(t,hit,!!source.friendId&&!!target.friendId&&this.friends(source.friendId,target.friendId));
    if(!strength)return;r.landed(t,strength);
    this.emit({type:hit.kind==='shove'?'ShoveRequest':'ItemImpact',source:source.id,target:target.id,item:hit.item,strength,from:hit.from.toArray(),direction:hit.direction.toArray()});
  }
  request(source:Rider,event:any,players:Map<string,Rider>){
    const self=this.target(source);if(!self||!source.pose.walking||!source.pose.grounded||source.pose.swim||!event)return;
    if(event.type==='ThrowItem'){
      if(!Object.hasOwn(THROW_STRENGTH,event.item)||!vector(event.from,100000)||!vector(event.velocity,24)||this.clock-(this.lastThrow.get(source.id)??-10)<.45)return;
      const from=new Vector3(...event.from),velocity=new Vector3(...event.velocity);
      if(from.distanceTo(self.position)>2||velocity.length()>24)return;
      this.lastThrow.set(source.id,this.clock);this.throws.push({source:source.id,item:event.item,position:from,velocity,age:0});
      this.emit({type:'ThrowItem',source:source.id,item:event.item,from:event.from,velocity:event.velocity});
    }else if(event.type==='ShoveRequest'){
      const other=players.get(event.target),target=other&&this.target(other);if(!other||!target||other.id===source.id||self.position.distanceTo(target.position)>1.8)return;
      const direction=target.position.clone().sub(self.position).setY(0).normalize();
      if(direction.dot(new Vector3(Math.sin(source.pose.yaw),0,Math.cos(source.pose.yaw)))<.2)return;
      const key=source.id+'>'+other.id;if(this.clock-(this.lastShove.get(key)??-10)<PlayfulRules.SHOVE_COOLDOWN)return;this.lastShove.set(key,this.clock);
      this.hit(source,other,{kind:'shove',source:source.id,from:self.position,direction,strength:shoveStrength(Math.abs(source.pose.speed))});
    }
  }
  update(dt:number,players:Map<string,Rider>){
    this.clock+=dt;for(const r of this.rules.values())r.update(dt);
    for(const t of this.throws){
      t.age+=dt;const source=players.get(t.source);if(!source?.ws){t.age=5;continue;}
      // Small substeps avoid tunnelling through a rider between server ticks.
      for(let remaining=dt;remaining>0&&t.age<4;){const step=Math.min(remaining,.01);remaining-=step;t.velocity.y-=9.81*step;t.position.addScaledVector(t.velocity,step);
        for(const p of players.values()){const target=this.target(p);if(p.id===t.source||!target)continue;const up=t.position.y-target.position.y;
          if(up>0&&up<1.85&&Math.hypot(t.position.x-target.position.x,t.position.z-target.position.z)<.48){this.hit(source,p,{kind:'throw',source:t.source,item:t.item,from:t.position.clone(),direction:t.velocity.clone().setY(0).normalize(),strength:THROW_STRENGTH[t.item]});t.age=5;break;}
        }
      }
    }
    this.throws=this.throws.filter(t=>t.age<4);
  }
}
