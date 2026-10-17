import { test, expect } from '@playwright/test';
import { open } from './helpers.js';

/* The review says, one line each, which words or clip art will hardly
   show against what is behind them, and which line Auto-fit shrank
   hard. Picking a board colour by hand is the usual way there: Wedding
   on navy turns every line of words dark on dark. The warning does not
   hold the order. No template as it comes is called unreadable, or the
   warning would mean nothing. */

const card = (page, label) => page.getByRole('button', { name: label + ' template', exact: true });
const tab = (page, name) => page.getByRole('tab', { name, exact: true }).click();
/* Open the review from wherever the Order pane is, and wait for the
   boards: the warning is written with them. */
async function review(page) {
  await tab(page, 'Order');
  if (!(await page.locator('#toreview').isVisible())) await page.click('#backtooptions');
  await page.click('#toreview');
  await expect(page.locator('#reviewboards figure').first()).toBeVisible();
}
const swatch = (page, hex) => page.click('#tab-board .sw[data-v="' + hex + '"]');

test('no template as it comes is called unreadable, the Business LOGO among them', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page);
  const ids = await page.evaluate(() => cornhole.TEMPLATES.map((t) => t.id));
  expect(ids).toHaveLength(32);
  for (const id of ids) {
    await page.evaluate((id) => cornhole.applyTemplate(id), id);
    await review(page);
    await page.check('#keepsamples');
    await expect(page.locator('#readwarn'), id).toBeHidden();
    await expect(page.locator('#tocheckout'), id).toBeEnabled();
  }
  /* The LOGO sat in the badge's open middle in the colour of the board. */
  await page.evaluate(() => cornhole.applyTemplate('business'));
  const logo = await page.evaluate(() => cornhole.activeBoard().elements.find((e) => e.text === 'LOGO').color);
  expect(logo).toBe('#d8b25c');
});

test('Wedding on navy names every line of words, still lets the order go on, and clears on ivory', async ({ page }) => {
  await open(page);
  await card(page, 'Wedding').click();
  await tab(page, 'Board');
  await swatch(page, '#1f3a93');
  expect(await page.evaluate(() => cornhole.activeBoard().base.color)).toBe('#1f3a93');
  await review(page);
  const warn = page.locator('#readwarn');
  await expect(warn).toBeVisible();
  await expect(warn).toContainText('“Mr & Mrs” on your board will hardly show against what is behind it.');
  await expect(warn).toContainText('“SMITH” on your board');
  await expect(warn).toContainText('“June 14, 2026” on your board');
  /* One line each; the sage laurel and the gold rings stand out on navy. */
  await expect(warn.locator('p')).toHaveCount(3);
  await expect(warn).not.toContainText('artwork');
  /* It warns and does not hold: with the sample words confirmed, the
     customer can go on to their details. */
  await expect(page.locator('#samplewarn')).toBeVisible();
  await expect(page.locator('#tocheckout')).toBeDisabled();
  await page.check('#keepsamples');
  await expect(page.locator('#tocheckout')).toBeEnabled();
  await expect(warn).toBeVisible();
  /* Back to the board, a colour the words stand out on, and the review
     is clear again. */
  await page.click('#backtoedit');
  await tab(page, 'Board');
  await swatch(page, '#fffaf0');
  await review(page);
  await expect(page.locator('#readwarn')).toBeHidden();
  await expect(page.locator('#readwarn p')).toHaveCount(0);
});

test('Board B painted the colour of its own first words is named, and Board A is not', async ({ page }) => {
  await open(page);
  await card(page, 'Wedding').click();
  await page.click('#boardmode .chip[data-v="b"]');
  expect(await page.evaluate(() => cornhole.active)).toBe('b');
  const first = await page.evaluate(() => cornhole.design.b.elements.find((e) => e.type === 'text'));
  expect(first.text).toBe('Mr & Mrs');
  await tab(page, 'Board');
  await swatch(page, first.color);
  expect(await page.evaluate(() => [cornhole.design.a.base.color, cornhole.design.b.base.color])).toEqual(['#fffaf0', first.color]);
  await review(page);
  await expect(page.locator('#reviewboards figure')).toHaveCount(2);
  const warn = page.locator('#readwarn');
  await expect(warn).toBeVisible();
  await expect(warn).toContainText('“Mr & Mrs” on Board B will hardly show against what is behind it.');
  await expect(warn).not.toContainText('Board A');
});

test('a long surname Auto-fit shrank hard is named with the size it prints at; a small shrink is not', async ({ page }) => {
  await open(page);
  await card(page, 'Wedding').click();
  const words = page.locator('#texts textarea.quick');
  /* SMITH is 2.5" in the template: SMITHS fits at most of that. */
  await words.nth(1).fill('SMITHS');
  const modest = await page.evaluate(() => cornhole.activeBoard().elements.find((e) => e.text === 'SMITHS').size);
  expect(modest).toBeGreaterThanOrEqual(0.6 * 2.5);
  expect(modest).toBeLessThan(2.5);
  await review(page);
  await expect(page.locator('#readwarn')).toBeHidden();
  await page.click('#backtoedit');
  await tab(page, 'Text');
  await words.nth(1).fill('Fairweather-Worthington');
  const size = await page.evaluate(() => cornhole.activeBoard().elements.find((e) => e.text === 'Fairweather-Worthington').size);
  expect(size).toBeLessThan(0.6 * 2.5);
  await review(page);
  const warn = page.locator('#readwarn');
  await expect(warn).toBeVisible();
  await expect(warn).toHaveText('“Fairweather-Worthington” on your board was shrunk to fit and will print very small (' + Math.round(size * 10) / 10 + ' in).');
  await expect(page.locator('#samplewarn')).toBeVisible();
  await page.check('#keepsamples');
  await expect(page.locator('#tocheckout')).toBeEnabled();
});

test('ordinary names shrunk to 1 to 2.5 in are not called very small', async ({ page }) => {
  /* The templates print lines this size themselves (the wedding date is
     1.4 in), so only a line under 1 in is named for its size. Each of
     these is under 0.6 of its template line. */
  await open(page);
  for (const [id, row, words, template] of [
    ['wedding', 1, 'ANDERSON', 2.5],
    ['wedding', 0, 'Christopher & Elizabeth', 3.2],
    ['team', 0, 'NORTHSIDE BULLDOGS', 4.5],
  ]) {
    await page.evaluate((id) => cornhole.applyTemplate(id), id);
    await page.locator('#texts textarea.quick').nth(row).fill(words);
    const size = await page.evaluate((words) => cornhole.activeBoard().elements.find((e) => e.text === words).size, words);
    expect(size, words).toBeLessThan(0.6 * template);
    expect(size, words).toBeGreaterThanOrEqual(1);
    await review(page);
    await page.check('#keepsamples');
    await expect(page.locator('#readwarn'), words).toBeHidden();
    await page.click('#backtoedit');
  }
});

test('words as light as the board are named only when no strong colour sets them apart, and an outline keeps them', async ({ page }) => {
  await open(page);
  const named = await page.evaluate(() => {
    const check = (base, ink, more = {}) => {
      const board = { base: { kind: 'paint', color: base }, pattern: { kind: 'none' }, elements: [
        { type: 'text', id: 't1', text: 'GAME DAY', font: 'Anton', size: 4, color: ink, x: 12, y: 24, ...more },
        { type: 'clip', id: 'c1', name: 'basketball', color: ink, width: 8, x: 12, y: 38, ...more }] };
      cornhole.setDesign({ version: 2, same: true, a: board, b: board });
      return cornhole.readabilityIssues(['a']).length;
    };
    return {
      redOnGreen: check('#2e7d32', '#c8102e'), orangeOnSky: check('#4fa3e3', '#f26b1d'),
      burgundyOnNavy: check('#1f3a93', '#6e1423'), purpleOnNavy: check('#1f3a93', '#5b2a86'), greenOnTeal: check('#0f8b8d', '#1f7a3a'),
      whiteOnWhite: check('#ffffff', '#ffffff'), outlinedWhiteOnWhite: check('#ffffff', '#ffffff', { outline: '#111111', outlineWidth: 0.12 }),
    };
  });
  expect(named).toEqual({ redOnGreen: 0, orangeOnSky: 0, burgundyOnNavy: 2, purpleOnNavy: 2, greenOnTeal: 2, whiteOnWhite: 2, outlinedWhiteOnWhite: 0 });
});

test('words are read against a picture filling the board, not the paint under it', async ({ page }) => {
  await open(page);
  const named = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 60; c.height = 120;
    const g = c.getContext('2d'); g.fillStyle = '#1f3a93'; g.fillRect(0, 0, 60, 120);
    const src = c.toDataURL('image/png');
    const check = async (ink) => {
      const board = { base: { kind: 'paint', color: '#ffffff' }, pattern: { kind: 'none' }, elements: [
        { type: 'image', id: 'p1', src, px: [60, 120], width: 10, x: 12, y: 30, cover: true },
        { type: 'text', id: 't1', text: 'THE CARTERS', font: 'Anton', size: 3, color: ink, x: 12, y: 30 }] };
      cornhole.setDesign({ version: 2, same: true, a: board, b: board });
      await cornhole.preloadImages(['a'], { print: false });
      return cornhole.readabilityIssues(['a']);
    };
    return { navy: await check('#1f3a93'), white: await check('#ffffff') };
  });
  expect(named.navy).toEqual(['“THE CARTERS” on your board will hardly show against what is behind it.']);
  expect(named.white).toEqual([]);
});

test('drawing the check leaves the board\'s hit boxes as they were', async ({ page }) => {
  await open(page);
  await card(page, 'Wedding').click();
  await page.click('#boardmode .chip[data-v="b"]');
  /* The review reads a copy of the design, as renderReview does. With
     every word half as big again in the copy, the check draws boxes of
     its own; the live ones have to be put back, not merely drawn again. */
  const [before, issues, after] = await page.evaluate(() => {
    cornhole.paint();
    const read = () => JSON.stringify([...cornhole.boxes].sort());
    const was = read();
    const source = structuredClone(cornhole.design);
    for (const k of ['a', 'b']) for (const e of source[k].elements) if (e.type === 'text') e.size *= 1.5;
    const said = cornhole.readabilityIssues(['a', 'b'], source);
    return [was, said, read()];
  });
  expect(issues).toEqual([]);
  expect(after).toBe(before);
});

for (const width of [320, 375, 390]) {
  test(`on a ${width} px phone the warning wraps a long unbroken name and the page does not scroll sideways`, async ({ page }) => {
    await page.setViewportSize({ width, height: 740 });
    await open(page);
    await card(page, 'Wedding').click();
    await page.locator('#texts textarea.quick').nth(1).fill('Wolfeschlegelsteinhausenbergerdorff');
    await tab(page, 'Board');
    await swatch(page, '#1f3a93');
    await review(page);
    const warn = page.locator('#readwarn');
    await expect(warn).toBeVisible();
    await expect(warn).toContainText('Wolfeschlegelsteinhausenbergerdorff');
    await warn.scrollIntoViewIfNeeded();
    const box = await warn.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}
