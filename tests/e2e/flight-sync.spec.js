import { test,expect } from '@playwright/test';
import { sampleFlight } from '../../src/flight.js';
import { writeFile } from 'node:fs/promises';

test('自然播放完整48秒，每个可见帧的实际塔体位置与遥测同源，最后三秒品牌渐显',async({page})=>{
  await page.goto('/?inspect=1');
  await expect(page.locator('#stage')).toHaveAttribute('data-ready','true');
  await page.getByRole('button',{name:'Launch',exact:true}).click();
  const samples=await page.evaluate(()=>new Promise(resolve=>{
    const samples=[];
    const begin=performance.now();
    function read() {
      const state=window.__PAGODAX__.state();
      samples.push({time:state.time,renderTime:state.renderTime,lift:state.vehicleLift,altitude:document.querySelector('#altitude').textContent,velocity:document.querySelector('#velocity').textContent,stageTime:Number(document.querySelector('#stage').dataset.time),brandOpacity:Number(document.querySelector('#end-card').style.opacity),wallSeconds:(performance.now()-begin)/1000});
      if(!state.playing && state.time===48) resolve(samples);else requestAnimationFrame(read);
    }
    requestAnimationFrame(read);
  }));
  expect(samples.length).toBeGreaterThan(100);
  for(const row of samples) {
    const frame=sampleFlight(row.time);
    expect(row.renderTime).toBe(row.time);
    expect(row.lift).toBeCloseTo(frame.lift,6);
    expect(row.altitude).toBe(String(Math.round(frame.altitude)).padStart(3,'0'));
    expect(row.velocity).toBe(frame.speed.toFixed(1));
    expect(row.stageTime).toBeCloseTo(row.time,2);
    expect(row.brandOpacity).toBeCloseTo(frame.ending,6);
    if(row.time<12) {expect(row.altitude).toBe('000');expect(row.velocity).toBe('0.0');}
  }
  for(const time of [6,12,18,24,30,42,45,48]) expect(samples.some(row=>Math.abs(row.time-time)<.5)).toBe(true);
  expect(samples.at(-1).wallSeconds).toBeGreaterThan(47);
  expect(samples.at(-1).wallSeconds).toBeLessThan(53);
  await writeFile('test-results/flight-sync-samples.json',JSON.stringify({frames:samples.length,samples},null,2));
  await page.screenshot({path:'test-results/brand-dimmed-final.png',fullPage:true});
});
