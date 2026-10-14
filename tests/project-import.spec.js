import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { open, reset, settled, reloaded, picture, pixelAt, setInput } from './helpers.js';

const imageElement = (src) => ({ type: 'image', id: 'picture', src, width: 8, x: 12, y: 30 });
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=';
const invalid = [
  ['missing board', (p) => { p.design.a = null; }, /Board A.*object/i],
  ['array instead of board', (p) => { p.design.b = []; }, /Board B.*object/i],
  ['malformed element list', (p) => { p.design.a.elements = {}; }, /Board A.*elements.*list/i],
  ['null element', (p) => { p.design.a.elements = [null]; }, /Board A.*item 1.*object/i],
  ['unsupported element type', (p) => { p.design.a.elements[0].type = 'video'; }, /Board A.*item 1.*type/i],
  ['unknown clip ID', (p) => { p.design.a.elements = [{ type: 'clip', name: 'toString', x: 12, y: 30 }]; }, /Board A.*item 1.*clip art/i],
  ['missing text value', (p) => { delete p.design.a.elements[0].text; }, /Board A.*item 1.*text/i],
  ['invalid gradient colour', (p) => { p.design.a.base = { kind: 'gradient', color: '#abcdef', color2: 'not-a-colour' }; }, /Board A.*colour/i],
  ['excessively dense pattern', (p) => { p.design.a.pattern = { kind: 'checker', color: '#abcdef', size: 0.01 }; }, /Board A.*pattern size.*0\.5/i],
  ['border below the supported minimum', (p) => { p.design.a.pattern = { kind: 'border', color: '#abcdef', size: 0.01 }; }, /Board A.*pattern size.*0\.1/i],
  ['non-finite position', (p) => { p.design.a.elements[0].x = Infinity; }, /Board A.*item 1.*horizontal position/i],
  ['extreme size', (p) => { p.design.a.elements[0].size = 1e9; }, /Board A.*item 1.*size/i],
  ['invalid image dimensions', (p) => { p.design.a.elements = [{ ...imageElement(PNG), px: [0, 100] }]; }, /Board A.*item 1.*dimensions/i],
  ['script image URL', (p) => { p.design.a.elements = [imageElement('javascript:alert(1)')]; }, /Board A.*item 1.*embedded.*image/i],
  ['remote image URL', (p) => { p.design.a.elements = [imageElement('https://example.com/image.png')]; }, /Board A.*item 1.*embedded.*image/i],
  ['unsafe print master', (p) => { p.design.a.elements = [{ ...imageElement(PNG), orig: 'data:text/html;base64,PGgxPkhlbGxvPC9oMT4=' }]; }, /Board A.*item 1.*print master.*image/i],
  ['malformed fit metadata', (p) => { p.design.a.elements[0].fitReference = { text: 'TEST', size: -50, spacing: 0, font: 'Impact' }; }, /Board A.*item 1.*reference.*size/i],
  ['duplicate element IDs', (p) => { p.design.a.elements.push({ ...p.design.a.elements[0] }); }, /Board A.*duplicate.*ID/i],
];

test.describe('project import validation', () => {
  for (const [label, corrupt, message] of invalid) test('rejects ' + label + ' without replacing the live or saved project', async ({ page }) => {
    await open(page); await reset(page); await settled(page);
    await page.evaluate(() => cornhole.select('t1'));
    const current = await page.evaluate(() => ({ design: cornhole.design, order: cornhole.order, selected: cornhole.selected }));
    const stored = await page.evaluate(async () => (await import('/lib/store.mjs')).loadProject());
    const incoming = structuredClone(stored); corrupt(incoming);
    const error = await page.evaluate((project) => {
      try { cornhole.importProject(project); return null; }
      catch (error) { return error.message; }
    }, incoming);
    expect(error).toMatch(message);
    expect(await page.evaluate(() => ({ design: cornhole.design, order: cornhole.order, selected: cornhole.selected }))).toEqual(current);
    expect(await page.evaluate(async () => (await import('/lib/store.mjs')).loadProject())).toEqual(stored);
    await reloaded(page);
    expect(await page.evaluate(() => cornhole.design)).toEqual(current.design);
  });

  test('the file picker reports the invalid field and leaves the saved design intact', async ({ page }) => {
    await open(page); await reset(page); await settled(page);
    const current = await page.evaluate(() => cornhole.projectRecord());
    const incoming = structuredClone(current);
    incoming.design.b.pattern = { kind: 'checker', color: '#zzzzzz', size: 3 };
    const dialog = page.waitForEvent('dialog');
    await page.setInputFiles('#importfile', { name: 'broken-project.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(incoming)) });
    const alert = await dialog;
    expect(alert.message()).toMatch(/Could not import.*Board B.*colour/i);
    await alert.dismiss();
    expect(await page.evaluate(() => cornhole.design)).toEqual(current.design);
    await reloaded(page);
    expect(await page.evaluate(() => cornhole.design)).toEqual(current.design);
  });

  test('approved thin borders import, render at their actual width and survive reload', async ({ page }) => {
    await open(page); await reset(page);
    await page.evaluate(() => {
      cornhole.applyTemplate('bbp1-garden-vows');
      const project = cornhole.projectRecord();
      cornhole.applyBlank(); cornhole.importProject(project);
    });
    expect(await page.evaluate(() => cornhole.design.a.pattern.size)).toBe(0.28);
    // The preview has a decorative bevel along the outer 0.25 inches;
    // the print canvas exposes the border ink itself without that shading.
    expect(await page.evaluate(() => Array.from(cornhole.printCanvas('a').getContext('2d').getImageData(15, 2000, 1, 1).data))).toEqual([49, 77, 62, 255]);
    expect(await pixelAt(page, 'a', 0.4, 20)).toEqual([246, 241, 229, 255]);
    await settled(page); await reloaded(page);
    expect(await page.evaluate(() => cornhole.design.a.pattern.size)).toBe(0.28);
    expect(await pixelAt(page, 'a', 0.4, 20)).toEqual([246, 241, 229, 255]);
    await page.evaluate(() => {
      const project = cornhole.projectRecord(); project.design.a.pattern.size = 0.1;
      cornhole.importProject(project);
    });
    expect(await page.evaluate(() => cornhole.design.a.pattern.size)).toBe(0.1);
    expect(await pixelAt(page, 'a', 0.3, 20)).toEqual([246, 241, 229, 255]);
  });

  test('switching a thin border to another style keeps exports and order payloads within supported pattern sizes', async ({ page }) => {
    await open(page); await reset(page);
    for (const kind of ['none', 'checker', 'hearts']) {
      await page.evaluate(() => { cornhole.applyTemplate('bbp1-garden-vows'); cornhole.showTab('board'); });
      await page.selectOption('#pattern', kind);
      const changed = await page.evaluate(() => cornhole.design.a.pattern);
      expect(changed).toMatchObject({ kind, size: 0.5 });
      const download = page.waitForEvent('download');
      await page.evaluate(() => cornhole.exportProject());
      const exported = JSON.parse(readFileSync(await (await download).path(), 'utf8'));
      await page.evaluate(() => cornhole.applyBlank());
      await page.setInputFiles('#importfile', { name: 'new-style.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)) });
      await page.waitForFunction((kind) => cornhole.design.a.pattern.kind === kind && cornhole.design.a.elements.length > 0, kind);
      expect(await page.evaluate(() => cornhole.orderPayload().design.a.pattern)).toEqual(changed);
    }
  });

  test('border size controls display exact widths and follow undo and redo', async ({ page }) => {
    await open(page); await reset(page);
    await page.evaluate(() => { cornhole.applyTemplate('bbp1-garden-vows'); cornhole.showTab('board'); });
    await expect(page.locator('#patsize')).toHaveAttribute('min', '0.1');
    await expect(page.locator('#patsize')).toHaveValue('0.28');
    await expect(page.locator('#patsizeval')).toHaveText('0.28"');
    await page.selectOption('#pattern', 'checker');
    await expect(page.locator('#patsize')).toHaveAttribute('min', '0.5');
    await expect(page.locator('#patsize')).toHaveValue('0.5');
    await page.click('#undo');
    await expect(page.locator('#pattern')).toHaveValue('border');
    await expect(page.locator('#patsize')).toHaveAttribute('min', '0.1');
    await expect(page.locator('#patsize')).toHaveValue('0.28');
    await expect(page.locator('#patsizeval')).toHaveText('0.28"');
    await page.click('#redo');
    await expect(page.locator('#pattern')).toHaveValue('checker');
    await expect(page.locator('#patsize')).toHaveValue('0.5');
    await expect(page.locator('#patsizeval')).toHaveText('0.5"');
  });

  test('oversized files are rejected before their contents are parsed', async ({ page }) => {
    await open(page); await reset(page); await settled(page);
    const current = await page.evaluate(() => cornhole.design);
    const dialog = page.waitForEvent('dialog');
    const chooseFile = page.evaluate(() => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array(64 * 1024 * 1024 + 1)], 'too-large.json', { type: 'application/json' }));
      const input = document.getElementById('importfile'); input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const alert = await dialog;
    expect(alert.message()).toMatch(/64 MB/);
    await alert.dismiss();
    await chooseFile;
    expect(await page.evaluate(() => cornhole.design)).toEqual(current);
  });

  test('a real export round-trips editable pack artwork, fitting metadata, images and order choices', async ({ page }) => {
    const errors = await open(page); await reset(page);
    await page.evaluate(() => { cornhole.applyTemplate('bbp1-family-roots'); cornhole.setOrder({ finish: 'gloss', quantity: 2, giftNote: 'Family keepsake' }); });
    const text = await page.evaluate(() => cornhole.design.a.elements.find((el) => el.text === 'THE PARKERS').id);
    await page.evaluate((id) => cornhole.select(id), text);
    await setInput(page, 'ttext', 'THE RIVERS');
    const photo = await picture(page, 2000, 1000, 'image/png', 'g.fillStyle="#00ff00"; g.fillRect(0,0,w,h);');
    await page.setInputFiles('#addimage', photo);
    await page.waitForFunction(() => cornhole.design.a.elements.some((el) => el.type === 'image'));
    await page.evaluate(() => { cornhole.design.a.elements.find((el) => el.type === 'image').note = { originalName: 'summer photo' }; cornhole.commit(); });
    await settled(page);
    const download = page.waitForEvent('download');
    await page.evaluate(() => cornhole.exportProject());
    const exported = JSON.parse(readFileSync(await (await download).path(), 'utf8'));
    expect(exported.design.a.elements.find((el) => el.id === text).fitReference.text).toBe('THE PARKERS');
    expect(exported.design.a.elements.find((el) => el.type === 'image').orig).toMatch(/^data:image\//);
    await page.evaluate(() => cornhole.applyBlank()); await settled(page);
    await page.setInputFiles('#importfile', { name: 'my-export.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)) });
    await page.waitForFunction(() => cornhole.design.a.elements.some((el) => el.text === 'THE RIVERS'));
    await settled(page);
    expect(await page.evaluate(() => cornhole.design)).toEqual(exported.design);
    expect(await page.evaluate(() => cornhole.order)).toEqual(exported.order);
    await reloaded(page);
    expect(await page.evaluate(() => cornhole.design)).toEqual(exported.design);
    expect(errors).toEqual([]);
  });

  test('legacy defaults, empty in-progress text and ordinary raster data URLs remain importable', async ({ page }) => {
    const errors = await open(page); await reset(page);
    const png = await picture(page, 10, 10, 'image/png', 'g.fillStyle="#ff0000"; g.fillRect(0,0,w,h);');
    const jpeg = await picture(page, 10, 10, 'image/jpeg', 'g.fillStyle="#0000ff"; g.fillRect(0,0,w,h);');
    const incoming = { version: 1, design: { version: 1, a: { elements: [
      { type: 'text', text: '', font: 'Impact', size: 4, color: '#ffffff', x: 12, y: 30 },
      { type: 'clip', name: 'heart', x: 12, y: 20 },
      imageElement('data:image/png;base64,' + png.buffer.toString('base64')),
      { ...imageElement('data:image/jpeg;base64,' + jpeg.buffer.toString('base64')), id: 'jpeg', x: 6 },
    ] }, b: {} } };
    await page.evaluate((project) => cornhole.importProject(project), incoming);
    await settled(page);
    const imported = await page.evaluate(() => cornhole.design);
    expect(imported.version).toBe(2);
    expect(imported.same).toBe(true);
    expect(imported.a.base.color).toBe('#1f3a93');
    expect(imported.a.elements[0]).toMatchObject({ text: '', rotation: 0, outlineWidth: 0 });
    expect(imported.a.elements[1]).toMatchObject({ name: 'heart', width: 8, opacity: 1, color: '#f5f5f0' });
    expect(imported.a.elements[2].src).toBe(incoming.design.a.elements[2].src);
    expect(imported.a.elements[3].src).toBe(incoming.design.a.elements[3].src);
    expect(imported.b.elements).toEqual([]);
    expect(errors).toEqual([]);
  });
});
