import { test, expect } from '@playwright/test';
import { open } from './helpers.js';

for (const viewport of [{ width: 1280, height: 900 }, { width: 375, height: 812 }]) {
  for (const activation of ['click', 'keyboard']) {
    test(`a distant template reveals selected words at ${viewport.width}px using ${activation}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await open(page);
      const card = page.getByRole('button', { name: 'Lake days template', exact: true });
      if (activation === 'keyboard') {
        await card.focus();
        await page.keyboard.press('Enter');
      } else await card.click();
      const field = page.locator('#ttext');
      await expect(field).toBeFocused();
      await expect(field, 'the first editable words should be visible immediately after choosing a design').toBeInViewport();
      await expect.poll(() => field.evaluate(el => {
        const r = el.getBoundingClientRect();
        return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === el;
      }), { message: 'the header, pinned board and Review bar must not cover the focused words' }).toBe(true);
      await expect(field).toHaveValue('LIFE AT THE LAKE');
      expect(await field.evaluate(el => ({ start: el.selectionStart, end: el.selectionEnd }))).toEqual({ start: 0, end: 16 });
      await page.keyboard.type('THE EXTRAORDINARILY LONG FAMILY NAME');
      await expect(field).toHaveValue('THE EXTRAORDINARILY LONG FAMILY NAME');
      expect(await page.evaluate(() => cornhole.activeBoard().elements.find(el => el.id === cornhole.selected).text)).toBe('THE EXTRAORDINARILY LONG FAMILY NAME');
      await expect(field).toBeFocused();
    });
  }

  test(`starting blank reveals the first editing action at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    await page.getByRole('button', { name: '+ Start with blank boards', exact: true }).click();
    const add = page.getByRole('button', { name: '+ Add text', exact: true });
    await expect(add).toBeFocused();
    await expect(add).toBeInViewport();
    await expect.poll(() => add.evaluate(el => {
      const r = el.getBoundingClientRect();
      return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === el;
    })).toBe(true);
    await page.keyboard.press('Enter');
    await expect(page.locator('#ttext')).toBeFocused();
    await page.keyboard.type('OUR FAMILY');
    await expect(page.locator('#ttext')).toHaveValue('OUR FAMILY');
  });
}
