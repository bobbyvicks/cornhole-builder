import { test, expect } from '@playwright/test';
import { open } from './helpers.js';

/* Ordering on a phone: the review and the address form have the screen
   to themselves. The editing board scrolls away with the page instead of
   staying pinned over them, and it shows the design as it will print,
   with no selection outline or handles (the selection is kept for when
   editing goes on). The review boards are about twice the size, the
   review lists the words on each board as text, and its price note says
   the bags are under Options, where they are. */

const card = (page, label) => page.getByRole('button', { name: label + ' template', exact: true });
const tab = (page, name) => page.getByRole('tab', { name, exact: true });

/* How many channels of a board's preview differ from the same board drawn
   with nothing selected: 0 when no outline and no handle is drawn. The
   selection is put back after. */
const selectionInk = (page, key = 'a') => page.evaluate((key) => {
  const c = document.getElementById('canvas' + key.toUpperCase()), g = c.getContext('2d');
  cornhole.paint();
  const now = g.getImageData(0, 0, c.width, c.height).data;
  const keep = cornhole.selected;
  cornhole.select(null); cornhole.paint();
  const bare = g.getImageData(0, 0, c.width, c.height).data;
  cornhole.select(keep); cornhole.paint();
  let n = 0;
  for (let i = 0; i < now.length; i++) if (now[i] !== bare[i]) n++;
  return n;
}, key);
const stagePosition = (page) => page.evaluate(() => getComputedStyle(document.querySelector('.stage')).position);
const noSidewaysScroll = async (page, width) => expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
/* In view, not under the header, and the element itself at its middle:
   nothing pinned covers it. What pins under the header sits at 60 px,
   under the header's 1 px rule on a phone. */
const clearInView = (locator) => locator.evaluate((el) => {
  const r = el.getBoundingClientRect(), header = document.querySelector('header.top').getBoundingClientRect().bottom;
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return r.height > 0 && r.top >= header - 1.5 && r.bottom <= innerHeight + 0.5 && Boolean(hit) && (hit === el || el.contains(hit));
});
/* A row of the review list, by its label. */
const row = (page, label) => page.locator('#reviewlist li').filter({ has: page.locator('span:first-child', { hasText: new RegExp('^' + label + '$') }) }).locator('> span:last-child');

/* The phone way in: a template, the keyboard put away, then Review order
   in the bar at the foot. */
async function weddingReview(page) {
  await card(page, 'Wedding').tap();
  await page.evaluate(() => document.activeElement.blur());
  await page.locator('#reviewbtn').tap();
  await expect(page.locator('#reviewboards figure').first()).toBeVisible();
}

for (const viewport of [{ width: 390, height: 844 }, { width: 375, height: 667 }]) test.describe(`ordering at ${viewport.width} x ${viewport.height} with touch`, () => {
  test.use({ viewport, hasTouch: true });

  test('the board scrolls away with no handles, the review board is big with its words listed, and the address field is clear', async ({ page }) => {
    // Without smooth scrolling, so a jump as the review boards come in shows.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    await weddingReview(page);
    const heading = page.getByRole('heading', { name: 'Review your order', exact: true });
    await expect(heading).toBeFocused();
    expect(await clearInView(heading), 'the review heading stays in view as its boards come in').toBe(true);
    const first = await page.evaluate(() => cornhole.activeBoard().elements.find((e) => e.type === 'text'));
    expect(first.text).toBe('Mr & Mrs');
    expect(await stagePosition(page), 'the editing board is not pinned over the review').not.toBe('sticky');
    expect(await page.evaluate(() => cornhole.selected), 'the template words are still selected').toBe(first.id);
    expect(await selectionInk(page), 'no outline and no handles on the board').toBe(0);

    const img = page.locator('#reviewboards img');
    await expect(img).toHaveCount(1);
    const box = await img.boundingBox();
    expect(box.width, 'the review board is about twice its old 76 px').toBeGreaterThanOrEqual(150);
    expect(box.height).toBeCloseTo(box.width * 2, 0);
    await expect(page.locator('#reviewlist')).toContainText('Mr & Mrs');
    await expect(page.locator('#reviewlist')).toContainText('SMITH');
    await expect(row(page, 'Words')).toHaveText('Mr & Mrs · SMITH · June 14, 2026');
    await expect(page.locator('#reviewnote')).toContainText('Bags are not included: add them under Options.');
    await expect(page.locator('#reviewnote')).not.toContainText('above');
    await noSidewaysScroll(page, viewport.width);

    /* Where the red x would be, a tap removes nothing: it is not drawn. */
    const del = await page.evaluate((id) => cornhole.handlePoints(id).delete, first.id);
    await page.evaluate(() => window.scrollTo(0, 0));
    const at = await page.locator('#canvasA').boundingBox();
    await page.touchscreen.tap(at.x + del.x / 24 * at.width, at.y + del.y / 48 * at.height);
    expect(await page.evaluate((id) => cornhole.design.a.elements.some((e) => e.id === id), first.id), 'the words are still there').toBe(true);

    await tab(page, 'Order').tap();
    if (await page.locator('#toreview').isVisible()) await page.locator('#toreview').tap();
    await page.locator('#keepsamples').tap();
    await expect(page.locator('#tocheckout')).toBeEnabled();
    await page.locator('#tocheckout').tap();
    const name = page.locator('#name');
    await expect(name).toBeVisible();
    await name.focus();
    await page.waitForTimeout(150);
    expect(await stagePosition(page)).not.toBe('sticky');
    expect(await clearInView(name), 'the Name field is in view and nothing pinned covers it').toBe(true);
    const stage = await page.locator('.stage').boundingBox(), field = await name.boundingBox();
    expect(stage.y + stage.height <= field.y || stage.y >= field.y + field.height, 'the stage is not over the field').toBe(true);
    expect(await selectionInk(page), 'still no handles while the address is typed').toBe(0);
    await noSidewaysScroll(page, viewport.width);

    /* Back to editing, the board pins again and shows its selection. */
    await page.locator('#backtoorder').tap();
    await page.locator('#backtoedit').tap();
    expect(await stagePosition(page)).toBe('sticky');
    expect(await selectionInk(page), 'the selection is drawn again while editing').toBeGreaterThan(0);
  });

  test('two different boards list their words in rows of their own, so a name changed on one shows against the other', async ({ page }) => {
    await open(page);
    await card(page, 'Wedding').tap();
    await page.evaluate(() => document.activeElement.blur());
    await page.locator('#boardmode .chip[data-v="b"]').tap();
    await page.locator('#boardmode .chip[data-v="a"]').tap();
    expect(await page.evaluate(() => [cornhole.design.same, cornhole.active])).toEqual([false, 'a']);
    await tab(page, 'Text').tap();
    const smith = page.locator('#texts textarea.quick').nth(1);
    await expect(smith).toHaveValue('SMITH');
    await smith.fill('SMYTHE');
    await page.evaluate(() => document.activeElement.blur());
    await page.locator('#reviewbtn').tap();
    await expect(page.locator('#reviewboards figure')).toHaveCount(2);
    await expect(row(page, 'Board A words')).toHaveText('Mr & Mrs · SMYTHE · June 14, 2026');
    await expect(row(page, 'Board B words')).toHaveText('Mr & Mrs · SMITH · June 14, 2026');
    await expect(row(page, 'Words')).toHaveCount(0);
    for (const img of await page.locator('#reviewboards img').all()) {
      const box = await img.boundingBox();
      expect(box.width, 'both review boards are big').toBeGreaterThanOrEqual(150);
    }
    await noSidewaysScroll(page, viewport.width);
  });

  test('with the review open, a save in another tab is told in a line that stays in view, with its Reload', async ({ page, context }) => {
    await open(page);
    await weddingReview(page);
    await page.waitForFunction(() => cornhole.saveState === 'saved');
    const other = await context.newPage(); await open(other);
    await other.getByRole('tab', { name: 'Text', exact: true }).click();
    const words = other.locator('#texts .quick').first();
    await words.fill('Emma & James'); await words.press('Tab');
    await other.waitForFunction(() => cornhole.saveState === 'saved');
    await page.waitForFunction(() => cornhole.saveState === 'elsewhere');
    const notice = page.locator('#tabnotice');
    const reload = page.getByRole('button', { name: 'Reload', exact: true });
    await expect(reload, 'one Reload, beside the notice').toHaveCount(1);
    await expect(notice).toContainText('changed in another tab');
    await page.locator('#orderstep2').evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().bottom + scrollY - innerHeight));
    await page.waitForTimeout(100);
    expect(await clearInView(notice), 'the notice is in view at the foot of the review').toBe(true);
    expect(await clearInView(reload)).toBe(true);
    expect((await reload.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await page.locator('#keepsamples').tap();
    await page.locator('#tocheckout').tap();
    await page.locator('#name').focus();
    await page.waitForTimeout(150);
    expect(await clearInView(page.locator('#name')), 'the Name field is not under the notice').toBe(true);
    expect(await clearInView(notice)).toBe(true);
    await noSidewaysScroll(page, viewport.width);
    await other.close();
  });
});

for (const width of [320, 375, 390]) test(`at ${width} px a long unbroken name in the review wraps instead of widening the page`, async ({ page }) => {
  await page.setViewportSize({ width, height: 740 });
  await open(page);
  await page.evaluate(() => {
    cornhole.applyTemplate('wedding');
    cornhole.setMode('b');
    cornhole.design.a.elements.find((e) => e.text === 'SMITH').text = 'FAIRWEATHERWORTHINGTONSMYTHE';
    cornhole.commit();
    cornhole.showTab('order'); cornhole.showOrderStep(2);
  });
  await expect(page.locator('#reviewboards figure')).toHaveCount(2);
  await expect(row(page, 'Board A words')).toContainText('FAIRWEATHERWORTHINGTONSMYTHE');
  await noSidewaysScroll(page, width);
  const list = await page.locator('#reviewlist').boundingBox();
  for (const span of await page.locator('#reviewlist li > span').all()) {
    const b = await span.boundingBox();
    expect(b.x + b.width).toBeLessThanOrEqual(list.x + list.width + 0.5);
  }
});

test('the words row shows line breaks as slashes, leaves out empty texts, and says None for a board with no words', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const base = { kind: 'paint', color: '#1f3a93', color2: '#4fa3e3', angle: 180, stain: 'walnut' }, pattern = { kind: 'none', color: '#f5f5f0', size: 3 };
    const text = (id, words, y) => ({ type: 'text', id, text: words, font: 'Impact', size: 3, color: '#ffffff', outline: '#000000', outlineWidth: 0, x: 12, y, rotation: 0, arc: 0, spacing: 0, shadow: false });
    cornhole.setDesign({ version: 2, same: false, a: { base, pattern, elements: [text('t1', 'EMMA\nJAMES', 20), text('t2', '   ', 30), text('t3', ' EST. 2026 ', 40)] }, b: { base, pattern, elements: [] } });
    cornhole.setOrder({ product: 'set', bags: 'none' });
    cornhole.showTab('order'); cornhole.showOrderStep(2);
  });
  await expect(page.locator('#reviewboards figure')).toHaveCount(2);
  await expect(row(page, 'Board A words')).toHaveText('EMMA / JAMES · EST. 2026');
  await expect(row(page, 'Board B words')).toHaveText('None');
  /* One board ordered: one row, named for the board. */
  await page.evaluate(() => { cornhole.setOrder({ product: 'single' }); cornhole.showOrderStep(2); });
  await expect(page.locator('#reviewboards figure')).toHaveCount(1);
  await expect(row(page, 'Words')).toHaveText('EMMA / JAMES · EST. 2026');
  await expect(row(page, 'Board B words')).toHaveCount(0);
});

test('at 1280 x 900 the board stays pinned beside the order, the review boards keep their size, and a focused board shows what its keys would move', async ({ page }) => {
  await open(page);
  await card(page, 'Wedding').click();
  await tab(page, 'Order').click();
  /* The Options step has the bags above its note, and says so. */
  await expect(page.locator('#pricenote')).toContainText('Bags are not included: add them above.');
  await page.click('#toreview');
  await expect(page.locator('#reviewboards figure')).toHaveCount(1);
  expect(await stagePosition(page)).toBe('sticky');
  const box = await page.locator('#reviewboards img').boundingBox();
  expect([box.width, box.height]).toEqual([76, 152]);
  await expect(page.locator('#reviewnote')).toContainText('add them under Options');
  await expect(row(page, 'Words')).toHaveText('Mr & Mrs · SMITH · June 14, 2026');
  expect(await page.evaluate(() => cornhole.selected)).toBeTruthy();
  expect(await selectionInk(page), 'no selection drawn while ordering').toBe(0);
  /* A keyboard user who comes to the board sees what the arrows and
     Delete would act on, and it goes again as the focus leaves. */
  await page.locator('#canvasA').focus();
  await expect.poll(() => selectionInk(page)).toBeGreaterThan(0);
  await page.locator('#toreview, #backtooptions').filter({ visible: true }).first().focus();
  await expect.poll(() => selectionInk(page)).toBe(0);
});
