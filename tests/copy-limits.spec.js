import { test, expect } from '@playwright/test';
import { open, reset, picture, settled, reloaded } from './helpers.js';

test('copying an uploaded photo to a full board explains the limit and recovers after removal', async ({ page }) => {
  const errors = await open(page); await reset(page);
  const photo = await picture(page, 80, 40, 'image/jpeg', 'g.fillStyle="#c8102e";g.fillRect(0,0,w,h);');
  await page.setInputFiles('#addimage', photo);
  await page.waitForFunction(() => cornhole.design.a.elements.some(el => el.type === 'image'));
  const source = await page.evaluate(() => cornhole.design.a.elements.find(el => el.type === 'image'));
  await page.locator('#boardmode [data-v="a"]').click();
  await page.locator('#images .item').first().click();
  await page.locator('#artmore summary').click();
  // Splitting matching boards starts B with one copy of the uploaded photo.
  for (let i = 0; i < 3; i++) await page.locator('#icopy').click();
  await settled(page);
  const before = await page.evaluate(() => cornhole.design);
  expect(before.b.elements.filter(el => el.type === 'image')).toHaveLength(4);
  const messages = [];
  page.on('dialog', async dialog => { messages.push(dialog.message()); await dialog.dismiss(); });
  await page.locator('#icopy').click();
  expect(messages.join(' ')).toMatch(/Board B.*4.*pictures.*[Rr]emove.*Board B.*copy/i);
  expect(await page.evaluate(() => cornhole.design)).toEqual(before);
  await settled(page); await reloaded(page);
  expect(await page.evaluate(() => cornhole.design)).toEqual(before);

  await page.locator('#boardmode [data-v="b"]').click();
  await page.getByRole('tab', { name: 'Art', exact: true }).click();
  await page.locator('#images .itemdel').first().click();
  await page.locator('#boardmode [data-v="a"]').click();
  await page.locator('#images .item').first().click();
  await page.locator('#artmore summary').click();
  await page.locator('#icopy').click();
  const copied = await page.evaluate(() => cornhole.design.b.elements.filter(el => el.type === 'image'));
  expect(copied).toHaveLength(4);
  expect(copied.at(-1)).toEqual({ ...source, id: copied.at(-1).id });
  expect(copied.at(-1).id).not.toBe(source.id);
  expect(messages).toHaveLength(1);
  expect(errors).toEqual([]);
});

for (const [type, limit, label] of [['text', 10, 'text items'], ['clip', 12, 'clip art items']]) {
  for (const destination of ['a', 'b']) test(`copying ${type} to full Board ${destination.toUpperCase()} explains its own limit`, async ({ page }) => {
    await open(page); await reset(page);
    await page.evaluate(([type, limit, destination]) => {
      if (type === 'clip') cornhole.addClip('heart');
      const source = structuredClone(cornhole.design.a.elements.find(el => el.type === type));
      source.id = 'source';
      const design = structuredClone(cornhole.design), from = destination === 'a' ? 'b' : 'a';
      design.same = false;
      design[from].elements = [source];
      design[destination].elements = Array.from({ length: limit }, (_, i) => ({ ...structuredClone(source), id: 'existing-' + i }));
      cornhole.setDesign(design); cornhole.setMode(from); cornhole.select(source.id);
      cornhole.showTab(type === 'text' ? 'text' : 'art');
    }, [type, limit, destination]);
    await page.locator(type === 'text' ? '#textmore summary' : '#artmore summary').click();
    const before = await page.evaluate(() => cornhole.design);
    const messages = [];
    page.on('dialog', async dialog => { messages.push(dialog.message()); await dialog.dismiss(); });
    await page.locator(type === 'text' ? '#tcopy' : '#icopy').click();
    expect(messages.join(' ')).toMatch(new RegExp(`Board ${destination.toUpperCase()}.*${limit}.*${label}.*remove.*Board ${destination.toUpperCase()}.*copy`, 'i'));
    expect(await page.evaluate(() => cornhole.design)).toEqual(before);
  });
}
