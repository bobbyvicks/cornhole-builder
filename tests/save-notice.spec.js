import { test, expect } from '@playwright/test';
import { open, reset, settled, reloaded } from './helpers.js';

async function textTab(page) {
  await page.getByRole('tab', { name: 'Text', exact: true }).click();
  return page.locator('#texts .quick').first();
}

async function readableNotice(page, message) {
  const notice = page.locator('.stagebar .savestatus');
  await expect(notice).toBeVisible();
  await expect(notice).toContainText(message);
  // An asynchronous notice changes the pinned stage's height. Keyboard
  // scrolling must reserve that space before the next control gains focus.
  await expect.poll(() => page.evaluate(() => {
    const stage = document.querySelector('.stage');
    const reserved = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop);
    const covered = parseFloat(getComputedStyle(stage).top) + stage.offsetHeight;
    return reserved >= covered && reserved <= covered + 12;
  })).toBe(true);
  const bounds = await notice.boundingBox();
  expect(bounds.y).toBeGreaterThanOrEqual(60);
  expect(bounds.y + bounds.height).toBeLessThan(page.viewportSize().height);
  expect(await page.locator('.savestatus[role="status"]').count()).toBe(0);
  await expect(page.locator('#savealert[role="status"]')).toContainText(message);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize().width);
}

async function usableText(page, field, words) {
  await field.fill(words);
  await field.press('End');
  await field.press('!');
  await expect(field).toHaveValue(words + '!');
  await expect(field).toBeFocused();
  await field.evaluate(el => el.scrollIntoView({ block: 'nearest' }));
  expect(await field.evaluate(el => {
    const r = el.getBoundingClientRect();
    return r.top >= document.querySelector('.stage').getBoundingClientRect().bottom &&
      r.bottom <= innerHeight && document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === el;
  })).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize().width);
}

test('an empty recovery replaces its waiting announcement without announcing normal fresh loads', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await open(page);
  await expect(page.locator('#savealert')).toHaveText('');
  await page.addInitScript(() => {
    if (sessionStorage.getItem('emptyRecoveryDelayed')) return;
    sessionStorage.setItem('emptyRecoveryDelayed', 'yes');
    const gate = new Promise(resolve => { window.releaseEmptyRecovery = resolve; });
    const openDb = indexedDB.open.bind(indexedDB);
    indexedDB.open = (...args) => {
      const request = openDb(...args);
      request.addEventListener('success', event => {
        event.stopImmediatePropagation();
        gate.then(() => request.dispatchEvent(new Event('success')));
      }, { once: true });
      return request;
    };
  });
  await page.reload();
  await page.waitForFunction(() => window.cornhole && cornhole.saveState === 'waiting');
  await expect(page.locator('#savealert')).toContainText(/still checking/i);
  await page.evaluate(() => window.releaseEmptyRecovery());
  await page.waitForFunction(() => cornhole.saveState === 'new');
  await expect(page.locator('#savealert')).toContainText(/not saved yet/i);
  await expect(page.locator('.stagebar .savestatus')).toBeHidden();
  await expect(page.locator('#exportlink')).toBeHidden();
  expect(await page.evaluate(async () => (await import('/lib/store.mjs')).loadProject())).toBeNull();
  await reloaded(page);
  await expect(page.locator('#savealert')).toHaveText('');
});

test('the announcement region is outside the startup gate, so a notice written as the builder opens is announced', async ({ page }) => {
  await open(page); await reset(page); await settled(page);
  // An unreadable record whose read is held: its notice is written in the
  // same breath as the gate opens, so the region must already be exposed.
  await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('cornhole', 1);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('project', 'readwrite');
      tx.objectStore('project').put({ design: { a: null } }, 'current');
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
    db.close();
    localStorage.setItem('cornhole.project.v2', '{unfinished JSON');
  });
  await page.addInitScript(() => {
    if (sessionStorage.getItem('gatedNoticeReadDelayed')) return;
    sessionStorage.setItem('gatedNoticeReadDelayed', 'yes');
    const gate = new Promise(resolve => { window.releaseGatedNoticeRead = resolve; });
    const openDb = indexedDB.open.bind(indexedDB);
    indexedDB.open = (...args) => {
      const request = openDb(...args);
      request.addEventListener('success', event => {
        event.stopImmediatePropagation();
        window.gatedNoticeReadWaiting = true;
        gate.then(() => request.dispatchEvent(new Event('success')));
      }, { once: true });
      return request;
    };
  });
  await page.reload();
  await page.waitForFunction(() => window.cornhole && window.gatedNoticeReadWaiting && !cornhole.loaded);
  expect(await page.evaluate(() => ['.panel', '.stage', '#mobilebar'].every(s => document.querySelector(s).inert))).toBe(true);
  expect(await page.evaluate(() => document.getElementById('savealert').closest('[inert]')), 'the live region is in no inert region').toBeNull();
  const cdp = await page.context().newCDPSession(page);
  const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#savealert' });
  const { nodes } = await cdp.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false });
  const region = nodes.find(n => n.role && n.role.value === 'status');
  expect(region && !region.ignored, 'assistive technology sees the region before anything is written to it').toBe(true);
  await cdp.detach();
  await page.evaluate(() => window.releaseGatedNoticeRead());
  await page.waitForFunction(() => cornhole.loaded && cornhole.saveState === 'unreadable');
  await expect(page.locator('#savealert')).toContainText(/could not be read/i);
});

test('once a write has failed, the notice stays while each keystroke retries, so the field being typed in does not jump', async ({ page }) => {
  // A phone with its keyboard open: the stage sits in the flow, so a notice
  // that comes and goes above the field moves the field by its own height.
  await page.setViewportSize({ width: 375, height: 420 });
  await open(page); await reset(page); await settled(page);
  const field = await textTab(page);
  await field.click(); await field.press('End');
  await page.evaluate(() => {
    const transaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (store, mode, ...rest) {
      if (mode === 'readwrite') throw new DOMException('Quota full', 'QuotaExceededError');
      return transaction.call(this, store, mode, ...rest);
    };
    Storage.prototype.setItem = function () { throw new DOMException('Quota full', 'QuotaExceededError'); };
  });
  await field.press('A');
  await page.waitForFunction(() => cornhole.saveState === 'error');
  const notice = page.locator('.stagebar .savestatus');
  await expect(notice).toBeVisible();
  // The notice's arrival may push the field down once; the next key brings
  // it back into view. From then on it must stay where it is.
  await field.press('B');
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => cornhole.saveState)).toBe('error');
  const top = () => field.evaluate(el => Math.round(el.getBoundingClientRect().top));
  const before = await top();
  expect(before).toBeLessThan(420 - 20);
  for (const key of ['C', 'D']) {
    await field.press(key);
    // Right after the key, during the retry's debounce, and after it fails again.
    expect(await page.evaluate(() => cornhole.saveState)).toBe('error');
    expect(await top()).toBe(before);
    await expect(notice).toBeVisible();
    await expect(page.locator('#exportlink')).toBeVisible();
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => cornhole.saveState)).toBe('error');
    expect(await top()).toBe(before);
  }
  await expect(field).toHaveValue('HELLOABCD');
  await expect(field).toBeFocused();
  expect(await page.evaluate(() => cornhole.design.a.elements[0].text)).toBe('HELLOABCD');
  // The one notice was announced once; retries do not repeat it.
  await expect(page.locator('#savealert')).toContainText(/not saved/i);
});

for (const viewport of [{ width: 320, height: 740 }, { width: 375, height: 812 }]) {
  test.describe(`save notices at ${viewport.width}px`, () => {
    test.use({ viewport });

    test('failed writes visibly explain how to keep the unsaved text', async ({ page }) => {
      await open(page); await reset(page); await settled(page);
      const field = await textTab(page);
      await expect(page.locator('.stagebar .savestatus')).toBeHidden();
      await page.evaluate(() => {
        const transaction = IDBDatabase.prototype.transaction;
        IDBDatabase.prototype.transaction = function (store, mode, ...rest) {
          if (mode === 'readwrite') throw new DOMException('Quota full', 'QuotaExceededError');
          return transaction.call(this, store, mode, ...rest);
        };
        Storage.prototype.setItem = function () { throw new DOMException('Quota full', 'QuotaExceededError'); };
      });
      await field.fill('MY FAMILY WORDS');
      await page.waitForFunction(() => cornhole.saveState === 'error');
      await readableNotice(page, /not saved.*export/i);
      await usableText(page, field, 'KEEP EDITING');
      await page.waitForFunction(() => cornhole.saveState === 'error');
      await readableNotice(page, /not saved.*export/i);
      const download = page.waitForEvent('download');
      await page.locator('#exportlink').click();
      expect((await download).suggestedFilename()).toMatch(/^cornhole-project-.*\.json$/);
      const persisted = await page.evaluate(async () => {
        const { loadProject } = await import('/lib/store.mjs');
        return (await loadProject()).design.a.elements[0].text;
      });
      expect(persisted).toBe('HELLO');
      expect(await page.evaluate(() => cornhole.design.a.elements[0].text)).toBe('KEEP EDITING!');
    });

    test('a stalled recovery remains readable while typing and clears after saving', async ({ page }) => {
      await open(page); await reset(page); await settled(page);
      await page.addInitScript(() => {
        if (sessionStorage.getItem('saveNoticeReadDelayed')) return;
        sessionStorage.setItem('saveNoticeReadDelayed', 'yes');
        const gate = new Promise(resolve => { window.releaseSaveNoticeRead = resolve; });
        const openDb = indexedDB.open.bind(indexedDB);
        indexedDB.open = (...args) => {
          const request = openDb(...args);
          request.addEventListener('success', event => {
            event.stopImmediatePropagation();
            window.saveNoticeReadWaiting = true;
            gate.then(() => request.dispatchEvent(new Event('success')));
          }, { once: true });
          return request;
        };
      });
      await page.reload();
      await page.waitForFunction(() => window.cornhole && window.saveNoticeReadWaiting);
      const field = await textTab(page);
      await field.focus();
      await page.waitForFunction(() => cornhole.saveState === 'waiting');
      await readableNotice(page, /still checking.*export/i);
      await usableText(page, field, 'WHILE RECOVERING');
      await readableNotice(page, /still checking.*export/i);
      await page.evaluate(() => window.releaseSaveNoticeRead());
      await settled(page);
      await expect(page.locator('.stagebar .savestatus')).toBeHidden();
      await expect(page.locator('#savealert')).toContainText(/saved on this device/i);
      await reloaded(page);
      expect(await page.evaluate(() => cornhole.design.a.elements[0].text)).toBe('WHILE RECOVERING!');
    });

    test('an unreadable draft warns outside Start and a new edit can save', async ({ page }) => {
      await open(page); await reset(page); await settled(page);
      await page.evaluate(async () => {
        const db = await new Promise((resolve, reject) => {
          const request = indexedDB.open('cornhole', 1);
          request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
        });
        await new Promise((resolve, reject) => {
          const tx = db.transaction('project', 'readwrite');
          tx.objectStore('project').put({ design: { a: null } }, 'current');
          tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
        });
        db.close();
        localStorage.setItem('cornhole.project.v2', '{unfinished JSON');
      });
      await reloaded(page);
      const field = await textTab(page);
      await readableNotice(page, /saved project.*could not be read/i);
      await usableText(page, field, 'NEW WORDS');
      await settled(page);
      await expect(page.locator('.stagebar .savestatus')).toBeHidden();
      await reloaded(page);
      expect(await page.evaluate(() => cornhole.design.a.elements[0].text)).toBe('NEW WORDS!');
    });
  });
}
