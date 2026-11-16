import { test, expect } from '@playwright/test';

async function ready(page) {
  await page.goto('/?inspect=1');
  await expect(page.locator('#stage')).toHaveAttribute('data-ready','true');
}
async function interfaceText(page) {
  return page.evaluate(() => {
    const body = document.body.cloneNode(true);
    body.querySelectorAll('select,script,noscript').forEach(node=>node.remove());
    return body.textContent;
  });
}

test('默认纯英文，右上角可切换纯中文并记住选择，天气入口带同字号箭头', async ({page}) => {
  await ready(page);
  await expect(page.locator('html')).toHaveAttribute('lang','en');
  await expect(page.locator('.site-header [data-i18n="mission.eyebrow"]')).toHaveText('EXPERIMENTAL FLIGHT / MISSION PX–01');
  await expect(page.locator('.mission-heading')).toHaveCount(0);
  await expect(page.locator('#open-atmosphere')).toHaveText('Weather archive');
  expect(await interfaceText(page)).not.toMatch(/\p{Script=Han}/u);
  const language=await page.locator('#language').boundingBox(), archive=await page.locator('#open-atmosphere').boundingBox();
  expect(language.x+language.width).toBeLessThan(archive.x);
  await expect(page.locator('#open-atmosphere .archive-arrow')).toBeVisible();
  const arrow=await page.locator('.archive-arrow').boundingBox();
  const fontSize=await page.locator('#open-atmosphere').evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
  expect(arrow.width).toBeCloseTo(fontSize,1);
  await expect(page.locator('select#language')).toHaveCount(0);
  await expect(page.locator('#language')).toHaveAccessibleName('Switch to Chinese');
  await expect(page.locator('#language')).toHaveText('English');
  await expect(page.locator('.atmosphere-meter>span')).toHaveText('WEATHER');
  await page.locator('#language').click();
  await expect(page.locator('html')).toHaveAttribute('lang','zh-CN');
  await expect(page.locator('.site-header [data-i18n="mission.eyebrow"]')).toHaveText('试验飞行 / 任务 PX–01');
  await expect(page.locator('#mission-title')).toHaveText('PagodaX 发射任务');
  await expect(page.locator('#play')).toHaveAccessibleName('Launch');
  expect((await interfaceText(page)).replaceAll('PagodaX','').replaceAll('LAUNCH','').replace(/CAM\s*01/g,'')).not.toMatch(/[A-Za-z]{3,}/);
  await page.getByRole('button',{name:'天气档案',exact:true}).click();
  await expect(page.locator('#atmosphere-title')).toHaveText('同一机位，不同天气。');
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.locator('#stage')).toHaveAttribute('data-ready','true');
  await expect(page.locator('#language')).toHaveAccessibleName('切换到英文');
  await expect(page.locator('#language')).toHaveText('简体中文');
  await expect(page.locator('.atmosphere-meter>span')).toHaveText('天气条件');
  await expect(page.locator('#phase-label')).toHaveText('等待发射');
});

test('运行中切换语言保持时间、播放、声音及资源状态，结尾品牌持续显示', async ({page}) => {
  await ready(page);
  await page.evaluate(()=>window.__PAGODAX__.seek(27));
  const before=await page.evaluate(()=>window.__PAGODAX__.state());
  await page.locator('#language').focus();
  await page.keyboard.press('Enter');
  const after=await page.evaluate(()=>window.__PAGODAX__.state());
  expect(after.time).toBe(before.time);
  expect(after.playing).toBe(before.playing);
  expect(after.geometries).toBe(before.geometries);
  expect(after.textures).toBe(before.textures);
  await expect(page.locator('#phase-label')).toHaveText('穿越云层');
  await expect(page.locator('#tracking-status')).toHaveText('升空跟踪中');
  await expect(page.locator('#sound')).toHaveAccessibleName('关闭声音');
  await expect(page.locator('#progress')).toHaveAttribute('aria-valuetext','穿越云层，已进行 27.0 秒');
  await page.locator('#play').click();
  await page.locator('#language').click();
  expect((await page.evaluate(()=>window.__PAGODAX__.state())).playing).toBe(true);
  await expect(page.locator('#play')).toHaveAccessibleName('Launch');
  await page.evaluate(()=>{window.__PAGODAX__.pause();window.__PAGODAX__.seek(48);});
  await expect(page.locator('#end-card')).toHaveCSS('opacity','1');
  await page.waitForTimeout(300);
  await expect(page.locator('#end-card')).toHaveCSS('opacity','1');
  await page.locator('#language').click();
  await expect(page.locator('#end-card .end-wordmark')).toHaveText('PagodaX');
  await expect(page.locator('#end-card')).toHaveCSS('opacity','1');
  await page.locator('#play').click();
  await expect(page.locator('#end-card')).toHaveCSS('opacity','0');
});

test('手机两种语言无横向溢出，语言存储被禁用仍可切换，失败提示同步翻译', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.addInitScript(()=>{
    Storage.prototype.getItem=()=>{throw new Error('blocked');};
    Storage.prototype.setItem=()=>{throw new Error('blocked');};
  });
  await page.route('**/assets/xian-cleanplate.webp',route=>route.abort());
  await page.goto('/');
  await expect(page.locator('#stage')).toHaveAttribute('data-ready','fallback');
  await expect(page.locator('#stage-message')).toContainText('Scene assets could not be loaded');
  for (const locale of ['zh-CN','en']) {
    await page.locator('#language').click();
    const language=await page.locator('#language').boundingBox(), archive=await page.locator('#open-atmosphere').boundingBox();
    expect(language.x+language.width).toBeLessThan(archive.x);
    const arrow=await page.locator('.archive-arrow').boundingBox();
    const fontSize=await page.locator('#open-atmosphere').evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
    expect(arrow.width).toBeCloseTo(fontSize,1);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await expect(page.locator('#stage-message')).toContainText(locale==='en'?'Scene assets could not be loaded':'场景资源暂时未能载入');
    await expect(page.locator('#play')).toBeDisabled();
  }
});
