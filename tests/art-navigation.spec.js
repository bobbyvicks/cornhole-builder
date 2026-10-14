import { test, expect } from '@playwright/test';
import { open } from './helpers.js';

async function expectUncovered(control) {
  await expect(control).toBeInViewport();
  await expect.poll(() => control.evaluate(el => {
    const r = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
  }), { message: 'the focused control must be clear of the pinned preview and header' }).toBe(true);
}

for (const [width, height, method] of [[1280, 900, 'click'], [375, 812, 'click'], [375, 420, 'keyboard']]) {
  test(`choosing the last artwork group reveals its controls at ${width} by ${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    await page.getByRole('tab', { name: 'Art', exact: true }).click();
    const groups = page.locator('#clipfilterlabel');
    await groups.click();
    const lastGroup = page.getByRole('button', { name: 'Game day collection', exact: true });
    if (method === 'keyboard') {
      await lastGroup.focus();
      await page.keyboard.press('Enter');
    } else await lastGroup.click();
    await expect(groups).toBeFocused();
    await expectUncovered(groups);
    await expect(page.locator('#clips .clip')).toHaveCount(4);
    await expect(page.locator('#clips .clip').first()).toBeInViewport();
    await page.keyboard.press('Tab');
    await expect(page.locator('#clips .clip').first()).toBeFocused();
    await expectUncovered(page.locator('#clips .clip').first());
  });
}

for (const [width, height, method] of [[1280, 900, 'keyboard'], [375, 812, 'click'], [375, 420, 'keyboard']]) {
  test(`adding distant artwork reveals its editable width at ${width} by ${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    await page.getByRole('tab', { name: 'Art', exact: true }).click();
    const artwork = page.getByRole('button', { name: 'Add Football Play', exact: true });
    if (method === 'keyboard') {
      await artwork.focus();
      await page.keyboard.press('Enter');
    } else await artwork.click();
    const widthControl = page.locator('#iwidth');
    await expect(widthControl).toBeFocused();
    await expectUncovered(widthControl);
    await expect(page.locator('#images .item[aria-pressed="true"]')).toContainText('Football Play');
    await page.keyboard.press('ArrowRight');
    expect(await page.evaluate(() => cornhole.activeBoard().elements.find(el => el.id === cornhole.selected).width)).toBe(8.25);
    expect(await page.evaluate(() => cornhole.activeBoard().elements.filter(el => el.name === 'bbp1-football-play').length)).toBe(1);
  });
}
