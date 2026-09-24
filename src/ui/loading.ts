const panel=()=>document.querySelector<HTMLElement>('#destination-loading')!;
// One tip per trip, shown under the bar.
const TIPS=['Missions pay Credit, XP and crates. Check MISSIONS on your phone.','Daily missions change at midnight.','Crate exclusives are never sold in shops.','Sign in to keep your progress on every device.','Today\'s deals change every day. Check the shop.','Land clean for PERFECT landings.','B Hill is steep. Watch for speed wobble.','Take your phone out with D-pad Down.'];
let tip=-1;
export async function loadingStage(label:string,value:number){const el=panel();if(el.hidden||tip<0){tip=(tip+1+Math.floor(Math.random()*(TIPS.length-1)))%TIPS.length;el.querySelector('.ld-tip')!.textContent=TIPS[tip];}el.hidden=false;el.querySelector('strong')!.textContent=label;const bar=el.querySelector('progress')!;bar.value=value;el.querySelector('small')!.textContent=value<100?'Preparing your destination…':'Ready to ride';await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));}
export function finishLoading(){panel().hidden=true;}
export function loadingFailed(){const el=panel();el.hidden=false;el.querySelector('strong')!.textContent='Could not load this destination';el.querySelector('small')!.textContent='Reload the page to try again. Your saved setup is safe.';el.querySelector('.ld-tip')!.textContent='';}
