const TAU=Math.PI*2;
/** Unwrapped channel rotation drives every phase; no clock or idle reset owns this pose. */
export function briPose(angle:number,natural:number,airTurn=0){
 const turns=Math.abs(angle)/TAU,phase=turns-Math.floor(turns),side=Math.sign(angle)||natural,inward=side!==natural;
 const clearance=Math.sin(Math.PI*phase)**2;
 const warped=phase+.055*Math.sin(TAU*phase);
 const air=Math.min(1,Math.abs(airTurn)/Math.PI)*clearance;
 return {phase,side,inward,clearance,rotation:(inward?1:-1)*(Math.floor(turns)+warped)*TAU,
  barLead:side*(inward?.12:.48)*clearance*(1+.3*Math.sin(TAU*phase)),
  yaw:side*(inward?.06:.23)*clearance,
  offset:[side*(.22+.07*Math.sin(TAU*phase))*clearance,-(.12+.03*air)*clearance,.065*Math.sin(TAU*phase)*clearance] as const,
  torsoYaw:side*(.12*clearance+.10*air),
  stage:phase<.16?'initiation':phase<.58?'sweep':phase<.88?'return':'catch'};
}
