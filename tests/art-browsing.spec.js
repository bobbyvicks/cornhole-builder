import { test, expect } from '@playwright/test';
import { open, reset, settled, reloaded } from './helpers.js';

test('art search finds named artwork across collections and keeps its visible label', async ({ page }) => {
  await open(page); await reset(page);
  await page.evaluate(() => cornhole.showTab('art'));
  const total = await page.evaluate(() => Object.keys(cornhole.CLIPS).length);
  await expect(page.locator('#clips .clip')).toHaveCount(total);
  await expect(page.locator('#clipresults')).toHaveText(total + ' artwork choices');
  await page.getByRole('searchbox', { name: 'Search clip art' }).fill('  cAnOé  ');
  const canoe = page.locator('#clips .clip[data-name="bbp1-canoe-sunset"]');
  await expect(canoe).toBeVisible();
  await expect(canoe.locator('.clip-label')).toBeVisible();
  await expect(canoe).toHaveAccessibleName(/^Add .*canoe/i);
  const labels = await page.locator('#clips .clip').allTextContents();
  expect(labels.every(label => /canoe/i.test(label))).toBe(true);
});

test('art category and search intersect, with an accessible recovery from no matches', async ({ page }) => {
  await open(page); await page.evaluate(() => cornhole.showTab('art'));
  const search = page.getByRole('searchbox', { name: 'Search clip art' });
  await search.fill('camping');
  await expect(page.locator('#clips .clip[data-name="bbp1-ridge-tent"]')).toBeVisible();
  await expect(page.locator('#clipfilters')).not.toHaveAttribute('open');
  await page.locator('#clipfilterlabel').click();
  await page.getByRole('button', { name: 'Wedding collection', exact: true }).click();
  await expect(page.locator('#clipfilterlabel')).toBeFocused();
  await expect(page.locator('#clipresults')).toHaveText('No artwork found');
  await expect(page.locator('#clipempty')).toBeVisible();
  await page.getByRole('button', { name: 'Clear art filters', exact: true }).click();
  await expect(search).toHaveValue('');
  await expect(search).toBeFocused();
  await expect(page.locator('#clipcats .chip[data-v=""]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#clipempty')).toBeHidden();
  await expect(page.locator('#clips .clip')).toHaveCount(await page.evaluate(() => Object.keys(cornhole.CLIPS).length));
  await expect(page.getByRole('button', { name: 'Clear art filters', exact: true })).toBeDisabled();
});

test('a search result can be added to Board B, undone, redone and restored without changing Board A', async ({ page }) => {
  await open(page); await reset(page);
  const boardA = await page.evaluate(() => cornhole.design.a);
  await page.locator('#boardmode .chip[data-v="b"]').click();
  await page.evaluate(() => cornhole.showTab('art'));
  await page.getByRole('searchbox', { name: 'Search clip art' }).fill('canoe sunset');
  await page.locator('#clips .clip[data-name="bbp1-canoe-sunset"]').click();
  expect(await page.evaluate(() => cornhole.activeBoard().elements.at(-1).name)).toBe('bbp1-canoe-sunset');
  await page.locator('#undo').click();
  expect(await page.evaluate(() => cornhole.design.b.elements.some(e => e.name === 'bbp1-canoe-sunset'))).toBe(false);
  await page.locator('#redo').click();
  await settled(page); await reloaded(page);
  expect(await page.evaluate(() => cornhole.design.a)).toEqual(boardA);
  expect(await page.evaluate(() => cornhole.design.b.elements.some(e => e.name === 'bbp1-canoe-sunset'))).toBe(true);
});

test('art search and labeled buttons fit a narrow phone and keep keyboard editing scoped to search', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await open(page); await reset(page);
  await page.evaluate(() => { cornhole.select('t1'); cornhole.showTab('art'); });
  const before = await page.evaluate(() => cornhole.design);
  const search = page.getByRole('searchbox', { name: 'Search clip art' });
  await search.fill('campfire'); await search.press('ArrowLeft'); await search.press('Delete');
  expect(await page.evaluate(() => cornhole.design)).toEqual(before);
  await search.fill('campfire');
  const sizes = await page.locator('#clips .clip').evaluateAll(buttons => buttons.map(b => ({ width:b.offsetWidth, height:b.offsetHeight })));
  expect(sizes.length).toBeGreaterThan(0);
  expect(sizes.every(s => s.width >= 44 && s.height >= 44)).toBe(true);
  const resultsGap = await page.evaluate(() => document.querySelector('#clips .clip').getBoundingClientRect().top - document.getElementById('clipsearch').getBoundingClientRect().bottom);
  expect(resultsGap, 'phone search results stay near the search field').toBeLessThan(220);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
