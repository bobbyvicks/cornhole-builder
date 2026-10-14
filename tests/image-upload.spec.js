import { test, expect } from '@playwright/test';
import { open, reset, picture, settled, reloaded, clientPoint } from './helpers.js';

async function jpeg(page, name, color) {
  const file = await picture(page, 80, 40, 'image/jpeg', `g.fillStyle='${color}'; g.fillRect(0,0,w,h);`);
  return { ...file, name };
}

// Let the browser really decode, resize, and read each JPEG, then hold the
// reader's completion callback to reproduce slower devices deterministically.
async function holdUploads(page) {
  await page.evaluate(() => {
    const read = FileReader.prototype.readAsDataURL;
    window.pendingUploads = []; window.uploadReads = [];
    FileReader.prototype.readAsDataURL = function (file) {
      const onload = this.onload;
      this.onload = (event) => window.pendingUploads.push({ name: file.name, release: () => onload.call(this, event) });
      window.uploadReads.push(file.name);
      return read.call(this, file);
    };
  });
}

async function releaseUpload(page, name) {
  await page.evaluate((name) => {
    const i = window.pendingUploads.findIndex(upload => upload.name === name);
    window.pendingUploads.splice(i, 1)[0].release();
  }, name);
}

test('a picture finishes on its original board after the user switches boards', async ({ page }) => {
  await open(page); await reset(page);
  await page.locator('#boardmode [data-v="a"]').click();
  await page.getByRole('tab', { name: 'Art', exact: true }).click();
  const file = await jpeg(page, 'board-a.jpg', '#ff0000');
  await holdUploads(page);
  await page.setInputFiles('#addimage', file);
  await page.waitForFunction(() => window.pendingUploads.length === 1);
  await page.locator('#boardmode [data-v="b"]').click();
  const boardB = await page.evaluate(() => cornhole.design.b);
  await releaseUpload(page, file.name);
  await page.waitForFunction(() => [cornhole.design.a, cornhole.design.b].some(board => board.elements.some(el => el.type === 'image')));
  expect(await page.evaluate(() => cornhole.design.a.elements.filter(el => el.type === 'image').length)).toBe(1);
  expect(await page.evaluate(() => cornhole.design.b)).toEqual(boardB);
  expect(await page.evaluate(() => cornhole.active)).toBe('b');
  await expect(page.locator('#uploadstatus')).toContainText(/added.*Board A/i);
  await settled(page); await reloaded(page);
  expect(await page.evaluate(() => cornhole.design.a.elements.filter(el => el.type === 'image').length)).toBe(1);
  expect(await page.evaluate(() => cornhole.design.b)).toEqual(boardB);
});

for (const replacement of ['blank', 'template', 'reset']) test('a delayed upload cannot add itself to a replacement ' + replacement + ' design', async ({ page }) => {
  await open(page); await reset(page);
  const file = await jpeg(page, 'old-design.jpg', '#ff0000');
  await holdUploads(page);
  await page.setInputFiles('#addimage', file);
  await page.waitForFunction(() => window.pendingUploads.length === 1);
  if (replacement === 'reset') {
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#reset').click();
  } else await page.evaluate((kind) => kind === 'blank' ? cornhole.applyBlank() : cornhole.applyTemplate('wedding'), replacement);
  await settled(page);
  const current = await page.evaluate(() => cornhole.design);
  await releaseUpload(page, file.name);
  expect(await page.evaluate(() => cornhole.design), 'the replacement design must not receive a picture selected for the previous design').toEqual(current);
  await expect(page.locator('#uploadstatus')).toContainText(/not added|cancel/i);
  await settled(page); await reloaded(page);
  expect(await page.evaluate(() => cornhole.design)).toEqual(current);
});

test('overlapping uploads reserve the last picture slot for the first accepted file', async ({ page }) => {
  await open(page); await reset(page);
  const first = await jpeg(page, 'first.jpg', '#ff0000');
  const second = await jpeg(page, 'second.jpg', '#0000ff');
  const original = 'data:image/jpeg;base64,' + first.buffer.toString('base64');
  await page.evaluate((src) => {
    const project = structuredClone(cornhole.design);
    project.a.elements = [0, 1, 2].map(i => ({ type: 'image', id: 'existing-' + i, src, width: 2, x: 3 + i * 3, y: 10 }));
    cornhole.setDesign(project); cornhole.showTab('art');
  }, original);
  const messages = [];
  page.on('dialog', async dialog => { messages.push(dialog.message()); await dialog.dismiss(); });
  await holdUploads(page);
  await page.setInputFiles('#addimage', first);
  await page.waitForFunction(() => window.pendingUploads.length === 1);
  await page.setInputFiles('#addimage', second);
  await expect.poll(async () => messages.length > 0 || await page.evaluate(() => window.pendingUploads.some(upload => upload.name === 'second.jpg') || /4/.test(document.getElementById('uploadstatus')?.textContent || ''))).toBe(true);
  const secondPending = await page.evaluate(() => window.pendingUploads.some(upload => upload.name === 'second.jpg'));
  if (secondPending) await releaseUpload(page, second.name);
  await releaseUpload(page, first.name);
  await page.waitForFunction(() => cornhole.design.a.elements.length === 4);
  const pictures = await page.evaluate(() => cornhole.design.a.elements.filter(el => el.type === 'image'));
  expect(pictures).toHaveLength(4);
  expect(pictures[3].orig, 'a faster later upload must not take the first accepted upload’s reserved slot').toBe(original);
  expect(await page.evaluate(() => window.uploadReads), 'the over-limit upload should be rejected before expensive processing').toEqual(['first.jpg']);
  await settled(page); await reloaded(page);
  expect(await page.evaluate(() => cornhole.design.a.elements.filter(el => el.type === 'image').length)).toBe(4);
});

test('replacing only the destination board cancels its pending upload', async ({ page }) => {
  await open(page); await reset(page);
  await page.locator('#boardmode [data-v="b"]').click();
  const file = await jpeg(page, 'board-b.jpg', '#ff0000');
  await holdUploads(page); await page.setInputFiles('#addimage', file);
  await page.waitForFunction(() => window.pendingUploads.length === 1);
  await page.locator('#boardmode [data-v="a"]').click();
  await page.locator('#copyother').click();
  const replacement = await page.evaluate(() => cornhole.design);
  await releaseUpload(page, file.name);
  expect(await page.evaluate(() => cornhole.design)).toEqual(replacement);
  await expect(page.locator('#uploadstatus')).toContainText(/not added|cancel/i);
  await settled(page); await reloaded(page);
  expect(await page.evaluate(() => cornhole.design)).toEqual(replacement);
});

test('returning to matching boards cancels an upload for the hidden separate Board B', async ({ page }) => {
  await open(page); await reset(page);
  await page.locator('#boardmode [data-v="b"]').click();
  const file = await jpeg(page, 'separate-b.jpg', '#ff0000');
  await holdUploads(page); await page.setInputFiles('#addimage', file);
  await page.waitForFunction(() => window.pendingUploads.length === 1);
  await page.locator('#boardmode [data-v="same"]').click();
  const matching = await page.evaluate(() => cornhole.design);
  await releaseUpload(page, file.name);
  expect(await page.evaluate(() => cornhole.design)).toEqual(matching);
  await expect(page.locator('#uploadstatus')).toContainText(/not added|cancel/i);
});

test('a failed image releases its pending slot so a valid replacement can be uploaded', async ({ page }) => {
  await open(page); await reset(page);
  const file = await jpeg(page, 'valid.jpg', '#ff0000');
  const source = 'data:image/jpeg;base64,' + file.buffer.toString('base64');
  await page.evaluate((src) => {
    const project = structuredClone(cornhole.design);
    project.a.elements = [0, 1, 2].map(i => ({ type: 'image', id: 'existing-' + i, src, width: 2, x: 3 + i * 3, y: 10 }));
    cornhole.setDesign(project); cornhole.showTab('art');
  }, source);
  await page.setInputFiles('#addimage', { name: 'broken.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('not an image') });
  await expect(page.locator('#uploadstatus')).toContainText(/could not read/i);
  expect(await page.evaluate(() => cornhole.design.a.elements.length)).toBe(3);
  await page.setInputFiles('#addimage', file);
  await page.waitForFunction(() => cornhole.design.a.elements.length === 4);
  await expect(page.locator('#uploadstatus')).toContainText(/added.*Board A/i);
});

test('finishing an upload preserves newer text editing and focus', async ({ page }) => {
  await open(page); await reset(page);
  await page.getByRole('tab', { name: 'Art', exact: true }).click();
  const file = await jpeg(page, 'while-typing.jpg', '#ff0000');
  await holdUploads(page); await page.setInputFiles('#addimage', file);
  await page.waitForFunction(() => window.pendingUploads.length === 1);
  await page.evaluate(() => { cornhole.select('t1'); cornhole.showTab('text'); });
  await page.locator('#ttext').fill('KEEP TYPING');
  await releaseUpload(page, file.name);
  await page.waitForFunction(() => cornhole.design.a.elements.some(el => el.type === 'image'));
  expect(await page.evaluate(() => cornhole.selected)).toBe('t1');
  await expect(page.locator('#ttext')).toBeFocused();
  await expect(page.locator('#ttext')).toHaveValue('KEEP TYPING');
  await expect(page.getByRole('tab', { name: 'Text', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.locator('#ttext').press('End'); await page.locator('#ttext').press('!');
  expect(await page.evaluate(() => cornhole.design.a.elements.find(el => el.id === 't1').text)).toBe('KEEP TYPING!');
});

test('finishing an upload keeps keyboard range edits on the selected artwork', async ({ page }) => {
  await open(page); await reset(page);
  const heart = await page.evaluate(() => cornhole.addClip('heart').id);
  const file = await jpeg(page, 'while-resizing.jpg', '#ff0000');
  await holdUploads(page); await page.setInputFiles('#addimage', file);
  await page.waitForFunction(() => window.pendingUploads.length === 1);
  await page.locator('#iwidth').focus(); await page.keyboard.press('ArrowRight');
  expect(await page.evaluate(id => cornhole.design.a.elements.find(el => el.id === id).width, heart)).toBe(8.25);
  await releaseUpload(page, file.name);
  await page.waitForFunction(() => cornhole.design.a.elements.some(el => el.type === 'image'));
  expect(await page.evaluate(() => cornhole.selected), 'the focused width control must keep editing the same artwork').toBe(heart);
  await expect(page.locator('#iwidth')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  expect(await page.evaluate(id => cornhole.design.a.elements.find(el => el.id === id).width, heart)).toBe(8.5);
  expect(await page.evaluate(() => cornhole.design.a.elements.find(el => el.type === 'image').width)).toBe(10);
});

test('finishing an upload during a canvas drag keeps subsequent keyboard nudges on the dragged artwork', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await open(page); await reset(page);
  const heart = await page.evaluate(() => cornhole.addClip('heart', { x: 12, y: 36 }).id);
  const file = await jpeg(page, 'during-drag.jpg', '#ff0000');
  await holdUploads(page); await page.setInputFiles('#addimage', file);
  await page.waitForFunction(() => window.pendingUploads.length === 1);
  const start = await clientPoint(page, 'a', 12, 36);
  const middle = await clientPoint(page, 'a', 14, 38);
  const end = await clientPoint(page, 'a', 16, 40);
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(middle.x, middle.y);
  await expect(page.locator('#canvasA')).toBeFocused();
  await expect(page.locator('#canvasA')).toHaveClass(/dragging/);
  await releaseUpload(page, file.name);
  await page.waitForFunction(() => cornhole.design.a.elements.some(el => el.type === 'image'));
  await page.mouse.move(end.x, end.y); await page.mouse.up();
  await page.keyboard.press('ArrowRight');
  expect.soft(await page.evaluate(() => cornhole.selected)).toBe(heart);
  expect.soft(await page.evaluate(id => cornhole.design.a.elements.find(el => el.id === id), heart)).toMatchObject({ x: 16.1, y: 40 });
  expect(await page.evaluate(() => cornhole.design.a.elements.find(el => el.type === 'image').x)).toBe(12);
});
