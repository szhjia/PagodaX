import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { chromium } from '@playwright/test';

const target = process.argv[2];
if (!target) throw new Error('Usage: npm run test:deployment -- https://host/project/ [screenshot.png]');
const url = new URL(target);
url.searchParams.set('inspect', '1');
const screenshot = process.argv[3] || 'test-results/deployment.png';
const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const failures = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => failures.push(`${request.url()}: ${request.failure()?.errorText}`));
  page.on('response', response => { if (response.status() >= 400) failures.push(`${response.status()}: ${response.url()}`); });
  const response = await page.goto(url.href);
  assert.equal(response.status(), 200);
  await page.locator('#stage[data-ready="true"]').waitFor({ timeout: 30000 });
  const geometry = await page.evaluate(() => {
    const stage = document.querySelector('#stage').getBoundingClientRect();
    const title = document.querySelector('.program-name').getBoundingClientRect();
    return { delta: title.x + title.width / 2 - stage.x - stage.width / 2, ratio: stage.width / stage.height, scrollHeight: document.documentElement.scrollHeight, height: innerHeight };
  });
  assert.ok(Math.abs(geometry.delta) < .5, JSON.stringify(geometry));
  assert.ok(Math.abs(geometry.ratio - 1.95) < .01);
  assert.ok(geometry.scrollHeight <= geometry.height);
  await page.locator('#open-atmosphere').click();
  await page.locator('#atmosphere-dialog[open]').waitFor();
  assert.ok(await page.locator('.comparison img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0)));
  await page.keyboard.press('Escape');
  await page.locator('#language').click();
  assert.equal(await page.locator('.program-name [data-i18n]').textContent(), '试验飞行 / 任务 PX–01');
  await page.locator('#language').click();
  await page.locator('#play').click();
  await page.waitForFunction(() => window.__PAGODAX__.state().playing);
  await page.evaluate(() => { window.__PAGODAX__.pause(); window.__PAGODAX__.seek(24); });
  assert.equal(await page.locator('#tracking-panel').getAttribute('data-visible'), 'true');
  await page.evaluate(() => window.__PAGODAX__.seek(48));
  assert.equal(await page.locator('#end-card').evaluate(el => el.style.opacity), '1');
  await page.getByRole('tab', { name: 'FORECAST', exact: true }).click();
  await page.waitForTimeout(320);
  await mkdir(dirname(screenshot), { recursive: true });
  await page.screenshot({ path: screenshot, fullPage: true });
  assert.deepEqual(failures, [], 'All deployed requests must succeed');
  assert.deepEqual(errors, [], 'The deployed app must not throw');
  console.log(JSON.stringify({ url: target, geometry, requests: 'passed', launch: 'passed', archive: 'passed', language: 'passed', screenshot }, null, 2));
} finally {
  await browser.close();
}
