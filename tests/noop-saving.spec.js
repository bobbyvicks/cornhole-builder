import { test, expect } from '@playwright/test';
import { open, reset, settled, reloaded } from './helpers.js';

const stored = page => page.evaluate(async () => (await import('/lib/store.mjs')).loadProject());
const words = page => page.evaluate(() => cornhole.design.a.elements.find(el => el.type === 'text').text);
async function textField(page) {
  await page.getByRole('tab', { name: 'Text', exact: true }).click();
  return page.locator('#texts .quick').first();
}
async function editAndCommit(page, text) {
  const field = await textField(page); await field.fill(text); await field.press('Tab');
}

for (const action of ['switch boards', 'navigate tabs', 'enter order details']) test('a stale tab can ' + action + ' without replacing the other tab’s saved design', async ({ page, context }) => {
  await open(page); await reset(page); await settled(page);
  await page.locator('#boardmode [data-v="a"]').click(); await settled(page);
  const other = await context.newPage(); await open(other);
  const originalOther = await other.evaluate(() => ({ design: cornhole.design, order: cornhole.order }));
  await editAndCommit(page, 'LATEST FROM THE FIRST TAB'); await settled(page);
  const latest = await stored(page);
  // The stale tab is told of the newer save before it does anything.
  await other.waitForFunction(() => cornhole.saveState === 'elsewhere');

  if (action === 'switch boards') await other.locator('#boardmode [data-v="b"]').click();
  else if (action === 'navigate tabs') {
    for (const name of ['Art', 'Text', 'Board']) await other.getByRole('tab', { name, exact: true }).click();
  } else {
    await other.getByRole('tab', { name: 'Order', exact: true }).click();
    await other.click('#toreview'); await other.click('#tocheckout');
    await expect(other.locator('#orderstep3')).toBeVisible();
  }
  // Past the 400 ms typing debounce: a write would have ended in "saved".
  await other.waitForTimeout(600);
  expect(await other.evaluate(() => cornhole.saveState), 'looking around writes nothing and keeps the notice').toBe('elsewhere');
  expect(await other.evaluate(() => ({ design: cornhole.design, order: cornhole.order }))).toEqual(originalOther);
  expect(await stored(other), 'unchanged controls must not replace or redate the newer shared draft').toEqual(latest);
  await reloaded(page);
  expect(await words(page)).toBe('LATEST FROM THE FIRST TAB');
  await other.close();
});

async function delayRealSaveCompletion(page) {
  // Keep real IndexedDB/localStorage. Only defer the save function's return,
  // after its real transaction completed, to expose a pending callback race.
  await page.route('**/lib/store.mjs', async route => {
    const response = await route.fetch();
    const source = (await response.text()).replace('export async function saveProject(project)', 'async function saveProjectNow(project)');
    await route.fulfill({ response, body: source + `
      export async function saveProject(project) {
        const result = await saveProjectNow(project);
        if (window.holdNextSave) {
          window.holdNextSave = false;
          window.realSaveWritten = true;
          await new Promise(resolve => { window.releaseSaveCompletion = resolve; });
        }
        return result;
      }
    ` });
  });
  await open(page); await reset(page); await settled(page);
}

test('new typing during a real pending save is flushed after the older save completes', async ({ page }) => {
  await delayRealSaveCompletion(page);
  await page.evaluate(() => { window.holdNextSave = true; });
  await editAndCommit(page, 'FIRST SAVED WORDS');
  await page.waitForFunction(() => window.realSaveWritten);
  expect((await stored(page)).design.a.elements[0].text).toBe('FIRST SAVED WORDS');
  const field = await textField(page); await field.fill('NEW TYPING WHILE SAVING');
  await page.evaluate(() => window.releaseSaveCompletion());
  await settled(page);
  expect((await stored(page)).design.a.elements[0].text).toBe('NEW TYPING WHILE SAVING');
  await reloaded(page);
  expect(await words(page)).toBe('NEW TYPING WHILE SAVING');
});

test('undoing to the saved baseline while another save completes still restores that baseline on disk', async ({ page }) => {
  await delayRealSaveCompletion(page);
  await editAndCommit(page, 'BASELINE A'); await settled(page);
  await page.evaluate(() => { window.holdNextSave = true; });
  await editAndCommit(page, 'PENDING B');
  await page.waitForFunction(() => window.realSaveWritten);
  expect((await stored(page)).design.a.elements[0].text).toBe('PENDING B');
  await page.click('#undo');
  expect(await words(page)).toBe('BASELINE A');
  await page.evaluate(() => window.releaseSaveCompletion());
  await settled(page);
  expect((await stored(page)).design.a.elements[0].text).toBe('BASELINE A');
  await reloaded(page);
  expect(await words(page)).toBe('BASELINE A');
});

test('typing and reverting before the first debounce keeps an unsaved page labelled not saved yet', async ({ page }) => {
  await open(page);
  expect(await page.evaluate(() => cornhole.saveState)).toBe('new');
  const field = await textField(page), original = await field.inputValue();
  await field.fill('A TEMPORARY EDIT'); await field.fill(original);
  await expect.poll(() => page.evaluate(() => cornhole.saveState)).not.toBe('saving');
  expect(await page.evaluate(() => cornhole.saveState)).toBe('new');
  await expect(page.locator('.savestatus').first()).toHaveText('Not saved yet');
  expect(await stored(page)).toBeNull();
});
