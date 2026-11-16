import test from 'node:test';
import assert from 'node:assert/strict';
import { DURATION, IGNITION_TIME, LIFTOFF_TIME, TRACKING_DURATION, TRACKING_END, sampleFlight, MissionClock, formatMissionTime } from '../src/flight.js';

test('直接从6秒倒计时进入点火、离地与结尾', () => {
  assert.equal(DURATION, 48);
  assert.equal(sampleFlight(0).phase, 'COUNTDOWN');
  assert.equal(sampleFlight(5).phase, 'COUNTDOWN');
  assert.equal(sampleFlight(6).phase, 'IGNITION');
  assert.equal(sampleFlight(12).phase, 'LIFTOFF');
  assert.equal(sampleFlight(42).phase, 'BEYOND');
  assert.equal(sampleFlight(48).complete, true);
});

test('点火后局部气流推动塔体渐显，结尾回到清晰原照', () => {
  assert.equal(sampleFlight(IGNITION_TIME - .01).plate, 0);
  assert.equal(sampleFlight(IGNITION_TIME).plate, 0);
  assert.equal(sampleFlight(IGNITION_TIME).towerOpacity, 0);
  assert.equal(sampleFlight(IGNITION_TIME).airPressure, 0);
  const early = sampleFlight(IGNITION_TIME + .5);
  const later = sampleFlight(IGNITION_TIME + 2);
  assert.ok(early.towerOpacity > 0 && early.towerOpacity < later.towerOpacity);
  assert.ok(later.towerOpacity < 1);
  assert.ok(later.airPressure > .9);
  assert.equal(sampleFlight(LIFTOFF_TIME - 1).towerOpacity, 1);
  assert.equal(sampleFlight(LIFTOFF_TIME - 1).plate, 1);
  assert.equal(sampleFlight(IGNITION_TIME - .01).flame, 0);
  assert.equal(sampleFlight(LIFTOFF_TIME).altitude, 0);
  for (let time = 0; time <= DURATION; time++) {
    assert.ok(!['OBSERVATION', 'ATMOSPHERE'].includes(sampleFlight(time).phase));
  }
  assert.equal(sampleFlight(TRACKING_END).photoReturn, 0);
  assert.ok(sampleFlight(DURATION - 3).photoReturn > .5);
  assert.equal(sampleFlight(DURATION).photoReturn, 1);
  assert.equal(sampleFlight(DURATION).plate, 0);
  assert.equal(sampleFlight(DURATION).ending, 1);
});

test('点火时平滑拉近塔体，离地后恢复原广场构图', () => {
  assert.equal(sampleFlight(IGNITION_TIME).zoom, 1);
  assert.ok(sampleFlight(IGNITION_TIME + 2).zoom > 1);
  assert.equal(sampleFlight(IGNITION_TIME + 4).zoom, 1.38);
  assert.equal(sampleFlight(LIFTOFF_TIME).zoom, 1.38);
  assert.ok(sampleFlight(LIFTOFF_TIME + 2).zoom < sampleFlight(LIFTOFF_TIME).zoom);
  assert.equal(sampleFlight(LIFTOFF_TIME + 4).zoom, 1);
  assert.equal(sampleFlight(LIFTOFF_TIME + 4).focus, 0);
  assert.equal(sampleFlight(DURATION).zoom, 1);
});

test('开场与点火阶段保持雾霾，离地后天气持续好转至清晰', () => {
  for (const time of [0, 3, IGNITION_TIME, LIFTOFF_TIME]) assert.equal(sampleFlight(time).haze, 1);
  for (let time = LIFTOFF_TIME + 1; time <= LIFTOFF_TIME + 18; time++) {
    assert.ok(sampleFlight(time).haze < sampleFlight(time - 1).haze);
  }
  assert.equal(sampleFlight(LIFTOFF_TIME + 18).haze, 0);
  assert.equal(sampleFlight(DURATION).haze, 0);
});

test('跟踪30秒后才慢慢收回副镜头，结束前完全收拢', () => {
  assert.equal(sampleFlight(TRACKING_END).trackingRetraction, 0);
  const first = sampleFlight(DURATION - 4);
  const last = sampleFlight(DURATION - 1);
  assert.ok(first.trackingRetraction > 0 && first.trackingRetraction < last.trackingRetraction);
  assert.ok(last.trackingRetraction < 1);
  assert.equal(sampleFlight(DURATION - .5).trackingRetraction, 1);
});

test('跳转为纯采样，越界钳制且异常输入回到起点', () => {
  const frame = sampleFlight(30);
  sampleFlight(60);
  assert.deepEqual(sampleFlight(30), frame);
  assert.deepEqual(sampleFlight(-2), sampleFlight(0));
  assert.deepEqual(sampleFlight(99), sampleFlight(60));
  assert.deepEqual(sampleFlight(NaN), sampleFlight(0));
});

test('暂停、隐藏与恢复不推进时间，重播彻底重置', () => {
  const clock = new MissionClock();
  clock.play();
  clock.tick(2);
  clock.pause();
  clock.tick(8);
  assert.equal(clock.time, 2);
  clock.play();
  clock.tick(5, true);
  assert.equal(clock.time, 2);
  clock.seek(DURATION - 1);
  clock.tick(2);
  assert.equal(clock.time, DURATION);
  assert.equal(clock.playing, false);
  clock.reset();
  assert.equal(clock.time, 0);
  assert.equal(clock.playing, true);
});

test('任务时间包含正确的正负号', () => {
  assert.equal(formatMissionTime(0), 'T−00:06');
  assert.equal(formatMissionTime(6), 'T+00:00');
  assert.equal(formatMissionTime(16), 'T+00:10');
});

test('离地后的30秒保持跟踪、动力和可见塔体，结尾才淡出', () => {
  assert.equal(LIFTOFF_TIME, 12);
  assert.equal(TRACKING_DURATION, 30);
  for (const time of [12, 18, 28, 38, 42]) {
    const frame = sampleFlight(time);
    assert.equal(frame.flightSeconds, time - LIFTOFF_TIME);
    assert.ok(frame.flame > .95);
    assert.ok(frame.towerOpacity > .6);
    assert.equal(frame.ending, 0);
  }
  assert.equal(sampleFlight(TRACKING_END - 1).cameraY, 0);
  assert.ok(sampleFlight(TRACKING_END - 1).cloudClearance > .9);
});

test('起步缓慢并持续加速，30秒爬升数千米，高度与速度保持物理一致', () => {
  const start = sampleFlight(LIFTOFF_TIME);
  assert.equal(start.altitude, 0);
  assert.equal(start.speed, 0);
  assert.ok(sampleFlight(LIFTOFF_TIME + 1).altitude < 4);
  for (let seconds = 1; seconds <= 30; seconds++) {
    const previous = sampleFlight(LIFTOFF_TIME + seconds - 1);
    const frame = sampleFlight(LIFTOFF_TIME + seconds);
    assert.ok(frame.altitude > previous.altitude);
    assert.ok(frame.speed > previous.speed);
    assert.ok(frame.acceleration > previous.acceleration);
    const before = sampleFlight(frame.time - .001);
    const after = sampleFlight(frame.time + .001);
    assert.ok(Math.abs((after.altitude - before.altitude) / .002 - frame.speed) < .0001);
    assert.ok(Math.abs((after.speed - before.speed) / .002 - frame.acceleration) < .0001);
  }
  const thirty = sampleFlight(LIFTOFF_TIME + 30);
  assert.ok(thirty.altitude > 2700 && thirty.altitude < 3200);
  assert.ok(thirty.speed > 190 && thirty.speed < 230);
});

test('品牌结尾在播放结束后保留，回拨时间轴才收起', () => {
  assert.equal(sampleFlight(42).ending, 0);
  assert.equal(sampleFlight(45).ending, 0);
  assert.ok(sampleFlight(46).ending > 0 && sampleFlight(46).ending < 1);
  assert.equal(sampleFlight(46.5).ending, .5);
  assert.ok(sampleFlight(47.99).ending < 1);
  assert.equal(sampleFlight(48).ending, 1);
  assert.equal(sampleFlight(100).ending, 1);
  assert.equal(sampleFlight(0).ending, 0);
});


test('推进剂包含点火等待消耗，余量与累计消耗守恒且回拨可复现', () => {
  assert.equal(sampleFlight(0).propellantRemaining, 1);
  assert.equal(sampleFlight(6).propellantUsed, 0);
  let previous=1;
  for(let time=6;time<=48;time+=.5) {
    const frame=sampleFlight(time);
    assert.ok(frame.propellantRemaining<=previous);
    assert.ok(frame.propellantRemaining>=0);
    assert.equal(frame.propellantRemaining+frame.propellantUsed,1);
    previous=frame.propellantRemaining;
  }
  assert.ok(Math.abs(sampleFlight(12).propellantRemaining-(1-.036/.3108))<1e-10);
  assert.ok(Math.abs(sampleFlight(48).propellantRemaining-(1-.252/.3108))<1e-10);
  assert.equal(sampleFlight(100).propellantUsed,sampleFlight(48).propellantUsed);
  assert.equal(sampleFlight(0).propellantRemaining,1);
});
