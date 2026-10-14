import { test, expect } from '@playwright/test';
import { open, reset, picture, settled, reloaded } from './helpers.js';

const upload = async (page, file) => {
  await page.setInputFiles('#addimage', file);
  await page.waitForFunction(() => cornhole.design.a.elements.some(el => el.type === 'image'));
  await settled(page);
  return page.evaluate(() => cornhole.design.a.elements.find(el => el.type === 'image'));
};
const decoded = (page, src, point = [0, 0]) => page.evaluate(async ([src, point]) => {
  const img = new Image(); img.src = src; await img.decode();
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  c.getContext('2d').drawImage(img, 0, 0);
  return { dimensions: [img.naturalWidth, img.naturalHeight], pixel: [...c.getContext('2d').getImageData(...point, 1, 1).data] };
}, [src, point]);

test('SVG preview and print master use their full rendering sizes and survive reopening', async ({ page }) => {
  const errors = await open(page); await reset(page);
  const image = await upload(page, { name: 'vector.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="300" height="200" fill="#c8102e"/></svg>') });
  expect((await decoded(page, image.src)).dimensions).toEqual([1600, 1067]);
  expect((await decoded(page, image.orig)).dimensions).toEqual([4000, 2667]);
  expect(image.px).toEqual([4000, 2667]);
  expect(image.src.length).toBeLessThanOrEqual(1_500_000 * 1.37);
  expect(image.orig.length).toBeLessThanOrEqual(3_000_000 * 1.37);
  await reloaded(page);
  expect(await page.evaluate(() => cornhole.design.a.elements.find(el => el.type === 'image'))).toEqual(image);
  await page.evaluate(() => cornhole.preloadImages(['a']));
  expect(await page.evaluate(() => cornhole.printCanvas('a').width)).toBe(2400);
  expect(errors).toEqual([]);
});

test('opaque WebP gets a compressed preview and retains its exact original master', async ({ page }) => {
  const errors = await open(page); await reset(page);
  const file = await picture(page, 600, 400, 'image/webp', 'g.fillStyle = "#c8102e"; g.fillRect(0, 0, w, h);');
  const image = await upload(page, file);
  expect(image.src).toMatch(/^data:image\/jpeg;base64,/);
  expect(image.orig).toBe('data:image/webp;base64,' + file.buffer.toString('base64'));
  expect(image.px).toEqual([600, 400]);
  await reloaded(page);
  expect(await page.evaluate(() => cornhole.design.a.elements.find(el => el.type === 'image'))).toEqual(image);
  expect(errors).toEqual([]);
});

test('even a single faintly transparent WebP pixel keeps the lossless preview', async ({ page }) => {
  const errors = await open(page); await reset(page);
  const file = await picture(page, 512, 512, 'image/webp', 'g.fillStyle = "#c8102e"; g.fillRect(0, 0, w, h); g.clearRect(256, 256, 1, 1); g.fillStyle = "rgba(200,16,46,0.98)"; g.fillRect(256, 256, 1, 1);');
  const original = await decoded(page, 'data:image/webp;base64,' + file.buffer.toString('base64'), [256, 256]);
  expect(original.pixel[3]).toBeLessThan(255);
  const image = await upload(page, file);
  expect(image.src).toMatch(/^data:image\/png;base64,/);
  expect((await decoded(page, image.src, [256, 256])).pixel).toEqual(original.pixel);
  expect(errors).toEqual([]);
});
