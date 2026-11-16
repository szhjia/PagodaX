import test from 'node:test';
import assert from 'node:assert/strict';
import { CameraControl } from '../src/camera-control.js';

const view = { width: 2040, height: 1000 };

test('AUTO同步动画倍率和机位，手动变焦接管后不被后续动画覆盖', () => {
  const camera = new CameraControl();
  assert.deepEqual(camera.sample({x:34,y:169,zoom:1.38},view), {x:34,y:169,zoom:1.38,mode:'auto'});
  camera.setZoom(9);
  assert.deepEqual(camera.sample({x:0,y:90,zoom:1},view), {x:34,y:169,zoom:5,mode:'manual'});
  camera.setZoom(-1);
  assert.equal(camera.sample({x:0,y:90,zoom:1},view).zoom, 1);
  camera.setZoom(NaN);
  assert.equal(camera.sample({x:0,y:90,zoom:1},view).zoom, 1);
});

test('按当前倍率把拖动距离换算为相机位移，并限制在摄影边缘', () => {
  const camera = new CameraControl();
  camera.sample({x:0,y:90,zoom:1},view);
  camera.setZoom(2);
  camera.sample({x:0,y:90,zoom:1},view);
  camera.pan(.25,-.1);
  assert.deepEqual(camera.sample({x:0,y:90,zoom:1},view), {x:-255,y:40,zoom:2,mode:'manual'});
  camera.setZoom(5);
  camera.sample({x:0,y:90,zoom:1},view);
  camera.pan(-100,100);
  assert.deepEqual(camera.sample({x:0,y:90,zoom:1},view), {x:816,y:668,zoom:5,mode:'manual'});
});

test('1倍时不拖动，AUTO放大后拖动接管，返回AUTO恢复当前动画构图', () => {
  const camera = new CameraControl();
  camera.sample({x:0,y:90,zoom:1},view);
  assert.equal(camera.pan(.1,.1), false);
  assert.equal(camera.mode, 'auto');
  camera.sample({x:34,y:169,zoom:1.38},view);
  assert.equal(camera.pan(.1,0), true);
  assert.equal(camera.mode, 'manual');
  camera.useAuto();
  assert.deepEqual(camera.sample({x:0,y:90,zoom:1},view), {x:0,y:90,zoom:1,mode:'auto'});
});
