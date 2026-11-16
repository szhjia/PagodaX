import { IGNITION_TIME, clamp, sampleFlight } from './flight.js';

// Fictional mission's powered upper-ascent plan, beyond the 48-second camera sequence.
// This is a target-orbit forecast, not a ballistic extrapolation of the vertical launch model.
export const ORBIT_PLAN = Object.freeze({ earthRadiusKm: 6371, earthMu: 398600.435507, perigeeKm: 320, apogeeKm: 340, inclinationDeg: 53, insertionAfterIgnition: 540 });
const a=ORBIT_PLAN.earthRadiusKm+(ORBIT_PLAN.perigeeKm+ORBIT_PLAN.apogeeKm)/2;
const e=(ORBIT_PLAN.apogeeKm-ORBIT_PLAN.perigeeKm)/(2*a);
export const ORBIT_PERIOD_SECONDS=2*Math.PI*Math.sqrt(a**3/ORBIT_PLAN.earthMu);
export function sampleForecast(time) {
  const elapsed=Math.max(0,(Number.isFinite(time)?time:0)-IGNITION_TIME);
  const remaining=Math.max(0,ORBIT_PLAN.insertionAfterIgnition-elapsed);
  const altitude=sampleFlight(time).altitude;
  // Expand the first 5km of ascent in the schematic, while keeping the remaining
  // transfer dashed and the 9-minute insertion clock independent of the diagram scale.
  const ascentProgress=.7*Math.sqrt(clamp(altitude/5000));
  return { remaining, altitude, ascentProgress, progress:clamp(elapsed/ORBIT_PLAN.insertionAfterIgnition), periodMinutes:ORBIT_PERIOD_SECONDS/60, perigeeKm:ORBIT_PLAN.perigeeKm, apogeeKm:ORBIT_PLAN.apogeeKm, inclinationDeg:ORBIT_PLAN.inclinationDeg };
}
export function formatInsertion(seconds) {
  const whole=Math.ceil(Math.max(0,seconds));
  return String(Math.floor(whole/60)).padStart(2,'0')+':'+String(whole%60).padStart(2,'0');
}
// Inclined Kepler ellipse projected into a compact instrument schematic.
// The Earth is a symbol: altitude separation is expanded for legibility at 32px high.
export function orbitPoint(angle) {
  const i=ORBIT_PLAN.inclinationDeg*Math.PI/180, node=-25*Math.PI/180;
  const r=(1-e*e)/(1+e*Math.cos(angle));
  const x=r*(Math.cos(node)*Math.cos(angle)-Math.sin(node)*Math.sin(angle)*Math.cos(i));
  const z=r*Math.sin(angle)*Math.sin(i);
  const depth=r*(Math.sin(node)*Math.cos(angle)+Math.cos(node)*Math.sin(angle)*Math.cos(i));
  return {x:60+44*x,y:16-13*z,depth};
}
export function orbitPath(front) {
  let path='',drawing=false;
  for(let n=0;n<=180;n++) {
    const p=orbitPoint(n*Math.PI/90);
    if((p.depth>=0)===front) {
      path+=(drawing?'L':'M')+p.x.toFixed(2)+','+p.y.toFixed(2);drawing=true;
    } else drawing=false;
  }
  return path;
}
export function transferPoint(progress) {
  const t=clamp(progress),u=1-t,end=orbitPoint(.5);
  return {x:u**3*60+3*u*u*t*67+3*u*t*t*82+t**3*end.x,y:u**3*7+3*u*u*t*1+3*u*t*t*0+t**3*end.y};
}

export function flownTransferPath(progress) {
  const t=clamp(progress),p0={x:60,y:7},p1={x:67,y:1},p2={x:82,y:0},p3=orbitPoint(.5);
  const mix=(a,b)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
  const a=mix(p0,p1),b=mix(p1,p2),c=mix(p2,p3),d=mix(a,b),end=transferPoint(t);
  return `M60,7C${a.x},${a.y} ${d.x},${d.y} ${end.x},${end.y}`;
}
