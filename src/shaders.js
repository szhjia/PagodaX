import { WEATHER_ALIGNMENT } from './weather-alignment.js';
const alignment=WEATHER_ALIGNMENT;
const alignmentDeterminant=alignment.a*alignment.d-alignment.b*alignment.c;

export const noise = /* glsl */`
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float noise2(vec2 p) {
  vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);
}
float fbm(vec2 p) { return .55*noise2(p)+.28*noise2(p*2.03)+.17*noise2(p*4.13); }
`;

export const photoVertex = /* glsl */`
varying vec2 vPhoto;
void main() {
  vPhoto=vec2((position.x+1020.)/2040.,(position.y+768.)/1536.);
  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
}`;

export const photoFragment = /* glsl */`
uniform sampler2D clearMap, hazeMap, plateMap, foregroundMap;
uniform float hazeRegistration, hazeAmount, padClearance, plateAmount, time, flame, lift, airPressure, ignitionAge, foreground, clearance, viewMode, engineBase;
varying vec2 vPhoto;
${noise}
vec2 registeredHazeUv(vec2 uv) {
  if(hazeRegistration<.5) return uv;
  vec2 pixel=vec2(uv.x*2040.,(1.-uv.y)*1536.);
  pixel=mat2(${alignment.d},${-alignment.b},${-alignment.c},${alignment.a})*(pixel-vec2(${alignment.tx},${alignment.ty}))/${alignmentDeterminant};
  return clamp(vec2(pixel.x/2040.,1.-pixel.y/1536.),vec2(.001),vec2(.999));
}
void main() {
  vec2 uv=clamp(vPhoto,vec2(.001),vec2(.999));
  vec2 source=uv;
  vec2 engine=vec2(1054./2040.,engineBase+lift/1536.);
  float heat=exp(-pow((uv.x-engine.x)*24.,2.)-pow((uv.y-engine.y+.04)*11.,2.))*flame;
  uv.x+=sin(uv.y*380.+time*17.)*.0008*heat;
  vec2 pressureDelta=(uv-vec2(engine.x,engineBase+.14))*vec2(1.,1.33);
  float distanceFromPad=length(pressureDelta);
  float pressureFront=.035+ignitionAge*.018;
  float pressureWave=exp(-pow((distanceFromPad-pressureFront)/.026,2.))*airPressure;
  uv+=pressureDelta/max(.001,distanceFromPad)*pressureWave*.003*sin(distanceFromPad*210.-ignitionAge*6.);
  vec3 base=mix(texture2D(clearMap,uv).rgb,texture2D(plateMap,uv).rgb,plateAmount);
  float clearingRadius=.035+.055*smoothstep(0.,6.,ignitionAge);
  float localClearing=exp(-pow(pressureDelta.x/clearingRadius,2.)-pow(pressureDelta.y/(clearingRadius*2.2),2.))*padClearance*.92;
  vec3 color=mix(base,texture2D(hazeMap,registeredHazeUv(uv)).rgb,hazeAmount*(1.-localClearing));
  float skyHeight=max(0.,(vPhoto.y-1.)*1536.);
  vec3 horizon=mix(texture2D(clearMap,vec2(uv.x,.995)).rgb,texture2D(hazeMap,registeredHazeUv(vec2(uv.x,.995))).rgb,hazeAmount);
  vec3 upper=vec3(.08,.20,.34);
  float blue=smoothstep(80.,2200.,skyHeight)*clearance;
  vec3 sky=mix(horizon,upper,blue);
  float clouds=fbm(vec2(vPhoto.x*4.2+time*.007,vPhoto.y*2.7));
  float band=exp(-pow((skyHeight-1600.)/1000.,2.));
  sky=mix(sky,vec3(.66,.71,.74),smoothstep(.46,.78,clouds)*band*.65);
  float highCloud=fbm(vec2(vPhoto.x*7.3-time*.003,vPhoto.y*1.9+18.));
  sky+=smoothstep(.6,.83,highCloud)*.07*blue;
  float extended=smoothstep(.93,1.06,vPhoto.y);
  if(viewMode>.5) extended=1.;
  color=mix(color,sky,extended);
  float scattered=exp(-pow((uv.x-engine.x)*15.,2.)-pow((uv.y-engine.y+.03)*13.,2.));
  color+=vec3(.32,.115,.023)*scattered*flame;
  float alpha=foreground>.5?texture2D(foregroundMap,source).a:1.;
  gl_FragColor=vec4(color,alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export const towerVertex = /* glsl */`
uniform float baseHeight;
varying vec2 vUv;
varying float vHeight;
varying vec3 vNormal, vLocalNormal;
void main(){
  vUv=uv; vHeight=baseHeight+position.y; vLocalNormal=normal;
  // World-space sunlight must not rotate with the tracking camera.
  vNormal=normalize(mat3(modelMatrix)*normal);
  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
}
`;
export const towerFragment = /* glsl */`
uniform sampler2D frontMap, sideMap, brickMap;
uniform float visibility, heat, haze, surfaceOnly;
uniform vec3 hazeColor;
varying vec2 vUv;
varying float vHeight;
varying vec3 vNormal, vLocalNormal;
void main(){
  float sideFace=step(.5,abs(vLocalNormal.x));
  vec3 color=mix(texture2D(frontMap,vUv).rgb,texture2D(sideMap,vUv).rgb,sideFace);
  if(surfaceOnly<.5) color*=mix(1.,.53,sideFace);
  float horizontal=step(.99,abs(vLocalNormal.y));
  float stone=max(step(.5,surfaceOnly)*(1.-step(1.5,surfaceOnly)),horizontal);
  // Photos already contain diffuse lighting and occlusion; do not light them twice.
  vec3 brick=texture2D(brickMap,vUv*vec2(3.,1.)).rgb;
  float diffuse=.55+.45*max(dot(normalize(vNormal),normalize(vec3(-.4,.8,1.))),0.);
  color=mix(color,brick*diffuse,stone);
  color*=1.28;
  // The cornice/roof use the exposed grey masonry, rather than golden wall paint.
  if(surfaceOnly>1.5) color*=mix(vec3(1.),vec3(.68,.72,.76),sideFace*.5);
  float engineBounce=exp(-max(0.,vHeight)/32.)*heat;
  color+=vec3(.045,.016,.003)*engineBounce;
  color=mix(color,hazeColor,haze);
  gl_FragColor=vec4(color,visibility);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const basicVertex = /* glsl */`
varying vec2 vUv;
void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}
`;
// 局部蒸汽先聚拢，再随压力向两侧展开，中心逐渐露出塔体。
export const airFragment = /* glsl */`
uniform float time, power;
varying vec2 vUv;
${noise}
void main(){
  vec2 p=(vUv-.5)*vec2(1.3,1.);
  float age=max(0.,time);
  float front=.10+min(age,8.)*.068;
  float width=.10+age*.012;
  float lobes=exp(-pow((abs(p.x)-front)/width,2.)-pow((p.y+.04-age*.015)/.34,2.));
  float center=exp(-pow(p.x/.18,2.)-pow((p.y+.03)/.43,2.))*(1.-smoothstep(1.2,4.5,age));
  float turbulent=fbm(vec2(p.x*8.-sign(p.x)*age*.85,p.y*7.-age*.25));
  float radius=length(vec2(p.x,(p.y+.30)*1.25));
  float ring=exp(-pow((radius-.12-age*.16)/.026,2.))*exp(-age*.7);
  float edge=(1.-smoothstep(.44,.64,abs(p.x)))*(1.-smoothstep(.36,.50,abs(p.y)));
  float alpha=(lobes*.46+center*.50+ring*.20)*(.45+.65*turbulent)*edge*power;
  vec3 color=mix(vec3(.77,.81,.84),vec3(.92,.83,.69),ring*.5);
  gl_FragColor=vec4(color,alpha);
  #include <colorspace_fragment>
}`;
export const flameFragment = /* glsl */`
uniform float time, power, seed;
varying vec2 vUv;
${noise}
void main(){
  float y=vUv.y;
  float n=fbm(vec2(vUv.x*12.+seed,y*10.+time*9.));
  float bend=sin(y*12.-time*18.+seed)*.018*(1.-y);
  float width=(.065+.30*sin(pow(y,.7)*3.14159))*(.68+.45*n);
  float x=abs(vUv.x-.5+bend);
  float body=1.-smoothstep(width*.5,width,x);
  float edge=smoothstep(0.,.22,y)*(1.-smoothstep(.96,1.,y));
  float core=exp(-pow(x/max(.015,width*.22),2.))*pow(y,.45);
  vec3 color=mix(vec3(.95,.18,.012),vec3(1.55,1.30,.85),core);
  float diamonds=pow(max(0.,cos(y*51.-time*2.)),7.)*exp(-pow(x/.08,2.));
  color+=vec3(.65,.55,.35)*diamonds;
  float bands=.65+.35*n;
  float fine=step(1.,seed);
  gl_FragColor=vec4(color*bands,body*edge*power*mix(.67,.48,fine));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
export const glowFragment = /* glsl */`
uniform float power;
varying vec2 vUv;
void main(){
  float d=length((vUv-.5)*2.);
  float a=exp(-d*d*5.)*power*.27;
  gl_FragColor=vec4(1.,.35,.065,a);
  #include <colorspace_fragment>
}`;
export const smokeVertex = /* glsl */`
attribute vec4 seed;
uniform float time, lift, density;
varying vec2 vUv;
varying float vAge, vHot, vOpacity;
void main(){
  vUv=uv;
  float birth=seed.x*6.5;
  float elapsed=time-birth;
  float age=mod(max(elapsed,0.),7.5);
  float cycle=floor(max(elapsed,0.)/7.5);
  float alive=step(0.,elapsed)*(1.-step(13.,birth+cycle*7.5));
  float direction=seed.y>.5?1.:-1.;
  float radius=12.+age*27.;
  vec3 p=position;
  p.xy*=radius;
  p.x+=34.+direction*(age*(36.+seed.z*35.)+seed.w*60.);
  p.y+=36.+age*(9.+seed.w*12.)+sin(seed.x*30.+age)*9.;
  p.z=100.+seed.z*20.;
  vAge=age;vHot=exp(-age*1.5);vOpacity=alive*sin(age/7.5*3.14159)*density;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
}`;
export const smokeFragment = /* glsl */`
uniform float time;
varying vec2 vUv;
varying float vAge, vHot, vOpacity;
${noise}
void main(){
  float d=length((vUv-.5)*2.);
  float n=fbm(vUv*7.+vec2(vAge*.25,time*.05));
  float a=(1.-smoothstep(.2,.98,d+(n-.5)*.6))*.48*vOpacity;
  vec3 dust=mix(vec3(.20,.185,.17),vec3(.44,.415,.38),n);
  vec3 color=mix(dust,vec3(.82,.38,.10),vHot*.65);
  gl_FragColor=vec4(color,a);
  #include <colorspace_fragment>
}`;
