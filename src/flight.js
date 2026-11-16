import { TOWER } from './calibration.js';

export const IGNITION_TIME = 6;
export const LIFTOFF_TIME = 12;
export const TRACKING_DURATION = 30;
export const TRACKING_END = LIFTOFF_TIME + TRACKING_DURATION;
export const DURATION = TRACKING_END + 6;
// 归一化质量下的垂直动力飞行：恒推力、匀速耗油，扣除重力，忽略阻力。
// 参数用于本项目的模拟演出，不代表 Falcon 9 的实测遥测。
export const ASCENT = { gravity: 9.81, initialThrust: 15.2, fuelRate: .006, propellantFraction: .30 };
export const PHASES = [
  { start: 0, key: 'COUNTDOWN', label: '发射倒计时', caption: '大雁塔，准备出发。' },
  { start: IGNITION_TIME, key: 'IGNITION', label: '发动机点火', caption: '九机点火。新的旅程，即将开始。' },
  { start: LIFTOFF_TIME, key: 'LIFTOFF', label: '大雁塔升空', caption: '从熟悉的广场，向更远的天空。' },
  { start: 24, key: 'CLOUD_BREAK', label: '穿越云层', caption: '云层之上，远行继续。' },
  { start: 32, key: 'UPPER_ASCENT', label: '持续爬升', caption: '速度渐起，视野渐远。' },
  { start: TRACKING_END, key: 'BEYOND', label: '向天而行', caption: '大雁塔的下一站，是天空。' },
];

export const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));
export function smooth(a, b, value) {
  const v = clamp((value - a) / (b - a));
  return v * v * (3 - 2 * v);
}

// 一切可见状态由任务时间求值，不依赖上一帧，保证重播和跳转一致。
export function sampleFlight(input) {
  const time = clamp(Number.isFinite(input) ? input : 0, 0, DURATION);
  const stage = PHASES.findLast((p) => time >= p.start);
  const elapsed = Math.max(0, time - LIFTOFF_TIME);
  const { gravity, initialThrust, fuelRate } = ASCENT;
  const burned = fuelRate * elapsed;
  const logMassRatio = -Math.log1p(-burned);
  const speed = initialThrust / fuelRate * logMassRatio - gravity * elapsed;
  const altitude = initialThrust / fuelRate ** 2 * (burned - (1 - burned) * logMassRatio) - .5 * gravity * elapsed ** 2;
  // Mass is normalized at liftoff; include propellant used during the ignition hold.
  const ignitionMass=1+fuelRate*(LIFTOFF_TIME-IGNITION_TIME);
  const initialPropellant=ASCENT.propellantFraction*ignitionMass;
  const propellantUsed=clamp(fuelRate*Math.max(0,time-IGNITION_TIME)/initialPropellant);
  const lift = altitude * (TOWER.height / 64);
  const flame = smooth(IGNITION_TIME, IGNITION_TIME + 3, time) * (1 - smooth(DURATION - 5, DURATION, time));
  const towerReveal = smooth(IGNITION_TIME + .2, LIFTOFF_TIME - 1, time);
  const photoReturn = smooth(TRACKING_END, DURATION - .5, time);
  const focus = smooth(IGNITION_TIME, IGNITION_TIME + 4, time) * (1 - smooth(LIFTOFF_TIME, LIFTOFF_TIME + 4, time));
  return {
    time, phase: stage.key, label: stage.label, caption: stage.caption,
    complete: time === DURATION,
    // 开场保持雾霾，离地后才逐渐转为清晰天气。
    haze: 1 - smooth(LIFTOFF_TIME, LIFTOFF_TIME + 18, time),
    // 点火后的局部气流掩护塔体交接，结尾再回到原始清晰照片。
    plate: towerReveal * (1 - photoReturn),
    photoReturn,
    airPressure: smooth(IGNITION_TIME, IGNITION_TIME + 1, time) * (1 - smooth(LIFTOFF_TIME, LIFTOFF_TIME + 5, time)),
    trackingRetraction: smooth(DURATION - 4.5, DURATION - .5, time),
    flame,
    flightSeconds: Math.min(TRACKING_DURATION, elapsed),
    cloudClearance: smooth(350, 1600, altitude),
    lift,
    altitude,
    speed,
    propellantUsed,
    propellantRemaining: 1-propellantUsed,
    acceleration: time >= LIFTOFF_TIME ? initialThrust / (1 - burned) - gravity : 0,
    towerOpacity: towerReveal,
    cameraY: 0,
    focus,
    zoom: 1 + .38 * focus,
    shake: flame * (1 - smooth(LIFTOFF_TIME, LIFTOFF_TIME + 6, time)),
    ending: smooth(DURATION - 3, DURATION, time),
  };
}

export function formatMissionTime(time) {
  const seconds = Math.floor(Math.abs(time - IGNITION_TIME));
  return `T${time < IGNITION_TIME ? '−' : '+'}${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export class MissionClock {
  time = 0;
  playing = false;
  play() { if (this.time >= DURATION) this.time = 0; this.playing = true; }
  pause() { this.playing = false; }
  seek(value) {
    this.time = clamp(Number.isFinite(value) ? value : 0, 0, DURATION);
    if (this.time === DURATION) this.playing = false;
  }
  reset() { this.time = 0; this.playing = true; }
  tick(delta, hidden = false) {
    if (this.playing && !hidden && Number.isFinite(delta) && delta > 0) this.seek(this.time + delta);
    return sampleFlight(this.time);
  }
}
