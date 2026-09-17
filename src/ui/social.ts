import * as THREE from "three";
import { emptyInput, type InputFrame } from "../input/input";
import type { Simulation } from "../physics/simulation";
import type { Events } from "../core/events";
export const EMOTES = [
  {id:"wave",label:"Wave",duration:2.4}, {id:"nod",label:"Nod",duration:1.6},
  {id:"shake",label:"Shake head",duration:1.6}, {id:"point",label:"Point",duration:2},
  {id:"clap",label:"Clap",duration:2.6}, {id:"celebrate",label:"Celebrate",duration:2.5},
  {id:"sit",label:"Sit",duration:8}, {id:"laugh",label:"Laugh",duration:2.5},
  {id:"facepalm",label:"Facepalm",duration:2.4},
].map(e => ({...e, looping:false, interruptible:true, multiplayerEvent:"playerEmote"}));
export class SocialControls {
  wheel = document.createElement("div");
  chat = document.createElement("form");
  field = document.createElement("input");
  bubble = document.createElement("div");
  nameplate = document.createElement("div");
  selected = -1;
  options:{label:string;action:()=>void}[]=[];
  latched=false;
  onBuild=()=>{};onInteract=()=>{};onScooter=()=>{};onItems=()=>{};onMusic=()=>{};
  warehouse=false;
  private left = 0;
  private right = 0;
  private chatArmed = true;
  private bubbleAge = 0;
  private wasWheel = false;
  private current: Simulation | null = null;
  constructor(private events: Events) {
    this.wheel.id="emote-wheel"; this.wheel.hidden=true;
    this.chat.id="social-chat";this.chat.hidden=true;
    this.field.maxLength=120;this.field.placeholder="Say something…";this.field.setAttribute("aria-label","Local chat message");
    const help=document.createElement("small");help.textContent="LOCAL CHAT · ENTER SENDS · ESC / B CANCELS";
    this.chat.append(this.field,help);
    this.chat.addEventListener("submit", e=>{e.preventDefault();this.send(this.field.value);});
    this.field.addEventListener("keydown", e=>{e.stopPropagation();if(e.key==="Escape"){e.preventDefault();this.closeChat();}});
    this.bubble.id="player-bubble";this.bubble.hidden=true;
    this.nameplate.id="player-nameplate";this.nameplate.hidden=true;
    document.body.append(this.wheel,this.chat,this.bubble,this.nameplate);
  }
  openOptions(title:string,options:{label:string;action:()=>void}[]){
    this.options=options;this.selected=-1;this.latched=true;this.wheel.hidden=false;this.wheel.replaceChildren();
    const center=document.createElement('strong');center.textContent=title;this.wheel.append(center);
    options.forEach((e,i)=>{const b=document.createElement('span');b.textContent=e.label;const a=i*Math.PI*2/options.length-Math.PI/2;b.style.left=(50+Math.cos(a)*38)+'%';b.style.top=(50+Math.sin(a)*38)+'%';this.wheel.append(b);});
  }
  rootOptions(s:Simulation){return [
   {label:'Emotes',action:()=>this.openOptions('EMOTES / RS SELECT',EMOTES.map(e=>({label:e.label,action:()=>this.perform(e.id,s)})))},
   {label:'Chat',action:()=>{this.chat.hidden=false;this.field.focus();}},
   {label:'Scooter',action:()=>this.onScooter()}, {label:'Interact',action:()=>this.onInteract()}, {label:'Items',action:()=>this.onItems()}, {label:'Music',action:()=>this.onMusic()}, {label:'Cancel',action:()=>{}},
  ];}
  send(message:string) {
    const text=message.trim().slice(0,120);
    if(text && this.current?.walking) {
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
    this.current=s;
    this.bubbleAge=Math.max(0,this.bubbleAge-dt);
    if(s.emote){s.emote.time+=dt;
      if(!s.walking || !s.grounded || f.pressed.sprint || f.pressed.hop || f.pressed.body ||
        Math.hypot(f.steer,f.lean)>.2 || s.emote.time>s.emote.duration || s.state==="Bail")s.emote=null;}
    if(!enabled||!s.walking||s.sitting){this.wheel.hidden=true;this.closeChat();this.left=this.right=0;this.wasWheel=false;this.latched=false;return f;}
    if(!this.chat.hidden){if(f.pressed.brakeBars)this.closeChat();return emptyInput();}
    this.left=f.held.menuLeft>.5?this.left+dt:0;
    this.right=f.held.menuRight>.5?this.right+dt:0;
    if(f.held.menuRight<.5)this.chatArmed=true;
    if(this.right>.2&&this.chatArmed){this.chat.hidden=false;this.chatArmed=false;this.field.focus();return emptyInput();}
    if(this.left>.16&&!this.wasWheel&&!this.latched){this.openOptions('QUICK WHEEL / RS SELECT',this.rootOptions(s));this.wasWheel=true;}
    if(!this.wheel.hidden){
      if(f.held.menuLeft>.5)this.wasWheel=true;
      if(Math.hypot(f.rx,f.ry)>.45)this.selected=Math.round((Math.atan2(f.ry,f.rx)+Math.PI/2+Math.PI*2)%(Math.PI*2)/(Math.PI*2)*this.options.length)%this.options.length;
      [...this.wheel.querySelectorAll('span')].forEach((b,i)=>b.classList.toggle('selected',i===this.selected));
      if(f.pressed.brakeBars){this.wheel.hidden=true;this.wasWheel=this.latched=false;return emptyInput();}
      if(f.pressed.hop||(this.wasWheel&&f.held.menuLeft<.5)){
        const option=this.options[this.selected];this.wheel.hidden=true;this.wasWheel=this.latched=false;this.selected=-1;option?.action();
      }
      return emptyInput();
    }
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
