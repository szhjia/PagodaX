import { test,expect } from '@playwright/test';

test.use({deviceScaleFactor:2});

test('4K及缩放后的最大化桌面整页适配视口，播放前后没有纵向滚动且所有控制完整',async({page})=>{
  await page.goto('/?inspect=1');
  await expect(page.locator('#stage')).toHaveAttribute('data-ready','true');
  for(const viewport of [{width:1920,height:1080},{width:3840,height:2160},{width:3072,height:1728},{width:2560,height:1440},{width:1728,height:972},{width:1536,height:864},{width:1440,height:900},{width:1280,height:720}]) {
    await page.setViewportSize(viewport);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    for(const locale of ['en','zh-CN']) {
      if(await page.locator('html').getAttribute('lang')!==locale) await page.locator('#language').click();
      for(const time of [0,12,24,42,48]) {
        await page.evaluate(t=>window.__PAGODAX__.seek(t),time);
        const layout=await page.evaluate(()=>({viewport:{width:innerWidth,height:innerHeight},scroll:{width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight},parts:[...document.querySelectorAll('.site-header,#stage,.telemetry,.playback,.bottom-signoff')].map(el=>{const r=el.getBoundingClientRect();return {part:el.id||el.className,x:r.x,y:r.y,right:r.right,bottom:r.bottom,height:r.height};})}));
        expect(layout.scroll.height,JSON.stringify({viewport,locale,time,layout})).toBeLessThanOrEqual(layout.viewport.height);
        expect(layout.scroll.width).toBeLessThanOrEqual(layout.viewport.width);
        for(const part of layout.parts) {
          expect(part.y).toBeGreaterThanOrEqual(0);
          expect(part.bottom,part.part).toBeLessThanOrEqual(layout.viewport.height+.5);
        }
        const stage=layout.parts.find(p=>p.part==='stage');
        const mission=await page.locator('.program-name').boundingBox();
        expect(mission.x+mission.width/2).toBeCloseTo((stage.x+stage.right)/2,1);
        const origin=await page.locator('[data-i18n="footer.origin"]').boundingBox();
        expect(origin.x+origin.width/2).toBeCloseTo((stage.x+stage.right)/2,1);
        expect(stage.height).toBeGreaterThan(250);
        expect((stage.right-stage.x)/stage.height).toBeCloseTo(1.95,2);
        await expect(page.locator('#play')).toBeInViewport();
        await expect(page.locator('#sound')).toBeInViewport();
        await expect(page.locator('#zoom')).toBeInViewport();
        await expect(page.locator('#fullscreen')).toBeInViewport();
        expect((await page.locator('#flight-instrument').boundingBox()).height).toBe(66);
        expect((await page.locator('#play').boundingBox()).height).toBe(48);
        if(time===24) {
          await expect(page.locator('#tracking-panel')).toBeVisible();
          expect((await page.locator('#tracking-view').boundingBox()).height,JSON.stringify({viewport,locale})).toBeGreaterThan(80);
          const tracker=await page.locator('#tracking-panel').boundingBox(),weather=await page.locator('.atmosphere-meter').boundingBox();
          expect(tracker.y).toBeGreaterThanOrEqual(weather.y+weather.height);
        }
      }
    }
    if(viewport.width===1920||viewport.width===1280) await page.screenshot({path:`test-results/desktop-fit-${viewport.width}x${viewport.height}.png`,fullPage:true});
    expect(await page.locator('html').evaluate(el=>getComputedStyle(el).overflow)).not.toBe('hidden');
    await page.mouse.wheel(0,500);
    await page.waitForTimeout(50);
    expect(await page.evaluate(()=>scrollY)).toBe(0);
  }
});
