import { test, expect } from '@playwright/test';

async function ready(page) {
  await page.goto('/?inspect=1');
  await expect(page.locator('#stage')).toHaveAttribute('data-ready','true');
}

test('横向仪表填补中部，飞行器释义靠右，曲线与引擎随进程更新且可回拨',async({page})=>{
  await ready(page);
  const panel=await page.locator('.flight-profile').boundingBox();
  const speed=await page.locator('.metric').nth(1).boundingBox();
  const vehicle=await page.locator('.vehicle-mark').boundingBox();
  const telemetry=await page.locator('.telemetry').boundingBox();
  const inset=await page.locator('.telemetry').evaluate(el=>parseFloat(getComputedStyle(el).paddingRight));
  expect(panel.x).toBeGreaterThan(speed.x+speed.width);
  expect(panel.x+panel.width).toBeLessThan(vehicle.x);
  expect(panel.width).toBeGreaterThan(panel.height*2);
  expect(Math.abs(vehicle.x+vehicle.width-telemetry.x-telemetry.width+inset)).toBeLessThan(1);
  await expect(page.locator('.telemetry-note')).toHaveCount(0);
  await expect.poll(()=>page.locator('.vehicle-mark img').evaluate(img=>img.naturalWidth)).toBeGreaterThan(0);
  const original=await page.locator('#profile-line').getAttribute('points');
  const base=Number(await page.locator('#profile-dot').getAttribute('cy'));
  await page.evaluate(()=>window.__PAGODAX__.seek(10));
  await expect(page.locator('#engine-output')).toHaveText('100%');
  await page.evaluate(()=>window.__PAGODAX__.seek(42));
  expect(Number(await page.locator('#profile-dot').getAttribute('cy'))).toBeLessThan(base);
  expect((await page.locator('#profile-line').getAttribute('points')).length).toBeGreaterThan(original.length);
  await page.evaluate(()=>window.__PAGODAX__.seek(0));
  await expect(page.locator('#profile-line')).toHaveAttribute('points',original);
  await expect(page.locator('#engine-output')).toHaveText('000%');
});

test('北京时间标题在日期左侧，跨北京午夜正确换日，天气同排对齐原指示条',async({page})=>{
  await page.clock.setFixedTime(new Date('2026-11-16T15:59:59Z'));
  await ready(page);
  await expect(page.locator('#mission-date')).toHaveText('2026.11.16');
  const label=await page.locator('#clock-label').boundingBox();
  const date=await page.locator('#mission-date').boundingBox();
  expect(date.x).toBeGreaterThan(label.x+label.width);
  expect(await page.locator('#mission-time').evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeLessThanOrEqual(28);
  await page.clock.setFixedTime(new Date('2026-11-16T16:00:01Z'));
  await expect(page.locator('#mission-date')).toHaveText('2026.11.17');
  await expect(page.locator('#mission-time')).toHaveText('00:00:01');
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
    await page.setViewportSize(viewport);
    for(const locale of ['en','zh-CN']) {
      if(await page.locator('html').getAttribute('lang')!==locale) await page.locator('#language').click();
      for(const time of [0,18,48]) {
        await page.evaluate(t=>window.__PAGODAX__.seek(t),time);
        const title=await page.locator('.atmosphere-meter>span').boundingBox();
        const status=await page.locator('#visibility-label').boundingBox();
        const bar=await page.locator('.atmosphere-meter>div').boundingBox();
        expect(Math.abs(title.x-bar.x)).toBeLessThan(1);
        expect(status.x).toBeGreaterThan(title.x+title.width);
        expect(status.y).toBeLessThan(title.y+title.height);
        expect(title.y).toBeLessThan(status.y+status.height);
        expect(status.x+status.width).toBeLessThanOrEqual(bar.x+bar.width+1);
      }
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    }
  }
});

test('四个仪表标签默认高亮飞行剖面，推移切换不改变任务时间，键盘可操作',async({page})=>{
  await ready(page);
  const tabs=page.getByRole('tab');
  await expect(tabs).toHaveCount(4);
  await expect(tabs.nth(0)).toHaveAttribute('aria-selected','true');
  await page.evaluate(()=>window.__PAGODAX__.seek(30));
  const before=await page.evaluate(()=>window.__PAGODAX__.state());
  for(const index of [1,2,3,0]) {
    await tabs.nth(index).click();
    await expect(tabs.nth(index)).toHaveAttribute('aria-selected','true');
    await expect(page.getByRole('tabpanel')).toHaveCount(1);
    const id=await tabs.nth(index).getAttribute('aria-controls');
    await expect.poll(async()=>page.locator('#'+id).evaluate(el=>Math.abs(el.getBoundingClientRect().left-el.closest('.instrument-window').getBoundingClientRect().left))).toBeLessThan(2);
    expect((await page.evaluate(()=>window.__PAGODAX__.state())).time).toBe(before.time);
    expect(await page.locator('.instrument-track').evaluate(el=>parseFloat(getComputedStyle(el).transitionDuration))).toBeGreaterThan(0);
  }
  await tabs.nth(0).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(tabs.nth(3)).toBeFocused();
  await expect(tabs.nth(3)).toHaveAttribute('aria-selected','true');
  await page.keyboard.press('Home');
  await expect(tabs.nth(0)).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(tabs.nth(1)).toBeFocused();
  await page.keyboard.press('End');
  await expect(tabs.nth(3)).toBeFocused();
  await page.locator('#language').click();
  await expect(tabs.nth(3)).toHaveText('飞行预测');
  await expect(tabs.nth(3)).toHaveAttribute('aria-selected','true');
  for(const width of [1440,768,390]) {
    await page.setViewportSize({width,height:1000});
    for(const index of [0,1,2,3]) {
      await tabs.nth(index).click();
      const tab=await tabs.nth(index).boundingBox();
      const window=await page.locator('.flight-profile').boundingBox();
      expect(tab.x).toBeGreaterThan(window.x);
      expect(tab.x+tab.width).toBeLessThan(window.x+window.width);
    }
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await page.screenshot({path:'test-results/instruments-mobile.png',fullPage:true});
});

test('推进剂、九机和飞行预测实时联动，可回拨，减少动态时取消推移动画',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await ready(page);
  const tabs=page.getByRole('tab');
  await tabs.nth(1).click();
  await expect(page.locator('#propellant-remaining')).toHaveText('100.0%');
  await page.evaluate(()=>window.__PAGODAX__.seek(12));
  await expect(page.locator('#propellant-remaining')).toHaveText('88.4%');
  await expect(page.locator('#propellant-used')).toHaveText('11.6%');
  const early=Number(await page.locator('.propellant-gauge').getAttribute('aria-valuenow'));
  await page.evaluate(()=>window.__PAGODAX__.seek(36));
  expect(Number(await page.locator('.propellant-gauge').getAttribute('aria-valuenow'))).toBeLessThan(early);
  await tabs.nth(2).click();
  await expect(page.locator('#engine-state')).toHaveText('NOMINAL');
  await expect(page.locator('#engine-count')).toHaveText('09 / 09');
  await expect(page.locator('#engine-array i')).toHaveCount(9);
  await expect(page.locator('#engine-output')).toHaveText('100%');
  await tabs.nth(3).click();
  await expect(page.locator('#insertion-countdown')).toHaveText('08:30');
  await expect(page.locator('#orbit-altitudes')).toContainText('320 × 340');
  await expect(page.locator('#orbit-elements')).toHaveText('53° · 91.0 min');
  expect(await page.locator('.instrument-track').evaluate(el=>parseFloat(getComputedStyle(el).transitionDuration))).toBe(0);
  await page.evaluate(()=>window.__PAGODAX__.seek(44));
  await tabs.nth(2).click();
  await expect(page.locator('#engine-state')).toHaveText('SHUTDOWN');
  await page.evaluate(()=>window.__PAGODAX__.seek(48));
  await expect(page.locator('#engine-state')).toHaveText('SEQUENCE COMPLETE');
  await expect(page.locator('#engine-count')).toHaveText('00 / 09');
  await expect(page.locator('#engine-output')).toHaveText('000%');
  await page.evaluate(()=>window.__PAGODAX__.seek(0));
  await expect(page.locator('#engine-state')).toHaveText('STANDBY');
  await tabs.nth(1).click();
  await expect(page.locator('#propellant-remaining')).toHaveText('100.0%');
  await page.screenshot({path:'test-results/instruments-propellant.png',fullPage:true});
});

test('品牌最后三秒渐显并保留，恢复无句号的小字，移除其余多余标题',async({page})=>{
  await ready(page);
  await expect(page.locator('#mission-title')).toHaveClass('sr-only');
  await expect(page.locator('.mission-intro,.mission-footer')).toHaveCount(0);
  await expect(page.locator('#end-card .end-wordmark')).toHaveText('PagodaX');
  for(const locale of ['en','zh-CN']) {
    if(await page.locator('html').getAttribute('lang')!==locale) await page.locator('#language').click();
    await expect(page.locator('body')).not.toContainText('未来，仍有熟悉的轮廓。');
    await expect(page.locator('body')).not.toContainText('千年形态，新的航迹。');
    await expect(page.locator('body')).not.toContainText('从长安，向天空。');
    await page.evaluate(()=>window.__PAGODAX__.seek(45));
    await expect(page.locator('#end-card')).toHaveCSS('opacity','0');
    await page.evaluate(()=>window.__PAGODAX__.seek(46.5));
    await expect(page.locator('#end-card')).toHaveCSS('opacity','0.5');
    await page.evaluate(()=>window.__PAGODAX__.seek(48));
    await expect(page.locator('#end-card')).toHaveCSS('opacity','1');
    await expect(page.locator('.end-tagline')).toHaveText(locale==='en'?'From Chang’an to the sky':'从长安，向天空');
    const wordmark=await page.locator('.end-wordmark').boundingBox(),tagline=await page.locator('.end-tagline').boundingBox();
    expect(tagline.y).toBeGreaterThan(wordmark.y+wordmark.height);
    expect(Math.abs(tagline.x+tagline.width/2-wordmark.x-wordmark.width/2)).toBeLessThan(1);
    await page.waitForTimeout(200);
    await expect(page.locator('#end-card')).toHaveCSS('opacity','1');
  }
  await page.screenshot({path:'test-results/mission-finale.png',fullPage:true});
});


test('仪表恢复66px及手机62px，四个面板内容完整，空间预测与任务时间联动',async({page})=>{
  await ready(page);
  const tabs=page.getByRole('tab');
  for(const width of [1440,1024,768,390,320]) {
    await page.setViewportSize({width,height:1000});
    for(const locale of ['en','zh-CN']) {
      if(await page.locator('html').getAttribute('lang')!==locale) await page.locator('#language').click();
      for(let index=0;index<4;index++) {
        await tabs.nth(index).click();
        const id=await tabs.nth(index).getAttribute('aria-controls');
        await expect.poll(async()=>page.locator('#'+id).evaluate(el=>Math.abs(el.getBoundingClientRect().left-el.closest('.instrument-window').getBoundingClientRect().left))).toBeLessThan(2);
        expect((await page.locator('#flight-instrument').boundingBox()).height).toBe(width>600?66:62);
        const clipped=await page.locator('#'+id).evaluate(el=>{
          const outer=el.closest('#flight-instrument').getBoundingClientRect();
          return [...el.querySelectorAll('strong,span,b,.engine-array,.propellant-gauge,svg')].filter(node=>{
            const r=node.getBoundingClientRect();
            return r.left<outer.left||r.right>outer.right||r.bottom>outer.bottom||r.top<outer.top;
          }).map(node=>node.id||node.className);
        });
        expect(clipped).toEqual([]);
      }
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    }
  }
  await page.setViewportSize({width:1440,height:1000});
  const near=await page.locator('#orbit-near').getAttribute('d');
  const far=await page.locator('#orbit-far').getAttribute('d');
  expect(near).not.toEqual(far);
  expect(near).not.toMatch(/NaN|undefined/);
  await page.evaluate(()=>window.__PAGODAX__.seek(6));
  await expect(page.locator('#insertion-countdown')).toHaveText('09:00');
  const start=await page.locator('#orbit-craft').getAttribute('cx');
  await page.evaluate(()=>window.__PAGODAX__.seek(48));
  await expect(page.locator('#insertion-countdown')).toHaveText('08:18');
  expect(await page.locator('#orbit-craft').getAttribute('cx')).not.toBe(start);
  await expect(page.locator('#orbit-elements')).toHaveText('53° · 91.0 分钟');
  await page.locator('#language').click();
  await expect(page.locator('#insertion-countdown')).toHaveText('08:18');
  await expect(page.locator('#orbit-elements')).toHaveText('53° · 91.0 min');
  await page.screenshot({path:'test-results/forecast-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.locator('#language').click();
  await page.screenshot({path:'test-results/forecast-mobile.png',fullPage:true});
  await page.evaluate(()=>window.__PAGODAX__.seek(0));
  await expect(page.locator('#insertion-countdown')).toHaveText('09:00');
  expect(await page.locator('#orbit-craft').getAttribute('cx')).toBe(start);
});

test('能见度指示条随天气平滑变色并增长，回拨、语言切换和重播正确复原',async({page})=>{
  await ready(page);
  const bar=page.locator('#visibility-bar');
  await expect(bar).toHaveCSS('background-color','rgb(75, 25, 63)');
  const startWidth=(await bar.boundingBox()).width;
  const colors=new Set();
  let previous=startWidth;
  for(let time=12;time<=30;time+=1) {
    await page.evaluate(t=>window.__PAGODAX__.seek(t),time);
    colors.add(await bar.evaluate(el=>getComputedStyle(el).backgroundColor));
    const width=(await bar.boundingBox()).width;
    expect(width).toBeGreaterThanOrEqual(previous-.1);previous=width;
  }
  expect(colors.size).toBeGreaterThan(15);
  await expect(bar).toHaveCSS('background-color','rgb(0, 228, 0)');
  await page.evaluate(()=>window.__PAGODAX__.seek(21));
  await expect(bar).toHaveCSS('background-color','rgb(255, 126, 0)');
  await page.locator('#language').click();
  await expect(bar).toHaveCSS('background-color','rgb(255, 126, 0)');
  await page.evaluate(()=>window.__PAGODAX__.seek(48));
  await page.locator('#play').click();
  await expect(bar).toHaveCSS('background-color','rgb(75, 25, 63)');
  await page.evaluate(()=>window.__PAGODAX__.pause());
  expect((await bar.boundingBox()).width).toBeCloseTo(startWidth,0);
});


test('空间图从地面出发动态绘制已飞航迹，显示当前高度，结束停在实际爬升位置',async({page})=>{
  await ready(page);
  await page.getByRole('tab').nth(3).click();
  const point=page.locator('#orbit-craft'),path=page.locator('#orbit-flown');
  const start=Number(await point.getAttribute('cx'));
  for(const time of [0,6,12]) {
    await page.evaluate(t=>window.__PAGODAX__.seek(t),time);
    expect(Number(await point.getAttribute('cx'))).toBe(start);
  }
  let previous=start,lastLength=0;
  for(const time of [18,24,30,42,48]) {
    await page.evaluate(t=>window.__PAGODAX__.seek(t),time);
    const x=Number(await point.getAttribute('cx'));
    expect(x).toBeGreaterThan(previous);previous=x;
    const length=await path.evaluate(el=>el.getTotalLength());
    expect(length).toBeGreaterThan(lastLength);lastLength=length;
  }
  expect(previous-start).toBeGreaterThan(20);
  await expect(page.locator('#orbit-current-height')).toHaveText('↑ 4.29 km');
  await expect(page.locator('.orbit-chart')).toHaveAccessibleName(/Current altitude 4.29 kilometers/);
  const end=await point.getAttribute('cx'),trail=await path.getAttribute('d');
  await page.waitForTimeout(200);
  expect(await point.getAttribute('cx')).toBe(end);
  expect(await path.getAttribute('d')).toBe(trail);
  await page.locator('#language').click();
  await expect(page.locator('#orbit-current-height')).toHaveText('↑ 4.29 千米');
  expect(await point.getAttribute('cx')).toBe(end);
  await page.screenshot({path:'test-results/forecast-live-final.png',fullPage:true});
  await page.locator('#play').click();
  expect(Number(await point.getAttribute('cx'))).toBe(start);
  await page.evaluate(()=>window.__PAGODAX__.pause());
});
