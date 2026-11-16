import { test, expect } from '@playwright/test';

async function ready(page) {
  await page.goto('/?inspect=1');
  await expect(page.locator('#stage')).toHaveAttribute('data-ready', 'true');
}
async function state(page) { return page.evaluate(() => window.__PAGODAX__.state()); }

test('直接倒计时点火，完整48秒发射包含离地后30秒跟踪且无运行错误', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  await ready(page);
  expect((await state(page)).playing).toBe(false);
  await page.getByRole('button', { name: 'Launch', exact: true }).click();
  await expect(page.locator('#stage')).toHaveAttribute('data-phase', 'COUNTDOWN');
  await expect(page.locator('#countdown')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Launch', exact: true })).toBeDisabled();
  await expect(page.locator('#stage')).toHaveAttribute('data-phase', 'IGNITION', { timeout: 8500 });
  await expect(page.locator('#stage')).toHaveAttribute('data-phase', 'BEYOND', { timeout: 45000 });
  await expect(page.getByRole('button', { name: 'Launch', exact: true })).toBeEnabled({ timeout: 15000 });
  expect((await state(page)).time).toBe(48);
  expect((await state(page)).playing).toBe(false);
  await expect(page.locator('#play')).toHaveAttribute('aria-pressed','false');
  await expect(page.locator('#play')).toHaveAttribute('data-latched','false');
  await expect(page.locator('#tracking-panel')).toBeHidden();
  await expect(page.locator('#end-card')).toHaveCSS('opacity', '1');
  expect(errors).toEqual([]);
});

test('等待发射、阶段跳转、键盘进度、3次重新发射资源稳定', async ({ page }) => {
  await ready(page);
  await expect(page.getByRole('button', { name: /暂停|播放|重播/ })).toHaveCount(0);
  const paused = (await state(page)).time;
  await page.waitForTimeout(250);
  expect((await state(page)).time).toBe(paused);
  await page.getByRole('button', { name: 'Ignition', exact: true }).click();
  await expect(page.locator('#stage')).toHaveAttribute('data-phase', 'IGNITION');
  await page.locator('#progress').focus();
  await page.keyboard.press('End');
  expect((await state(page)).time).toBe(48);
  // 先暖机所有可见材质，再比较重复播放的GPU资源数量。
  await page.evaluate(() => { for (const time of [0, 8, 14, 20, 27, 37, 42]) window.__PAGODAX__.seek(time); });
  const before = await state(page);
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.__PAGODAX__.seek(48));
    await page.getByRole('button', { name: 'Launch', exact: true }).click();
    await expect.poll(async () => (await state(page)).time).toBeLessThan(1);
    await page.evaluate(() => { window.__PAGODAX__.pause(); window.__PAGODAX__.seek(28); });
  }
  const after = await state(page);
  expect(after.geometries).toBe(before.geometries);
  expect(after.textures).toBe(before.textures);
});

test('天气推演保留档案对比，移除下载与指定说明，关闭后恢复发射', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Launch', exact: true }).click();
  await page.getByRole('button', { name: 'Weather archive' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  expect((await state(page)).playing).toBe(false);
  await page.getByRole('slider', { name: 'Clear and hazy image comparison divider' }).focus();
  await page.keyboard.press('End');
  await expect(page.locator('#compare-line')).toHaveCSS('left', /px/);
  await expect(dialog.locator('a[download]')).toHaveCount(0);
  await expect(dialog).not.toContainText('基于你提供的 8 张同机位照片');
  await expect(dialog.locator('#comparison-haze img')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect.poll(async ()=>(await state(page)).playing).toBe(true);
});

test('手机构图无横向溢出，减少动态效果默认静态且可主动播放', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page);
  expect((await state(page)).time).toBe(0);
  expect((await state(page)).playing).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const box = await page.locator('#stage').boundingBox();
  expect(box.width / box.height).toBeCloseTo(2040 / 1536, 2);
  await page.getByRole('button', { name: 'Launch', exact: true }).click();
  await expect.poll(async () => (await state(page)).time).toBeGreaterThan(0);
});

test('WebGL不可用时提供静态摄影与天气档案对比', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) { return type === 'webgl2' ? null : original.call(this, type, ...args); };
  });
  await page.goto('/');
  await expect(page.locator('#stage')).toHaveAttribute('data-ready', 'fallback');
  await expect(page.getByText('This device is showing a static view')).toBeVisible();
  await expect(page.locator('.fallback-photo')).toBeVisible();
  await page.getByRole('button', { name: 'Weather archive' }).click();
  await expect(page.locator('#comparison')).toBeVisible();
  await expect(page.locator('#atmosphere-dialog a[download]')).toHaveCount(0);
});

test('摄影资源失败时明确回退，可重新加载', async ({ page }) => {
  await page.route('**/assets/xian-cleanplate.webp', (route) => route.abort());
  await page.goto('/');
  await expect(page.locator('#stage')).toHaveAttribute('data-ready', 'fallback');
  await expect(page.getByText('Scene assets could not be loaded')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reload', exact: true })).toBeVisible();
});

test('档案内启用减少动态效果，关闭后保持暂停并允许主动播放', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Launch', exact: true }).click();
  await page.getByRole('button', { name: 'Weather archive' }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.keyboard.press('Escape');
  expect((await state(page)).playing).toBe(false);
  await page.getByRole('button', { name: 'Launch', exact: true }).click();
  expect((await state(page)).playing).toBe(true);
});

test('竖屏全屏的摄影画面覆盖到底部，不出现几何范围外黑区', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  await page.getByRole('button', { name: 'View fullscreen', exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  const bounds = await page.locator('#stage').boundingBox();
  expect(bounds.height / bounds.width).toBeGreaterThan(1536 / 2040);
  await page.waitForTimeout(100);
  const pixel = await page.evaluate(() => {
    window.__PAGODAX__.seek(0);
    const canvas = document.querySelector('#flight-visuals canvas');
    const gl = canvas.getContext('webgl2');
    const pixel = new Uint8Array(4);
    gl.readPixels(Math.floor(canvas.width / 2), 4, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    return [...pixel];
  });
  expect(Math.max(...pixel.slice(0, 3))).toBeGreaterThan(20);
});

test('广场机位保持固定，塔完全离场后才交接右侧跟踪镜头', async ({ page }) => {
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await ready(page);
  const main=await page.locator('#stage').boundingBox();
  for(const time of [0,3,12,16]) {
    await page.evaluate(t=>window.__PAGODAX__.seek(t),time);
    await expect(page.locator('#tracking-panel')).toBeHidden();
    expect((await state(page)).trackingVisible).toBe(false);
  }
  for(const time of [21,28,38,42]) {
    await page.evaluate(t=>window.__PAGODAX__.seek(t),time);
    const frame=await state(page);
    expect(frame.flightSeconds).toBe(time-12);
    expect(frame.mainCameraY).toBe(90);
    expect(frame.cameraZoom).toBe(1);
    expect(frame.mainBottom.y).toBeGreaterThan(1);
    expect(frame.trackingVisible).toBe(true);
    await expect(page.locator('#tracking-panel')).toBeVisible();
    expect(Math.abs(frame.trackingTarget.x)).toBeLessThan(.7);
    expect(Math.abs(frame.trackingTarget.y)).toBeLessThan(.7);
    expect(frame.trackingTarget).not.toEqual(frame.mainTarget);
  }
  const side=await page.locator('#tracking-view').boundingBox();
  expect(side.x).toBeGreaterThan(main.x+main.width*.6);
  expect(side.x+side.width).toBeLessThan(main.x+main.width);
  expect(await page.locator('#stage').boundingBox()).toEqual(main);
  await expect(page.locator('#tracking-seconds')).toHaveText('30.0');
  await page.evaluate(()=>window.__PAGODAX__.seek(3));
  await expect(page.locator('#tracking-panel')).toBeHidden();
  expect(errors).toEqual([]);
});

test('天气入口去重，声音只有静音与声波两态图标', async ({ page }) => {
  await ready(page);
  await expect(page.locator('#open-comparison')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Weather archive' })).toHaveCount(1);
  await expect(page.locator('#mission-title')).toHaveText('PagodaX launch mission');
  await expect(page.locator('body')).not.toContainText('冲破霾层');
  const sound = page.locator('#sound');
  await expect(sound).toHaveText('');
  await expect(sound).toHaveAttribute('aria-pressed', 'true');
  await expect(sound.locator('.sound-muted')).toBeHidden();
  await expect(sound.locator('.sound-waves')).toBeVisible();
  await sound.click();
  await expect(sound).toHaveAttribute('aria-pressed', 'false');
  await expect(sound).toHaveAttribute('aria-label', 'Enable sound');
  await expect(sound).toHaveAttribute('title', 'Enable sound');
  await expect(sound.locator('.sound-muted')).toBeVisible();
  await expect(sound.locator('.sound-waves')).toBeHidden();
  await sound.click();
  await expect(sound).toHaveAttribute('aria-pressed', 'true');
  await expect(sound).toHaveAttribute('aria-label', 'Mute sound');
  await expect(sound.locator('.sound-muted')).toBeHidden();
  await expect(sound.locator('.sound-waves')).toBeVisible();
});

test('手机副镜头接力时广场尺寸不变，回到发射前恢复单画面', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  const main=await page.locator('#stage').boundingBox();
  await page.evaluate(()=>window.__PAGODAX__.seek(28));
  await expect(page.locator('#tracking-panel')).toBeVisible();
  const side=await page.locator('#tracking-view').boundingBox();
  expect(side.y).toBeGreaterThanOrEqual(main.y+main.height);
  expect(await page.locator('#stage').boundingBox()).toEqual(main);
  expect(Math.abs((await state(page)).trackingTarget.y)).toBeLessThan(.7);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.evaluate(()=>window.__PAGODAX__.seek(48));
  await expect(page.locator('#tracking-panel')).toBeHidden();
  expect(await page.locator('#stage').boundingBox()).toEqual(main);
  await page.evaluate(()=>window.__PAGODAX__.seek(0));
  await expect(page.locator('#tracking-panel')).toBeHidden();
  expect(await page.locator('#stage').boundingBox()).toEqual(main);
});

test('暂停倒计时后重排窗口，定位框继续对准塔体', async ({ page }) => {
  await ready(page);
  await page.evaluate(()=>{window.__PAGODAX__.pause();window.__PAGODAX__.seek(3);});
  await page.setViewportSize({width:1100,height:900});
  await expect.poll(()=>page.evaluate(()=>{
    const frame=window.__PAGODAX__.state();
    const stage=document.getElementById('stage').getBoundingClientRect();
    const marker=document.getElementById('target-marker').getBoundingClientRect();
    const actual=marker.left+marker.width/2-stage.left;
    const expected=(frame.mainTarget.x*.5+.5)*stage.width;
    return Math.abs(actual-expected);
  })).toBeLessThan(1);
  expect((await state(page)).playing).toBe(false);
});

test('待发射时北京时间每秒更新，点击后切换为任务倒计时', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-15T16:00:00Z'));
  await ready(page);
  await expect(page.locator('#stage')).toHaveAttribute('data-phase', 'STANDBY');
  await expect(page.locator('#phase-label')).toHaveText('Awaiting launch');
  await expect(page.locator('#clock-label')).toContainText('BEIJING TIME');
  await expect(page.locator('#mission-time')).toHaveText('00:00:00');
  await expect(page.locator('#countdown')).toHaveCount(0);
  await page.clock.setFixedTime(new Date('2026-11-15T16:00:02Z'));
  await expect(page.locator('#mission-time')).toHaveText('00:00:02');
  expect((await state(page)).time).toBe(0);
  expect((await state(page)).playing).toBe(false);
  await page.getByRole('button', { name: 'Launch', exact: true }).click();
  await expect(page.locator('#clock-label')).toContainText('MISSION TIME');
  await expect(page.locator('#mission-time')).toHaveText(/T−00:0[56]/);
  await expect(page.locator('#stage')).toHaveAttribute('data-phase', 'COUNTDOWN');
  await page.clock.setFixedTime(new Date('2026-11-15T17:30:00Z'));
  await expect(page.locator('#mission-time')).not.toHaveText('01:30:00');
});

test('开场浓雾保持到离地再逐渐散去，天气纹理失败仍可发射', async ({ page }) => {
  await page.route('**/assets/xian-haze.webp', route=>route.abort());
  await ready(page);
  const pixels=[];
  for(const time of [0,3,6,18,24,30,36,48]) {
    pixels.push(await page.evaluate(t=>{
      window.__PAGODAX__.seek(t);
      const canvas=document.querySelector('#flight-visuals canvas');
      const gl=canvas.getContext('webgl2');
      const pixel=new Uint8Array(4);
      gl.readPixels(Math.floor(canvas.width*.12),Math.floor(canvas.height*.8),1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
      return [...pixel];
    },time));
    await expect(page.locator('#visibility-label')).toHaveText(time<=12?'HAZY':time>=30?'CLEAR':'CLEARING');
  }
  expect(Math.max(...pixels[0].slice(0,3))).toBeGreaterThan(80);
  const distance=(a,b)=>a.slice(0,3).reduce((sum,value,i)=>sum+Math.abs(value-b[i]),0);
  for(const pixel of pixels.slice(0,3)) expect(distance(pixel,pixels[0])).toBeLessThan(3);
  expect(distance(pixels[0],pixels[5])).toBeGreaterThan(15);
  expect(distance(pixels[3],pixels[5])).toBeLessThan(distance(pixels[2],pixels[5]));
  expect(distance(pixels[4],pixels[5])).toBeLessThan(distance(pixels[3],pixels[5]));
  // 晴天阶段使用同一局部底板，固定机位的背景像素应保持一致。
  expect(pixels[6]).toEqual(pixels[5]);
});

test('点火起点没有硬切，结尾副屏逐渐收回，主机位恢复原照', async ({ page }) => {
  await ready(page);
  const pixelsAt = time=>page.evaluate(t=>{
    window.__PAGODAX__.seek(t);
    const canvas=document.querySelector('#flight-visuals canvas');
    const gl=canvas.getContext('webgl2');
    const result=[];
    for(const [x,y] of [[.50,.58],[.52,.56],[.54,.63],[.49,.69],[.18,.72],[.10,.35]]) {
      const pixel=new Uint8Array(4);
      gl.readPixels(Math.floor(canvas.width*x),Math.floor(canvas.height*y),1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
      result.push([...pixel]);
    }
    return result;
  },time);
  const original=await pixelsAt(0);
  expect(await pixelsAt(6)).toEqual(original);
  await page.evaluate(()=>window.__PAGODAX__.seek(42));
  await expect(page.locator('#tracking-panel')).toBeVisible();
  const opened=await page.locator('#tracking-panel').boundingBox();
  await page.evaluate(()=>window.__PAGODAX__.seek(45.5));
  await expect(page.locator('#tracking-panel')).toBeVisible();
  const closing=await page.locator('#tracking-panel').boundingBox();
  const transform=await page.locator('#tracking-panel').evaluate(el=>new DOMMatrix(getComputedStyle(el).transform).toJSON());
  expect(closing.x).toBeGreaterThan(opened.x);
  expect(closing.width).toBeCloseTo(opened.width,1);
  expect(closing.height).toBeCloseTo(opened.height,1);
  expect(transform.a).toBe(1);
  expect(transform.e).toBeGreaterThan(0);
  expect((await state(page)).trackingReveal).toBeCloseTo(.5,2);
  const completed=await pixelsAt(48);
  expect(completed).not.toEqual(original);
  const contrast=values=>{
    const luminance=values.slice(0,4).map(([r,g,b])=>.2126*r+.7152*g+.0722*b);
    return Math.max(...luminance)-Math.min(...luminance);
  };
  expect(contrast(completed)).toBeGreaterThan(contrast(original)*2);
  await expect(page.locator('#visibility-label')).toHaveText('CLEAR');
  await expect(page.locator('#tracking-panel')).toBeHidden();
  await expect(page.locator('#end-card')).toHaveCSS('opacity','1');
  await expect(page.getByRole('button',{name:'Launch',exact:true})).toBeEnabled();
});

test('点火变焦拉近，离地时平滑回到广场视野，页面尺寸不跳变', async ({ page }) => {
  await ready(page);
  const bounds=await page.locator('#stage').boundingBox();
  await page.evaluate(()=>window.__PAGODAX__.seek(6));
  expect((await state(page)).cameraZoom).toBe(1);
  await page.evaluate(()=>window.__PAGODAX__.seek(10));
  const focused=await state(page);
  expect(focused.cameraZoom).toBeCloseTo(1.38,2);
  expect(Math.abs(focused.mainTarget.x)).toBeLessThan(.1);
  await page.evaluate(()=>window.__PAGODAX__.seek(14));
  const departing=await state(page);
  expect(departing.cameraZoom).toBeLessThan(focused.cameraZoom);
  expect(departing.cameraZoom).toBeGreaterThan(1);
  await page.evaluate(()=>window.__PAGODAX__.seek(18));
  expect((await state(page)).cameraZoom).toBe(1);
  expect((await state(page)).mainCameraY).toBe(90);
  expect(await page.locator('#stage').boundingBox()).toEqual(bounds);
});
