import { test, expect } from '@playwright/test';
import { open, reset, settled, reloaded, clientPoint } from './helpers.js';

test.use({ viewport: { width: 375, height: 812 }, hasTouch: true });

test('a cancelled touch restores saved geometry and automatic fitting without adding an undo step', async ({ page }) => {
  const errors = await open(page); await reset(page); await settled(page);
  await page.addInitScript(() => {
    if (sessionStorage.getItem('gestureRecoveryDelayed')) return;
    sessionStorage.setItem('gestureRecoveryDelayed', 'yes');
    const gate = new Promise(resolve => { window.releaseGestureRecovery = resolve; });
    const openDb = indexedDB.open.bind(indexedDB);
    indexedDB.open = (...args) => {
      const request = openDb(...args);
      request.addEventListener('success', event => {
        event.stopImmediatePropagation(); window.gestureRecoveryWaiting = true;
        gate.then(() => request.dispatchEvent(new Event('success')));
      }, { once: true });
      return request;
    };
  });
  await page.reload();
  await page.waitForFunction(() => window.cornhole && window.gestureRecoveryWaiting && !cornhole.loaded);
  await page.getByRole('button', { name: 'Garden vows template', exact: true }).click();
  const before = await page.evaluate(() => {
    cornhole.paint();
    const element = cornhole.design.a.elements.find(e => e.id === cornhole.selected);
    return { element: structuredClone(element), centreY: element.y + cornhole.boxes.get(element.id).oy, history: cornhole.historyLength };
  });
  expect(before.element.autoFit).toBe(true);
  const cdp = await page.context().newCDPSession(page);
  const start = { id: 1, ...await clientPoint(page, 'a', before.element.x, before.centreY) };
  const moved = { id: 1, ...await clientPoint(page, 'a', before.element.x + 2, before.centreY + 2) };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [moved] });
  expect(await page.evaluate(id => cornhole.design.a.elements.find(e => e.id === id).autoFit, before.element.id)).toBe(false);
  // Recovery can finish and save the current edit while the finger is held.
  await page.evaluate(() => window.releaseGestureRecovery());
  await page.waitForFunction(() => cornhole.loaded && cornhole.saveState === 'saved');
  const savedDuringDrag = await page.evaluate(async id => {
    const project = await (await import('/lib/store.mjs')).loadProject();
    return project.design.a.elements.find(e => e.id === id);
  }, before.element.id);
  expect(savedDuringDrag.x).not.toBe(before.element.x);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await settled(page);
  expect(await page.evaluate(id => cornhole.design.a.elements.find(e => e.id === id), before.element.id)).toEqual(before.element);
  expect(await page.evaluate(() => cornhole.historyLength)).toBe(before.history);
  const saved = await page.evaluate(async id => {
    const project = await (await import('/lib/store.mjs')).loadProject();
    return project.design.a.elements.find(e => e.id === id);
  }, before.element.id);
  expect(saved).toEqual(before.element);
  await reloaded(page);
  expect(await page.evaluate(id => cornhole.design.a.elements.find(e => e.id === id), before.element.id)).toEqual(before.element);
  expect(errors).toEqual([]);
  await cdp.detach();
});
