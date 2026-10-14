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
  /* Two boards side by side with a title and captions: 664 x 700. */
  expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([664, 700]);
  /* Only the boards and their captions are drawn: the side margins and the
     band between the board captions and the footer are plain background, so
     a quote, an address or any other line of text would show up here. */
  const stray = await page.evaluate(async (bytes) => {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
    const c = document.createElement('canvas'); c.width = bitmap.width; c.height = bitmap.height;
    const g = c.getContext('2d'); g.drawImage(bitmap, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      if (!(x < 28 || x >= c.width - 28 || (y >= 660 && y <= 671))) continue;
      const i = (y * c.width + x) * 4;
      if (d[i] !== 0xf7 || d[i + 1] !== 0xf4 || d[i + 2] !== 0xed) n++;
    }
    return n;
  }, Array.from(bytes));
  expect(stray, 'no order details or anything else beside the boards').toBe(0);
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
