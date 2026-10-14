import { test, expect } from '@playwright/test';
import { open, reset, settled, reloaded, setInput } from './helpers.js';

test('template search and occasion filters combine, announce results and recover from no results', async ({ page }) => {
  await open(page);
  const all = await page.locator('#templates .tpl').count();
  await page.getByRole('searchbox', { name: 'Search templates' }).fill('wedding');
  const weddings = await page.locator('#templates .tpl').count();
  expect(weddings).toBeGreaterThan(0); expect(weddings).toBeLessThan(all);
  await page.locator('#templateoccasion').selectOption('team');
  await expect(page.locator('#templateempty')).toBeVisible();
  await expect(page.locator('#templateresults')).toHaveText('No templates found');
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.locator('#templates .tpl')).toHaveCount(all);
  await expect(page.locator('#templateempty')).toBeHidden();
  await expect(page.getByRole('searchbox', { name: 'Search templates' })).toHaveValue('');
  await page.locator('#templateoccasion').selectOption('wedding');
  await expect(page.locator('#templates .tplgroup')).toHaveCount(1);
  await expect(page.locator('#templates .tplgroup')).toHaveText('Weddings');
});

test('typing a draft saves without blur and survives reload', async ({ page }) => {
  await open(page); await reset(page); await settled(page);
  await page.evaluate(() => { cornhole.select('t1'); cornhole.showTab('text'); });
  await page.locator('#ttext').fill('STILL TYPING');
  await expect(page.locator('#ttext')).toBeFocused();
  await settled(page);
  await reloaded(page);
  expect(await page.evaluate(() => cornhole.design.a.elements[0].text)).toBe('STILL TYPING');
  await page.evaluate(() => cornhole.showTab('text'));
  await page.locator('#texts input.quick').fill('ROW DRAFT');
  await settled(page); await reloaded(page);
  expect(await page.evaluate(() => cornhole.design.a.elements[0].text)).toBe('ROW DRAFT');
});

test('personalizing a template fits a long name into its original space, stays editable and undoes', async ({ page }) => {
  await open(page);
  await page.evaluate(() => { cornhole.applyTemplate('team'); cornhole.paint(); });
  const original = await page.evaluate(() => { const e = cornhole.activeBoard().elements.find(e => e.type === 'text'); return { id: e.id, size: e.size, text: e.text, width: cornhole.boxes.get(e.id).w }; });
  await expect(page.locator('#autofittext')).toBeChecked();
  await page.locator('#ttext').fill('THE EXTRAORDINARILY LONG FAMILY NAME');
  await page.locator('#ttext').blur();
  const fitted = await page.evaluate(id => { cornhole.paint(); const e = cornhole.activeBoard().elements.find(e => e.id === id); return { size:e.size, width:cornhole.boxes.get(id).w }; }, original.id);
  expect(fitted.size).toBeLessThan(original.size);
  expect(fitted.width).toBeLessThanOrEqual(original.width + 0.05);
  await expect(page.locator('#fitstatus')).toContainText('fit');
  await page.evaluate(() => cornhole.undo());
  expect(await page.evaluate(id => cornhole.activeBoard().elements.find(e => e.id === id).text, original.id)).toBe(original.text);
  await page.evaluate(() => cornhole.redo());
  await settled(page); await reloaded(page);
  const restored = await page.evaluate(id => cornhole.design.a.elements.find(e => e.id === id), original.id);
  expect(restored.size).toBeCloseTo(fitted.size, 2);
  expect(restored.text).toBe('THE EXTRAORDINARILY LONG FAMILY NAME');
});

test('manual size controls stay manual after fitting is switched off', async ({ page }) => {
  await open(page); await page.evaluate(() => cornhole.applyTemplate('team'));
  await setInput(page, 'tsize', 6);
  await expect(page.locator('#autofittext')).not.toBeChecked();
  await page.locator('#ttext').fill('LONG MANUALLY SIZED TEXT');
  expect(await page.evaluate(() => cornhole.activeBoard().elements.find(e => e.id === cornhole.selected).size)).toBe(6);
});
