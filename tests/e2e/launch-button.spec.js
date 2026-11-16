import { test, expect } from '@playwright/test';

async function ready(page) {
  await page.goto('/?inspect=1');
  await expect(page.locator('#stage')).toHaveAttribute('data-ready','true');
}

test('实体发射键途中锁住下陷，完成后自动弹起并可再次发射', async ({ page }, testInfo) => {
  await ready(page);
  const button=page.getByRole('button',{name:'Launch',exact:true});
  await button.scrollIntoViewIfNeeded();
  const face=button.locator('.launch-face');
  const restingColor=await face.evaluate(el=>getComputedStyle(el).color);
  await expect(button).toHaveText('LAUNCH');
  await expect(button).toHaveAttribute('aria-pressed','false');
  const offset=async()=>{
    const faceBox=await face.boundingBox(), buttonBox=await button.boundingBox();
    return faceBox.y-buttonBox.y;
  };
  const raised=await offset();
  await button.screenshot({path:testInfo.outputPath('launch-raised.png')});
  // A real pointer press must visibly travel down before the click/mission starts.
  const box=await button.boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  await page.mouse.down();
  await expect(face).toHaveCSS('color','rgb(232, 173, 113)');
  await expect.poll(offset).toBeGreaterThan(raised+3);
  await page.mouse.up();
  await expect(button).toHaveAttribute('aria-pressed','true');
  await expect(button).toBeDisabled();
  await expect.poll(offset).toBeGreaterThan(raised+3);
  await page.evaluate(()=>window.__PAGODAX__.pause());
  await expect(face).toHaveCSS('color','rgb(232, 173, 113)');
  expect(await face.evaluate(el=>getComputedStyle(el).textShadow)).toContain('5px');
  await expect(button).toBeEnabled();
  await button.screenshot({path:testInfo.outputPath('launch-latched.png')});
  await button.screenshot({path:'test-results/launch-orange.png'});
  await expect.poll(offset).toBeGreaterThan(raised+3);
  await page.locator('#language').click();
  await expect(button).toHaveText('LAUNCH');
  await expect(button).toHaveAttribute('aria-pressed','true');
  await page.evaluate(()=>window.__PAGODAX__.seek(47.99));
  await expect(button).toHaveAttribute('aria-pressed','true');
  await expect.poll(offset).toBeGreaterThan(raised+3);
  await page.evaluate(()=>window.__PAGODAX__.seek(48));
  await expect(button).toBeEnabled();
  await expect(button).toHaveText('LAUNCH');
  await expect(button).toHaveAttribute('aria-pressed','false');
  await expect(face).toHaveCSS('color',restingColor);
  await expect.poll(offset).toBeCloseTo(raised,1);
  // The completed mission releases the key; replay presses and latches it again.
  await button.click();
  await expect.poll(()=>page.evaluate(()=>window.__PAGODAX__.state().time)).toBeLessThan(1);
  await page.evaluate(()=>{window.__PAGODAX__.pause();window.__PAGODAX__.seek(0);});
  await expect(button).toHaveAttribute('aria-pressed','true');
  await expect.poll(offset).toBeGreaterThan(raised+3);
  await page.reload();
  await expect(page.locator('#stage')).toHaveAttribute('data-ready','true');
  await expect(button).toHaveAttribute('aria-pressed','false');
});

test('手机及减少动态效果下，键盘可触发固定英文发射键并保持按下', async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  await page.emulateMedia({reducedMotion:'reduce'});
  await ready(page);
  const button=page.getByRole('button',{name:'Launch',exact:true});
  await page.locator('#language').click();
  await expect(button).toHaveText('LAUNCH');
  const box=await button.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(44);
  await button.focus();
  await page.keyboard.press('Space');
  await expect(button).toHaveAttribute('aria-pressed','true');
  expect((await page.evaluate(()=>window.__PAGODAX__.state())).playing).toBe(true);
  await page.evaluate(()=>window.__PAGODAX__.pause());
  await expect(button).toHaveAttribute('aria-pressed','true');
  await page.evaluate(()=>window.__PAGODAX__.seek(48));
  await expect(button).toHaveAttribute('aria-pressed','false');
  await expect(button).toBeEnabled();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
