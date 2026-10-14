import { test, expect } from '@playwright/test';
import { open, reset, picture, settled, reloaded } from './helpers.js';

// Detailed lossless artwork can exceed the preview byte budget even when
// its dimensions fit. Seeded RGB pixels make that case reproducible.
const detailedPixels = `
  const d = g.createImageData(w, h); let seed = 42;
  for (let i = 0; i < d.data.length; i += 4) {
    for (let channel = 0; channel < 3; channel++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      d.data[i + channel] = seed >>> 24;
    }
    d.data[i + 3] = 255;
  }
  g.putImageData(d, 0, 0);
`;

const uploadedPicture = page => page.evaluate(() => cornhole.design.a.elements.find(el => el.type === 'image'));

async function detailedPng(page, side) {
  const url = await page.evaluate(([side, paint]) => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = side;
    new Function('g', 'w', 'h', paint)(canvas.getContext('2d'), side, side);
    return canvas.toDataURL('image/png');
  }, [side, detailedPixels]);
  return { name: 'detailed-logo.png', mimeType: 'image/png', buffer: Buffer.from(url.split(',')[1], 'base64') };
}

async function upload(page, file) {
  await page.setInputFiles('#addimage', file);
  await page.waitForFunction(() => cornhole.design.a.elements.some(el => el.type === 'image'));
  await settled(page);
  return uploadedPicture(page);
}

async function dimensions(page, source) {
  return page.evaluate(async src => {
    const image = new Image(); image.src = src; await image.decode();
    return [image.naturalWidth, image.naturalHeight];
  }, source);
}

async function roundTripAndPrint(page, image) {
  await page.getByRole('tab', { name: 'Start', exact: true }).click();
  const downloadEvent = page.waitForEvent('download');
  await page.locator('#exportbtn').click();
  const stream = await (await downloadEvent).createReadStream();
  const chunks = []; for await (const chunk of stream) chunks.push(chunk);
  const file = Buffer.concat(chunks);
  const exported = JSON.parse(file.toString('utf8'));
  expect(exported.design.a.elements.find(el => el.type === 'image')).toEqual(image);

  await reloaded(page);
  expect(await uploadedPicture(page)).toEqual(image);
  await page.evaluate(() => cornhole.applyBlank()); await settled(page);
  await page.setInputFiles('#importfile', { name: 'image-quality.json', mimeType: 'application/json', buffer: file });
  await page.waitForFunction(id => cornhole.design.a.elements.some(el => el.id === id), image.id);
  await settled(page);
  expect(await uploadedPicture(page)).toEqual(image);

  const printed = await page.evaluate(async () => {
    await cornhole.preloadImages(['a']);
    const image = cornhole.design.a.elements.find(el => el.type === 'image');
    const draw = CanvasRenderingContext2D.prototype.drawImage, sources = [];
    CanvasRenderingContext2D.prototype.drawImage = function (source, ...args) {
      if (source instanceof HTMLImageElement) sources.push({ master: source.src === image.orig, px: [source.naturalWidth, source.naturalHeight] });
      return draw.call(this, source, ...args);
    };
    try {
      const canvas = cornhole.printCanvas('a');
      return { size: [canvas.width, canvas.height], sources };
    } finally { CanvasRenderingContext2D.prototype.drawImage = draw; }
  });
  expect(printed.size).toEqual([2400, 4800]);
  expect(printed.sources).toEqual([{ master: true, px: image.px }]);
}

test('a detailed PNG within the original byte limit keeps its untouched print master', async ({ page }) => {
  const errors = await open(page); await reset(page);
  const file = await detailedPng(page, 900);
  expect(file.buffer.length).toBeGreaterThan(1_500_000);
  expect(file.buffer.length).toBeLessThanOrEqual(3_000_000);
  const image = await upload(page, file);
  expect(await dimensions(page, image.src)).not.toEqual([900, 900]);
  expect(image.orig === 'data:image/png;base64,' + file.buffer.toString('base64'), 'shrinking the preview must not discard the accepted original').toBe(true);
  expect(image.px).toEqual([900, 900]);
  await roundTripAndPrint(page, image);
  expect(errors).toEqual([]);
});

test('an oversized PNG below the preview dimension limit retains a larger print master', async ({ page }) => {
  const errors = await open(page); await reset(page);
  const file = await detailedPng(page, 1500);
  expect(file.buffer.length).toBeGreaterThan(3_000_000);
  const image = await upload(page, file);
  const preview = await dimensions(page, image.src);
  expect(image.orig, 'detailed small-dimension files still need a print master').toBeTruthy();
  const master = await dimensions(page, image.orig);
  expect(master[0]).toBeGreaterThan(preview[0]);
  expect(master[1]).toBeGreaterThan(preview[1]);
  expect(image.px).toEqual(master);
  expect(Math.max(...master)).toBeLessThanOrEqual(4000);
  expect(image.orig.length).toBeLessThanOrEqual(3_000_000 * 1.37);
  await roundTripAndPrint(page, image);
  expect(errors).toEqual([]);
});

test('a small lossless PNG needs only one full-quality source', async ({ page }) => {
  const errors = await open(page); await reset(page);
  const file = await picture(page, 80, 40, 'image/png', 'g.fillStyle="#00ff00"; g.fillRect(0,0,w,h);');
  const image = await upload(page, file);
  expect(image.orig).toBeUndefined();
  expect(image.px).toEqual([80, 40]);
  expect(await dimensions(page, image.src)).toEqual([80, 40]);
  await reloaded(page);
  expect(await uploadedPicture(page)).toEqual(image);
  expect(errors).toEqual([]);
});

for (const side of [1000, 4000]) test(`a detailed ${side}px transparent PNG fits both byte budgets without losing transparency`, async ({ page }) => {
  const errors = await open(page); await reset(page);
  // Generate and upload the real file in the browser, avoiding a large
  // fixture transfer through the test runner for the 4000px source.
  const bytes = await page.evaluate(async side => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = side;
    const g = canvas.getContext('2d'), pixels = g.createImageData(side, side); let seed = 42;
    for (let i = 0; i < pixels.data.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      pixels.data[i] = seed >>> 24;
    }
    g.putImageData(pixels, 0, 0);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const files = new DataTransfer(); files.items.add(new File([blob], 'transparent-art.png', { type: 'image/png' }));
    const picker = document.getElementById('addimage'); picker.files = files.files;
    picker.dispatchEvent(new Event('change', { bubbles: true }));
    return blob.size;
  }, side);
  expect(bytes).toBeGreaterThan(3_000_000);
  await page.waitForFunction(() => cornhole.design.a.elements.some(el => el.type === 'image'));
  await settled(page);
  const image = await uploadedPicture(page);
  expect(image.src.length).toBeLessThanOrEqual(1_500_000 * 1.37);
  expect(image.orig?.length, 'the retained master must fit even when six reductions are insufficient').toBeLessThanOrEqual(3_000_000 * 1.37);
  expect(image.orig).toMatch(/^data:image\/png;/);
  expect(image.px).toEqual(await dimensions(page, image.orig));
  expect(image.px[0]).toBeGreaterThan((await dimensions(page, image.src))[0]);
  const alpha = await page.evaluate(async src => {
    const image = new Image(); image.src = src; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
    const g = canvas.getContext('2d');
    g.drawImage(image, Math.floor(image.naturalWidth / 2), Math.floor(image.naturalHeight / 2), 1, 1, 0, 0, 1, 1);
    return g.getImageData(0, 0, 1, 1).data[3];
  }, image.orig);
  expect(alpha).toBeGreaterThan(0); expect(alpha).toBeLessThan(255);
  await roundTripAndPrint(page, image);
  expect(errors).toEqual([]);
});
