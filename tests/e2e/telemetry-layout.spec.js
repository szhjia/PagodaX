import { sampleFlight } from '../../src/flight.js';
import { TOWER } from '../../src/calibration.js';
import { test,expect } from '@playwright/test';

async function ready(page) {
  await page.goto('/?inspect=1');
  await expect(page.locator('#stage')).toHaveAttribute('data-ready','true');
}
async function geometry(page) {
  return page.locator('.telemetry').evaluate(root=>{const origin=root.getBoundingClientRect();return [...root.querySelectorAll(':scope>.mission-status,:scope>.metric,:scope>.flight-profile,:scope>.vehicle-mark')].filter(el=>getComputedStyle(el).display!=='none').map(el=>{
    const r=el.getBoundingClientRect();
    return {name:el.tagName==='SMALL'?'unit':el.id||el.className||el.tagName,x:r.x,width:r.width,y:r.y-origin.y,height:r.height};
  });});
}

test('数值增长不会改变高度速度列、右侧仪表和飞行器释义的水平位置',async({page})=>{
  await ready(page);
  for(const width of [1473,1440,1280,1201,1200,1100,1024,1001,1000,768,601,600,390,320]) {
    await page.setViewportSize({width,height:1292});
    let baseline;
    for(const locale of ['en','zh-CN']) {
      if(await page.locator('html').getAttribute('lang')!==locale) await page.locator('#language').click();
      for(const time of [0,6,12,18,24,32,42,48,0]) {
        await page.evaluate(t=>window.__PAGODAX__.seek(t),time);
        const current=await geometry(page);
        baseline??=current;
        expect(current.length).toBe(baseline.length);
        current.forEach((box,index)=>{
          expect(Math.abs(box.x-baseline[index].x),`width=${width} locale=${locale} time=${time} ${box.name} x`).toBeLessThan(.5);
          if(box.name!=='unit') expect(Math.abs(box.width-baseline[index].width),`width=${width} locale=${locale} time=${time} ${box.name} width`).toBeLessThan(.5);
          if(box.name==='flight-instrument') {
            expect(Math.abs(box.y-baseline[index].y),`width=${width} locale=${locale} time=${time} instrument row position`).toBeLessThan(.5);
            expect(box.height).toBe(width>600?66:62);
          }
        });
      }
    }
  }
});

test('四个面板保持可读宽度，数值和单位完整显示，中英文不溢出',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await ready(page);
  for(const width of [1473,1201,1200,1024,1001,1000,768,601,600,390,320]) {
    await page.setViewportSize({width,height:1292});
    for(const locale of ['en','zh-CN']) {
      if(await page.locator('html').getAttribute('lang')!==locale) await page.locator('#language').click();
      await page.evaluate(()=>window.__PAGODAX__.seek(48));
      for(const metric of await page.locator('.metric').all()) {
        const gap=await metric.evaluate(el=>el.querySelector('small').getBoundingClientRect().left-el.querySelector('strong>span').getBoundingClientRect().right);
        expect(gap).toBeGreaterThanOrEqual(0);expect(gap).toBeLessThanOrEqual(3.1);
      }
      for(const tab of await page.getByRole('tab').all()) {
        await tab.click();
        const overflow=await page.locator('.telemetry').evaluate(root=>{
          const outer=root.getBoundingClientRect();
          return [...root.querySelectorAll('.metric>strong,.metric small,.instrument-tabs button,.instrument-panel[aria-hidden=false] strong,.instrument-panel[aria-hidden=false] span')].filter(el=>{
            const r=el.getBoundingClientRect();
            const panel=el.closest('.metric')?.getBoundingClientRect()||el.closest('.flight-profile')?.getBoundingClientRect()||outer;
            return r.left<panel.left-.5||r.right>panel.right+.5||r.bottom>panel.bottom+.5||r.top<panel.top-.5;
          }).map(el=>el.id||el.textContent);
        });
        expect(overflow,`width=${width} locale=${locale}`).toEqual([]);
      }
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    }
  }
  await page.setViewportSize({width:1473,height:1292});
  await page.screenshot({path:'test-results/telemetry-stable-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'test-results/telemetry-stable-mobile.png',fullPage:true});
});


test('同一播放帧的塔体位移、高度速度、时间轴及预测高度一致，暂停和回拨不串帧',async({page})=>{
  await ready(page);
  for(const time of [0,6,11.9,12,12.1,14,18,24,30,42,45,48,18]) {
    await page.evaluate(t=>window.__PAGODAX__.seek(t),time);
    const snapshot=await page.evaluate(()=>({state:window.__PAGODAX__.state(),altitude:document.querySelector('#altitude').textContent,speed:document.querySelector('#velocity').textContent,time:Number(document.querySelector('#stage').dataset.time)}));
    const frame=sampleFlight(time);
    expect(snapshot.state.renderTime).toBe(time);
    expect(snapshot.state.vehicleLift).toBeCloseTo(frame.altitude*TOWER.height/64,6);
    expect(snapshot.altitude).toBe(String(Math.round(frame.altitude)).padStart(3,'0'));
    expect(snapshot.speed).toBe(frame.speed.toFixed(1));
    expect(snapshot.time).toBe(time);
  }
  await page.evaluate(()=>{window.__PAGODAX__.seek(11.5);window.__PAGODAX__.play();});
  const samples=await page.evaluate(()=>new Promise(resolve=>{
    const samples=[];
    function read(){
      samples.push({state:window.__PAGODAX__.state(),altitude:document.querySelector('#altitude').textContent,speed:document.querySelector('#velocity').textContent,time:Number(document.querySelector('#stage').dataset.time)});
      if(samples.length>=90) resolve(samples);else requestAnimationFrame(read);
    }
    requestAnimationFrame(read);
  }));
  await page.evaluate(()=>window.__PAGODAX__.pause());
  for(const sample of samples) {
    const frame=sampleFlight(sample.state.time);
    expect(sample.state.renderTime).toBe(sample.state.time);
    expect(sample.state.vehicleLift).toBeCloseTo(frame.lift,6);
    expect(sample.altitude).toBe(String(Math.round(frame.altitude)).padStart(3,'0'));
    expect(sample.speed).toBe(frame.speed.toFixed(1));
    expect(sample.time).toBeCloseTo(sample.state.time,2);
  }
  expect(samples.at(-1).state.time).toBeGreaterThan(12.5);
});
