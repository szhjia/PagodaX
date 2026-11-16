import { test, expect } from '@playwright/test';

async function ready(page) {
  // Observe the real browser AudioContext; no mocked sound or production inspection API.
  await page.addInitScript(() => {
    const NativeAudio = window.AudioContext;
    window.__audioContexts = [];
    window.AudioContext = class extends NativeAudio {
      constructor(...args) { super(...args); window.__audioContexts.push(this); }
      createGain() { const gain = super.createGain(); this.masterGain ??= gain; return gain; }
    };
  });
  await page.goto('/?inspect=1');
  await expect(page.locator('#stage')).toHaveAttribute('data-ready','true');
}

test('默认声音开启，实际发射手势启动音频且静音会停止输出', async ({page}) => {
  await ready(page);
  await expect(page.locator('#sound')).toHaveAttribute('aria-pressed','true');
  expect(await page.evaluate(()=>window.__audioContexts.length)).toBe(0);
  await page.getByRole('button',{name:'Launch',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.__audioContexts[0]?.state)).toBe('running');
  await page.evaluate(()=>window.__PAGODAX__.seek(10));
  await expect.poll(()=>page.evaluate(()=>window.__audioContexts[0].masterGain.gain.value)).toBeGreaterThan(.1);
  await page.locator('#sound').click();
  await expect(page.locator('#sound')).toHaveAttribute('aria-pressed','false');
  await expect.poll(()=>page.evaluate(()=>window.__audioContexts[0].masterGain.gain.value)).toBeLessThan(.001);
  await page.locator('#language').click();
  await expect(page.locator('#sound')).toHaveAttribute('aria-pressed','false');
});

test('发射前主动静音，发射与重播不会重新打开声音', async ({page}) => {
  await ready(page);
  await page.locator('#sound').click();
  await page.getByRole('button',{name:'Launch',exact:true}).click();
  expect(await page.evaluate(()=>window.__audioContexts.length)).toBe(0);
  await page.evaluate(()=>{window.__PAGODAX__.pause();window.__PAGODAX__.seek(48);});
  await page.getByRole('button',{name:'Launch',exact:true}).click();
  await expect(page.locator('#sound')).toHaveAttribute('aria-pressed','false');
  expect(await page.evaluate(()=>window.__audioContexts.length)).toBe(0);
});
