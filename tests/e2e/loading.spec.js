import { test, expect } from '@playwright/test';

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
