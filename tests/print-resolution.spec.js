import { test, expect } from '@playwright/test';
import { open, reset } from './helpers.js';

async function bytes(download) {
  const stream = await download.createReadStream(), chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function resolutionChunks(png) {
  const found = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset), type = png.toString('ascii', offset + 4, offset + 8);
    if (type === 'pHYs') found.push(png.subarray(offset, offset + length + 12));
    offset += length + 12;
  }
  return found;
}

test('both print downloads carry 100ppi metadata with identical decoded pixels', async ({ page }) => {
  const errors = await open(page); await reset(page);
  await page.evaluate(() => {
    const design = structuredClone(cornhole.design);
    design.same = false; design.a.base.color = '#c8102e'; design.b.base.color = '#1f3a93';
    cornhole.setDesign(design);
    window.rawPrintBlobs = [];
    const encode = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback, ...args) {
      return encode.call(this, blob => { if (this.width === 2400 && blob) window.rawPrintBlobs.push(blob); callback(blob); }, ...args);
    };
  });
  const downloads = []; page.on('download', download => downloads.push(download));
  await page.locator('#download').click();
  await expect.poll(() => downloads.length).toBe(2);
  await expect(page.locator('#download')).toBeEnabled();
  for (const [index, key] of ['A', 'B'].entries()) {
    expect(downloads[index].suggestedFilename()).toBe(`cornhole-board-${key}-24x48in-100ppi.png`);
    const png = await bytes(downloads[index]);
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([2400, 4800]);
    const chunks = resolutionChunks(png);
    expect(chunks, 'the physical print resolution must travel inside each file').toHaveLength(1);
    expect(chunks[0].toString('hex')).toBe('000000097048597300000f6100000f6101a83fa769');
    const hashes = await page.evaluate(async ([index, dataUrl]) => {
      const downloaded = await (await fetch(dataUrl)).blob();
      const hashPixels = async blob => {
        const image = await createImageBitmap(blob), canvas = document.createElement('canvas');
        canvas.width = image.width; canvas.height = image.height;
        const g = canvas.getContext('2d'); g.drawImage(image, 0, 0); image.close();
        const pixels = g.getImageData(0, 0, canvas.width, canvas.height).data;
        canvas.width = canvas.height = 1;
        return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', pixels))).join(',');
      };
      return [await hashPixels(window.rawPrintBlobs[index]), await hashPixels(downloaded)];
    }, [index, 'data:image/png;base64,' + png.toString('base64')]);
    expect(hashes[1]).toBe(hashes[0]);
  }
  // The small shared image still uses the ordinary preview encoder.
  await page.getByRole('tab', { name: 'Start', exact: true }).click();
  await page.evaluate(() => Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true }));
  const previewEvent = page.waitForEvent('download'); await page.locator('#sharepreview').click();
  const preview = await bytes(await previewEvent);
  expect([preview.readUInt32BE(16), preview.readUInt32BE(20)]).toEqual([664, 700]);
  expect(resolutionChunks(preview)).toHaveLength(0);
  expect(errors).toEqual([]);
});

test('failed print metadata preparation explains the error and permits a successful retry', async ({ page }) => {
  const errors = await open(page); await reset(page);
  const before = await page.evaluate(() => cornhole.design);
  await page.evaluate(() => {
    const encode = HTMLCanvasElement.prototype.toBlob; let fail = true;
    HTMLCanvasElement.prototype.toBlob = function (callback, ...args) {
      if (this.width === 2400 && fail) { fail = false; callback(new Blob(['not a PNG'], { type: 'image/png' })); return; }
      return encode.call(this, callback, ...args);
    };
  });
  const downloads = [], messages = [];
  page.on('download', download => downloads.push(download));
  page.on('dialog', async dialog => { messages.push(dialog.message()); await dialog.dismiss(); });
  await page.locator('#download').click();
  await expect.poll(() => messages.length + downloads.length).toBeGreaterThan(0);
  expect(messages.join(' ')).toMatch(/PNG.*design is still here/i);
  expect(downloads).toHaveLength(0);
  await expect(page.locator('#download')).toBeEnabled();
  await expect(page.locator('#download')).not.toHaveAttribute('aria-busy', 'true');
  expect(await page.evaluate(() => cornhole.design)).toEqual(before);
  await page.locator('#download').click();
  await expect.poll(() => downloads.length).toBe(1);
  expect(resolutionChunks(await bytes(downloads[0]))).toHaveLength(1);
  expect(errors).toEqual([]);
});
