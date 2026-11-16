import { test, expect } from '@playwright/test';

async function ready(page) {
  await page.goto('/?inspect=1');
  await expect(page.locator('#stage')).toHaveAttribute('data-ready','true');
}
async function state(page) { return page.evaluate(()=>window.__PAGODAX__.state()); }
async function zoom(page,value) {
  await page.locator('#zoom').evaluate((input,value)=>{input.value=String(value);input.dispatchEvent(new Event('input',{bubbles:true}));},value);
}
async function drag(page,dx,dy) {
  const box=await page.locator('#stage').boundingBox();
  await page.mouse.move(box.x+box.width*.45,box.y+box.height*.55);
  await page.mouse.down();
  await page.mouse.move(box.x+box.width*.45+dx,box.y+box.height*.55+dy,{steps:8});
  await page.mouse.up();
}

test('AUTO倍率与动画一致，手动变焦上限5倍且不会被动画覆盖，返回AUTO还原', async ({page})=>{
  await ready(page);
  await expect(page.locator('#zoom-auto')).toHaveAttribute('aria-pressed','true');
  for(const [time,value] of [[0,1],[10,1.38],[14,1.19],[18,1]]) {
    await page.evaluate(t=>window.__PAGODAX__.seek(t),time);
    await expect(page.locator('#zoom-value')).toHaveText(value.toFixed(2)+'×');
    expect((await state(page)).cameraZoom).toBeCloseTo(value,2);
  }
  await page.evaluate(()=>window.__PAGODAX__.seek(10));
  await zoom(page,3);
  await page.evaluate(()=>window.__PAGODAX__.seek(14));
  expect((await state(page)).cameraZoom).toBe(3);
  await expect(page.locator('#zoom-auto')).toHaveAttribute('aria-pressed','false');
  await page.locator('#zoom').focus();
  await page.keyboard.press('End');
  expect((await state(page)).cameraZoom).toBe(5);
  await expect(page.locator('#zoom-value')).toHaveText('5.00×');
  await page.locator('#zoom-auto').click();
  expect((await state(page)).cameraZoom).toBeCloseTo(1.19,2);
  expect((await state(page)).zoomMode).toBe('auto');
});

test('1倍图片不产生原生拖拽浮图，5倍拖动改变真实相机，AUTO可复位', async ({page})=>{
  await ready(page);
  await page.evaluate(()=>{window.__dragStarts=0;document.addEventListener('dragstart',()=>window.__dragStarts++);});
  await drag(page,50,30);
  expect(await page.evaluate(()=>window.__dragStarts)).toBe(0);
  expect((await state(page)).mainCameraX).toBe(0);
  await expect(page.locator('.fallback-photo')).toHaveAttribute('draggable','false');
  await zoom(page,5);
  const before=await state(page);
  await drag(page,50,30);
  const after=await state(page);
  expect(after.mainCameraX).toBeLessThan(before.mainCameraX);
  expect(after.mainCameraY).toBeGreaterThan(before.mainCameraY);
  expect(after.time).toBe(0);
  expect(after.geometries).toBe(before.geometries);
  expect(after.textures).toBe(before.textures);
  expect(await page.evaluate(()=>window.__dragStarts)).toBe(0);
  await expect(page.locator('#stage')).toHaveAttribute('data-dragging','false');
  await page.locator('#zoom-auto').click();
  expect((await state(page)).mainCameraX).toBe(0);
  expect((await state(page)).mainCameraY).toBe(90);
  expect((await state(page)).cameraZoom).toBe(1);
  await page.evaluate(()=>window.__PAGODAX__.seek(10));
  await drag(page,20,0);
  expect((await state(page)).zoomMode).toBe('manual');
  expect((await state(page)).cameraZoom).toBeCloseTo(1.38,2);
  const cross=await page.locator('.camera-crosshair').boundingBox(), stage=await page.locator('#stage').boundingBox();
  expect(Math.abs(cross.x+cross.width/2-stage.x-stage.width/2)).toBeLessThan(1);
  expect(Math.abs(cross.y+cross.height/2-stage.y-stage.height/2)).toBeLessThan(1);
  expect(cross.width).toBeLessThanOrEqual(16);
  await page.locator('#stage').focus();
  const x=(await state(page)).mainCameraX;
  await page.keyboard.press('ArrowRight');
  expect((await state(page)).mainCameraX).toBeGreaterThan(x);
});

test('天气档案照片也不能被浏览器拖出，回退禁用变焦', async ({page})=>{
  await page.route('**/assets/xian-cleanplate.webp',route=>route.abort());
  await page.goto('/');
  await expect(page.locator('#stage')).toHaveAttribute('data-ready','fallback');
  await expect(page.locator('#zoom')).toBeDisabled();
  await expect(page.locator('#zoom-auto')).toBeDisabled();
  await page.locator('#open-atmosphere').click();
  for(const image of await page.locator('#comparison img').all()) await expect(image).toHaveAttribute('draggable','false');
});

test.describe('触摸摄像头',()=>{
  test.use({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  test('手机放大后单指平移，原倍率可正常滚动，中英文控制区不溢出',async ({page},testInfo)=>{
    await ready(page);
    await expect(page.locator('#stage')).toHaveCSS('touch-action','pan-y');
    await zoom(page,3);
    await expect(page.locator('#stage')).toHaveCSS('touch-action','none');
    const before=await state(page), box=await page.locator('#stage').boundingBox();
    const x=box.x+box.width*.5,y=box.y+box.height*.6;
    const cdp=await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+40,y:y+20}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    expect((await state(page)).mainCameraX).toBeLessThan(before.mainCameraX);
    await expect(page.locator('#stage')).toHaveAttribute('data-dragging','false');
    for(const locale of ['en','zh-CN']) {
      if(await page.locator('html').getAttribute('lang')!==locale) await page.locator('#language').click();
      const control=await page.locator('.zoom-control').boundingBox(), sound=await page.locator('#sound').boundingBox();
      expect(control.x+control.width).toBeLessThan(sound.x);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      await page.screenshot({path:testInfo.outputPath('camera-mobile-'+locale+'.png'),fullPage:true});
    }
    await page.locator('#zoom-auto').click();
    await expect(page.locator('#stage')).toHaveCSS('touch-action','pan-y');
  });
});
