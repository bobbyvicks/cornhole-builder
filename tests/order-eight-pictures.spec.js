import { test, expect } from '@playwright/test';
import { open, reset, settled } from './helpers.js';

async function eightPictures(page, patterned = false) {
  const errors = await open(page); await reset(page);
  // A real PNG travels through the native uploader and its
  // existing byte limits before it is duplicated to four on each board.
  await page.evaluate(async patterned => {
    const side = patterned ? 1600 : 1000;
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = side;
    const g = canvas.getContext('2d'), pixels = g.createImageData(side, side); let seed = 42;
    if (patterned) {
      // Ordinary two-colour pixel art compresses well before resampling.
      // Interpolation adds shades, so the first smaller PNG takes more bytes.
      for (let y = 0; y < side; y += 2) for (let x = 0; x < side; x += 2) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const value = (seed >>> 31) * 255;
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
          const i = ((y + dy) * side + x + dx) * 4;
          pixels.data.set([value, value, value, 255], i);
        }
      }
    } else for (let i = 0; i < pixels.data.length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        pixels.data[i] = seed >>> 24;
      }
    g.putImageData(pixels, 0, 0);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const files = new DataTransfer(); files.items.add(new File([blob], 'transparent-art.png', { type: 'image/png' }));
    const picker = document.getElementById('addimage'); picker.files = files.files;
    picker.dispatchEvent(new Event('change', { bubbles: true }));
  }, patterned);
  await page.waitForFunction(() => cornhole.design.a.elements.some(el => el.type === 'image'));
  const initial = await page.evaluate(async () => {
    const image = cornhole.design.a.elements.find(el => el.type === 'image');
    window.originalEightPicture = structuredClone(image);
    const design = structuredClone(cornhole.design); design.same = false;
    for (const key of ['a', 'b']) design[key].elements = Array.from({ length: 4 }, (_, i) => ({
      ...image, id: key + '-picture-' + i, width: 12, x: 6 + 12 * (i % 2), y: 12 + 24 * Math.floor(i / 2),
    }));
    cornhole.setDesign(design);
    await cornhole.preloadImages(['a', 'b'], { print: false });
    return { payloadChars: JSON.stringify(cornhole.orderPayload()).length, sourceChars: image.src.length };
  });
  await settled(page);
  expect(initial.payloadChars).toBeGreaterThan(3_800_000);
  return { initial, errors };
}

async function originalsIntact(page) {
  return page.evaluate(async () => {
    const saved = await (await import('/lib/store.mjs')).loadProject();
    return [cornhole.design, saved.design].every(design => ['a', 'b'].every(key =>
      design[key].elements.length === 4 && design[key].elements.every(el =>
        el.src === window.originalEightPicture.src && el.orig === window.originalEightPicture.orig &&
        JSON.stringify(el.px) === JSON.stringify(window.originalEightPicture.px))));
  });
}

for (const patterned of [false, true]) test(patterned
  ? 'eight patterned PNG pictures reach checkout even when their first resample takes more bytes'
  : 'eight valid pictures shrink enough for checkout while all saved originals stay intact', async ({ page }) => {
  const { initial, errors } = await eightPictures(page, patterned);
  if (patterned) await page.evaluate(() => {
    const encode = HTMLCanvasElement.prototype.toDataURL; window.patternedResamples = [];
    HTMLCanvasElement.prototype.toDataURL = function (...args) {
      const result = encode.apply(this, args);
      if (this.width === this.height) window.patternedResamples.push({ side: this.width, chars: result.length });
      return result;
    };
  });
  await page.getByRole('tab', { name: 'Order', exact: true }).click();
  await page.click('#toreview');
  await expect(page.locator('#tocheckout')).toBeEnabled();
  if (patterned) {
    const first = await page.evaluate(() => window.patternedResamples[0]);
    expect(first.side).toBe(1120);
    expect(first.chars).toBeGreaterThan(initial.sourceChars);
  }
  await expect(page.locator('#assetwarn')).toBeVisible();
  await page.click('#tocheckout');
  for (const [id, value] of Object.entries({ name: 'Pat Example', email: 'pat@example.com', line1: '1 Main St', city: 'Austin', postal: '78701' })) await page.fill('#' + id, value);
  await page.selectOption('#state', 'TX');
  let posted;
  await page.route('**/api/order', route => {
    posted = route.request().postDataJSON();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 'CH-EIGHT', total: 30800 }) });
  });
  await page.click('#checkout');
  await expect(page.locator('#orderstatus')).toContainText('CH-EIGHT');
  const sentChars = JSON.stringify(posted).length;
  expect(sentChars).toBeLessThanOrEqual(3_800_000);
  expect(posted.options.assets).toBe('pending');
  expect(posted.previews).toHaveLength(2);
  for (const key of ['a', 'b']) {
    expect(posted.design[key].elements).toHaveLength(4);
    expect(posted.design[key].elements.every(el => !el.orig && el.src.length < initial.sourceChars)).toBe(true);
  }
  await settled(page);
  expect(await originalsIntact(page)).toBe(true);
  expect(errors).toEqual([]);
  console.log((patterned ? 'Patterned' : 'Transparent') + ' eight-picture payload characters: ' + initial.payloadChars + ' before, ' + sentChars + ' sent.');
});

test('an encoder that cannot reduce pictures stops promptly without losing the saved design', async ({ page }) => {
  const { errors } = await eightPictures(page);
  await page.evaluate(() => {
    const encode = HTMLCanvasElement.prototype.toDataURL; window.eightShrinkAttempts = 0;
    HTMLCanvasElement.prototype.toDataURL = function (...args) {
      if (this.width === this.height) { window.eightShrinkAttempts++; return window.originalEightPicture.src; }
      return encode.apply(this, args);
    };
  });
  await page.getByRole('tab', { name: 'Order', exact: true }).click();
  await page.click('#toreview');
  await expect(page.locator('#reviewboards')).toContainText('could not be prepared');
  await expect(page.locator('#tocheckout')).toBeDisabled();
  expect(await page.evaluate(() => window.eightShrinkAttempts)).toBe(1);
  expect(await originalsIntact(page)).toBe(true);
  expect(errors).toEqual([]);
});
