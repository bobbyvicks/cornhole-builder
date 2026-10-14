import { test, expect } from '@playwright/test';
import { open, reset, settled, reloaded } from './helpers.js';

const LATE_PROMPT = 'A design saved earlier on this device was found. Replace what you have started with it?';
const words = page => page.evaluate(() => cornhole.design.a.elements[0].text);
const stored = page => page.evaluate(async () => (await import('/lib/store.mjs')).loadProject());

/* A saved design, then a reload whose IndexedDB open is held until the test
   lets it go. Reads and writes still use the real store, so each test
   proves which draft survives the next reload. */
async function startWithSlowRecovery(page) {
  await open(page); await reset(page);
  await page.evaluate(() => { cornhole.select('t1'); cornhole.showTab('text'); });
  await page.locator('#ttext').fill('SAVED EARLIER');
  await page.locator('#ttext').blur();
  await settled(page);
  await page.addInitScript(() => {
    if (sessionStorage.getItem('startupReadDelayed')) return;
    sessionStorage.setItem('startupReadDelayed', 'yes');
    const gate = new Promise(resolve => { window.releaseStartupRead = resolve; });
    const openDb = indexedDB.open.bind(indexedDB);
    indexedDB.open = (...args) => {
      const request = openDb(...args);
      request.addEventListener('success', event => {
        event.stopImmediatePropagation();
        window.startupReadWaiting = true;
        gate.then(() => request.dispatchEvent(new Event('success')));
      }, { once: true });
      return request;
    };
  });
  await page.reload();
  await page.waitForFunction(() => window.cornhole && window.startupReadWaiting && !cornhole.loaded);
}

/* Six seconds on, the builder opens with its "still checking" notice. */
async function builderOpen(page) {
  await expect(page.locator('.stagebar .savestatus')).toContainText('Still checking', { timeout: 8000 });
  await page.waitForFunction(() => cornhole.loaded);
}

/* The held read lands. A found project is offered when something was
   edited meanwhile; `answer` is what the customer says to that. */
async function finishRecovery(page, answer = 'dismiss') {
  const dialogs = [];
  const handle = d => { dialogs.push(d.message()); return answer === 'accept' ? d.accept() : d.dismiss(); };
  page.on('dialog', handle);
  await page.evaluate(() => window.releaseStartupRead());
  await page.waitForFunction(() => cornhole.loaded && cornhole.saveState !== 'waiting');
  page.off('dialog', handle);
  return dialogs;
}

test('until the saved project is back the builder takes no click and no key, then restores it and protects it as usual', async ({ page }) => {
  await startWithSlowRecovery(page);
  expect(await page.evaluate(() => document.body.classList.contains('loading'))).toBe(true);
  expect(await page.evaluate(() => ['.panel', '.stage', '#mobilebar'].every(s => document.querySelector(s).inert))).toBe(true);
  const card = page.locator('#templates .tpl').first();
  await card.scrollIntoViewIfNeeded();
  const box = await card.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  expect(await words(page), 'the click did nothing').toBe('YOUR TEAM');
  expect(await page.evaluate(() => { document.getElementById('ttext').focus(); return document.activeElement === document.getElementById('ttext'); }), 'nor can a field take the keyboard').toBe(false);
  expect(await page.evaluate(() => cornhole.historyLength)).toBe(1);
  expect(await finishRecovery(page)).toEqual([]);
  expect(await words(page)).toBe('SAVED EARLIER');
  expect(await page.evaluate(() => document.body.classList.contains('loading'))).toBe(false);
  expect(await page.evaluate(() => document.querySelector('.panel').inert)).toBe(false);
  await expect(page.locator('.stagebar .savestatus')).toHaveAttribute('data-state', 'saved');
  expect((await stored(page)).design.a.elements[0].text, 'nothing was written over it').toBe('SAVED EARLIER');
  await page.evaluate(() => cornhole.showTab('templates'));
  const asked = [];
  page.once('dialog', d => { asked.push(d.message()); return d.dismiss(); });
  await page.locator('#templates .tpl[data-id="team"]').click();
  expect(asked).toEqual(['Replace your current design with the Team template?']);
  expect(await words(page)).toBe('SAVED EARLIER');
});

test('a stalled read offers an export and its late result restores the unchanged draft without asking', async ({ page }) => {
  await startWithSlowRecovery(page);
  await builderOpen(page);
  await page.getByRole('tab', { name: 'Start', exact: true }).click();
  await expect(page.locator('#exportlink')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.locator('#exportlink').click();
  expect((await download).suggestedFilename()).toMatch(/^cornhole-project-/);
  expect(await finishRecovery(page)).toEqual([]);
  await settled(page);
  expect(await words(page)).toBe('SAVED EARLIER');
  await reloaded(page);
  expect(await words(page)).toBe('SAVED EARLIER');
});

for (const field of ['#texts .quick', '#ttext']) {
  test(`typing in ${field} after the notice is offered the found project; keeping the typing leaves the saved design one Undo away`, async ({ page }) => {
    await startWithSlowRecovery(page);
    await builderOpen(page);
    await page.getByRole('tab', { name: 'Text', exact: true }).click();
    await page.locator('#texts .item').click();
    await page.locator(field).fill('EARLY TYPING');
    expect(await finishRecovery(page)).toEqual([LATE_PROMPT]);
    expect(await words(page)).toBe('EARLY TYPING');
    await expect(page.locator(field)).toBeFocused();
    await settled(page);
    await page.evaluate(() => cornhole.undo());
    expect(await words(page), 'the saved design is still there, one step back').toBe('SAVED EARLIER');
    await page.evaluate(() => cornhole.redo());
    await settled(page); await reloaded(page);
    expect(await words(page)).toBe('EARLY TYPING');
  });
}

test('a committed edit made after the notice is kept on request and saved as soon as storage is ready', async ({ page }) => {
  await startWithSlowRecovery(page);
  await builderOpen(page);
  await page.getByRole('tab', { name: 'Board', exact: true }).click();
  await page.locator('#paints .sw[data-v="#c8102e"]').click();
  expect(await finishRecovery(page)).toEqual([LATE_PROMPT]);
  await expect(page.locator('.stagebar .savestatus')).toHaveAttribute('data-state', 'saved');
  expect(await page.evaluate(() => cornhole.design.a.base.color)).toBe('#c8102e');
  await page.evaluate(() => cornhole.undo());
  expect(await words(page)).toBe('SAVED EARLIER');
  expect(await page.evaluate(() => cornhole.design.a.base.color)).toBe('#1f3a93');
  await page.evaluate(() => cornhole.redo());
  await settled(page); await reloaded(page);
  expect(await page.evaluate(() => cornhole.design.a.base.color)).toBe('#c8102e');
});

test('accepting the found project puts it back, leaves the stored copy as it was, and keeps the edit one Undo away', async ({ page }) => {
  await startWithSlowRecovery(page);
  await builderOpen(page);
  await page.getByRole('tab', { name: 'Board', exact: true }).click();
  await page.locator('#paints .sw[data-v="#c8102e"]').click();
  expect(await finishRecovery(page, 'accept')).toEqual([LATE_PROMPT]);
  expect(await words(page)).toBe('SAVED EARLIER');
  expect(await page.evaluate(() => cornhole.design.a.base.color)).toBe('#1f3a93');
  await expect(page.locator('.stagebar .savestatus')).toHaveAttribute('data-state', 'saved');
  expect((await stored(page)).design.a.elements[0].text).toBe('SAVED EARLIER');
  await page.evaluate(() => cornhole.undo());
  expect(await page.evaluate(() => ({ text: cornhole.design.a.elements[0].text, color: cornhole.design.a.base.color }))).toEqual({ text: 'YOUR TEAM', color: '#c8102e' });
  await page.evaluate(() => cornhole.redo());
  await settled(page); await reloaded(page);
  expect(await words(page)).toBe('SAVED EARLIER');
});

test('order choices entered after the notice are kept on request even without a design-history entry', async ({ page }) => {
  await startWithSlowRecovery(page);
  await builderOpen(page);
  await page.getByRole('tab', { name: 'Order', exact: true }).click();
  await page.locator('#qty').fill('3');
  expect(await finishRecovery(page)).toEqual([LATE_PROMPT]);
  await expect(page.locator('#qty')).toHaveValue('3');
  await settled(page);
  await page.evaluate(() => cornhole.undo());
  expect(await words(page), 'the design that was not kept is one step back').toBe('SAVED EARLIER');
  await page.evaluate(() => cornhole.redo());
  await settled(page); await reloaded(page);
  expect(await page.evaluate(() => cornhole.order.quantity)).toBe(3);
});

test('an in-progress board colour pick made after the notice survives before its change event', async ({ page }) => {
  await startWithSlowRecovery(page);
  await builderOpen(page);
  await page.getByRole('tab', { name: 'Board', exact: true }).click();
  await page.locator('#paintcustom').evaluate(el => {
    el.value = '#00ff00';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(await finishRecovery(page)).toEqual([LATE_PROMPT]);
  expect(await page.evaluate(() => cornhole.design.a.base.color)).toBe('#00ff00');
  await settled(page); await reloaded(page);
  expect(await page.evaluate(() => cornhole.design.a.base.color)).toBe('#00ff00');
});

test('navigation and unchanged order input after the notice still recover the existing draft without asking', async ({ page }) => {
  await startWithSlowRecovery(page);
  await builderOpen(page);
  await page.getByRole('tab', { name: 'Order', exact: true }).click();
  await page.locator('#qty').fill('1');
  expect(await finishRecovery(page)).toEqual([]);
  expect(await words(page)).toBe('SAVED EARLIER');
  await settled(page); await reloaded(page);
  expect(await words(page)).toBe('SAVED EARLIER');
});
