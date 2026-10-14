import { test, expect } from '@playwright/test';
import { open } from './helpers.js';

for (const height of [812, 420]) {
  test(`keyboard board switching keeps focus visible at 375 by ${height}`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    await page.getByRole('button', { name: 'Garden vows template', exact: true }).click();
    await page.locator('#ttext').fill('ALEXANDRIA AND CHRISTOPHER');
    await page.locator('#boardmode [data-v="b"]').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('body')).not.toHaveClass(/\btyping\b/);
    expect(await page.evaluate(() => cornhole.active)).toBe('b');
    await expect(page.locator(':focus'), 'keyboard focus follows the revealed controls').toBeInViewport();
    await expect.poll(() => page.evaluate(() => {
      const el = document.activeElement, r = el.getBoundingClientRect();
      return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === el;
    })).toBe(true);
  });

  test(`switching boards after personalizing text reveals the new board controls at 375 by ${height}`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    await page.getByRole('button', { name: 'Garden vows template', exact: true }).click();
    await page.locator('#ttext').fill('ALEXANDRIA AND CHRISTOPHER');
    await page.locator('#boardmode [data-v="b"]').click();
    await expect(page.locator('body')).not.toHaveClass(/\btyping\b/);
    const words = page.locator('#texts .quick').first();
    await expect(words, 'switching boards must reveal the new editable words').toBeInViewport();
    await expect.poll(() => words.evaluate(el => {
      const r = el.getBoundingClientRect();
      return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === el;
    }), { message: 'the new board controls must stay clear of sticky elements' }).toBe(true);
    expect(await page.evaluate(() => cornhole.active)).toBe('b');
    await words.fill('BOARD B WORDS');
    expect(await page.evaluate(() => cornhole.design.a.elements.find(el => el.type === 'text').text)).toBe('ALEXANDRIA AND CHRISTOPHER');
    expect(await page.evaluate(() => cornhole.design.b.elements.find(el => el.type === 'text').text)).toBe('BOARD B WORDS');
  });
}

test('desktop board switching preserves the gallery scroll position', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  await page.evaluate(() => window.scrollTo(0, 300));
  expect(await page.evaluate(() => scrollY)).toBe(300);
  await page.locator('#boardmode [data-v="b"]').click();
  expect(await page.evaluate(() => scrollY)).toBe(300);
  expect(await page.evaluate(() => cornhole.active)).toBe('b');
});

test.describe('touch handles on each phone board', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true });
  for (const key of ['a', 'b']) {
    test(`Board ${key.toUpperCase()} keeps the delete handle's finger-sized hit area`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await open(page);
      await page.locator(`#boardmode [data-v="${key}"]`).click();
      await page.getByRole('tab', { name: 'Text', exact: true }).click();
      await page.locator('#texts .item').first().click();
      await page.locator('#canvas' + key.toUpperCase()).focus();
      const point = await page.evaluate(key => {
        cornhole.paint();
        const c = document.getElementById('canvas' + key.toUpperCase()), r = c.getBoundingClientRect();
        const p = cornhole.handlePoints(cornhole.selected).delete;
        // A real finger tap 12 CSS pixels above the target's centre is within
        // the same intended touch area on either equally sized board.
        return { x: r.left + p.x / 24 * r.width, y: r.top + p.y / 48 * r.height - 12 };
      }, key);
      await page.touchscreen.tap(point.x, point.y);
      await expect(page.locator('#texts .quick'), 'a tap within the handle reach removes the selected words').toHaveCount(0);
    });
  }
});
