import { test, expect } from '@playwright/test';
import { open, reset, setInput, settled, reloaded } from './helpers.js';

test('undoing the first Board B switch keeps subsequent edits on the visible matching boards', async ({ page }) => {
  await open(page); await reset(page);
  await page.locator('#boardmode [data-v="b"]').click();
  await page.locator('#undo').click();
  await page.getByRole('tab', { name: 'Text', exact: true }).click();
  await expect(page.locator('#texts .quick')).toHaveValue('HELLO');
  await page.locator('#texts .quick').fill('VISIBLE AGAIN');
  await page.locator('#texts .quick').blur();
  expect(await page.evaluate(() => cornhole.design.a.elements[0].text)).toBe('VISIBLE AGAIN');
  expect(await page.evaluate(() => cornhole.design.b.elements)).toEqual([]);
  await settled(page); await reloaded(page);
  expect(await page.evaluate(() => cornhole.design.a.elements[0].text)).toBe('VISIBLE AGAIN');
});

test('redoing matching boards after returning to Board B edits Board A', async ({ page }) => {
  await open(page); await reset(page);
  await page.locator('#boardmode [data-v="b"]').click();
  await page.locator('#boardmode [data-v="same"]').click();
  await page.locator('#undo').click();
  await page.locator('#boardmode [data-v="b"]').click();
  await page.locator('#redo').click();
  await page.getByRole('tab', { name: 'Text', exact: true }).click();
  await page.locator('#texts .quick').fill('MATCHING REDO');
  expect(await page.evaluate(() => cornhole.design.a.elements[0].text)).toBe('MATCHING REDO');
  expect(await page.evaluate(() => cornhole.design.b.elements[0].text)).toBe('HELLO');
});

test('text layer selection and removal names follow typing, property edits, and undo', async ({ page }) => {
  await open(page); await reset(page);
  await page.getByRole('tab', { name: 'Text', exact: true }).click();
  const words = page.locator('#texts .quick');
  await words.fill('MY CLUB');
  await expect(words).toBeFocused();
  await expect(page.locator('#texts .item')).toHaveAccessibleName('Select "MY CLUB"');
  await expect(page.locator('#texts .itemdel')).toHaveAccessibleName('Remove "MY CLUB"');
  await words.blur();
  await page.locator('#ttext').fill('GAME NIGHT');
  await page.locator('#ttext').blur();
  await expect(page.locator('#texts .itemdel')).toHaveAccessibleName('Remove "GAME NIGHT"');
  await page.locator('#undo').click();
  await expect(page.locator('#texts .item')).toHaveAccessibleName('Select "MY CLUB"');
  await expect(page.locator('#texts .itemdel')).toHaveAccessibleName('Remove "MY CLUB"');
});

test('resizing art updates the layer removal name', async ({ page }) => {
  await open(page); await reset(page);
  await page.evaluate(() => { cornhole.addClip('heart'); cornhole.showTab('art'); });
  await setInput(page, 'iwidth', 12);
  await expect(page.locator('#images .item')).toHaveAccessibleName('Select Heart, 12"');
  await expect(page.locator('#images .itemdel')).toHaveAccessibleName('Remove Heart, 12"');
});

test('removing selected text from its properties returns keyboard focus to the remaining layer', async ({ page }) => {
  await open(page); await reset(page);
  await page.getByRole('tab', { name: 'Text', exact: true }).click();
  await page.locator('#addtext').click();
  await page.locator('#tdel').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#texts .item')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#ttext')).toHaveValue('HELLO');
});

test('removing the last selected text returns focus to Add text', async ({ page }) => {
  await open(page); await reset(page);
  await page.getByRole('tab', { name: 'Text', exact: true }).click();
  await page.locator('#texts .item').click();
  await page.locator('#tdel').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#addtext')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#ttext')).toBeFocused();
});

for (const control of ['#images .itemdel', '#idel']) {
  test(`removing the last art layer with ${control} keeps its upload control keyboard reachable`, async ({ page }) => {
    await open(page); await reset(page);
    await page.evaluate(() => { cornhole.addClip('heart'); cornhole.showTab('art'); });
    await page.locator(control).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#addimagebtn')).toBeFocused();
    await expect(page.locator('#images .itemrow')).toHaveCount(0);
  });
}
