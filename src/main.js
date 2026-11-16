import './style.css';
import { t, getLocale, setLocale, applyTranslations } from './i18n.js';
import { DURATION, LIFTOFF_TIME, TRACKING_END, TRACKING_DURATION, PHASES, MissionClock, sampleFlight, formatMissionTime } from './flight.js';
import { createFlightRenderer } from './renderer.js';
import { FlightAudio } from './audio.js';
import { CameraControl } from './camera-control.js';
import { sampleForecast, formatInsertion, orbitPath, orbitPoint, transferPoint, flownTransferPath } from './forecast.js';
import { visibilityColor } from './weather.js';
import { weatherComparisonTransform } from './weather-alignment.js';
import { assetUrl } from './asset-url.js';

const $ = (id) => document.getElementById(id);
const clock = new MissionClock();
const cameraControl = new CameraControl();
const audio = new FlightAudio();
const stage = $('stage');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const message = $('stage-message');
const progress = $('progress');
const loadingShownAt = new Promise(resolve => requestAnimationFrame(() => resolve(performance.now())));
const loadingSurfaces = [...document.querySelectorAll('.site-header, main, .bottom-signoff')];
loadingSurfaces.forEach(element => { element.inert = true; });
let flight, available = false, raf = 0, previous = 0, wasPlaying = false;
let launched = false, launchLatched = false, fallbackReason, soundUnavailable = false, fullscreenUnavailable = false;
applyTranslations();
const comparisonTransforms=weatherComparisonTransform();
$('comparison').style.setProperty('--comparison-color',visibilityColor(1-Number($('compare-range').value)/100));
for(const [selector,transform] of [['.comparison>img',comparisonTransforms.clear],['.comparison-haze>img',comparisonTransforms.haze]]) {
  const image=document.querySelector(selector);
  image.style.transformOrigin='0 0';image.style.transform=transform;
}
const beijingTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
const beijingDate = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'});
const maxAltitude=sampleFlight(DURATION).altitude;
const profileSamples=Array.from({length:DURATION+1},(_,time)=>({time,altitude:sampleFlight(time).altitude}));
let lastProfileTime;
$('orbit-far').setAttribute('d',orbitPath(false));
$('orbit-near').setAttribute('d',orbitPath(true));
const insertion=orbitPoint(.5);
$('orbit-transfer').setAttribute('d',`M60,7C67,1 82,0 ${insertion.x},${insertion.y}`);
$('orbit-insertion').setAttribute('cx',insertion.x);
$('orbit-insertion').setAttribute('cy',insertion.y);
const arrow=orbitPoint(1),nextArrow=orbitPoint(1.02);
$('orbit-direction').setAttribute('d','M-3,-1.7L0,0 -3,1.7');
$('orbit-direction').setAttribute('transform',`translate(${arrow.x} ${arrow.y}) rotate(${Math.atan2(nextArrow.y-arrow.y,nextArrow.x-arrow.x)*180/Math.PI})`);
let frames = 0, frameSeconds = 0, fps = 0;
let lastPlaying;

function text(id, value) { const el = $(id); if (el.textContent !== value) el.textContent = value; }
function updateTime(frame = sampleFlight(clock.time)) {
  const now=new Date();
  const parts=Object.fromEntries(beijingDate.formatToParts(now).map(part=>[part.type,part.value]));
  text('mission-date',parts.year+'.'+parts.month+'.'+parts.day);
  $('mission-date').dateTime=parts.year+'-'+parts.month+'-'+parts.day;
  const time = $('mission-time');
  if (launched && available) {
    text('clock-label', t('scene.clock'));
    text('mission-time', formatMissionTime(frame.time));
    time.removeAttribute('datetime');
  } else {
    text('clock-label', t('scene.beijing'));
    text('mission-time', beijingTime.format(now));
    time.dateTime = now.toISOString();
  }
}
updateTime();
// 待发射时只更新文字，不启动WebGL渲染循环。
const wallClockTimer = setInterval(() => { if (!launched || !available) updateTime(); }, 1000);
function placeMarker(marker) {
  if (!marker) return;
  updateCameraControls(marker.camera);
  const target = $('target-marker');
  target.style.left = `${marker.x - marker.width / 2 - 5}px`;
  target.style.top = `${marker.y - marker.height / 2 - 5}px`;
  target.style.width = `${marker.width + 10}px`;
  target.style.height = `${marker.height + 10}px`;
}
function updateCameraControls(pose) {
  if (!pose) return;
  const value=pose.zoom.toFixed(2);
  $('zoom').value=value;
  $('zoom').setAttribute('aria-valuetext',t('zoom.value',{zoom:value}));
  text('zoom-value',value+'×');
  $('zoom-auto').setAttribute('aria-pressed',String(pose.mode==='auto'));
  document.querySelector('.zoom-control').dataset.mode=pose.mode;
  stage.dataset.canPan=String(available && pose.zoom>1.001);
}

function update(frame) {
  const marker = flight?.render(frame);
  text('phase-label', launched ? t('phase.' + frame.phase) : t('phase.STANDBY'));
  text('scene-caption', launched ? t('caption.' + frame.phase) : t('scene.standby'));
  updateTime(frame);
  updateInstrumentRotation(frame);
  updateProfile(frame);
  text('altitude', Math.round(frame.altitude).toString().padStart(3, '0'));
  text('velocity', frame.speed.toFixed(1));
  const elapsed = Math.floor(frame.time);
  text('elapsed', `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`);
  progress.value = frame.time;
  progress.style.setProperty('--progress', `${frame.time / DURATION * 100}%`);
  progress.setAttribute('aria-valuetext', t('timeline.value', { phase: t('phase.' + frame.phase), time: frame.time.toFixed(1), duration: DURATION }));
  text('camera-mode', t('scene.cameraMode'));
  text('tracking-status', t(frame.time < LIFTOFF_TIME ? 'tracking.pad' : frame.time < TRACKING_END ? 'tracking.ascent' : 'tracking.complete'));
  text('tracking-time', t('tracking.time', {seconds: frame.flightSeconds.toFixed(1).padStart(4, '0')}));
  text('tracking-seconds', frame.flightSeconds.toFixed(1).padStart(4, '0'));
  $('tracking-view').dataset.flightSeconds = frame.flightSeconds.toFixed(3);
  const trackProgress = frame.flightSeconds / TRACKING_DURATION;
  $('trajectory-dot').setAttribute('cx', String(10 + trackProgress * 75));
  $('trajectory-dot').setAttribute('cy', String(40 - trackProgress ** 2 * 36));
  text('visibility-label', t(frame.haze > .85 ? 'weather.hazy' : frame.haze > .05 ? 'weather.clearing' : 'weather.clear'));
  $('visibility-bar').style.width = `${Math.max(5, (1 - frame.haze) * 100)}%`;
  $('visibility-bar').style.backgroundColor=visibilityColor(frame.haze);
  const target = $('target-marker');
  target.style.opacity = launched && frame.time < LIFTOFF_TIME ? .8 : 0;
  placeMarker(marker);
  $('end-card').style.opacity = frame.ending;
  stage.dataset.phase = launched ? frame.phase : 'STANDBY';
  stage.dataset.time = frame.time.toFixed(3);
  const currentStage = launched ? PHASES.findLastIndex((item) => frame.time >= item.start) : -1;
  document.querySelectorAll('.phase-ticks button').forEach((button, i) => { button.classList.toggle('active', i === currentStage); if (i === currentStage) button.setAttribute('aria-current', 'step'); else button.removeAttribute('aria-current'); });
  updateTransport(frame);
  audio.update(frame, clock.playing);
}

function updateProfile(frame) {
  const forecast=sampleForecast(frame.time);
  text('orbit-elements',t('forecast.elements',{inclination:forecast.inclinationDeg,period:forecast.periodMinutes.toFixed(1)}));
  text('orbit-current-height','↑ '+t('forecast.height',{altitude:(forecast.altitude/1000).toFixed(2)}));
  document.querySelector('.orbit-chart').setAttribute('aria-label',t('forecast.current',{altitude:(forecast.altitude/1000).toFixed(2),eta:formatInsertion(forecast.remaining)}));
  text('engine-state',t(frame.time>=DURATION?'engine.complete':frame.time>DURATION-5?'engine.shutdown':frame.time<LIFTOFF_TIME&&frame.flame>0?'engine.ignition':frame.flame>0?'engine.nominal':'engine.standby'));
  if (lastProfileTime===frame.time) return;
  lastProfileTime=frame.time;
  const point=sample=>[(1+sample.time/DURATION*258).toFixed(1),(33-sample.altitude/maxAltitude*29).toFixed(1)];
  const samples=profileSamples.filter(sample=>sample.time<frame.time);
  const current=point(frame);
  $('profile-line').setAttribute('points',[...samples.map(sample=>point(sample).join(',')),current.join(',')].join(' '));
  $('profile-dot').setAttribute('cx',current[0]);
  $('profile-dot').setAttribute('cy',current[1]);
  text('engine-output',String(Math.round(frame.flame*100)).padStart(3,'0')+'%');
  text('propellant-remaining',(frame.propellantRemaining*100).toFixed(1)+'%');
  text('propellant-used',(frame.propellantUsed*100).toFixed(1)+'%');
  $('propellant-fill').style.width=(frame.propellantRemaining*100)+'%';
  document.querySelector('.propellant-gauge').setAttribute('aria-valuenow',(frame.propellantRemaining*100).toFixed(1));
  $('engine-array').style.setProperty('--engine-power',frame.flame);
  text('engine-count',(frame.flame>.01?'09':'00')+' / 09');
  text('insertion-countdown',formatInsertion(forecast.remaining));
  const craft=transferPoint(forecast.ascentProgress);
  $('orbit-flown').setAttribute('d',flownTransferPath(forecast.ascentProgress));
  $('orbit-halo').setAttribute('cx',craft.x);$('orbit-halo').setAttribute('cy',craft.y);
  $('orbit-craft').setAttribute('cx',craft.x);
  $('orbit-craft').setAttribute('cy',craft.y);
}

const instrumentTabs=[...document.querySelectorAll('.instrument-tabs [role=tab]')];
const instrumentPanels=[...document.querySelectorAll('.instrument-panel')];
let lastInstrumentStep=-1;
function selectInstrument(index) {
  document.querySelector('.instrument-track').style.transform='translate3d('+(-index*100)+'%,0,0)';
  instrumentTabs.forEach((tab,i)=>{tab.setAttribute('aria-selected',String(i===index));tab.tabIndex=i===index?0:-1;});
  instrumentPanels.forEach((panel,i)=>{panel.setAttribute('aria-hidden',String(i!==index));panel.inert=i!==index;});
}
function updateInstrumentRotation(frame) {
  const step=frame.time<LIFTOFF_TIME?-1:Math.floor((frame.time-LIFTOFF_TIME)/3);
  if(step===lastInstrumentStep) return;
  lastInstrumentStep=step;
  selectInstrument(frame.complete?instrumentTabs.length-1:step<0?0:step%instrumentTabs.length);
}
instrumentTabs.forEach((tab,index)=>{
  tab.addEventListener('click',()=>selectInstrument(index));
  tab.addEventListener('keydown',event=>{
    const next=event.key==='ArrowRight'?(index+1)%4:event.key==='ArrowLeft'?(index+3)%4:event.key==='Home'?0:event.key==='End'?3:undefined;
    if (next===undefined) return;
    event.preventDefault();selectInstrument(next);instrumentTabs[next].focus();
  });
});

function updateTransport(frame) {
  if (frame.complete) launchLatched = false;
  const controlState = `${clock.playing}-${launchLatched}-${available}`;
  if (lastPlaying !== controlState) {
    $('play').dataset.latched = String(launchLatched);
    $('play').setAttribute('aria-pressed', String(launchLatched));
    $('play').setAttribute('aria-busy', String(clock.playing));
    $('play').disabled = clock.playing || !available;
    lastPlaying = controlState;
  }
}

function loop(now) {
  raf = 0;
  if (!available || document.hidden) return;
  const delta = previous ? (now - previous) / 1000 : 0;
  previous = now;
  const frame = clock.tick(delta);
  update(frame);
  if (delta > 0 && delta < .3 && clock.playing) {
    frames++; frameSeconds += delta;
    if (frameSeconds >= 2) { fps = frames / frameSeconds; if (fps < 28) flight.reduceQuality(); frames = 0; frameSeconds = 0; }
  }
  if (clock.playing) raf = requestAnimationFrame(loop);
}
function wake() { if (available && !raf && !document.hidden) { previous = 0; raf = requestAnimationFrame(loop); } }
function pause() { clock.pause(); cancelAnimationFrame(raf); raf = 0; if (available) update(sampleFlight(clock.time)); }
function play() {
  if (!available) return;
  message.hidden = true; launched = true; launchLatched = true; clock.play();
  // Initialize/resume audio inside the launch gesture to respect browser autoplay policy.
  audio.start().then(() => {
    soundUnavailable = false;
    updateUtilityLabels();
    audio.update(sampleFlight(clock.time), clock.playing);
  }).catch(() => { soundUnavailable = true; updateUtilityLabels(); });
  update(sampleFlight(clock.time)); wake();
}
function seek(time) { if (!available) return; clock.seek(Number(time)); launched = clock.time > 0 || clock.playing; message.hidden = true; update(sampleFlight(clock.time)); if (!clock.playing) { cancelAnimationFrame(raf); raf = 0; } }

$('play').addEventListener('click', play);
progress.addEventListener('input', () => seek(progress.value));
document.querySelectorAll('.phase-ticks button').forEach((button) => { button.disabled = true; button.addEventListener('click', () => seek(button.dataset.time)); });
function redrawCamera() { if (available) update(sampleFlight(clock.time)); }
$('zoom').addEventListener('input',event=>{cameraControl.setZoom(Number(event.target.value));redrawCamera();});
$('zoom-auto').addEventListener('click',()=>{cameraControl.useAuto();redrawCamera();});
let drag;
stage.addEventListener('pointerdown',event=>{
  if (!available || stage.dataset.canPan!=='true' || !event.isPrimary || event.button!==0 || drag) return;
  if (event.target.closest('button,input,a')) return;
  event.preventDefault();
  drag={id:event.pointerId,x:event.clientX,y:event.clientY};
  stage.setPointerCapture(event.pointerId);
  stage.dataset.dragging='true';
});
stage.addEventListener('pointermove',event=>{
  if (!drag || drag.id!==event.pointerId) return;
  const bounds=stage.getBoundingClientRect();
  cameraControl.pan((event.clientX-drag.x)/bounds.width,(event.clientY-drag.y)/bounds.height);
  drag.x=event.clientX;drag.y=event.clientY;
  redrawCamera();
});
function finishDrag(event) {
  if (!drag || drag.id!==event.pointerId) return;
  drag=undefined;stage.dataset.dragging='false';
  if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
}
for (const event of ['pointerup','pointercancel','lostpointercapture']) stage.addEventListener(event,finishDrag);
stage.addEventListener('keydown',event=>{
  if (!available || stage.dataset.canPan!=='true') return;
  const delta={ArrowLeft:[.05,0],ArrowRight:[-.05,0],ArrowUp:[0,.05],ArrowDown:[0,-.05]}[event.key];
  if (!delta) return;
  event.preventDefault();cameraControl.pan(...delta);redrawCamera();
});
$('sound').addEventListener('click', async () => {
  try {
    await audio.toggle();
    soundUnavailable = false;
    updateUtilityLabels();
    audio.update(sampleFlight(clock.time), clock.playing);
  } catch { soundUnavailable = true; updateUtilityLabels(); }
});
function updateUtilityLabels() {
  $('sound').setAttribute('aria-pressed', String(audio.enabled));
  const soundKey = soundUnavailable ? 'control.soundUnavailable' : $('sound').getAttribute('aria-pressed') === 'true' ? 'control.soundOff' : 'control.soundOn';
  $('sound').setAttribute('aria-label', t(soundKey));
  $('sound').title = t(soundKey);
  $('fullscreen').title = t(fullscreenUnavailable ? 'control.fullscreenUnavailable' : 'control.fullscreen');
}
updateUtilityLabels();
updateCameraControls(cameraControl.pose);
$('fullscreen').disabled = !document.fullscreenEnabled;
$('fullscreen').addEventListener('click', async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.querySelector('.flight-window').requestFullscreen(); }
  catch { fullscreenUnavailable = true; updateUtilityLabels(); }
});

document.addEventListener('visibilitychange', () => {
  previous = 0;
  if (document.hidden) { cancelAnimationFrame(raf); raf = 0; audio.update(sampleFlight(clock.time), false); }
  else { updateTime(); wake(); }
});
reducedMotion.addEventListener('change', () => {
  if (reducedMotion.matches) { wasPlaying = false; pause(); }
});

const dialog = $('atmosphere-dialog');
function fitArchive() {
  if (!dialog.open) return;
  const viewportHeight=window.visualViewport?.height||innerHeight;
  const maxWidth=Math.min(980,document.documentElement.clientWidth*.94);
  const maxHeight=viewportHeight*.92;
  const css=getComputedStyle(dialog);
  const px=name=>parseFloat(css[name])||0;
  const horizontal=px('paddingLeft')+px('paddingRight')+px('borderLeftWidth')+px('borderRightWidth');
  const vertical=px('paddingTop')+px('paddingBottom')+px('borderTopWidth')+px('borderBottomWidth');
  const intro=dialog.querySelector('.study-intro'),heading=dialog.querySelector('.dialog-heading');
  const ratio=2040/1536,minimumWidth=Math.min(maxWidth,300);
  let width=maxWidth;
  // Re-measure the copy after narrowing: English and Chinese wrap differently.
  for(let pass=0;pass<6;pass++) {
    dialog.style.width=width+'px';
    const introCss=getComputedStyle(intro);
    const textHeight=heading.getBoundingClientRect().height+intro.getBoundingClientRect().height+parseFloat(introCss.marginTop)+parseFloat(introCss.marginBottom);
    const imageHeight=Math.max(1,Math.min((width-horizontal)/ratio,maxHeight-vertical-textHeight));
    $('comparison').style.width=(imageHeight*ratio)+'px';
    // CSS aspect-ratio also follows max-width immediately during viewport resize.
    const nextWidth=Math.max(minimumWidth,Math.min(width,imageHeight*ratio+horizontal));
    if(Math.abs(nextWidth-width)<.5) break;
    width=nextWidth;
  }
}
function fitDesktop() {
  const main=document.querySelector('main');
  if(!matchMedia('(min-width:1001px) and (min-height:700px)').matches) {
    main.style.removeProperty('--desktop-width');return;
  }
  if(document.fullscreenElement) return;
  const viewportHeight=window.visualViewport?.height||innerHeight;
  const maxWidth=Math.min(1640,document.documentElement.clientWidth*.916);
  const frame=document.querySelector('.flight-window'),footer=document.querySelector('.bottom-signoff');
  const frameCss=getComputedStyle(frame),footerCss=getComputedStyle(footer);
  const borderY=parseFloat(frameCss.borderTopWidth)+parseFloat(frameCss.borderBottomWidth);
  const borderX=parseFloat(frameCss.borderLeftWidth)+parseFloat(frameCss.borderRightWidth);
  let width=maxWidth;
  // Narrowing can move telemetry to two rows. Measure that row budget again.
  for(let pass=0;pass<6;pass++) {
    main.style.setProperty('--desktop-width',width+'px');
    const fixedHeight=[document.querySelector('.site-header'),document.querySelector('.telemetry'),document.querySelector('.playback'),footer].reduce((sum,el)=>sum+el.getBoundingClientRect().height,0)+parseFloat(footerCss.marginTop)+parseFloat(footerCss.marginBottom)+borderY;
    const nextWidth=Math.min(width,Math.max(1,viewportHeight-fixedHeight-1)*1.95+borderX);
    if(Math.abs(nextWidth-width)<.5) break;
    width=nextWidth;
  }
}
function openArchive() { if (dialog.open) return; wasPlaying = clock.playing; pause(); dialog.showModal(); fitArchive(); }
window.addEventListener('resize',fitDesktop);
window.visualViewport?.addEventListener('resize',fitDesktop);
document.addEventListener('fullscreenchange',fitDesktop);
fitDesktop();
window.addEventListener('resize',fitArchive);
window.visualViewport?.addEventListener('resize',fitArchive);
$('open-atmosphere').addEventListener('click', openArchive);
dialog.querySelector('.close-dialog').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => { if (event.target === dialog) { const bounds = dialog.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close(); } });
dialog.addEventListener('close', () => { if (wasPlaying) play(); });
$('compare-range').addEventListener('input', (event) => {
  const value = event.target.value;
  $('comparison-haze').style.clipPath = `inset(0 0 0 ${value}%)`;
  $('compare-line').style.left = `${value}%`;
  $('comparison').style.setProperty('--comparison-color',visibilityColor(1-value/100));
});

function staticFallback(reason) {
  available = false;
  clock.pause(); cancelAnimationFrame(raf); raf = 0;
  audio.update(sampleFlight(clock.time), false);
  flight?.dispose(); flight = undefined;
  document.querySelector('.fallback-photo').src = assetUrl(sampleFlight(clock.time).haze > .5 ? 'xian-haze.webp' : 'xian-clear.webp');
  $('tracking-panel').dataset.visible = 'false';
  $('tracking-panel').setAttribute('aria-hidden', 'true');
  $('tracking-panel').inert = true;
  for (const el of [$('play'), $('sound'), $('zoom'), $('zoom-auto'), progress, ...document.querySelectorAll('.phase-ticks button')]) el.disabled = true;
  stage.dataset.ready = 'fallback'; stage.dataset.phase = 'STATIC';
  fallbackReason = reason;
  renderFallbackMessage();
  updateTransport(sampleFlight(clock.time));
  updateTime();
}

function renderFallbackMessage() {
  message.hidden = false;
  message.replaceChildren();
  const paragraph = document.createElement('p');
  paragraph.textContent = t(fallbackReason === 'WEBGL_UNAVAILABLE' ? 'fallback.static' : fallbackReason === 'CONTEXT_LOST' ? 'fallback.context' : 'fallback.assets');
  const detail = document.createElement('span'); detail.textContent = t('fallback.detail'); paragraph.append(detail);
  message.append(paragraph);
  if (fallbackReason !== 'WEBGL_UNAVAILABLE') {
    const retry = document.createElement('button'); retry.className = 'retry'; retry.textContent = t('fallback.retry');
    retry.onclick = () => location.reload(); message.append(retry);
  }
  text('phase-label', t('fallback.phase'));
}
$('language').addEventListener('click', () => {
  setLocale(getLocale() === 'en' ? 'zh-CN' : 'en');
  applyTranslations();
  fitDesktop();
  fitArchive();
  updateUtilityLabels();
  if (available) update(sampleFlight(clock.time));
  else {
    if (fallbackReason) renderFallbackMessage();
    updateTransport(sampleFlight(clock.time));
    updateCameraControls(cameraControl.pose);
    updateTime();
  }
});

function loadingProgress(completed) {
  $('loading-progress').setAttribute('aria-valuenow', String(completed));
  $('loading-progress').style.setProperty('--load-progress', completed / 5);
  $('loading-count').textContent = `${String(completed).padStart(2,'0')} / 05`;
  const key = completed === 5 ? 'loading.ready' : completed >= 4 ? 'loading.cameras' : 'loading.images';
  $('loading-step').dataset.i18n = key;
  $('loading-step').textContent = t(key);
}
try {
  flight = await createFlightRenderer($('flight-visuals'), () => staticFallback('CONTEXT_LOST'), placeMarker, cameraControl, loadingProgress);
  available = true;
  for (const el of [$('play'), $('sound'), $('zoom'), $('zoom-auto'), progress, ...document.querySelectorAll('.phase-ticks button')]) el.disabled = false;
  applyTranslations();
  updateUtilityLabels();
  message.hidden = true;
  update(sampleFlight(0));
  loadingProgress(5);
} catch (error) { staticFallback(error.message); }
finally {
  const shownAt = await loadingShownAt;
  // The minimum runs alongside downloads, never after them. Let the final
  // progress update settle before starting the handoff on a slower connection.
  const progressSettle = available && !reducedMotion.matches ? 240 : 0;
  await new Promise(resolve => setTimeout(resolve, Math.max(0, 1500 - (performance.now() - shownAt), progressSettle)));
  document.body.dataset.loading = 'false';
  $('preloader').setAttribute('aria-hidden', 'true');
  $('preloader').inert = true;
  const fadeDuration = parseFloat(getComputedStyle($('preloader')).transitionDuration) * 1000;
  if (fadeDuration > 0) await new Promise(resolve => setTimeout(resolve, fadeDuration));
  $('preloader').hidden = true;
  loadingSurfaces.forEach(element => { element.inert = false; });
  if (available) stage.dataset.ready = 'true';
}

// 仅显式检查链接提供只读统计和确定性帧控制，不出现在普通用户界面。
if (new URLSearchParams(location.search).has('inspect')) {
  window.__PAGODAX__ = {
    pause, play, seek,
    state: () => ({ time: clock.time, playing: clock.playing, waiting: !launched, available, fps, ...flight?.stats() }),
  };
}
window.addEventListener('pagehide', () => { pause(); });
if (import.meta.hot) import.meta.hot.dispose(() => { clearInterval(wallClockTimer); cancelAnimationFrame(raf); window.removeEventListener('resize',fitDesktop); window.visualViewport?.removeEventListener('resize',fitDesktop); document.removeEventListener('fullscreenchange',fitDesktop); window.removeEventListener('resize',fitArchive); window.visualViewport?.removeEventListener('resize',fitArchive); flight?.dispose(); audio.dispose(); });
