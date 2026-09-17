import type {Input} from '../input/input';
/** Browser activation and controller availability only. No touch riding inputs. */
export class MobileGate {
 readonly mobile=matchMedia('(pointer: coarse)').matches;
 private activated=!this.mobile;private connected=false;private physicalPads=0;
 private root=document.createElement('div');private rotate=document.createElement('div');
 constructor(private activate:()=>void,private suspend:()=>void){
  this.root.id='mobile-start';this.root.hidden=true;document.body.append(this.root);
  this.rotate.id='rotate-device';this.rotate.textContent='Rotate your device for landscape play';document.body.append(this.rotate);
  document.body.classList.toggle('mobile-layout',this.mobile);
  const meta=document.querySelector('meta[name="viewport"]');meta?.setAttribute('content','width=device-width, initial-scale=1, viewport-fit=cover');
 }
 update(input:Input){
  if(!this.mobile)return false;
  // On-screen touch controls count as a controller unless the player turned them off.
  const available=!!input.pad||(!!input.touch?.device&&input.touch.mode!=='off');
  // A physical controller disconnecting pauses even when touch controls take over.
  if((this.connected&&!available)||(this.physicalPads>0&&input.physicalPads===0))this.suspend();this.connected=available;this.physicalPads=input.physicalPads;
  const blocked=!this.activated||!available;
  this.root.hidden=!blocked;
  const message=!this.activated?'TAP TO START':!navigator.getGamepads?'BROWSER NOT SUPPORTED':input.unsupported?'CONTROLLER NOT SUPPORTED':'CONTROLLER REQUIRED';
  if(this.root.dataset.message!==message){this.root.dataset.message=message;this.root.innerHTML=`<section><div class="eyebrow">SCOOT WITH FRIENDS</div><h2>${message}</h2><p>${!this.activated?'Enable the game, then use your paired controller.':!navigator.getGamepads?'This browser does not provide gamepad input. Open the game in a browser with the Gamepad API.':input.unsupported?'This controller does not expose the standard browser mapping. Switch it to standard/XInput mode or use a supported controller.':'Connect your controller in your phone’s Bluetooth settings, return here, and press a controller button.'}</p>${!this.activated?'<button>Enable Game</button>':''}<small>Touch controls appear automatically when no controller is in use (Settings → Touch Controls). Progress saves on this device.</small></section>`;this.root.querySelector('button')?.addEventListener('click',()=>{this.activated=true;this.activate();});}
  return blocked;
 }
}
