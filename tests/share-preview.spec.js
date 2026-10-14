import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { open, reset } from './helpers.js';

test('sharing falls back to a PNG of both boards without exposing order details', async ({ page }) => {
  await open(page); await reset(page);
  await page.evaluate(() => cornhole.showTab('templates'));
  await page.evaluate(() => { Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true }); });
  await expect(page.getByRole('button', { name: 'Share preview' })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Share preview' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^cornhole-preview-.*\.png$/);
  const bytes = await readFile(await file.path());
  expect(bytes.subarray(1, 4).toString()).toBe('PNG');
  expect(bytes.readUInt32BE(16)).toBeGreaterThan(600);
  expect(bytes.readUInt32BE(20)).toBeGreaterThan(600);
  await expect(page.locator('#sharestatus')).toContainText('downloaded');
  expect(await page.evaluate(() => cornhole.design.a.elements[0].text)).toBe('HELLO');
});

test('native sharing gets a preview file, and cancelling does not download or discard the design', async ({ page }) => {
  await open(page); await reset(page);
  await page.evaluate(() => cornhole.showTab('templates'));
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'canShare', { value: data => data.files?.[0]?.type === 'image/png', configurable: true });
    Object.defineProperty(navigator, 'share', { value: async data => { window.sharedPreview = { title: data.title, count: data.files.length, type: data.files[0].type }; throw new DOMException('Cancelled', 'AbortError'); }, configurable: true });
  });
  let downloads = 0; page.on('download', () => downloads++);
  await expect(page.getByRole('button', { name: 'Share preview' })).toBeVisible();
  await page.getByRole('button', { name: 'Share preview' }).click();
  await expect(page.locator('#sharestatus')).toContainText('cancelled');
  expect(await page.evaluate(() => window.sharedPreview)).toEqual({ title: 'My cornhole board design', count: 1, type: 'image/png' });
  expect(downloads).toBe(0);
  await expect(page.getByRole('button', { name: 'Share preview' })).toBeEnabled();
});

test('an already failed picture reports an error instead of leaving sharing stuck', async ({ page }) => {
  await open(page); await reset(page);
  await page.evaluate(async () => {
    const src = 'data:image/png;base64,AAAA';
    cornhole.activeBoard().elements.push({ type:'image', id:'broken-photo', src, x:12, y:20, width:6, rotation:0, opacity:1 });
    cornhole.paint();
    await new Promise(resolve => { const probe = new Image(); probe.onerror = resolve; probe.src = src; });
    cornhole.showTab('templates');
  });
  await page.getByRole('button', { name: 'Share preview' }).click();
  await expect(page.locator('#sharestatus')).toContainText('could not be prepared');
  await expect(page.getByRole('button', { name: 'Share preview' })).toBeEnabled();
});
