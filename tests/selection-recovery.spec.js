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

test('removing a middle row with its own x leaves the focus on a Select button, so a second Enter removes nothing else', async ({ page }) => {
  await open(page);
  await page.evaluate(() => { cornhole.applyTemplate('bbp1-garden-vows'); cornhole.showTab('text'); });
  const rows = page.locator('#texts .itemrow');
  const texts = await rows.count();
  await page.getByRole('button', { name: 'Remove "AVERY"', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(rows).toHaveCount(texts - 1);
  await expect(page.locator('#texts .item').nth(1), 'the row now in its place, ready to select').toBeFocused();
  await page.keyboard.press('Enter');
  await expect(rows).toHaveCount(texts - 1);
  expect(await page.evaluate(() => cornhole.activeBoard().elements.filter(e => e.type === 'text').map(e => e.text))).toEqual(['TOGETHER IS HOME', '&', 'JORDAN', 'JUNE 14, 2027']);
  await page.evaluate(() => cornhole.showTab('art'));
  const art = page.locator('#images .itemrow');
  const pictures = await art.count();
  await page.getByRole('button', { name: /^Remove Linked Rings/ }).focus();
  await page.keyboard.press('Enter');
  await expect(art).toHaveCount(pictures - 1);
  expect(await page.evaluate(() => document.activeElement.classList.contains('item'))).toBe(true);
  await page.keyboard.press('Enter');
  await expect(art).toHaveCount(pictures - 1);
});

test('a project file whose item ids hold a quote still has its rows removed, recorded and saved', async ({ page }) => {
  const errors = await open(page); await reset(page); await settled(page);
  await page.evaluate(() => {
    const p = cornhole.projectRecord();
    p.design.a.elements[0].id = 'bad"id';
    p.design.a.elements.push({ type: 'text', id: 'ok1', text: 'OK', font: 'Impact', size: 3, color: '#ffffff', x: 12, y: 36 });
    cornhole.importProject(p);
    cornhole.showTab('text');
  });
  const before = await page.evaluate(() => cornhole.historyLength);
  await page.getByRole('button', { name: 'Remove "HELLO"', exact: true }).click();
  expect(await page.evaluate(() => cornhole.design.a.elements.map(e => e.id))).toEqual(['ok1']);
  expect(await page.evaluate(() => cornhole.historyLength), 'the removal is a step in the history').toBe(before + 1);
  await settled(page);
  expect((await page.evaluate(async () => (await import('/lib/store.mjs')).loadProject())).design.a.elements.map(e => e.id)).toEqual(['ok1']);
  expect(errors).toEqual([]);
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
