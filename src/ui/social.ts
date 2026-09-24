import * as THREE from "three";
import { emptyInput, type InputFrame } from "../input/input";
import type { Simulation } from "../physics/simulation";
import type { Events } from "../core/events";
/** Which hand a one-hand emote uses: the one not holding the phone, a fixed side, or either. */
export type EmoteHand = "oppositePhone" | "left" | "right" | "either";
/**
 * The canonical emotes. `hands`: "none" moves only the head, "one" a single
 * hand, "two" both hands or the whole body. Emotes that leave a hand free are
 * `phoneCompatible`: they play with the phone still out, on `preferredHand`;
 * the rest put the phone away first.
 */
export const EMOTES = ([
  {id:"wave",label:"Wave",duration:2.4,hands:"one",preferredHand:"oppositePhone"}, {id:"nod",label:"Nod",duration:1.6,hands:"none",preferredHand:"either"},
  {id:"shake",label:"Shake head",duration:1.6,hands:"none",preferredHand:"either"}, {id:"point",label:"Point",duration:2,hands:"one",preferredHand:"oppositePhone"},
  {id:"clap",label:"Clap",duration:2.6,hands:"two",preferredHand:"either"}, {id:"celebrate",label:"Celebrate",duration:2.5,hands:"two",preferredHand:"either"},
  {id:"sit",label:"Sit",duration:8,hands:"two",preferredHand:"either"}, {id:"laugh",label:"Laugh",duration:2.5,hands:"two",preferredHand:"either"},
  {id:"facepalm",label:"Facepalm",duration:2.4,hands:"one",preferredHand:"oppositePhone"}, {id:"cheer",label:"Cheer",duration:2.2,hands:"one",preferredHand:"oppositePhone"},
  {id:"shrug",label:"Shrug",duration:1.8,hands:"two",preferredHand:"either"},
] as const).map(e => ({...e, preferredHand:e.preferredHand as EmoteHand, phoneCompatible:e.hands!=="two", looping:false, interruptible:true, multiplayerEvent:"playerEmote"}));
/** The hand index (0 right, 1 left, as the rider model counts them) an emote plays on, given the phone hand. */
export function emoteHand(id:string, phoneHand:0|1):0|1{
  const e=EMOTES.find(e=>e.id===id);
  if(!e||e.preferredHand==="either")return 0;
  if(e.preferredHand==="right")return 0;
  if(e.preferredHand==="left")return 1;
  return phoneHand===0?1:0;
}
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
  perform(id:string,s:Simulation,phoneHand:0|1=0){
    const e=EMOTES.find(e=>e.id===id);if(!e||!s.walking)return;
    s.running=false;s.emote={id,time:0,duration:e.duration,hand:emoteHand(id,phoneHand)};
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
