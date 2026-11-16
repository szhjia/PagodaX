import * as THREE from 'three';
import { PHOTO, TOWER, photoToWorld } from './calibration.js';
import { photoVertex, photoFragment } from './shaders.js';
import { createTower } from './tower.js';
import { createEffects } from './effects.js';
import { loadAssets } from './assets.js';
import { IGNITION_TIME, LIFTOFF_TIME, smooth } from './flight.js';
import { CameraControl } from './camera-control.js';

export async function createFlightRenderer(container, onContextLost, onProjectionChange, cameraControl = new CameraControl(), onProgress) {
  const canvas = document.createElement('canvas');
  canvas.dataset.i18nAriaLabel = 'scene.canvas';
  const context = canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance' });
  if (!context) throw new Error('WEBGL_UNAVAILABLE');
  const renderer = new THREE.WebGLRenderer({ canvas, context, antialias: true });
  renderer.autoClear = false;
  renderer.info.autoReset = false;
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1020,1020,768,-768,.1,24000);
  const trackingCamera = new THREE.OrthographicCamera(-300,300,450,-450,.1,24000);
  const mobile = matchMedia('(max-width: 600px)').matches;
  const baseRatio = Math.min(devicePixelRatio, mobile ? 1.5 : 1.75);
  renderer.setPixelRatio(baseRatio);
  const assets = await loadAssets(onProgress).catch((error) => { renderer.dispose(); renderer.forceContextLoss(); throw error; });
  function makePhoto(foreground) {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        clearMap:{value:assets.clear},hazeMap:{value:assets.haze},plateMap:{value:assets.plate},foregroundMap:{value:assets.foreground},
        hazeRegistration:{value:assets.haze.userData.needsRegistration?1:0},hazeAmount:{value:1},padClearance:{value:0},plateAmount:{value:0},time:{value:0},flame:{value:0},lift:{value:0},airPressure:{value:0},ignitionAge:{value:0},foreground:{value:foreground?1:0},
        clearance:{value:0},viewMode:{value:0},engineBase:{value:(PHOTO.height-TOWER.base-57)/PHOTO.height},
      },
      vertexShader:photoVertex,fragmentShader:photoFragment,
      transparent:foreground,depthWrite:false,depthTest:false,
    });
    const geometry = new THREE.PlaneGeometry(6000,90000).translate(0,44232,0);
    const mesh = new THREE.Mesh(geometry,material);
    mesh.position.z=foreground?200:-300; mesh.renderOrder=foreground?90:0;
    scene.add(mesh); return mesh;
  }
  const background=makePhoto(false),roof=makePhoto(true);
  const tower=createTower(assets); scene.add(tower.group);
  scene.add(new THREE.HemisphereLight('#e9f2ff','#685749',2.5));
  const sun=new THREE.DirectionalLight('#fff4da',2.5); sun.position.set(-400,800,1000); scene.add(sun);
  const effects=createEffects(scene,mobile);
  let width=1,height=1,mainRect,trackingRect,trackingDistance=1,lastFrame,targets={},trackingVisible=false;
  const point=new THREE.Vector3();
  const anchor=photoToWorld(TOWER.x,TOWER.base);
  const stage=document.getElementById('stage');
  const trackingView=document.getElementById('tracking-view');
  const trackingPanel=document.getElementById('tracking-panel');
  function rectangle(element,root) {
    const r=element.getBoundingClientRect();
    return {x:r.left-root.left,y:root.height-(r.top-root.top)-r.height,width:Math.max(1,r.width),height:Math.max(1,r.height)};
  }
  function resize(renderNow=true) {
    const bounds=container.getBoundingClientRect();
    width=Math.max(1,bounds.width);height=Math.max(1,bounds.height);
    mainRect=rectangle(stage,bounds);
    // 使用未平移的布局边界，DOM窗口与GL视口沿同一路径滑动。
    trackingRect={
      x:trackingPanel.offsetLeft+trackingPanel.clientLeft+trackingView.offsetLeft,
      y:height-trackingPanel.offsetTop-trackingPanel.clientTop-trackingView.offsetTop-trackingView.offsetHeight,
      width:Math.max(1,trackingView.offsetWidth),height:Math.max(1,trackingView.offsetHeight),
    };
    trackingDistance=width-trackingPanel.offsetLeft+1;
    const aspect=mainRect.width/mainRect.height;
    const worldHeight=Math.min(PHOTO.height,PHOTO.width/aspect);
    camera.left=-worldHeight*aspect/2;camera.right=worldHeight*aspect/2;
    camera.top=worldHeight/2;camera.bottom=-worldHeight/2;
    camera.updateProjectionMatrix();
    const detailHeight=900,detailAspect=trackingRect.width/trackingRect.height;
    trackingCamera.left=-detailHeight*detailAspect/2;trackingCamera.right=detailHeight*detailAspect/2;
    trackingCamera.top=detailHeight/2;trackingCamera.bottom=-detailHeight/2;
    trackingCamera.updateProjectionMatrix();
    renderer.setSize(width,height,false);
    if(renderNow&&lastFrame)onProjectionChange?.(render(lastFrame));
  }
  function viewport(rect) {
    renderer.setViewport(rect.x,rect.y,rect.width,rect.height);
    renderer.setScissor(rect.x,rect.y,rect.width,rect.height);
  }
  function target(view) {
    point.set(anchor.x,anchor.y+lastFrame.lift+TOWER.height/2,20).project(view);
    return {x:point.x,y:point.y};
  }
  function render(frame) {
    lastFrame=frame;
    for(const mesh of [background,roof]) {
      const u=mesh.material.uniforms;
      u.plateAmount.value=frame.plate;
      u.hazeAmount.value=frame.haze;u.padClearance.value=frame.towerOpacity;
      u.time.value=frame.time;u.flame.value=frame.flame;u.lift.value=frame.lift;
      u.airPressure.value=frame.airPressure;u.ignitionAge.value=Math.max(0,frame.time-IGNITION_TIME);
      u.clearance.value=0;u.viewMode.value=0;
    }
    effects.update(frame);tower.update(frame);
    const shakeX=Math.sin(frame.time*61)*Math.sin(frame.time*23)*frame.shake*1.6;
    const shakeY=Math.sin(frame.time*47)*frame.shake*1.2;
    const baseY=mobile?0:90;
    const focusY=anchor.y+TOWER.height*.4;
    const pose=cameraControl.sample({x:anchor.x*frame.focus,y:baseY+(focusY-baseY)*frame.focus+frame.cameraY,zoom:frame.zoom},{width:camera.right-camera.left,height:camera.top-camera.bottom});
    camera.zoom=pose.zoom;
    camera.position.set(pose.x+shakeX,pose.y+shakeY,3000);
    camera.updateProjectionMatrix();camera.updateMatrixWorld();
    // 地面镜头始终保留原机位。连发动机舱也离开上沿后，才交接副镜头。
    point.set(anchor.x,anchor.y+frame.lift-82,20).project(camera);
    const mainBottom={x:point.x,y:point.y};
    const openingReveal=frame.time>LIFTOFF_TIME?smooth(1.04,1.6,mainBottom.y):0;
    const trackingReveal=openingReveal*(1-frame.trackingRetraction);
    const nextVisible=trackingReveal>0;
    if(nextVisible!==trackingVisible) {
      trackingVisible=nextVisible;
      trackingPanel.dataset.visible=String(trackingVisible);
      trackingPanel.setAttribute('aria-hidden',String(!trackingVisible));
      trackingPanel.inert=!trackingVisible;
      resize(false);
    }
    const trackingShift=(1-trackingReveal)*trackingDistance;
    trackingPanel.style.transform=`translateX(${trackingShift}px)`;
    roof.visible=true;
    renderer.info.reset();
    renderer.setScissorTest(false);renderer.setClearColor('#11171c',1);renderer.clear();
    renderer.setScissorTest(true);viewport(mainRect);renderer.render(scene,camera);
    const mainTarget=target(camera);
    const marker={x:(mainTarget.x*.5+.5)*mainRect.width,y:(-mainTarget.y*.5+.5)*mainRect.height,height:TOWER.height*camera.zoom/(camera.top-camera.bottom)*mainRect.height,width:195*camera.zoom/(camera.right-camera.left)*mainRect.width,camera:pose};

    // 同一个场景、同一个任务时间，独立相机与裁切视口，不复制主镜头画面。
    const chaseY=anchor.y+frame.lift+120;
    trackingCamera.position.set(anchor.x+290,chaseY+50,2000);
    trackingCamera.lookAt(anchor.x,chaseY,20);trackingCamera.updateMatrixWorld();
    background.material.uniforms.viewMode.value=1;
    background.material.uniforms.clearance.value=frame.cloudClearance;
    roof.visible=false;tower.update(frame,true);
    if(trackingVisible) {
      viewport({...trackingRect,x:trackingRect.x+trackingShift});
      renderer.clearDepth();renderer.render(scene,trackingCamera);
    }
    targets={mainTarget,mainBottom,trackingTarget:target(trackingCamera),trackingVisible,trackingReveal,mainCameraY:camera.position.y,mainCameraX:camera.position.x,cameraZoom:camera.zoom,zoomMode:pose.mode,flightSeconds:frame.flightSeconds,altitude:frame.altitude,speed:frame.speed};
    renderer.setScissorTest(false);
    return marker;
  }
  resize();
  await renderer.compileAsync(scene,camera);
  container.prepend(canvas);
  const observer=new ResizeObserver(()=>resize());observer.observe(container);
  canvas.addEventListener('webglcontextlost',(event)=>{event.preventDefault();onContextLost();});
  let reduced=false;
  return {
    render,
    reduceQuality(){if(reduced)return;reduced=true;renderer.setPixelRatio(Math.min(baseRatio,1));effects.reduceQuality();resize();},
    stats(){return {renderTime:lastFrame?.time,vehicleLift:tower.group.position.y-anchor.y,...renderer.info.memory,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,pixelRatio:renderer.getPixelRatio(),reduced,...targets};},
    dispose(){
      observer.disconnect();
      const geometries=new Set(),materials=new Set();
      scene.traverse((item)=>{if(item.geometry)geometries.add(item.geometry);if(item.material)materials.add(item.material);});
      geometries.forEach((g)=>g.dispose());materials.forEach((m)=>m.dispose());Object.values(assets).flat().forEach((t)=>t.dispose());
      renderer.dispose();canvas.remove();
    },
  };
}
