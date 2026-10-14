import { test, expect } from '@playwright/test';
import { open, reset, settled, reloaded, picture } from './helpers.js';

async function stored(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('cornhole', 1);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const current = await new Promise((resolve, reject) => {
      const request = db.transaction('project').objectStore('project').get('current');
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    db.close();
    return { current, fallback: localStorage.getItem('cornhole.project.v2'), legacy: localStorage.getItem('cornhole.design.v1') };
  });
}

async function seed(page, { current = null, fallback = null, legacy = null }) {
  await page.evaluate(async ({ current, fallback, legacy }) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('cornhole', 1);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('project', 'readwrite'), store = tx.objectStore('project');
      if (current) store.put(current, 'current'); else store.delete('current');
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
    db.close();
    for (const [key, value] of [['cornhole.project.v2', fallback], ['cornhole.design.v1', legacy]]) {
      if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    }
  }, { current, fallback, legacy });
}

async function fixture(page) {
  await reset(page); await settled(page);
  const good = await page.evaluate(() => cornhole.projectRecord());
  good.savedAt = '2020-01-01T00:00:00.000Z'; good.design.a.elements[0].text = 'RECOVER THIS DESIGN';
  return good;
}

for (const location of ['current', 'fallback']) test('an unreadable newer ' + location + ' restores the intact other draft without rewriting storage', async ({ page }) => {
  const errors = await open(page), good = await fixture(page), bad = structuredClone(good);
  bad.savedAt = '2020-01-02T00:00:00.000Z';
  if (location === 'current') bad.design.a.elements = {}; else delete bad.design.b;
  await seed(page, location === 'current' ? { current: bad, fallback: good } : { current: good, fallback: bad });
  const before = await stored(page);
  await reloaded(page);
  expect(await page.evaluate(() => cornhole.design.a.elements[0].text)).toBe('RECOVER THIS DESIGN');
  await expect(page.locator('.stagebar .savestatus')).toHaveAttribute('data-state', 'saved');
  expect(await stored(page)).toEqual(before);
  await page.getByRole('tab', { name: 'Text', exact: true }).click();
  await page.locator('#texts .quick').fill('RECOVERED AND EDITED');
  await page.locator('#texts .quick').blur();
  await settled(page); await reloaded(page);
  expect(await page.evaluate(() => cornhole.design.a.elements[0].text)).toBe('RECOVERED AND EDITED');
  expect(errors).toEqual([]);
});

for (const kind of ['malformed current', 'malformed JSON alone']) test(kind + ' stays untouched until a deliberate edit and never claims the default is saved', async ({ page }) => {
  const errors = await open(page), bad = await fixture(page); bad.design.a.elements = {};
  await seed(page, { current: kind === 'malformed current' ? bad : null, fallback: '{unfinished JSON' });
  const before = await stored(page);
  await reloaded(page);
  await expect(page.locator('.stagebar .savestatus')).toContainText(/saved project.*could not be read/i);
  await expect(page.locator('.stagebar .savestatus')).not.toHaveAttribute('data-state', 'saved');
  await page.getByRole('tab', { name: 'Order', exact: true }).click();
  await page.locator('#qty').fill('1'); // unchanged input invokes normal save plumbing
  await page.getByRole('tab', { name: 'Text', exact: true }).click();
  expect(await stored(page)).toEqual(before);
  await page.locator('#texts .quick').fill('MY NEW SAVED DESIGN');
  await page.locator('#texts .quick').blur(); await settled(page); await reloaded(page);
  expect(await page.evaluate(() => cornhole.design.a.elements[0].text)).toBe('MY NEW SAVED DESIGN');
  expect(errors).toEqual([]);
});

test('legacy defaults and stale order choices recover without rejecting valid artwork', async ({ page }) => {
  const errors = await open(page); await fixture(page);
  const legacy = { a: { elements: [
    { type: 'text', text: 'OLD FAMILY DESIGN', font: 'Impact', size: 4, color: '#ffffff', x: 12, y: 30 },
    { type: 'clip', name: 'heart', x: 12, y: 20 },
  ] }, b: {} };
  await seed(page, { current: { design: legacy, order: { product: 'retired-product', finish: 'retired-finish', quantity: 2 } } });
  await reloaded(page);
  expect(await page.evaluate(() => ({ text: cornhole.design.a.elements[0].text, clip: cornhole.design.a.elements[1], order: cornhole.order }))).toMatchObject({
    text: 'OLD FAMILY DESIGN', clip: { name: 'heart', width: 8, opacity: 1 }, order: { product: 'set', finish: 'satin', quantity: 2 },
  });
  await seed(page, { current: { design: { a: null } }, legacy });
  await reloaded(page);
  expect(await page.evaluate(() => cornhole.design.a.elements[0].text)).toBe('OLD FAMILY DESIGN');
  expect(errors).toEqual([]);
});

test('current projects retain uploaded pictures and all supported template defaults during recovery', async ({ page }) => {
  const errors = await open(page); await reset(page);
  const photo = await picture(page, 60, 40, 'image/png', 'g.fillStyle="#e75480";g.fillRect(0,0,w,h);');
  await page.setInputFiles('#addimage', photo);
  await page.waitForFunction(() => cornhole.design.a.elements.some(e => e.type === 'image'));
  await settled(page);
  const expected = await page.evaluate(() => cornhole.design);
  await reloaded(page);
  expect(await page.evaluate(() => cornhole.design)).toEqual(expected);
  const failures = await page.evaluate(async () => {
    const { validateProject } = await import('/lib/project-validation.mjs');
    const options = { clips: cornhole.CLIPS, patterns: cornhole.PATTERNS, stains: Object.fromEntries(['natural','honey','cherry','walnut','grey','ebony'].map(k => [k, true])) };
    return cornhole.TEMPLATES.flatMap(t => {
      try { validateProject({ design: { a: t.board(), b: {} } }, options); return []; }
      catch (error) { return [t.id + ': ' + error.message]; }
    });
  });
  expect(failures).toEqual([]);
  expect(errors).toEqual([]);
});

test('inherited order choice names are ignored while the saved artwork is restored', async ({ page }) => {
  const errors = await open(page), good = await fixture(page);
  good.order = { product: '__proto__', finish: 'constructor', bags: 'toString', occasion: '__proto__', quantity: 2 };
  await seed(page, { current: good });
  await reloaded(page);
  expect(await page.evaluate(() => ({ words: cornhole.design.a.elements[0].text, order: cornhole.order }))).toMatchObject({
    words: 'RECOVER THIS DESIGN', order: { product: 'set', finish: 'satin', bags: 'none', occasion: 'other', quantity: 2 },
  });
  expect(errors).toEqual([]);
});

test('keyboard nudges stop where a drag stops, within what the checkout accepts, and the position restores unchanged', async ({ page }) => {
  const errors = await open(page); await reset(page);
  await page.getByRole('tab', { name: 'Text', exact: true }).click();
  await page.locator('#texts .item').click(); await page.locator('#canvasA').focus();
  for (let i = 0; i < 120; i++) await page.keyboard.press('Shift+ArrowRight');
  expect(await page.evaluate(() => cornhole.design.a.elements[0].x)).toBe(28);
  for (let i = 0; i < 60; i++) await page.keyboard.press('Shift+ArrowUp');
  expect(await page.evaluate(() => cornhole.design.a.elements[0].y)).toBe(-4);
  expect(await page.evaluate(() => { const e = cornhole.orderPayload().design.a.elements[0]; return e.x <= 30 && e.y >= -6; }), 'the server takes positions between -6 and 30 across').toBe(true);
  await settled(page);
  const before = await page.evaluate(() => cornhole.design);
  await reloaded(page);
  expect(await page.evaluate(() => cornhole.design)).toEqual(before);
  await expect(page.locator('.stagebar .savestatus')).toHaveAttribute('data-state', 'saved');
  expect(errors).toEqual([]);
});
