import * as THREE from "three";
import { emptyInput, type InputFrame } from "../input/input";
import type { Simulation } from "../physics/simulation";
import type { Events } from "../core/events";
export const EMOTES = [
  {id:"wave",label:"Wave",duration:2.4}, {id:"nod",label:"Nod",duration:1.6},
  {id:"shake",label:"Shake head",duration:1.6}, {id:"point",label:"Point",duration:2},
  {id:"clap",label:"Clap",duration:2.6}, {id:"celebrate",label:"Celebrate",duration:2.5},
  {id:"sit",label:"Sit",duration:8}, {id:"laugh",label:"Laugh",duration:2.5},
  {id:"facepalm",label:"Facepalm",duration:2.4}, {id:"cheer",label:"Cheer",duration:2.2},
  {id:"shrug",label:"Shrug",duration:1.8},
].map(e => ({...e, looping:false, interruptible:true, multiplayerEvent:"playerEmote"}));
/**
 * On-foot social layer: emotes (started from the phone's EMOTES app), local
 * chat (hold D-pad Right, or MESSAGES on the phone) and the speech bubble.
 * The old radial quick wheel is retired; its functions live in the phone apps.
 */
export class SocialControls {
  chat = document.createElement("form");
  field = document.createElement("input");
  bubble = document.createElement("div");
  nameplate = document.createElement("div");
  private right = 0;
  private chatArmed = true;
  private bubbleAge = 0;
  constructor(private events: Events) {
    this.chat.id="social-chat";this.chat.hidden=true;
    this.field.maxLength=120;this.field.placeholder="Say something…";this.field.setAttribute("aria-label","Chat message");
    const help=document.createElement("small");help.textContent="CHAT · ENTER SENDS · ESC CANCELS";
    this.chat.append(this.field,help);
    this.chat.addEventListener("submit", e=>{e.preventDefault();this.send(this.field.value);});
    this.field.addEventListener("keydown", e=>{e.stopPropagation();if(e.key==="Escape"){e.preventDefault();this.closeChat();}});
    this.bubble.id="player-bubble";this.bubble.hidden=true;
    this.nameplate.id="player-nameplate";this.nameplate.hidden=true;
    document.body.append(this.chat,this.bubble,this.nameplate);
  }
  openChat(){this.chat.hidden=false;this.field.focus();}
  send(message:string) {
    const text=message.trim().slice(0,120);
    if(text) {
      this.bubble.textContent=text;this.bubbleAge=5;
      this.events.emit({type:"playerChat",playerId:"local",message:text,timestamp:Date.now()});
    }
    this.closeChat();
  }
  closeChat(){this.chat.hidden=true;this.field.blur();this.field.value="";}
  perform(id:string,s:Simulation){
    const e=EMOTES.find(e=>e.id===id);if(!e||!s.walking)return;
    s.running=false;s.emote={id,time:0,duration:e.duration};
    this.events.emit({type:"playerEmote",playerId:"local",emoteId:id,timestamp:Date.now()});
  }
  update(s:Simulation,f:InputFrame,dt:number,enabled=true):InputFrame {

    this.bubbleAge=Math.max(0,this.bubbleAge-dt);
    if(s.emote){s.emote.time+=dt;
      if(!s.walking || !s.grounded || f.pressed.sprint || f.pressed.hop || f.pressed.body ||
        Math.hypot(f.steer,f.lean)>.2 || s.emote.time>s.emote.duration || s.state==="Bail")s.emote=null;}
    if(!this.chat.hidden){if(f.pressed.brakeBars)this.closeChat();return emptyInput();}
    if(!enabled||!s.walking||s.sitting){this.right=0;return f;}
    this.right=f.held.menuRight>.5?this.right+dt:0;
    if(f.held.menuRight<.5)this.chatArmed=true;
    if(this.right>.2&&this.chatArmed){this.openChat();this.chatArmed=false;return emptyInput();}
    return f;
  }
  render(head:THREE.Vector3,camera:THREE.Camera,visible:boolean){
    const p=head.clone().add(new THREE.Vector3(0,.35,0)).project(camera);
    this.bubble.hidden=!visible||this.bubbleAge<=0||p.z>1||p.z< -1;
    this.bubble.style.left=`${(p.x*.5+.5)*innerWidth}px`;
    this.bubble.style.top=`${(-p.y*.5+.5)*innerHeight}px`;
    this.bubble.style.opacity=String(Math.min(1,this.bubbleAge));
    this.nameplate.style.left=this.bubble.style.left;this.nameplate.style.top=this.bubble.style.top;
  }
}
