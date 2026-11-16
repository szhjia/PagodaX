import { test, expect } from '@playwright/test';

test('斜砖檐保留实拍纹理，世界空间灯光不随镜头转动', async ({ page }) => {
  await page.goto('/?inspect=1');
  await expect(page.locator('#stage')).toHaveAttribute('data-ready', 'true');
  const result = await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { towerVertex, towerFragment } = await import('/src/shaders.js');
    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(32, 32);
    const target = new THREE.WebGLRenderTarget(32, 32);
    renderer.setRenderTarget(target);
    const map = new THREE.DataTexture(new Uint8Array([180, 30, 10, 255]), 1, 1);
    const brick = new THREE.DataTexture(new Uint8Array([10, 30, 180, 255]), 1, 1);
    map.needsUpdate = brick.needsUpdate = true;
    const geometry = new THREE.PlaneGeometry(2, 2);
    const normals = geometry.getAttribute('normal');
    for (let i = 0; i < normals.count; i++) normals.setXYZ(i, 0, .8, .6);
    const uniforms = {
      frontMap: {value:map}, sideMap: {value:map}, brickMap: {value:brick},
      baseHeight:{value:100}, visibility:{value:1}, heat:{value:0}, haze:{value:0},
      hazeColor:{value:new THREE.Color()}, surfaceOnly:{value:2},
    };
    const material = new THREE.ShaderMaterial({vertexShader:towerVertex, fragmentShader:towerFragment, uniforms});
    const scene = new THREE.Scene(); scene.add(new THREE.Mesh(geometry, material));
    const camera = new THREE.OrthographicCamera(-1,1,1,-1,.1,100);
    function sample(x) {
      camera.position.set(x,0,4); camera.lookAt(0,0,0);
      renderer.render(scene,camera);
      const pixel = new Uint8Array(4);
      renderer.readRenderTargetPixels(target,16,16,1,1,pixel);
      return [...pixel];
    }
    const slope = sample(0);
    uniforms.surfaceOnly.value = 1;
    const front = sample(0), oblique = sample(2);
    geometry.dispose(); material.dispose(); map.dispose(); brick.dispose(); target.dispose(); renderer.dispose();
    return {slope, front, oblique};
  });
  // The old .5 normal cutoff replaced sloped cornice photographs with blue test masonry.
  expect(result.slope[0]).toBeGreaterThan(result.slope[2] * 4);
  for (let i=0;i<3;i++) expect(Math.abs(result.front[i]-result.oblique[i])).toBeLessThanOrEqual(1);
});

test('摄影立面校正后不透明且保留门窗明暗细节', async ({ page }) => {
  await page.goto('/?inspect=1');
  await expect(page.locator('#stage')).toHaveAttribute('data-ready', 'true');
  const result = await page.evaluate(async () => {
    const { loadAssets } = await import('/src/assets.js');
    const assets = await loadAssets();
    const front = assets.front.map(map => {
      const canvas = map.image;
      const {data} = canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height);
      let transparent=0, min=255, max=0;
      for (let i=0;i<data.length;i+=4) { transparent += data[i+3] !== 255; min=Math.min(min,data[i]); max=Math.max(max,data[i]); }
      return {transparent, contrast:max-min};
    });
    Object.values(assets).flat().forEach(map => map.dispose());
    return {front};
  });
  expect(result.front).toHaveLength(7);
  result.front.forEach(face => { expect(face.transparent).toBe(0); expect(face.contrast).toBeGreaterThan(50); });
});
