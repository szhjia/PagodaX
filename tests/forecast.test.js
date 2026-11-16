import test from 'node:test';
import assert from 'node:assert/strict';
import { ORBIT_PLAN, ORBIT_PERIOD_SECONDS, sampleForecast, formatInsertion, orbitPath, orbitPoint, transferPoint, flownTransferPath } from '../src/forecast.js';
import { visibilityColor } from '../src/weather.js';

test('预测基于点火后的9分钟入轨计划，随任务时钟推进且可回拨',()=>{
  assert.equal(formatInsertion(sampleForecast(0).remaining),'09:00');
  assert.equal(formatInsertion(sampleForecast(6).remaining),'09:00');
  assert.equal(formatInsertion(sampleForecast(48).remaining),'08:18');
  assert.equal(formatInsertion(sampleForecast(546).remaining),'00:00');
  assert.equal(sampleForecast(1000).progress,1);
  for(const input of [-1,NaN,Infinity]) assert.equal(sampleForecast(input).remaining,540);
  assert.equal(formatInsertion(sampleForecast(6.1).remaining),'09:00');
  assert.equal(sampleForecast(0).progress,0);
});

test('近远地点定义半长轴和开普勒周期，倾斜轨道前后分段完整，转移端点吻合',()=>{
  const a=6371+(320+340)/2;
  assert.equal(ORBIT_PLAN.inclinationDeg,53);
  assert.ok(ORBIT_PERIOD_SECONDS/60>90.9 && ORBIT_PERIOD_SECONDS/60<91.1);
  assert.ok(Math.abs((2*Math.PI/ORBIT_PERIOD_SECONDS)**2*a**3-ORBIT_PLAN.earthMu)<1e-8);
  for(const front of [true,false]) {
    const path=orbitPath(front);
    assert.ok(path.startsWith('M'));
    assert.ok(path.includes('L'));
    assert.ok(!path.includes('NaN'));
  }
  assert.deepEqual(transferPoint(0),{x:60,y:7});
  const end=orbitPoint(.5);
  assert.ok(Math.abs(transferPoint(1).x-end.x)<1e-8);
  assert.ok(Math.abs(transferPoint(1).y-end.y)<1e-8);
});

test('天气色带沿指定深紫、暗红、橙、黄、绿插值且异常输入保持雾霾色',()=>{
  for(const [haze,color] of [[1,'rgb(75 25 63)'],[.75,'rgb(126 0 35)'],[.5,'rgb(255 126 0)'],[.25,'rgb(255 255 0)'],[0,'rgb(0 228 0)']]) assert.equal(visibilityColor(haze),color);
  assert.equal(visibilityColor(2),visibilityColor(1));
  assert.equal(visibilityColor(-1),visibilityColor(0));
  assert.equal(visibilityColor(NaN),visibilityColor(1));
  assert.notEqual(visibilityColor(.49),visibilityColor(.5));
});


test('实际爬升航段放大，地面时停在发射点，结尾位置明显但尚未入轨',()=>{
  assert.equal(sampleForecast(0).ascentProgress,0);
  assert.equal(sampleForecast(6).ascentProgress,0);
  assert.equal(sampleForecast(12).ascentProgress,0);
  let last=0;
  for(const time of [18,24,30,42,48]) {
    const f=sampleForecast(time);
    assert.ok(f.ascentProgress>last);last=f.ascentProgress;
    assert.ok(f.ascentProgress<1);
    assert.ok(flownTransferPath(f.ascentProgress).startsWith('M60,7C'));
  }
  assert.ok(transferPoint(last).x-transferPoint(0).x>20);
  assert.equal(sampleForecast(0).ascentProgress,0);
});
