import { test,expect } from '@playwright/test';

async function ready(page) {
  await page.goto('/?inspect=1');
  await expect(page.locator('#stage')).toHaveAttribute('data-ready','true');
}

test('天气弹窗按可用宽高等比缩放，短窗口和手机不出现内部滚动，切换语言和重排仍完整',async({page})=>{
  await ready(page);
  for(const viewport of [{width:1473,height:1292},{width:1280,height:720},{width:1280,height:500},{width:768,height:1024},{width:390,height:844},{width:844,height:390},{width:568,height:320},{width:320,height:568},{width:320,height:360}]) {
    await page.setViewportSize(viewport);
    for(const locale of ['en','zh-CN']) {
      if(await page.locator('html').getAttribute('lang')!==locale) await page.locator('#language').click();
      await page.locator('#open-atmosphere').click();
      const size=await page.locator('#atmosphere-dialog').evaluate(el=>{
        const dialog=el.getBoundingClientRect(),image=el.querySelector('#comparison').getBoundingClientRect();
        return {x:dialog.x,y:dialog.y,right:dialog.right,bottom:dialog.bottom,width:dialog.width,height:dialog.height,scrollHeight:el.scrollHeight,clientHeight:el.clientHeight,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth,image:{width:image.width,height:image.height,bottom:image.bottom},viewport:{width:innerWidth,height:innerHeight}};
      });
      expect(size.scrollHeight,JSON.stringify({viewport,locale,size})).toBeLessThanOrEqual(size.clientHeight+1);
      expect(size.scrollWidth).toBeLessThanOrEqual(size.clientWidth+1);
      expect(size.x).toBeGreaterThanOrEqual(0);
      expect(size.y).toBeGreaterThanOrEqual(0);
      expect(size.right).toBeLessThanOrEqual(size.viewport.width);
      expect(size.bottom).toBeLessThanOrEqual(size.viewport.height);
      expect(size.width).toBeLessThanOrEqual(980.5);
      expect(size.image.width/size.image.height).toBeCloseTo(2040/1536,2);
      expect(size.image.height).toBeGreaterThan(35);
      expect(size.image.bottom).toBeLessThan(size.bottom);
      await expect(page.locator('.study-details')).toHaveCount(0);
      await expect(page.locator('html')).toHaveCSS('overflow','hidden');
      await page.locator('#compare-range').fill('75');
      await expect(page.locator('#comparison-haze')).toHaveCSS('clip-path','inset(0px 0px 0px 75%)');
      if(viewport.width===1280&&viewport.height===720&&locale==='zh-CN') await page.screenshot({path:'test-results/archive-fit-1280x720.png',fullPage:false});
      if(viewport.width===844&&locale==='en') await page.screenshot({path:'test-results/archive-fit-landscape.png',fullPage:false});
      await page.keyboard.press('Escape');
      await expect(page.locator('#atmosphere-dialog')).not.toBeVisible();
      expect(await page.locator('html').evaluate(el=>getComputedStyle(el).overflow)).not.toBe('hidden');
    }
  }
});

test('打开时重排保持图片完整，真实拖动与关闭后页面滚动可用',async({page})=>{
  await page.setViewportSize({width:1280,height:720});
  await ready(page);
  await page.locator('#open-atmosphere').click();
  for(const viewport of [{width:1280,height:500},{width:390,height:844},{width:1280,height:720}]) {
    await page.setViewportSize(viewport);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await expect.poll(()=>page.locator('#atmosphere-dialog').evaluate(el=>el.scrollHeight-el.clientHeight)).toBeLessThanOrEqual(1);
  }
  const image=await page.locator('#comparison').boundingBox();
  const thumb=Number(await page.locator('#compare-range').inputValue())/100;
  await page.mouse.move(image.x+image.width*thumb,image.y+image.height*.5);
  await page.mouse.down();
  await page.mouse.move(image.x+image.width*.8,image.y+image.height*.5,{steps:8});
  await page.mouse.up();
  expect(Number(await page.locator('#compare-range').inputValue())).toBeGreaterThan(70);
  const before=await page.evaluate(()=>scrollY);
  await page.mouse.wheel(0,500);
  await page.waitForTimeout(100);
  expect(await page.evaluate(()=>scrollY)).toBe(before);
  await page.keyboard.press('Escape');
  await expect(page.locator('html')).not.toHaveCSS('overflow','hidden');
  await page.setViewportSize({width:390,height:500});
  await page.mouse.wheel(0,500);
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(before);
});
