const panel=()=>document.querySelector<HTMLElement>('#destination-loading')!;
export async function loadingStage(label:string,value:number){const el=panel();el.hidden=false;el.querySelector('strong')!.textContent=label;const bar=el.querySelector('progress')!;bar.value=value;el.querySelector('small')!.textContent=value<100?'Preparing your destination?':'Ready to ride';await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));}
export function finishLoading(){panel().hidden=true;}
export function loadingFailed(){const el=panel();el.hidden=false;el.querySelector('strong')!.textContent='Could not load this destination';el.querySelector('small')!.textContent='Reload the page to try again. Your saved setup is safe.';}
