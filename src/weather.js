import { clamp } from './flight.js';
// Air-quality-inspired display colors, driven by scene visibility, not measured AQI.
const stops=[[75,25,63],[126,0,35],[255,126,0],[255,255,0],[0,228,0]];
export function visibilityColor(haze) {
  const value=(1-clamp(Number.isFinite(haze)?haze:1))*(stops.length-1);
  const index=Math.min(stops.length-2,Math.floor(value)),mix=value-index;
  return 'rgb('+stops[index].map((channel,i)=>Math.round(channel+(stops[index+1][i]-channel)*mix)).join(' ')+')';
}
