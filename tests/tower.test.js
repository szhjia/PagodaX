import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTower } from '../src/tower.js';
import { IGNITION_TIME, TRACKING_END, sampleFlight } from '../src/flight.js';

test('完整七层使用独立摄影纹理，升空30秒后仍有实体', () => {
  const assets={front:Array.from({length:7},()=>new THREE.Texture()),side:Array.from({length:7},()=>new THREE.Texture()),brick:new THREE.Texture(),cornice:new THREE.Texture(),roof:new THREE.Texture(),clear:new THREE.Texture()};
  const tower=createTower(assets);
  const body=tower.group.getObjectByName('seven-complete-storeys');
  const storeys=body.children.filter(child=>child.name.startsWith('storey-'));
  assert.equal(storeys.length,7);
  for(const [level,storey] of storeys.entries()) {
    assert.equal(storey.material.uniforms.frontMap.value,assets.front[level]);
    assert.equal(storey.material.uniforms.sideMap.value,assets.side[level]);
    assert.ok(!Object.values(storey.material.uniforms).some(uniform=>uniform.value===assets.clear));
  }
  tower.update(sampleFlight(IGNITION_TIME - .01));
  assert.equal(tower.group.visible,false);
  tower.update(sampleFlight(IGNITION_TIME));
  assert.equal(tower.group.visible,true);
  assert.equal(storeys[0].material.uniforms.visibility.value,0);
  tower.update(sampleFlight(IGNITION_TIME + 2));
  assert.ok(storeys[0].material.uniforms.visibility.value>0);
  assert.ok(storeys[0].material.uniforms.visibility.value<1);
  tower.update(sampleFlight(TRACKING_END));
  assert.equal(tower.group.visible,true);
  assert.ok(tower.group.position.y>5000);
  assert.equal(tower.group.getObjectByName('nine-engine-propulsion-module').visible,true);
});

test('每层保留各自实拍立面，实体深度避免背面屋檐穿透', () => {
  const assets = { front: Array.from({length:7}, () => new THREE.Texture()), side: Array.from({length:7}, () => new THREE.Texture()), brick: new THREE.Texture(), cornice: new THREE.Texture(), roof: new THREE.Texture() };
  const tower = createTower(assets);
  const body = tower.group.getObjectByName('seven-complete-storeys');
  const storeys = body.children.filter(child => child.name.startsWith('storey-'));
  for (let level = 0; level < 7; level++) {
    assert.equal(storeys[level].material.uniforms.frontMap.value, assets.front[level]);
    assert.equal(storeys[level].material.uniforms.sideMap.value, assets.side[level]);
  }
  tower.update(sampleFlight(16));
  body.traverse(mesh => { if (mesh.isMesh) assert.equal(mesh.material.depthWrite, true); });
});
