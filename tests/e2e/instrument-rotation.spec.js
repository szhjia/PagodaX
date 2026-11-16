import {test,expect} from '@playwright/test';

async function ready(page) {
  await page.goto('/?inspect=1');
  await expect(page.locator('#stage')).toHaveAttribute('data-ready','true');
}

test('离地后每3个任务秒顺序推移，结束固定在预测，回拨和重播恢复对应面板',async({page})=>{
  await ready(page);
  const tabs=page.getByRole('tab');
  for(const [time,index] of [[0,0],[6,0],[11.99,0],[12,0],[14.99,0],[15,1],[17.99,1],[18,2],[21,3],[24,0],[27,1],[30,2],[33,3],[36,0],[39,1],[42,2],[45,3],[47.99,3],[48,3]]) {
    await page.evaluate(time=>window.__PAGODAX__.seek(time),time);
    await expect(tabs.nth(index),`mission time ${time}`).toHaveAttribute('aria-selected','true');
    await expect(page.getByRole('tabpanel')).toHaveCount(1);
  }
  await page.waitForTimeout(3200);
  await expect(tabs.nth(3)).toHaveAttribute('aria-selected','true');
  await expect.poll(()=>page.locator('#instrument-panel-forecast').evaluate(el=>Math.abs(el.getBoundingClientRect().left-el.closest('.instrument-window').getBoundingClientRect().left))).toBeLessThan(2);
  await page.screenshot({path:'test-results/instrument-autocycle-final.png',fullPage:true});
  await page.locator('#play').click();
  await expect(tabs.nth(0)).toHaveAttribute('aria-selected','true');
  await page.evaluate(()=>{window.__PAGODAX__.pause();window.__PAGODAX__.seek(18);});
  await expect(tabs.nth(2)).toHaveAttribute('aria-selected','true');
  await page.evaluate(()=>window.__PAGODAX__.seek(0));
  await expect(tabs.nth(0)).toHaveAttribute('aria-selected','true');
});

test('真实播放跨界自动切换，暂停不轮播，手动选择保留到下一节拍且不抢焦点',async({page})=>{
  await ready(page);
  const tabs=page.getByRole('tab');
  await page.evaluate(()=>window.__PAGODAX__.seek(14.8));
  await page.locator('#play').click();
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected','true',{timeout:2000});
  await page.evaluate(()=>window.__PAGODAX__.pause());
  await tabs.nth(3).click();
  const paused=await page.evaluate(()=>window.__PAGODAX__.state().time);
  await page.waitForTimeout(3200);
  await expect(tabs.nth(3)).toHaveAttribute('aria-selected','true');
  expect(await page.evaluate(()=>window.__PAGODAX__.state().time)).toBe(paused);
  await page.locator('#play').click();
  await tabs.nth(3).focus();
  await expect(tabs.nth(2)).toHaveAttribute('aria-selected','true',{timeout:4000});
  await expect(tabs.nth(3)).toBeFocused();
  await page.evaluate(()=>window.__PAGODAX__.pause());
  await page.keyboard.press('ArrowLeft');
  await expect(tabs.nth(2)).toBeFocused();
  await expect(tabs.nth(2)).toHaveAttribute('aria-selected','true');
  await page.locator('#language').click();
  await expect(tabs.nth(2)).toHaveText('引擎状态');
  await expect(tabs.nth(2)).toHaveAttribute('aria-selected','true');
});
