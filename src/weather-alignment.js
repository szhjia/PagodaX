// Haze -> clear-photo registration, in the common 2040 x 1536 coordinate system.
// Fitted to fixed-building features; source photographs remain untouched.
export const WEATHER_ALIGNMENT=Object.freeze({
  a:.9933427376354143, b:-.0006570998044488119,
  c:-.011855986314017538, d:.9841498541375541,
  tx:41.08367571387849, ty:25.52904275105934,
});
export const ARCHIVE_CROP=1.06;
export function registerWeatherPoint(x,y) {
  const {a,b,c,d,tx,ty}=WEATHER_ALIGNMENT;
  return {x:a*x+c*y+tx,y:b*x+d*y+ty};
}
export function weatherComparisonTransform() {
  const {a,b,c,d,tx,ty}=WEATHER_ALIGNMENT;
  const crop=`translate(${-(ARCHIVE_CROP-1)*50}%, ${-(ARCHIVE_CROP-1)*50}%) scale(${ARCHIVE_CROP})`;
  return {clear:crop,haze:`${crop} translate(${tx/2040*100}%, ${ty/1536*100}%) matrix(${a},${b},${c},${d},0,0)`};
}
