/** Private-alpha friends use a device credential, separate from the account wallet. */
export type Friend = {id:string;name:string;online?:boolean};
export type LobbyInvite = {id:string;from:string;name:string;expiresAt:number};
import {PROTOCOL,CONTENT} from './protocol';

export class SocialClient {
  status='Offline';id='';name='Rider';lastError='';persistent=false;
  friends:Friend[]=[];requests:Friend[]=[];outgoing:Friend[]=[];invites:LobbyInvite[]=[];
  readonly credential:string;
  private ws:WebSocket|null=null;private retry:number|undefined;private stopped=false;
  onState=()=>{};onInvite=(_invite:LobbyInvite)=>{};onAccepted=(_code:string)=>{};
  constructor(private endpoint:()=>string){
    const key='swf-social-device';
    let saved:any;try{saved=JSON.parse(localStorage.getItem(key)||'null');}catch{}
    if(!/^[a-f0-9]{64}$/.test(saved?.credential??'')){
      const bytes=crypto.getRandomValues(new Uint8Array(32));
      saved={credential:Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join(''),name:'Rider'};
    }
    this.credential=saved.credential;this.name=this.validName(saved.name)?saved.name:'Rider';
    this.save();
    window.addEventListener('online',()=>this.connect());
    window.addEventListener('pagehide',()=>this.disconnect());
    window.addEventListener('pageshow',()=>{this.stopped=false;this.connect();});
  }
  private validName(name:unknown):name is string{return typeof name==='string'&&/^[\p{L}\p{N} _-]{1,24}$/u.test(name);}
  private save(){try{localStorage.setItem('swf-social-device',JSON.stringify({credential:this.credential,name:this.name}));}catch{this.lastError='Browser storage is unavailable. Your friend code lasts only for this visit.';}}
  connect(){
    if(this.stopped||this.ws&&this.ws.readyState<2)return;
    window.clearTimeout(this.retry);
    const endpoint=this.endpoint();if(!endpoint){this.status='Unavailable';this.onState();return;}
    this.status=this.id?'Reconnecting':'Connecting';this.onState();
    const ws=this.ws=new WebSocket(endpoint);
    ws.onopen=()=>ws.send(JSON.stringify({type:'social-auth',protocol:PROTOCOL,content:CONTENT,credential:this.credential,name:this.name}));
    ws.onmessage=e=>{if(this.ws!==ws)return;let m;try{m=JSON.parse(e.data);}catch{return;}
      if(m.type==='social-state'){
        const old=new Set(this.invites.map(i=>i.id));
        this.id=m.friendId;this.name=m.name;this.friends=m.friends;this.requests=m.requests;this.outgoing=m.outgoing;this.invites=m.invites;
        this.persistent=!!m.persistent;this.status='Connected';this.lastError='';this.save();
        for(const invite of this.invites)if(!old.has(invite.id))this.onInvite(invite);
      }else if(m.type==='social-error'||m.type==='error')this.lastError=String(m.message).slice(0,200);
      else if(m.type==='invite-accepted')this.onAccepted(m.code);
      this.onState();
    };
    ws.onclose=e=>{if(this.ws!==ws)return;this.ws=null;this.status='Offline';this.friends=this.friends.map(f=>({...f,online:false}));this.onState();
      if(e.code===4001){this.stopped=true;this.lastError='Friends is active in another tab. Use that tab, or reload this one.';this.onState();}
      if(!this.stopped)this.retry=window.setTimeout(()=>this.connect(),3000);
    };
  }
  send(message:unknown){if(this.ws?.readyState===WebSocket.OPEN&&this.status==='Connected'){this.lastError='';this.ws.send(JSON.stringify(message));}else{this.lastError='Friends is reconnecting. Try again when connected.';this.connect();}this.onState();}
  setName(name:string){name=name.trim();if(!this.validName(name)){this.lastError='Use 1–24 letters, numbers, spaces, _ or -.';this.onState();return;}this.name=name;this.save();this.send({type:'social-name',name});}
  disconnect(){this.stopped=true;window.clearTimeout(this.retry);this.ws?.close();}
}
