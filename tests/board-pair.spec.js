import { test, expect } from '@playwright/test';
import { open, pixelAt } from './helpers.js';

/* The two boards of a set. The opposite-colours board is on offer from
   the start, with matching boards, and makes Board B. On a phone only the
   board being edited is drawn, so whatever changes the other board -
   opposite colours, Copy, or an Undo or a Redo that touched only that
   board - moves the preview to it, and the change is seen. Where both
   boards show, editing stays on the board it was on, and the board not
   being edited is drawn in its true colours, not dimmed. */

const GOLD = [0xf2, 0xb7, 0x05], NAVY = [0x1f, 0x3a, 0x93], RED = [0xc8, 0x10, 0x2e];
const card = (page, label) => page.getByRole('button', { name: label + ' template', exact: true });
const tab = (page, name) => page.getByRole('tab', { name, exact: true });
const boardChip = (page, v) => page.locator('#boardmode .chip[data-v="' + v + '"]');
const state = (page) => page.evaluate(() => ({ same: cornhole.design.same, active: cornhole.active }));
/* Pixels of one colour on a board's preview, the selection taken down. */
const inkOf = (page, key, rgb) => page.evaluate(([key, rgb]) => {
  const keep = cornhole.selected; if (keep) cornhole.select(null); cornhole.paint();
  const c = document.getElementById('canvas' + key.toUpperCase()), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] === rgb[0] && d[i + 1] === rgb[1] && d[i + 2] === rgb[2]) n++;
  if (keep) { cornhole.select(keep); cornhole.paint(); }
  return n;
}, [key, rgb]);

/* The Team template (navy, a gold star, white YOUR TEAM, gold EST. 2026)
   with the keyboard put away, on the Board tab. */
async function teamOnBoardTab(page) {
  await card(page, 'Team').tap();
  await page.evaluate(() => document.activeElement.blur());
  await tab(page, 'Board').tap();
  await expect(page.locator('#tab-board')).toHaveAttribute('data-open', 'true');
}

test.describe('a set on a phone, 390 x 844 with touch', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('the opposite colours are on offer with matching boards, and the board that changed is the one shown', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    await teamOnBoardTab(page);
    expect(await state(page)).toEqual({ same: true, active: 'a' });
    const swap = page.locator('#swapcolours');
    await expect(swap).toBeVisible();
    await expect(swap).toHaveText('Make Board B the opposite colours');
    await expect(page.locator('#copyother'), 'nothing to copy between while the boards match').toBeHidden();
    expect((await swap.boundingBox()).height).toBeGreaterThanOrEqual(44);

    /* One tap makes Board B, gold with navy, and shows it. */
    await swap.tap();
    expect(await state(page)).toEqual({ same: false, active: 'b' });
    await expect(page.locator('#canvasB')).toBeVisible();
    await expect(page.locator('#canvasA')).toBeHidden();
    await expect(page.locator('#boardB .label')).toHaveText('Board B - editing');
    await expect(boardChip(page, 'b')).toHaveAttribute('aria-pressed', 'true');
    expect(await pixelAt(page, 'b', 2, 40)).toEqual([...GOLD, 255]);
    expect(await pixelAt(page, 'a', 2, 40), 'Board A is left as it was').toEqual([...NAVY, 255]);
    expect(await inkOf(page, 'b', NAVY), 'the gold star and words are navy on B').toBeGreaterThan(200);
    /* From B, the buttons act on A. */
    await expect(swap).toHaveText('Make Board A the opposite colours');
    await expect(page.locator('#copyother')).toHaveText('Copy to Board A');

    /* Back on A, a new board colour, and B made again from it: B shows. */
    await boardChip(page, 'a').tap();
    expect(await state(page)).toEqual({ same: false, active: 'a' });
    await expect(page.locator('#canvasA')).toBeVisible();
    await page.locator('#paints .sw[data-v="#c8102e"]').tap();
    expect(await pixelAt(page, 'a', 2, 40)).toEqual([...RED, 255]);
    await expect(swap).toHaveText('Make Board B the opposite colours');
    await swap.tap();
    expect(await state(page)).toEqual({ same: false, active: 'b' });
    await expect(page.locator('#canvasB')).toBeVisible();
    expect(await pixelAt(page, 'b', 2, 40)).toEqual([...GOLD, 255]);
    expect(await inkOf(page, 'b', RED), 'the star and words on B are now red').toBeGreaterThan(200);
    expect(await inkOf(page, 'b', NAVY)).toBe(0);

    /* On A, an Undo that changes only B shows B; so does the Redo. */
    await boardChip(page, 'a').tap();
    await page.locator('#undo').tap();
    expect(await state(page)).toEqual({ same: false, active: 'b' });
    await expect(page.locator('#canvasB')).toBeVisible();
    expect(await inkOf(page, 'b', RED), 'B is back to navy on gold').toBe(0);
    expect(await inkOf(page, 'b', NAVY)).toBeGreaterThan(200);
    await boardChip(page, 'a').tap();
    await page.locator('#redo').tap();
    expect(await state(page)).toEqual({ same: false, active: 'b' });
    expect(await inkOf(page, 'b', RED)).toBeGreaterThan(200);

    /* On B, an Undo that changes only A shows A. */
    await page.locator('#undo').tap();
    expect(await state(page)).toEqual({ same: false, active: 'b' });
    await page.locator('#undo').tap();
    expect(await state(page), 'the red board colour taken off A').toEqual({ same: false, active: 'a' });
    await expect(page.locator('#canvasA')).toBeVisible();
    expect(await pixelAt(page, 'a', 2, 40)).toEqual([...NAVY, 255]);
    /* And the first Undo of all goes back to matching boards, on A. */
    await page.locator('#undo').tap();
    expect(await state(page)).toEqual({ same: true, active: 'a' });
    await expect(page.locator('#copyother')).toBeHidden();
    await expect(swap).toHaveText('Make Board B the opposite colours');
  });

  test('from Board B, Copy shows Board A, and an Undo of the board on screen stays on it', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    await teamOnBoardTab(page);
    await page.locator('#swapcolours').tap();
    expect(await state(page)).toEqual({ same: false, active: 'b' });
    await page.locator('#paints .sw[data-v="#c8102e"]').tap();
    expect(await pixelAt(page, 'b', 2, 40)).toEqual([...RED, 255]);
    await page.locator('#copyother').tap();
    expect(await state(page)).toEqual({ same: false, active: 'a' });
    await expect(page.locator('#canvasA')).toBeVisible();
    await expect(page.locator('#canvasB')).toBeHidden();
    expect(await pixelAt(page, 'a', 2, 40), 'A is now the copy of B').toEqual([...RED, 255]);
    /* The Undo changes A, the board on screen: it stays on A. */
    await page.locator('#undo').tap();
    expect(await state(page)).toEqual({ same: false, active: 'a' });
    expect(await pixelAt(page, 'a', 2, 40)).toEqual([...NAVY, 255]);
    /* Opposite colours from B rewrites A and shows it. */
    await boardChip(page, 'b').tap();
    await page.locator('#swapcolours').tap();
    expect(await state(page)).toEqual({ same: false, active: 'a' });
    await expect(page.locator('#canvasA')).toBeVisible();
    expect(await pixelAt(page, 'b', 2, 40), 'B keeps its own red').toEqual([...RED, 255]);
  });
});

for (const width of [320, 375, 390]) test.describe(`the board actions at ${width} px with touch`, () => {
  test.use({ viewport: { width, height: 740 }, hasTouch: true });

  test('are finger-sized and leave no sideways scroll, before and after the boards are split', async ({ page }) => {
    await open(page);
    await teamOnBoardTab(page);
    const fits = async (id) => {
      const r = await page.locator('#' + id).boundingBox();
      expect(r.height, id + ' is at least 44 px tall').toBeGreaterThanOrEqual(44);
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.x + r.width).toBeLessThanOrEqual(width);
    };
    await fits('swapcolours');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.locator('#swapcolours').tap();
    expect(await state(page)).toEqual({ same: false, active: 'b' });
    await fits('swapcolours'); await fits('copyother');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  });
});

test.describe('a set on a tablet, 820 x 1180', () => {
  test.use({ viewport: { width: 820, height: 1180 }, hasTouch: true });

  test('the opposite board appears beside the one being edited, in its true colours', async ({ page }) => {
    await open(page);
    await teamOnBoardTab(page);
    await expect(page.locator('#canvasB'), 'matching boards show one board here').toBeHidden();
    await page.locator('#swapcolours').tap();
    /* Both boards show, so editing stays on A. */
    expect(await state(page)).toEqual({ same: false, active: 'a' });
    await expect(page.locator('#canvasA')).toBeVisible();
    await expect(page.locator('#canvasB')).toBeVisible();
    await expect(page.locator('#boardB')).toHaveClass(/\binactive\b/);
    expect(await page.locator('#canvasB').evaluate((c) => getComputedStyle(c).opacity)).toBe('1');
    expect(await pixelAt(page, 'b', 2, 40)).toEqual([...GOLD, 255]);
    await boardChip(page, 'b').tap();
    await expect(page.locator('#boardA')).toHaveClass(/\binactive\b/);
    expect(await page.locator('#canvasA').evaluate((c) => getComputedStyle(c).opacity)).toBe('1');
  });
});

test('at 1280 x 900 the keyboard makes the opposite board from matching boards and editing stays on A', async ({ page }) => {
  await open(page);
  await card(page, 'Team').click();
  await tab(page, 'Board').click();
  await page.locator('#swapcolours').focus();
  await page.keyboard.press('Enter');
  expect(await state(page)).toEqual({ same: false, active: 'a' });
  await expect(page.locator('#swapcolours'), 'the focus stays on the button').toBeFocused();
  await expect(page.locator('#canvasB')).toBeVisible();
  expect(await pixelAt(page, 'b', 2, 40)).toEqual([...GOLD, 255]);
  expect(await pixelAt(page, 'a', 2, 40)).toEqual([...NAVY, 255]);
  /* An Undo with both boards in view stays on A and goes back to matching. */
  await page.locator('#undo').click();
  expect(await state(page)).toEqual({ same: true, active: 'a' });
});
