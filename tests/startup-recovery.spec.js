import { test, expect } from '@playwright/test';
import { open, reset, settled, reloaded } from './helpers.js';

async function startWithSlowRecovery(page) {
  await open(page); await reset(page);
  await page.evaluate(() => { cornhole.select('t1'); cornhole.showTab('text'); });
  await page.locator('#ttext').fill('SAVED EARLIER');
  await page.locator('#ttext').blur();
  await settled(page);
  await page.addInitScript(() => {
    // Hold the real IndexedDB open result once. Reads/writes still use the
    // real store, so the test proves which draft survives the next reload.
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

async function finishRecovery(page) {
  await page.evaluate(() => window.releaseStartupRead());
  await page.waitForFunction(() => cornhole.loaded);
}

for (const field of ['#texts .quick', '#ttext']) {
  test(`text entered into ${field} before recovery finishes survives without blur`, async ({ page }) => {
    await startWithSlowRecovery(page);
    await page.getByRole('tab', { name: 'Text', exact: true }).click();
    await page.locator('#texts .item').click();
    await page.locator(field).fill('EARLY TYPING');
    await finishRecovery(page);
    expect(await page.evaluate(() => cornhole.design.a.elements[0].text)).toBe('EARLY TYPING');
    await expect(page.locator(field)).toBeFocused();
    await settled(page); await reloaded(page);
    expect(await page.evaluate(() => cornhole.design.a.elements[0].text)).toBe('EARLY TYPING');
  });
}

test('a committed edit made during recovery is saved as soon as storage is ready', async ({ page }) => {
  await startWithSlowRecovery(page);
  await page.getByRole('tab', { name: 'Board', exact: true }).click();
  await page.locator('#paints .sw[data-v="#c8102e"]').click();
  await finishRecovery(page);
  await expect(page.locator('.stagebar .savestatus')).toHaveAttribute('data-state', 'saved');
  await reloaded(page);
  expect(await page.evaluate(() => cornhole.design.a.base.color)).toBe('#c8102e');
});

test('order choices entered during recovery survive even without a design-history entry', async ({ page }) => {
  await startWithSlowRecovery(page);
  await page.getByRole('tab', { name: 'Order', exact: true }).click();
  await page.locator('#qty').fill('3');
  await finishRecovery(page);
  await expect(page.locator('#qty')).toHaveValue('3');
  await settled(page); await reloaded(page);
  expect(await page.evaluate(() => cornhole.order.quantity)).toBe(3);
});

test('an in-progress board colour pick survives recovery before its change event', async ({ page }) => {
  await startWithSlowRecovery(page);
  await page.getByRole('tab', { name: 'Board', exact: true }).click();
  await page.locator('#paintcustom').evaluate(el => {
    el.value = '#00ff00';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await finishRecovery(page);
  expect(await page.evaluate(() => cornhole.design.a.base.color)).toBe('#00ff00');
  await settled(page); await reloaded(page);
  expect(await page.evaluate(() => cornhole.design.a.base.color)).toBe('#00ff00');
});

test('navigation and unchanged order input still recover the existing draft', async ({ page }) => {
  await startWithSlowRecovery(page);
  await page.getByRole('tab', { name: 'Order', exact: true }).click();
  await page.locator('#qty').fill('1');
  await finishRecovery(page);
  expect(await page.evaluate(() => cornhole.design.a.elements[0].text)).toBe('SAVED EARLIER');
  await settled(page); await reloaded(page);
  expect(await page.evaluate(() => cornhole.design.a.elements[0].text)).toBe('SAVED EARLIER');
});
