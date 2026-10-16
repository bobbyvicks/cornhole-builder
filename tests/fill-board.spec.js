import { test, expect } from '@playwright/test';
import { open, reset, picture, settled, reloaded, pixelAt, count, clientPoint, setInput, WHITE, NAVY, RED } from './helpers.js';

/* Fill the board: one picture drawn over the whole 24 x 48, centred and
   trimmed to fit, under every other item, with its own place set aside
   until it is put back. */

const CORNERS = [[0.8, 0.8], [23.2, 0.8], [0.8, 47.2], [23.2, 47.2]];
const GREEN = [0x1f, 0x7a, 0x3a];

/* A landscape picture, 2:1: blue at the two outer quarters, red in the
   middle half. Filling the 1:2 board it is 48" tall and 96" wide, so only
   its middle quarter shows - all red, if it is centred. At 2000 px wide
   its preview is shrunk, so it keeps its own file as the print master. */
const landscape = (page, colour = '#c8102e', w = 2000, h = 1000) => picture(page, w, h, 'image/png',
  `g.fillStyle = '#1e5bc6'; g.fillRect(0, 0, w, h); g.fillStyle = '${colour}'; g.fillRect(w / 4, 0, w / 2, h);`);

async function upload(page, file) {
  const before = await page.evaluate(() => cornhole.activeBoard().elements.filter((e) => e.type === 'image').length);
  await page.setInputFiles('#addimage', file);
  await page.waitForFunction((n) => cornhole.activeBoard().elements.filter((e) => e.type === 'image').length > n, before);
  await settled(page);
  /* The page selects a new picture only when nothing else is being
     edited; the specs always go on with the one just added. */
  return page.evaluate(() => {
    const pic = cornhole.activeBoard().elements.filter((e) => e.type === 'image').at(-1);
    cornhole.showTab('art'); cornhole.select(pic.id);
    return pic;
  });
}
const element = (page, id) => page.evaluate((id) => cornhole.activeBoard().elements.find((e) => e.id === id) || null, id);
const corners = (page, key = 'a') => Promise.all(CORNERS.map(([x, y]) => pixelAt(page, key, x, y)));
const placement = ({ x, y, width, rotation, circleCrop }) => ({ x, y, width, rotation, circleCrop });

test('ticking Fill the board paints the picture into all four corners, under the words, and unticking puts it back', async ({ page }) => {
  const errors = await open(page); await reset(page);
  const pic = await upload(page, await landscape(page));
  expect(pic.cover, 'a new picture does not fill the board').toBe(false);
  /* Somewhere of its own first: small, low down, turned and circle-cropped. */
  await page.evaluate((id) => { Object.assign(cornhole.activeBoard().elements.find((e) => e.id === id), { x: 6, y: 40, width: 6, rotation: 20 }); cornhole.commit(); cornhole.select(id); }, pic.id);
  await page.check('#icircle');
  const before = placement(await element(page, pic.id));
  for (const c of await corners(page)) expect(c).toEqual([...NAVY, 255]);

  await page.check('#icover');
  await settled(page);
  for (const c of await corners(page)) expect(c, 'the picture reaches every corner').toEqual([...RED, 255]);
  expect(await pixelAt(page, 'a', 12, 44), 'centred: only the middle of the picture shows').toEqual([...RED, 255]);
  expect(await count(page, 'a', WHITE), 'the words are drawn over it, though the picture is later in the list').toBeGreaterThan(200);
  const on = await element(page, pic.id);
  expect(on.cover).toBe(true);
  expect(placement(on), 'its own place is kept for later').toEqual(before);
  for (const id of ['iwidth', 'irot', 'ix', 'iy', 'icircle']) await expect(page.locator('#' + id), id + ' waits while it fills the board').toBeDisabled();
  await expect(page.locator('#iflip')).toBeEnabled();
  await expect(page.locator('#iopacity')).toBeEnabled();
  await expect(page.locator('#images .item[aria-pressed="true"]')).toHaveAccessibleName('Select Picture, filling the board');
  await expect(page.locator('#canvasA')).toHaveAccessibleDescription('Painted navy. Words: "HELLO" in Impact. One picture, filling the board.');

  /* Flip and opacity still apply: half see-through, the navy shows through. */
  await page.evaluate(() => { document.getElementById('artmore').open = true; });
  await setInput(page, 'iopacity', 0.5);
  const mixed = await pixelAt(page, 'a', 0.8, 0.8);
  expect(mixed).not.toEqual([...RED, 255]);
  expect(mixed).not.toEqual([...NAVY, 255]);
  await setInput(page, 'iopacity', 1);

  await page.uncheck('#icover');
  await settled(page);
  for (const c of await corners(page)) expect(c, 'unticked, the board shows again').toEqual([...NAVY, 255]);
  expect(await pixelAt(page, 'a', 6, 40), 'back at its own place').not.toEqual([...NAVY, 255]);
  const off = await element(page, pic.id);
  expect(off.cover).toBe(false);
  expect(placement(off), 'at the size, turn and crop it had').toEqual(before);
  await expect(page.locator('#iwidth')).toBeEnabled();
  await expect(page.locator('#icircle')).toBeEnabled();
  expect(errors).toEqual([]);
});

test('the words on a filling picture are still picked by a click, the picture from anywhere else, and it shows no handles', async ({ page }) => {
  const errors = await open(page); await reset(page);
  const pic = await upload(page, await landscape(page));
  await page.check('#icover');
  await settled(page);

  const word = await clientPoint(page, 'a', 12, 30);
  await page.mouse.click(word.x, word.y);
  expect(await page.evaluate(() => cornhole.selected), 'the words on top are picked').toBe('t1');
  await expect(page.locator('#tab-text')).toBeVisible();

  const empty = await clientPoint(page, 'a', 12, 42);
  await page.mouse.click(empty.x, empty.y);
  expect(await page.evaluate(() => cornhole.selected), 'an empty spot picks the picture under everything').toBe(pic.id);
  await expect(page.locator('#tab-art')).toBeVisible();
  expect(await page.evaluate((id) => cornhole.handlePoints(id), pic.id), 'no resize, turn or remove handles').toBeNull();

  /* It is not dragged, and the keys that move or resize leave it alone. */
  const steps = await page.evaluate(() => cornhole.historyLength);
  const before = placement(await element(page, pic.id));
  const to = await clientPoint(page, 'a', 18, 46);
  await page.mouse.move(empty.x, empty.y); await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 }); await page.mouse.up();
  for (const key of ['ArrowLeft', 'ArrowDown', '+', '-']) await page.keyboard.press(key);
  expect(placement(await element(page, pic.id))).toEqual(before);
  expect(await page.evaluate(() => cornhole.historyLength), 'nothing was recorded').toBe(steps);

  /* With the words selected, their handles still work above the picture. */
  await page.mouse.click(word.x, word.y);
  expect(await page.evaluate(() => cornhole.handlePoints('t1'))).not.toBeNull();

  /* Delete, with the board focused, removes the picture; Undo brings it back filling the board. */
  await page.mouse.click(empty.x, empty.y);
  await page.keyboard.press('Delete');
  expect(await element(page, pic.id)).toBeNull();
  for (const c of await corners(page)) expect(c).toEqual([...NAVY, 255]);
  await page.click('#undo');
  expect((await element(page, pic.id)).cover).toBe(true);
  for (const c of await corners(page)) expect(c).toEqual([...RED, 255]);
  expect(errors).toEqual([]);
});

test('the print file is covered too, drawn from the master, and the order carries the choice', async ({ page }) => {
  const errors = await open(page); await reset(page);
  const pic = await upload(page, await landscape(page));
  expect(pic.orig, 'a 2000 px picture keeps its master').toBeTruthy();
  await page.check('#icover');
  await settled(page);
  const printed = await page.evaluate(async () => {
    await cornhole.preloadImages(['a']);
    const image = cornhole.design.a.elements.find((el) => el.type === 'image');
    const draw = CanvasRenderingContext2D.prototype.drawImage, sources = [];
    CanvasRenderingContext2D.prototype.drawImage = function (source, ...args) {
      if (source instanceof HTMLImageElement) sources.push({ master: source.src === image.orig, px: [source.naturalWidth, source.naturalHeight], at: args.slice(-4).map((v) => Math.round(v * 100) / 100) });
      return draw.call(this, source, ...args);
    };
    try {
      const c = cornhole.printCanvas('a'), g = c.getContext('2d');
      const at = (x, y) => Array.from(g.getImageData(Math.round(x * 100), Math.round(y * 100), 1, 1).data);
      return { size: [c.width, c.height], sources, corners: [[0.3, 0.3], [23.7, 0.3], [0.3, 47.7], [23.7, 47.7]].map(([x, y]) => at(x, y)), middle: at(12, 24), hole: at(12, 9.5) };
    } finally { CanvasRenderingContext2D.prototype.drawImage = draw; }
  });
  expect(printed.size).toEqual([2400, 4800]);
  /* 2000 x 1000 covering 24 x 48 is 96" wide and 48" tall, centred on the board. */
  expect(printed.sources).toEqual([{ master: true, px: [2000, 1000], at: [-48, -24, 96, 48] }]);
  for (const c of printed.corners) expect(c, 'the print reaches every corner').toEqual([...RED, 255]);
  expect(printed.middle).toEqual([...RED, 255]);
  expect(printed.hole, 'the hole is only a hairline in the print file').toEqual([...RED, 255]);

  const payload = await page.evaluate(() => cornhole.orderPayload());
  expect(payload.design.a.elements.find((e) => e.type === 'image').cover).toBe(true);
  expect(errors).toEqual([]);
});

test('Undo and Redo step through Fill the board, and a reload keeps it', async ({ page }) => {
  const errors = await open(page); await reset(page);
  const pic = await upload(page, await landscape(page));
  await page.check('#icover');
  await settled(page);
  await page.click('#undo');
  expect((await element(page, pic.id)).cover).toBe(false);
  for (const c of await corners(page)) expect(c).toEqual([...NAVY, 255]);
  await page.click('#redo');
  expect((await element(page, pic.id)).cover).toBe(true);
  for (const c of await corners(page)) expect(c).toEqual([...RED, 255]);
  await settled(page);

  await reloaded(page);
  expect((await element(page, pic.id)).cover, 'the saved design keeps it').toBe(true);
  for (const c of await corners(page)) expect(c).toEqual([...RED, 255]);
  await page.evaluate((id) => { cornhole.showTab('art'); cornhole.select(id); }, pic.id);
  await expect(page.locator('#icover')).toBeChecked();
  await expect(page.locator('#iwidth')).toBeDisabled();
  expect(errors).toEqual([]);
});

test('one picture fills a board at a time: ticking another moves it, and copies follow the rule', async ({ page }) => {
  const errors = await open(page); await reset(page);
  const red = await upload(page, await landscape(page));
  await page.check('#icover');
  const green = await upload(page, await landscape(page, '#1f7a3a', 400, 200));
  await expect(page.locator('#icover')).not.toBeChecked();
  await page.check('#icover');
  await settled(page);
  expect((await element(page, green.id)).cover).toBe(true);
  expect((await element(page, red.id)).cover, 'the first one is put back').toBe(false);
  for (const c of await corners(page)) expect(c).toEqual([...GREEN, 255]);
  await expect(page.locator('#canvasA')).toHaveAccessibleDescription(/ Two pictures, one filling the board\.$/);

  /* Duplicate makes an ordinary picture of the copy. */
  await page.click('#idup');
  const pictures = await page.evaluate(() => cornhole.activeBoard().elements.filter((e) => e.type === 'image').map((e) => e.cover));
  expect(pictures).toEqual([false, true, false]);

  /* To the other board: the copy fills Board B, in place of what filled it. */
  await page.locator('#boardmode [data-v="a"]').click();
  const filledB = await page.evaluate(() => cornhole.design.b.elements.filter((e) => e.type === 'image').map((e) => e.cover));
  expect(filledB, 'splitting the boards copies Board A as it is').toEqual([false, true, false]);
  await page.evaluate((id) => { cornhole.showTab('art'); cornhole.select(id); document.getElementById('artmore').open = true; }, red.id);
  await page.check('#icover');
  await page.click('#icopy');
  const b = await page.evaluate(() => cornhole.design.b.elements.filter((e) => e.type === 'image').map((e) => e.cover));
  expect(b, 'the copy fills Board B and the picture that did is put back').toEqual([false, false, false, true]);
  expect(errors).toEqual([]);
});

test('the print-size warning for a filling picture uses the size it prints at', async ({ page }) => {
  const errors = await open(page); await reset(page);
  await upload(page, await landscape(page));
  await expect(page.locator('#ireswarn'), '2000 px across 10" is sharp').toBeHidden();
  await page.check('#icover');
  /* 48" tall and 96" wide: 2000 / 96 is about 21 dots per inch. */
  await expect(page.locator('#ireswarn')).toBeVisible();
  await expect(page.locator('#ireswarn')).toHaveText('The picture is 2000 x 1000 pixels: filling the board, 48" tall, it prints at about 21 dots per inch, which will look blurry. 100 or more prints sharp: use a bigger file, or untick Fill the board.');

  /* A tall picture is governed by the 24" width instead: 1200 / 24 is 50. */
  await upload(page, await picture(page, 1200, 3000, 'image/png', "g.fillStyle = '#c8102e'; g.fillRect(0, 0, w, h);"));
  await page.check('#icover');
  await expect(page.locator('#ireswarn')).toHaveText(/^The picture is 1200 x 3000 pixels: filling the board, 24" wide, it prints at about 50 dots per inch, which will look blurry\./);
  await page.evaluate(() => { cornhole.showTab('order'); cornhole.showOrderStep(2); });
  await expect(page.locator('#reswarn')).toContainText('1200 x 3000 pixels: filling the board, 24" wide');
  await expect(page.locator('#reswarn'), 'the other picture is back at 10", sharp again').not.toContainText('2000 x 1000');
  expect(errors).toEqual([]);
});

test('designs from before Fill the board load as they were, and a file with two filling one board keeps the first', async ({ page }) => {
  const errors = await open(page); await reset(page);
  const src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const result = await page.evaluate(async (src) => {
    const board = (elements) => ({ base: { kind: 'paint', color: '#1f3a93', color2: '#4fa3e3', angle: 180, stain: 'walnut' }, pattern: { kind: 'none', color: '#f5f5f0', size: 3 }, elements });
    const old = { type: 'image', id: 'old', src, width: 8, x: 12, y: 20, rotation: 0, opacity: 1, flipH: false, circleCrop: false, knockout: false };
    await cornhole.importProject({ app: 'cornhole-builder', version: 3, design: { version: 2, same: true, a: board([old]), b: board([]) } });
    const legacy = cornhole.design.a.elements[0].cover;
    await cornhole.importProject({ app: 'cornhole-builder', version: 3, design: { version: 2, same: true, a: board([{ ...old, id: 'one', cover: true }, { ...old, id: 'two', cover: true }]), b: board([]) } });
    const both = cornhole.design.a.elements.map((e) => e.cover);
    let refused = '';
    try { await cornhole.importProject({ design: { version: 2, same: true, a: board([{ ...old, cover: 'yes' }]), b: board([]) } }); } catch (e) { refused = e.message; }
    return { legacy, both, refused };
  }, src);
  expect(result.legacy, 'a picture saved before the option does not fill the board').toBe(false);
  expect(result.both).toEqual([true, false]);
  expect(result.refused).toMatch(/fill the board must be true or false/);
  expect(errors).toEqual([]);
});

test.describe('on a phone', () => {
  test.use({ hasTouch: true });
  for (const width of [320, 375, 390]) {
    test(`at ${width} px the Fill the board toggle is a finger-sized target, works from the keyboard and fits`, async ({ page }) => {
      await page.setViewportSize({ width, height: 740 });
      const errors = await open(page); await reset(page);
      const pic = await upload(page, await landscape(page, '#c8102e', 400, 200));
      await page.evaluate((id) => { cornhole.showTab('art'); cornhole.select(id); document.getElementById('artmore').open = true; }, pic.id);
      const label = page.locator('label:has(#icover)');
      await expect(label).toHaveText('Fill the board');
      expect((await label.boundingBox()).height).toBeGreaterThanOrEqual(43.5);
      await page.locator('#icover').focus();
      await page.keyboard.press('Space');
      expect((await element(page, pic.id)).cover).toBe(true);
      const overflow = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, panel: document.querySelector('.panel').scrollWidth, available: document.querySelector('.panel').clientWidth }));
      expect(overflow.page, 'no sideways scroll').toBeLessThanOrEqual(width);
      expect(overflow.panel).toBeLessThanOrEqual(overflow.available + 1);
      /* A tap on an empty spot of the board picks the picture. */
      await page.evaluate(() => cornhole.select(null));
      const spot = await clientPoint(page, 'a', 12, 42);
      await page.touchscreen.tap(spot.x, spot.y);
      expect(await page.evaluate(() => cornhole.selected)).toBe(pic.id);
      expect(errors).toEqual([]);
    });
  }
});
