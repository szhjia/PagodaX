import { test,expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const evidence=JSON.parse(await readFile(new URL('../../docs/evidence/weather-registration.json',import.meta.url)));

test('天气对比固定建筑对齐，宽屏和手机拖动分界不改变两幅照片的配准',async({page})=>{
  await page.goto('/?inspect=1');
  await expect(page.locator('#stage')).toHaveAttribute('data-ready','true');
  await page.locator('#open-atmosphere').click();
  await expect(page.locator('#atmosphere-dialog')).toBeVisible();
  await page.locator('#compare-range').focus();
  for(const width of [1440,768,390]) {
    await page.setViewportSize({width,height:1000});
    for(const value of [0,25,39,50,75,100]) {
      await page.locator('#compare-range').fill(String(value));
      const colors={0:'rgb(75, 25, 63)',25:'rgb(126, 0, 35)',50:'rgb(255, 126, 0)',75:'rgb(255, 255, 0)',100:'rgb(0, 228, 0)'};
      if(colors[value]) await expect(page.locator('#comparison')).toHaveCSS('outline-color',colors[value]);
      const errors=await page.locator('#comparison').evaluate((root,matches)=>{
        const clear=root.querySelector(':scope>img'),haze=root.querySelector('.comparison-haze>img');
        const cm=new DOMMatrix(getComputedStyle(clear).transform),hm=new DOMMatrix(getComputedStyle(haze).transform);
        return matches.map(({source,target})=>{
          const p=hm.transformPoint(new DOMPoint(source[0]/2040*haze.clientWidth,source[1]/1536*haze.clientHeight));
          const q=cm.transformPoint(new DOMPoint(target[0]/2040*clear.clientWidth,target[1]/1536*clear.clientHeight));
          // The clear image scales around its zero origin, like the registered haze image.
          return Math.hypot(p.x-q.x,p.y-q.y);
        }).sort((a,b)=>a-b);
      },evidence.matches);
      expect(errors[Math.floor(errors.length*.95)]).toBeLessThan(2.2);
      await expect(page.locator('#comparison-haze')).toHaveCSS('clip-path',`inset(0px 0px 0px ${value}%)`);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    }
    await page.locator('#compare-range').fill('39');
    await page.screenshot({path:`test-results/weather-aligned-${width}.png`,fullPage:true});
  }
});
