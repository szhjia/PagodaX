import * as THREE from 'three';
import { basicVertex, airFragment, flameFragment, glowFragment, smokeVertex, smokeFragment } from './shaders.js';
import { TOWER, photoToWorld } from './calibration.js';
import { IGNITION_TIME } from './flight.js';

export function createEffects(scene, mobile) {
  const anchor = photoToWorld(TOWER.x, TOWER.base);
  const flames = [];
  for (let i = 0; i < 10; i++) {
    const material = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, power: { value: 0 }, seed: { value: i * 4.7 } },
      vertexShader: basicVertex, fragmentShader: flameFragment,
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    });
    const flame = new THREE.Mesh(new THREE.PlaneGeometry(i ? 14 : 142, i ? 120 : 520), material);
    flame.renderOrder = 20;
    scene.add(flame);
    flames.push(flame);
  }
  const glowMaterial = new THREE.ShaderMaterial({
    uniforms: { power: { value: 0 } }, vertexShader: basicVertex, fragmentShader: glowFragment,
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
  });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(410, 410), glowMaterial);
  glow.renderOrder = 21;
  scene.add(glow);

  const count = mobile ? 46 : 90;
  const geometry = new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(2, 2));
  const seeds = new Float32Array(count * 4);
  let state = 37201;
  for (let i = 0; i < seeds.length; i++) { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; seeds[i] = state / 4294967296; }
  geometry.setAttribute('seed', new THREE.InstancedBufferAttribute(seeds, 4));
  geometry.instanceCount = count;
  const smokeMaterial = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, lift: { value: 0 }, density: { value: 1 } },
    vertexShader: smokeVertex, fragmentShader: smokeFragment,
    transparent: true, depthWrite: false, depthTest: false,
  });
  const smoke = new THREE.Mesh(geometry, smokeMaterial);
  smoke.frustumCulled = false;
  smoke.renderOrder = 30;
  scene.add(smoke);

  const airMaterial = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, power: { value: 0 } },
    vertexShader: basicVertex, fragmentShader: airFragment,
    transparent: true, depthWrite: false, depthTest: false,
  });
  const air = new THREE.Mesh(new THREE.PlaneGeometry(720, 540), airMaterial);
  air.position.set(anchor.x, anchor.y + 145, 180);
  air.renderOrder = 35;
  scene.add(air);

  return {
    reduceQuality() { geometry.instanceCount = Math.min(geometry.instanceCount, 36); },
    update(frame) {
      air.visible = frame.airPressure > 0;
      airMaterial.uniforms.time.value = frame.time - IGNITION_TIME;
      airMaterial.uniforms.power.value = frame.airPressure;
      flames.forEach((flame, i) => {
        const baseHeight = i ? 120 : 520;
        const height = baseHeight * (.5 + frame.flame * .5);
        flame.visible = frame.flame > 0;
        const angle = (i - 2) * Math.PI / 4;
        const offset = i > 1 ? Math.sin(angle) * 43 * Math.cos(TOWER.rotationY) + Math.cos(angle) * 43 * Math.sin(TOWER.rotationY) : 0;
        const depth = i > 1 ? Math.cos(angle) * 43 : 0;
        flame.position.set(anchor.x + offset, anchor.y + frame.lift - 57 - depth * .1 - height / 2, 140);
        flame.scale.y = height / baseHeight;
        flame.material.uniforms.time.value = frame.time;
        flame.material.uniforms.power.value = frame.flame;
      });
      glow.position.set(anchor.x, anchor.y + frame.lift - 55, 145);
      glowMaterial.uniforms.power.value = frame.flame;
      glow.visible = frame.flame > 0;
      smoke.visible = frame.time >= IGNITION_TIME && frame.time < IGNITION_TIME + 22;
      smokeMaterial.uniforms.time.value = frame.time - IGNITION_TIME;
      smokeMaterial.uniforms.lift.value = frame.lift;
      smokeMaterial.uniforms.density.value = 1 - Math.max(0, (frame.time - IGNITION_TIME - 15) / 7);
    },
  };
}
