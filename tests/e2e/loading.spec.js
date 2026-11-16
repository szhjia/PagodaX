import { test, expect } from '@playwright/test';

async function recordLoading(page) {
  await page.addInitScript(() => {
    window.__loadingTransitions = {};
    new PerformanceObserver(list => {
      const paint = list.getEntries().find(entry => entry.name === 'first-contentful-paint');
      if (paint) window.__loadingTransitions.paint = paint.startTime;
    }).observe({type:'paint', buffered:true});
    new MutationObserver(() => {
      const timings = window.__loadingTransitions;
      if (document.body?.dataset.loading === 'false' && timings.fade === undefined) timings.fade = performance.now();
      if (document.querySelector('#preloader')?.hidden && timings.hidden === undefined) timings.hidden = performance.now();
    }).observe(document, {subtree:true, attributes:true, attributeFilter:['data-loading','hidden']});
  });
}

test('缓存加载仍完整展示至少1.5秒，600毫秒淡出期间主画面不可提前操作', async ({page}) => {
  await recordLoading(page);
  await page.goto('/');
  await expect(page.locator('#stage')).toHaveAttribute('data-ready','true');
  await page.reload({waitUntil:'commit'});
  await expect(page.locator('#loading-progress')).toHaveAttribute('aria-valuenow','5');
  await expect(page.locator('body')).toHaveAttribute('data-loading','true');
  await expect(page.locator('#preloader')).toHaveCSS('opacity','1');
  await expect(page.locator('#preloader')).toHaveAttribute('aria-hidden','true');
  await page.waitForTimeout(180);
  const fading = await page.locator('#preloader').evaluate(el => ({opacity:Number(getComputedStyle(el).opacity),mainInert:document.querySelector('main').inert}));
  expect(fading.opacity).toBeGreaterThan(0);
  expect(fading.opacity).toBeLessThan(1);
  expect(fading.mainInert).toBe(true);
  await expect(page.locator('#stage')).toHaveAttribute('data-ready','true');
  await expect(page.locator('#preloader')).toBeHidden();
  expect(await page.locator('main').evaluate(el => el.inert)).toBe(false);
  const timings = await page.evaluate(() => window.__loadingTransitions);
  expect(timings.fade-timings.paint).toBeGreaterThanOrEqual(1470);
  expect(timings.hidden-timings.fade).toBeGreaterThanOrEqual(580);
  await page.screenshot({path:'test-results/loading-handoff-complete.png',fullPage:true});
});

test('慢资源超过最短时间仍等待，完成后不重复等待最短时长', async ({page}) => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/assets/xian-haze.webp', async route => { await gate; await route.continue(); });
  await page.goto('/',{waitUntil:'commit'});
  await expect(page.locator('#loading-progress')).toHaveAttribute('aria-valuenow','3');
  await page.waitForTimeout(1700);
  await expect(page.locator('body')).toHaveAttribute('data-loading','true');
  const releasedAt = await page.evaluate(() => performance.now());
  release();
  await expect(page.locator('#stage')).toHaveAttribute('data-ready','true');
  const enteredAt = await page.evaluate(() => performance.now());
  expect(enteredAt-releasedAt).toBeLessThan(1800);
});

test('减少动态偏好保留最短展示时间，并直接完成交接', async ({page}) => {
  await page.emulateMedia({reducedMotion:'reduce'});
  await recordLoading(page);
  await page.goto('/');
  await expect(page.locator('#stage')).toHaveAttribute('data-ready','true');
  await expect(page.locator('#preloader')).toBeHidden();
  const timings = await page.evaluate(() => window.__loadingTransitions);
  expect(timings.fade-timings.paint).toBeGreaterThanOrEqual(1470);
  expect(timings.hidden-timings.fade).toBeLessThan(200);
});
test('加载页跟随实际资源完成计数，慢资源完成前不开放发射，完成后退出', async ({page}) => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/assets/xian-haze.webp', async route => { await gate; await route.continue(); });
  const images = [];
  page.on('request', request => { if (request.resourceType() === 'image') images.push(request.url()); });
  await page.goto('/?inspect=1', {waitUntil: 'commit'});
  await expect(page.locator('#preloader')).toBeVisible();
  await expect(page.locator('#loading-progress')).toHaveAttribute('aria-valuenow', '3');
  await expect(page.locator('#loading-count')).toHaveText('03 / 05');
  await expect(page.locator('#play')).toBeDisabled();
  await page.screenshot({path: 'test-results/loading-screen.png', fullPage: true});
  release();
  await expect(page.locator('#stage')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#preloader')).toBeHidden();
  await expect(page.locator('#loading-progress')).toHaveAttribute('aria-valuenow', '5');
  await expect(page.locator('#play')).toBeEnabled();
  expect(images.filter(url => /\.(jpg|jpeg|png)(?:\?|$)/.test(url))).toEqual([]);
});

test('资源失败时退出加载页，展示静态回退和重载按钮', async ({page}) => {
  await page.route('**/assets/xian-cleanplate.webp', route => route.abort());
  await page.goto('/');
  await expect(page.locator('#stage')).toHaveAttribute('data-ready', 'fallback');
  await expect(page.locator('#preloader')).toBeHidden();
  await expect(page.locator('#stage-message')).toContainText('Scene assets could not be loaded');
  await expect(page.getByRole('button', {name: 'Reload',exact:true})).toBeVisible();
});
