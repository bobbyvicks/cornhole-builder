import { test, expect } from '@playwright/test';
import { open, reset, picture } from './helpers.js';

async function addPicture(page, file) {
  const had = await page.evaluate(() => cornhole.activeBoard().elements.filter((el) => el.type === 'image').length);
  await page.setInputFiles('#addimage', file);
  await page.waitForFunction((had) => cornhole.activeBoard().elements.filter((el) => el.type === 'image').length > had, had);
}

async function review(page) {
  await page.getByRole('tab', { name: 'Order', exact: true }).click();
  await page.click('#toreview');
}

// Real, deterministic photo bytes exercise the upload encoder and payload
// size limit. No network image or fabricated data URL is involved.
const NOISE = `
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

test('a photo whose master fits beside its preview goes whole with the order', async ({ page }) => {
  test.slow(); // real photo-sized encoding
  await open(page);
  await reset(page);
  await addPicture(page, await picture(page, 1800, 1800, 'image/jpeg', NOISE));
  const sent = await page.evaluate(() => {
    const source = cornhole.activeBoard().elements.find((el) => el.type === 'image');
    const payload = cornhole.orderPayload(), image = payload.design.a.elements.find((el) => el.type === 'image');
    return { assets: payload.options.assets, master: source.orig.length, masterSent: image.orig === source.orig, chars: JSON.stringify(payload).length };
  });
  expect(sent.master, 'the photo has a separate print master').toBeGreaterThan(1_000_000);
  expect(sent).toMatchObject({ assets: 'included', masterSent: true });
  expect(sent.chars).toBeLessThanOrEqual(3_800_000);
  await review(page);
  await expect(page.locator('#assetwarn')).toBeHidden();
});

test('masters that cannot both fit are omitted from checkout, explained during review without promising a follow-up, and kept locally for printing', async ({ page }) => {
  test.slow(); // two real photo-sized encodings
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
  const photo = await picture(page, 1800, 1800, 'image/jpeg', noise);
  await addPicture(page, photo);
  await addPicture(page, photo);
  const masterBefore = await page.evaluate(() => cornhole.activeBoard().elements.find((el) => el.type === 'image').orig?.length);
  expect(masterBefore, 'the uploaded photo has a separate print master').toBeGreaterThan(1_000_000);
  const outgoing = await page.evaluate(() => {
    const payload = cornhole.orderPayload();
    const images = payload.design.a.elements.filter((el) => el.type === 'image');
    return { assets: payload.options.assets, mastersOmitted: images.every((image) => !image.orig), previews: images.every((image) => image.src.startsWith('data:image/')) };
  });
  expect(outgoing).toEqual({ assets: 'pending', mastersOmitted: true, previews: true });
  await review(page);
  await expect(page.locator('#assetwarn'), 'the file handoff is disclosed before buyer details and payment').toBeVisible();
  await expect(page.locator('#assetwarn')).toContainText('full-size');
  await expect(page.locator('#assetwarn'), 'no email follow-up exists to promise').not.toContainText(/email/i);
  expect(await page.evaluate(() => cornhole.activeBoard().elements.find((el) => el.type === 'image').orig.length)).toBe(masterBefore);
  await page.click('#backtoedit');
  await page.locator('#images .itemdel').first().click();
  await review(page);
  await expect(page.locator('#assetwarn'), 'with one picture left, its master fits and the warning clears').toBeHidden();
});
