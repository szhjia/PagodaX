import { test, expect } from '@playwright/test';

test('中英文任务叙事移除模拟说明，左上角标识发射场且天气在右上角', async ({page}, testInfo) => {
  await page.goto('/?inspect=1');
  await expect(page.locator('#stage')).toHaveAttribute('data-ready','true');
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
    await page.setViewportSize(viewport);
    for(const locale of ['en','zh-CN']) {
      if(await page.locator('html').getAttribute('lang')!==locale) await page.locator('#language').click();
      await expect(page.locator('.camera-location')).toHaveCount(0);
      await expect(page.locator('.camera-id')).toHaveText('CAM 01');
      await expect(page.locator('#camera-mode')).toHaveText(locale==='en'?'Earth · Xi’an · Giant Wild Goose Pagoda Launch Site':'地球 · 西安 · 大雁塔发射场');
      const camera=await page.locator('.camera-top>span').boundingBox();
      const weather=await page.locator('.atmosphere-meter').boundingBox();
      const top=await page.locator('.camera-top').boundingBox();
      expect(weather.x).toBeGreaterThan(camera.x+camera.width);
      expect(Math.abs(weather.y-top.y)).toBeLessThan(1);
      const copy=await page.evaluate(()=>{
        const root=document.body.cloneNode(true);
        root.querySelectorAll('script,noscript').forEach(node=>node.remove());
        return root.textContent+' '+[...root.querySelectorAll('[aria-label],[alt]')].map(el=>(el.getAttribute('aria-label')||'')+(el.getAttribute('alt')||'')).join(' ');
      });
      expect(copy).not.toMatch(/模拟|simulat|推演/i);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      await page.screenshot({path:testInfo.outputPath('mission-'+viewport.width+'-'+locale+'.png'),fullPage:true});
    }
  }
});
