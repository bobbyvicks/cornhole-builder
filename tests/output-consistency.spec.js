import { test, expect } from '@playwright/test';
import { open, reset, picture } from './helpers.js';

async function twoBoards(page) {
  await open(page); await reset(page);
  await page.evaluate(() => {
    const d = structuredClone(cornhole.design);
    d.same = false; d.a.elements = []; d.b.elements = [];
    d.a.base.color = '#ff0000'; d.b.base.color = '#0000ff';
    cornhole.setDesign(d);
    window.outputBlobs = [];
    const createURL = URL.createObjectURL;
    URL.createObjectURL = function (blob) { if (blob?.type === 'image/png') window.outputBlobs.push(blob); return createURL.call(this, blob); };
    document.addEventListener('click', event => { if (event.target.closest('a[download]')) event.preventDefault(); }, true);
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
  });
}

async function pixels(page, points) {
  return page.evaluate(async points => {
    const result = [];
    for (const [index, x, y] of points) {
      const bitmap = await createImageBitmap(window.outputBlobs[index]);
      const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d'); ctx.drawImage(bitmap, 0, 0); bitmap.close();
      result.push(Array.from(ctx.getImageData(x, y, 1, 1).data));
    }
    return result;
  }, points);
}

test('a shared preview keeps the clicked design and board mode while fonts prepare', async ({ page }) => {
  await twoBoards(page);
  await page.evaluate(() => {
    cornhole.showTab('templates');
    const ready = new Promise(resolve => { window.releaseOutputFonts = resolve; });
    Object.defineProperty(document.fonts, 'ready', { get: () => { window.outputFontsWaiting = true; return ready; }, configurable: true });
  });
  await page.locator('#sharepreview').click();
  await page.waitForFunction(() => window.outputFontsWaiting);
  await page.evaluate(() => { cornhole.design.same = true; cornhole.design.a.base.color = '#00ff00'; cornhole.commit(); window.releaseOutputFonts(); });
  await expect(page.locator('#sharestatus')).toContainText('downloaded');
  expect(await pixels(page, [[0, 176, 500], [0, 488, 500]])).toEqual([[255, 0, 0, 255], [0, 0, 255, 255]]);
  expect(await page.evaluate(() => cornhole.design.a.base.color)).toBe('#00ff00');
});

test('both print files come from one design even when edits happen between PNG encodes', async ({ page }) => {
  await twoBoards(page);
  await page.evaluate(() => {
    const encode = HTMLCanvasElement.prototype.toBlob;
    let count = 0;
    HTMLCanvasElement.prototype.toBlob = function (callback, ...args) {
      if (this.width === 2400 && ++count === 1) {
        return encode.call(this, blob => { window.printEncodeWaiting = true; window.releasePrintEncode = () => callback(blob); }, ...args);
      }
      return encode.call(this, callback, ...args);
    };
  });
  await page.locator('#download').click();
  await page.waitForFunction(() => window.printEncodeWaiting);
  await page.evaluate(() => { cornhole.design.b.base.color = '#00ff00'; cornhole.commit(); window.releasePrintEncode(); });
  await page.waitForFunction(() => window.outputBlobs.length === 2);
  expect(await pixels(page, [[0, 1200, 4000], [1, 1200, 4000]])).toEqual([[255, 0, 0, 255], [0, 0, 255, 255]]);
  await expect(page.locator('#download')).toBeEnabled();
});

test('printing waits for fonts and prevents duplicate preparation', async ({ page }) => {
  await twoBoards(page);
  await page.evaluate(() => {
    const ready = new Promise(resolve => { window.releaseOutputFonts = resolve; });
    Object.defineProperty(document.fonts, 'ready', { get: () => { window.outputFontsWaiting = true; return ready; }, configurable: true });
  });
  await page.locator('#download').click();
  await expect(page.locator('#download')).toBeDisabled();
  await page.waitForFunction(() => window.outputFontsWaiting);
  expect(await page.evaluate(() => window.outputBlobs.length)).toBe(0);
  await page.evaluate(() => window.releaseOutputFonts());
  await page.waitForFunction(() => window.outputBlobs.length === 2);
  await expect(page.locator('#download')).toBeEnabled();
});

test('preparing a captured preview leaves current canvas selection geometry unchanged', async ({ page }) => {
  await open(page); await reset(page);
  await page.evaluate(() => {
    cornhole.showTab('templates');
    const ready = new Promise(resolve => { window.releaseOutputFonts = resolve; });
    Object.defineProperty(document.fonts, 'ready', { get: () => { window.outputFontsWaiting = true; return ready; }, configurable: true });
    const encode = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback, ...args) {
      return encode.call(this, blob => { window.previewEncodeWaiting = true; window.releasePreviewEncode = () => callback(blob); }, ...args);
    };
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    Object.defineProperty(navigator, 'share', { value: async () => {}, configurable: true });
  });
  await page.locator('#sharepreview').click();
  await page.waitForFunction(() => window.outputFontsWaiting);
  const liveBox = await page.evaluate(() => {
    cornhole.design.a.elements[0].size = 12;
    cornhole.paint(); cornhole.commit();
    return cornhole.boxes.get('t1');
  });
  await page.evaluate(() => window.releaseOutputFonts());
  await page.waitForFunction(() => window.previewEncodeWaiting);
  expect(await page.evaluate(() => cornhole.boxes.get('t1'))).toEqual(liveBox);
  await page.evaluate(() => window.releasePreviewEncode());
  await expect(page.locator('#sharestatus')).toContainText('shared');
});

test('failed PNG preparation reports the problem and makes printing available again', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await twoBoards(page);
  await page.evaluate(() => { HTMLCanvasElement.prototype.toBlob = function (callback) { callback(null); }; });
  const messages = [];
  page.on('dialog', async dialog => { messages.push(dialog.message()); await dialog.dismiss(); });
  await page.locator('#download').click();
  await expect.poll(() => messages.length + errors.length).toBeGreaterThan(0);
  expect(errors).toEqual([]);
  expect(messages.join(' ')).toMatch(/print|generate|prepared/i);
  expect(await page.evaluate(() => window.outputBlobs.length)).toBe(0);
  await expect(page.locator('#download')).toBeEnabled();
});

test('sharing, printing and editable saving explain a pending upload instead of omitting it', async ({ page }) => {
  await twoBoards(page);
  const file = await picture(page, 32, 32, 'image/jpeg', 'g.fillStyle="#00ff00"; g.fillRect(0,0,w,h);');
  await page.evaluate(() => {
    const read = FileReader.prototype.readAsDataURL;
    FileReader.prototype.readAsDataURL = function (file) {
      window.uploadReadWaiting = true;
      window.finishOutputUpload = () => read.call(this, file);
    };
  });
  await page.setInputFiles('#addimage', file);
  await page.waitForFunction(() => window.uploadReadWaiting);
  expect(await page.evaluate(() => {
    const leaving = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(leaving); return leaving.defaultPrevented;
  }), 'leaving while a selected picture is still processing warns before losing it').toBe(true);
  await page.evaluate(() => cornhole.showTab('templates'));
  let downloads = 0;
  page.on('download', () => downloads++);
  await page.locator('#sharepreview').click();
  await expect(page.locator('#sharestatus')).toContainText('processing');
  await page.locator('#exportbtn').click();
  await expect(page.locator('#uploadstatus')).toContainText('processing');
  const messages = [];
  page.on('dialog', async dialog => { messages.push(dialog.message()); await dialog.dismiss(); });
  await page.locator('#download').click();
  expect(messages.join(' ')).toContain('processing');
  expect(downloads).toBe(0);
  expect(await page.evaluate(() => window.outputBlobs.length)).toBe(0);
  await page.evaluate(() => window.finishOutputUpload());
  await expect(page.locator('#uploadstatus')).toContainText('added');
});
