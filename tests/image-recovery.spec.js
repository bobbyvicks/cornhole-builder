import { test, expect } from '@playwright/test';
import { open, reset, settled, reloaded, picture, pixelAt } from './helpers.js';

function acceptReplacement(page) {
  const messages = [], confirmations = [];
  page.on('dialog', async dialog => {
    if (dialog.type() === 'confirm' && /Replace your current design with the imported project/.test(dialog.message())) {
      confirmations.push(dialog.message()); await dialog.accept();
    } else { messages.push(dialog.message()); await dialog.dismiss(); }
  });
  return { messages, confirmations };
}

// A correct data URL header and Base64 payload do not prove that the raster
// can decode. Reject it before import commits over the customer's draft.
for (const field of ['src', 'orig']) test('a corrupt imported ' + (field === 'src' ? 'preview' : 'print master') + ' leaves the live and saved draft intact', async ({ page }) => {
  await open(page); await reset(page); await settled(page);
  const current = await page.evaluate(() => cornhole.projectRecord());
  const stored = await page.evaluate(async () => (await import('/lib/store.mjs')).loadProject());
  const file = await picture(page, 16, 16, 'image/png', 'g.fillStyle="#ff0000"; g.fillRect(0,0,w,h);');
  const valid = 'data:image/png;base64,' + file.buffer.toString('base64');
  const truncated = 'data:image/png;base64,' + file.buffer.subarray(0, 16).toString('base64');
  const incoming = structuredClone(current);
  incoming.design.a.elements = [{ type: 'image', id: 'imported-photo', src: valid, orig: valid, px: [16, 16], width: 8, x: 12, y: 30, [field]: truncated }];
  const messages = [];
  page.on('dialog', async (dialog) => { messages.push(dialog.message()); await dialog.dismiss(); });

  await page.setInputFiles('#importfile', { name: 'damaged-project.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(incoming)) });
  await expect.poll(async () => messages.length > 0 || await page.evaluate(() => cornhole.design.a.elements.some((el) => el.id === 'imported-photo'))).toBe(true);

  expect.soft(await page.evaluate(() => cornhole.design), 'a damaged imported raster must not replace the current design').toEqual(current.design);
  expect.soft(messages.join(' ')).toMatch(/could not import|could not.*image|picture.*load/i);
  await settled(page);
  expect.soft(await page.evaluate(async () => (await import('/lib/store.mjs')).loadProject()), 'the last successful saved draft must remain intact').toEqual(stored);
  await reloaded(page);
  expect(await page.evaluate(() => cornhole.design)).toEqual(current.design);
});

test('editing while an image-bearing project opens keeps the newer edit', async ({ page }) => {
  await open(page); await reset(page); await settled(page);
  const incoming = await page.evaluate(() => cornhole.projectRecord());
  const file = await picture(page, 16, 16, 'image/png', 'g.fillStyle="#00ff00"; g.fillRect(0,0,w,h);');
  incoming.design.a.elements = [{ type: 'image', id: 'imported-photo', src: 'data:image/png;base64,' + file.buffer.toString('base64'), width: 8, x: 12, y: 30 }];
  // Only defer the real browser decoder's result, reproducing a slow device.
  // The actual PNG still has to decode before the import can continue.
  await page.evaluate(() => {
    const decode = HTMLImageElement.prototype.decode;
    const gate = new Promise(resolve => { window.releaseImportDecode = resolve; });
    HTMLImageElement.prototype.decode = async function () {
      await decode.call(this);
      window.importDecodeStarted = true;
      await gate;
    };
  });
  const messages = [];
  page.on('dialog', async (dialog) => { messages.push(dialog.message()); await dialog.dismiss(); });
  await page.setInputFiles('#importfile', { name: 'photo-project.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(incoming)) });
  await page.waitForFunction(() => window.importDecodeStarted);
  await page.evaluate(() => { cornhole.select('t1'); cornhole.showTab('text'); });
  await page.locator('#ttext').fill('KEEP THIS EDIT');
  await settled(page);
  const edited = await page.evaluate(() => cornhole.design);
  await page.evaluate(() => window.releaseImportDecode());
  await expect.poll(async () => messages.length > 0 || await page.evaluate(() => cornhole.design.a.elements.some((el) => el.id === 'imported-photo'))).toBe(true);
  expect(await page.evaluate(() => cornhole.design)).toEqual(edited);
  expect(messages.join(' ')).toMatch(/changed|edit|again/i);
  await reloaded(page);
  expect(await page.evaluate(() => cornhole.design)).toEqual(edited);
});

test('a newer valid project wins while an older project is still decoding', async ({ page }) => {
  await open(page); await reset(page); await settled(page);
  const incoming = await page.evaluate(() => cornhole.projectRecord());
  const newer = structuredClone(incoming); newer.design.a.elements[0].text = 'LATEST PROJECT';
  const file = await picture(page, 16, 16, 'image/png', 'g.fillStyle="#0000ff"; g.fillRect(0,0,w,h);');
  incoming.design.a.elements = [{ type: 'image', id: 'older-photo', src: 'data:image/png;base64,' + file.buffer.toString('base64'), width: 8, x: 12, y: 30 }];
  await page.evaluate(() => {
    const decode = HTMLImageElement.prototype.decode;
    const gate = new Promise(resolve => { window.releaseImportDecode = resolve; });
    HTMLImageElement.prototype.decode = async function () {
      await decode.call(this); window.importDecodeStarted = true;
      await gate; window.importDecodeFinished = true;
    };
  });
  const { messages, confirmations } = acceptReplacement(page);
  await page.setInputFiles('#importfile', { name: 'older-project.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(incoming)) });
  await page.waitForFunction(() => window.importDecodeStarted);
  await page.setInputFiles('#importfile', { name: 'newer-project.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(newer)) });
  await page.waitForFunction(() => cornhole.design.a.elements[0]?.text === 'LATEST PROJECT');
  await page.evaluate(() => window.releaseImportDecode());
  await page.waitForFunction(() => window.importDecodeFinished);
  expect(await page.evaluate(() => cornhole.design)).toEqual(newer.design);
  expect(messages, 'superseded imports finish quietly').toEqual([]);
  expect(confirmations, 'only the latest valid import asks to replace the design').toHaveLength(1);
  await settled(page); await reloaded(page);
  expect(await page.evaluate(() => cornhole.design)).toEqual(newer.design);
});

test('a slower earlier file read cannot replace the latest selected project', async ({ page }) => {
  await open(page); await reset(page); await settled(page);
  const older = await page.evaluate(() => cornhole.projectRecord());
  older.design.a.elements[0].text = 'OLDER PROJECT';
  const newer = structuredClone(older); newer.design.a.elements[0].text = 'LATEST PROJECT';
  await page.evaluate(() => {
    const read = File.prototype.text;
    const gate = new Promise(resolve => { window.releaseProjectRead = resolve; });
    File.prototype.text = async function () {
      const text = await read.call(this);
      if (this.name === 'older-project.json') {
        window.projectReadStarted = true;
        await gate; window.projectReadFinished = true;
      }
      return text;
    };
  });
  const { messages, confirmations } = acceptReplacement(page);
  await page.setInputFiles('#importfile', { name: 'older-project.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(older)) });
  await page.waitForFunction(() => window.projectReadStarted);
  await page.setInputFiles('#importfile', { name: 'newer-project.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(newer)) });
  await page.waitForFunction(() => cornhole.design.a.elements[0]?.text === 'LATEST PROJECT');
  await page.evaluate(() => window.releaseProjectRead());
  await page.waitForFunction(() => window.projectReadFinished);
  expect(await page.evaluate(() => cornhole.design)).toEqual(newer.design);
  expect(messages, 'superseded file reads finish quietly').toEqual([]);
  expect(confirmations, 'the superseded read must not ask to replace the newer project').toHaveLength(1);
  await settled(page); await reloaded(page);
  expect(await page.evaluate(() => cornhole.design)).toEqual(newer.design);
});

test('editing while a project file is being read preserves the newer saved draft', async ({ page }) => {
  await open(page); await reset(page); await settled(page);
  const incoming = await page.evaluate(() => cornhole.projectRecord());
  incoming.design.a.elements[0].text = 'IMPORTED PROJECT';
  await page.evaluate(() => {
    const read = File.prototype.text;
    const gate = new Promise(resolve => { window.releaseProjectRead = resolve; });
    File.prototype.text = async function () {
      const text = await read.call(this); window.projectReadStarted = true;
      await gate; window.projectReadFinished = true;
      return text;
    };
  });
  const messages = [];
  page.on('dialog', async (dialog) => { messages.push(dialog.message()); await dialog.dismiss(); });
  await page.setInputFiles('#importfile', { name: 'slow-project.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(incoming)) });
  await page.waitForFunction(() => window.projectReadStarted);
  await page.evaluate(() => { cornhole.select('t1'); cornhole.showTab('text'); });
  await page.locator('#ttext').fill('KEEP THIS NEW EDIT');
  await settled(page);
  const edited = await page.evaluate(() => cornhole.projectRecord());
  await page.evaluate(() => window.releaseProjectRead());
  await page.waitForFunction(() => window.projectReadFinished);
  expect(await page.evaluate(() => cornhole.design)).toEqual(edited.design);
  expect(messages.join(' ')).toMatch(/changed|edit|again/i);
  await reloaded(page);
  expect(await page.evaluate(() => cornhole.design)).toEqual(edited.design);
});

test('project import validates only one raster at a time', async ({ page }) => {
  await open(page); await reset(page); await settled(page);
  const { messages, confirmations } = acceptReplacement(page);
  const incoming = await page.evaluate(() => cornhole.projectRecord());
  const preview = await picture(page, 16, 16, 'image/png', 'g.fillStyle="#ff0000"; g.fillRect(0,0,w,h);');
  const master = await picture(page, 32, 32, 'image/jpeg', 'g.fillStyle="#0000ff"; g.fillRect(0,0,w,h);');
  incoming.design.a.elements = [{ type: 'image', id: 'sequential-photo', src: 'data:image/png;base64,' + preview.buffer.toString('base64'), orig: 'data:image/jpeg;base64,' + master.buffer.toString('base64'), width: 8, x: 12, y: 30 }];
  await page.evaluate(() => {
    const decode = HTMLImageElement.prototype.decode;
    window.pendingDecodes = []; window.activeDecodes = 0; window.peakDecodes = 0;
    HTMLImageElement.prototype.decode = async function () {
      window.activeDecodes++;
      window.peakDecodes = Math.max(window.peakDecodes, window.activeDecodes);
      try {
        await decode.call(this);
        await new Promise(resolve => window.pendingDecodes.push(resolve));
      } finally { window.activeDecodes--; }
    };
  });
  await page.setInputFiles('#importfile', { name: 'two-rasters.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(incoming)) });
  for (let i = 0; i < 2; i++) {
    await page.waitForFunction(() => window.pendingDecodes.length > 0);
    expect(await page.evaluate(() => window.peakDecodes), 'only one raster may decode before the previous one finishes').toBe(1);
    await page.evaluate(() => window.pendingDecodes.shift()());
  }
  await page.waitForFunction(() => cornhole.design.a.elements[0]?.id === 'sequential-photo');
  expect(confirmations).toHaveLength(1); expect(messages).toEqual([]);
  await settled(page);
});

test('separate imported boards display, reload and print with distinct preview and master images', async ({ page }) => {
  const errors = await open(page); await reset(page); await settled(page);
  const { messages, confirmations } = acceptReplacement(page);
  const incoming = await page.evaluate(() => cornhole.projectRecord());
  const red = await picture(page, 32, 32, 'image/png', 'g.fillStyle="#ff0000"; g.fillRect(0,0,w,h);');
  const blue = await picture(page, 64, 64, 'image/jpeg', 'g.fillStyle="#0000ff"; g.fillRect(0,0,w,h);');
  const green = await picture(page, 128, 128, 'image/png', 'g.fillStyle="#00ff00"; g.fillRect(0,0,w,h);');
  const redUrl = 'data:image/png;base64,' + red.buffer.toString('base64');
  const blueUrl = 'data:image/jpeg;base64,' + blue.buffer.toString('base64');
  const greenUrl = 'data:image/png;base64,' + green.buffer.toString('base64');
  incoming.design.same = false;
  incoming.design.a.elements = [{ type: 'image', id: 'photo-a', src: redUrl, orig: blueUrl, px: [64, 64], width: 8, x: 12, y: 30 }];
  // A source used as A's master is also B's preview; it must stay decoded.
  incoming.design.b.elements = [{ type: 'image', id: 'photo-b', src: blueUrl, orig: greenUrl, px: [128, 128], width: 8, x: 12, y: 30 }];
  await page.setInputFiles('#importfile', { name: 'two-boards.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(incoming)) });
  await page.waitForFunction(() => cornhole.design.a.elements[0]?.id === 'photo-a');
  expect(confirmations).toHaveLength(1); expect(messages).toEqual([]);
  await settled(page);

  for (const reload of [false, true]) {
    if (reload) await reloaded(page);
    await page.evaluate(() => cornhole.preloadImages(['a', 'b'], { print: false }));
    expect(await pixelAt(page, 'a', 12, 30)).toEqual([255, 0, 0, 255]);
    const previewB = await pixelAt(page, 'b', 12, 30);
    expect(previewB[0]).toBeLessThan(6); expect(previewB[1]).toBeLessThan(6); expect(previewB[2]).toBeGreaterThan(250);
    const printed = await page.evaluate(async () => {
      await cornhole.preloadImages(['a', 'b']);
      return ['a', 'b'].map(key => Array.from(cornhole.printCanvas(key).getContext('2d').getImageData(1200, 3000, 1, 1).data));
    });
    expect(printed[0][0]).toBeLessThan(6); expect(printed[0][1]).toBeLessThan(6); expect(printed[0][2]).toBeGreaterThan(250);
    expect(printed[1]).toEqual([0, 255, 0, 255]);
    expect(await page.evaluate(() => [cornhole.design.a.elements[0].orig, cornhole.design.b.elements[0].orig])).toEqual([blueUrl, greenUrl]);
  }
  expect(errors).toEqual([]);
});

test('cancelling replacement after image validation preserves the live and saved project', async ({ page }) => {
  const errors = await open(page); await reset(page); await settled(page);
  const before = await page.evaluate(() => cornhole.projectRecord());
  const saved = await page.evaluate(async () => (await import('/lib/store.mjs')).loadProject());
  const preview = await picture(page, 16, 16, 'image/png', 'g.fillStyle="#ff0000"; g.fillRect(0,0,w,h);');
  const master = await picture(page, 32, 32, 'image/jpeg', 'g.fillStyle="#0000ff"; g.fillRect(0,0,w,h);');
  const incoming = structuredClone(before);
  incoming.design.a.elements = [{ type: 'image', id: 'cancelled-photo', src: 'data:image/png;base64,' + preview.buffer.toString('base64'), orig: 'data:image/jpeg;base64,' + master.buffer.toString('base64'), width: 8, x: 12, y: 30 }];
  await page.evaluate(() => {
    const decode = HTMLImageElement.prototype.decode; window.validatedImages = 0;
    HTMLImageElement.prototype.decode = async function () { await decode.call(this); window.validatedImages++; };
  });
  const dialogs = [];
  page.on('dialog', async dialog => { dialogs.push({ type: dialog.type(), message: dialog.message() }); await dialog.dismiss(); });
  await page.setInputFiles('#importfile', { name: 'cancelled-project.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(incoming)) });
  await expect.poll(() => dialogs.length).toBe(1);
  expect(dialogs[0]).toEqual({ type: 'confirm', message: 'Replace your current design with the imported project?' });
  expect(await page.evaluate(() => window.validatedImages)).toBe(2);
  expect(await page.evaluate(() => cornhole.design)).toEqual(before.design);
  expect(await page.evaluate(async () => (await import('/lib/store.mjs')).loadProject())).toEqual(saved);
  await reloaded(page);
  expect(await page.evaluate(() => cornhole.design)).toEqual(before.design);
  expect(errors).toEqual([]);
});
