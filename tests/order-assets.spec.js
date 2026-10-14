import { test, expect } from '@playwright/test';
import { open, reset, picture } from './helpers.js';

async function addPicture(page, file) {
  await page.setInputFiles('#addimage', file);
  await page.waitForFunction(() => cornhole.activeBoard().elements.some((el) => el.type === 'image'));
}

async function review(page) {
  await page.getByRole('tab', { name: 'Order', exact: true }).click();
  await page.click('#toreview');
}

test('a small lossless picture is included without asking the buyer to send the same file again', async ({ page }) => {
  await open(page);
  await reset(page);
  await addPicture(page, await picture(page, 400, 400, 'image/png', "g.fillStyle = '#c8102e'; g.fillRect(0, 0, w, h);"));
  const uploaded = await page.evaluate(() => {
    const source = cornhole.activeBoard().elements.find((el) => el.type === 'image');
    const payload = cornhole.orderPayload();
    const sent = payload.design.a.elements.find((el) => el.type === 'image');
    return { assets: payload.options.assets, hasSeparateMaster: !!source.orig, sourceIncluded: sent.src === source.src };
  });
  expect(uploaded.hasSeparateMaster, 'the preview already is this full-size lossless image').toBe(false);
  expect(uploaded.sourceIncluded).toBe(true);
  expect(uploaded.assets).toBe('included');
  await review(page);
  await expect(page.locator('#assetwarn')).toBeHidden();
});

test('a large master omitted from checkout is explained during review and kept locally for printing', async ({ page }) => {
  await open(page);
  await reset(page);
  // Real, deterministic photo bytes exercise the upload encoder and payload
  // size limit. No network image or fabricated data URL is involved.
  const noise = `
    const pixels = g.createImageData(w, h);
    let seed = 42;
    for (let i = 0; i < pixels.data.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        pixels.data[i + c] = seed >>> 24;
      }
      pixels.data[i + 3] = 255;
    }
    g.putImageData(pixels, 0, 0);
  `;
  await addPicture(page, await picture(page, 1800, 1800, 'image/jpeg', noise));
  const masterBefore = await page.evaluate(() => cornhole.activeBoard().elements.find((el) => el.type === 'image').orig?.length);
  expect(masterBefore, 'the uploaded photo has a separate print master').toBeGreaterThan(1_000_000);
  const outgoing = await page.evaluate(() => {
    const payload = cornhole.orderPayload();
    const image = payload.design.a.elements.find((el) => el.type === 'image');
    return { assets: payload.options.assets, masterOmitted: !image.orig, hasPreview: image.src.startsWith('data:image/') };
  });
  expect(outgoing).toEqual({ assets: 'pending', masterOmitted: true, hasPreview: true });
  await review(page);
  await expect(page.locator('#assetwarn'), 'the file handoff is disclosed before buyer details and payment').toBeVisible();
  await expect(page.locator('#assetwarn')).toContainText('full-size');
  expect(await page.evaluate(() => cornhole.activeBoard().elements.find((el) => el.type === 'image').orig.length)).toBe(masterBefore);
  await page.click('#backtoedit');
  await page.locator('#images .itemdel').click();
  await review(page);
  await expect(page.locator('#assetwarn'), 'removing the large image clears its warning').toBeHidden();
});
