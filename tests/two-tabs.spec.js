import { test, expect } from '@playwright/test';
import { open, reset, settled } from './helpers.js';

/* Two tabs of one browser share one saved project (the same IndexedDB)
   and one BroadcastChannel. The last save wins; these specs check that the
   tab whose screen is out of date says so, once, and that Reload or its
   own next change puts it right. */

const NOTICE = /changed in another tab.*reload to see the latest.*next change here replaces it/i;
const stored = (page) => page.evaluate(async () => (await import('/lib/store.mjs')).loadProject());
const words = (page) => page.evaluate(() => cornhole.design.a.elements.find((el) => el.type === 'text').text);
const token = (page) => page.evaluate(() => sessionStorage.getItem('cornhole.tab'));
const state = (page) => page.evaluate(() => cornhole.saveState);

async function edit(page, text) {
  await page.getByRole('tab', { name: 'Text', exact: true }).click();
  const field = page.locator('#texts .quick').first();
  await field.fill(text); await field.press('Tab');
  await settled(page);
}
/* The first page saves a known design; the second opens on it. */
async function twoTabs(page, context) {
  await open(page); await reset(page); await settled(page);
  const other = await context.newPage(); await open(other);
  expect(await words(other)).toBe('HELLO');
  expect(await state(other)).toBe('saved');
  return other;
}
/* Every text written to a page's announcement region from now on. */
const watchAnnouncements = (page) => page.evaluate(() => {
  window.announced = [];
  const region = document.getElementById('savealert');
  new MutationObserver((records) => {
    for (const r of records) for (const n of r.addedNodes) window.announced.push(n.textContent);
  }).observe(region, { childList: true, characterData: true, subtree: true });
});
/* Every note on the tabs' channel that reaches this page from now on. */
const listen = (page) => page.evaluate(() => {
  window.heard = [];
  new BroadcastChannel('cornhole.project').onmessage = (e) => window.heard.push(e.data);
});
async function reloadWith(page, act) {
  await Promise.all([page.waitForEvent('load'), act()]);
  await page.waitForFunction(() => window.cornhole && cornhole.loaded);
}

test('a save in another tab is announced once here, the screen is left alone, and Reload shows it', async ({ page, context }) => {
  const other = await twoTabs(page, context);
  const reload = page.getByRole('button', { name: 'Reload', exact: true });
  await expect(reload).toBeHidden();
  await watchAnnouncements(page); await listen(page);

  await edit(other, 'FROM THE OTHER TAB');
  await page.waitForFunction(() => cornhole.saveState === 'elsewhere');
  await expect(page.locator('.stagebar .savestatus')).toHaveText(NOTICE);
  await expect(page.locator('#project .savestatus')).toHaveText(NOTICE);
  await expect(page.locator('#savealert')).toHaveText(NOTICE);
  await expect(reload).toBeVisible();

  // The other tab carries on; this one has said its piece.
  await edit(other, 'AND AGAIN'); await edit(other, 'AND ONCE MORE');
  const latest = await stored(page);
  await page.waitForFunction((at) => window.heard.some((note) => note.savedAt === at), latest.savedAt);
  const heard = await page.evaluate(() => window.heard), otherTab = await token(other);
  expect(otherTab).toMatch(/^[0-9a-f]{16}$/);
  expect(otherTab).not.toBe(await token(page));
  expect(heard.length).toBeGreaterThanOrEqual(3);
  for (const note of heard) expect(Object.keys(note).sort()).toEqual(['savedAt', 'tab']);
  expect(heard.every((note) => note.tab === otherTab)).toBe(true);
  expect(latest.tab, 'the saved record names the tab that wrote it').toBe(otherTab);
  expect(latest.design.a.elements[0].text).toBe('AND ONCE MORE');
  expect(await page.evaluate(() => window.announced), 'announced once').toEqual([await page.evaluate(() => cornhole.SAVE_TEXT.elsewhere)]);
  expect(await state(page)).toBe('elsewhere');
  expect(await words(page), 'nothing is merged into the screen').toBe('HELLO');
  expect(await stored(page), 'hearing of it writes nothing').toEqual(latest);

  await reloadWith(page, () => reload.click());
  expect(await words(page)).toBe('AND ONCE MORE');
  expect(await state(page)).toBe('saved');
  await expect(page.locator('.stagebar .savestatus')).toHaveText('Saved on this device');
  await expect(page.getByRole('button', { name: 'Reload', exact: true })).toBeHidden();
  await expect(page.locator('#savealert'), 'an ordinary load announces nothing').toHaveText('');
  expect(await token(page), 'each load has a token of its own').not.toBe(await token(other));
  await other.close();
});

test('a change in the out-of-date tab replaces the other save, puts the status back, and the other tab is told', async ({ page, context }) => {
  const other = await twoTabs(page, context);
  await edit(other, 'FROM THE OTHER TAB');
  await page.waitForFunction(() => cornhole.saveState === 'elsewhere');
  const theirs = await stored(page);

  // Looking around in the out-of-date tab writes nothing and keeps the notice.
  for (const name of ['Art', 'Board', 'Order', 'Start']) await page.getByRole('tab', { name, exact: true }).click();
  await page.waitForTimeout(600);
  expect(await state(page)).toBe('elsewhere');
  expect(await stored(page)).toEqual(theirs);

  await watchAnnouncements(other);
  await edit(page, 'FROM THIS TAB');
  await expect(page.locator('.stagebar .savestatus')).toHaveText('Saved on this device');
  await expect(page.locator('#savealert')).toHaveText('Saved on this device');
  await expect(page.getByRole('button', { name: 'Reload', exact: true })).toBeHidden();
  const ours = await stored(page);
  expect(ours.tab).toBe(await token(page));
  expect(ours.design.a.elements[0].text, 'the last save wins').toBe('FROM THIS TAB');

  await other.waitForFunction(() => cornhole.saveState === 'elsewhere');
  await expect(other.locator('.stagebar .savestatus')).toHaveText(NOTICE);
  await expect(other.getByRole('button', { name: 'Reload', exact: true })).toBeVisible();
  expect(await other.evaluate(() => window.announced)).toEqual([await other.evaluate(() => cornhole.SAVE_TEXT.elsewhere)]);
  expect(await words(other)).toBe('FROM THE OTHER TAB');
  expect(await state(page), 'the tab that saved last is not told of its own save').toBe('saved');

  // And back again: the tab that saved last is the one told.
  await edit(other, 'THE OTHER TAB AGAIN');
  await page.waitForFunction(() => cornhole.saveState === 'elsewhere');
  expect(await state(other)).toBe('saved');
  await reloadWith(page, () => page.getByRole('button', { name: 'Reload', exact: true }).click());
  expect(await words(page)).toBe('THE OTHER TAB AGAIN');
  await other.close();
});

test('a browser without BroadcastChannel hears of the other tab through the storage event', async ({ page, context }) => {
  await context.addInitScript(() => { delete window.BroadcastChannel; });
  const other = await twoTabs(page, context);
  expect(await page.evaluate(() => typeof BroadcastChannel)).toBe('undefined');
  await edit(other, 'FROM THE OTHER TAB');
  await page.waitForFunction(() => cornhole.saveState === 'elsewhere');
  await expect(page.locator('#savealert')).toHaveText(NOTICE);
  const note = JSON.parse(await other.evaluate(() => localStorage.getItem('cornhole.saved')));
  expect(note).toEqual({ tab: await token(other), savedAt: (await stored(other)).savedAt });
  expect(await state(other), 'a tab is not told of its own save').toBe('saved');

  await edit(page, 'FROM THIS TAB');
  await other.waitForFunction(() => cornhole.saveState === 'elsewhere');
  expect(await state(page)).toBe('saved');
  await other.close();
});

test('a page back from the back-forward cache checks who saved last', async ({ page }) => {
  await open(page); await reset(page); await settled(page);
  const backFromCache = () => page.evaluate(async () => {
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    await (await import('/lib/store.mjs')).loadProject();
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
  await backFromCache();
  expect(await state(page), 'its own save is not news').toBe('saved');

  await page.evaluate(async () => {
    const { loadProject, saveProject } = await import('/lib/store.mjs');
    const p = await loadProject();
    p.tab = 'a-tab-that-saved-while-this-one-was-away';
    p.savedAt = new Date(Date.parse(p.savedAt) + 1000).toISOString();
    p.design.a.elements[0].text = 'WRITTEN WHILE AWAY';
    await saveProject(p);
  });
  await backFromCache();
  await page.waitForFunction(() => cornhole.saveState === 'elsewhere');
  await expect(page.locator('#savealert')).toHaveText(NOTICE);
  await reloadWith(page, () => page.getByRole('button', { name: 'Reload', exact: true }).click());
  expect(await words(page)).toBe('WRITTEN WHILE AWAY');
});

for (const width of [320, 375, 390]) test.describe(`the other-tab notice at ${width}px`, () => {
  test.use({ viewport: { width, height: 740 } });

  test('shows in the pinned toolbar with a finger-sized Reload that works from the keyboard, and nothing overflows', async ({ page, context }) => {
    const other = await twoTabs(page, context);
    await page.getByRole('tab', { name: 'Text', exact: true }).click();
    await edit(other, 'FROM THE OTHER TAB');
    await page.waitForFunction(() => cornhole.saveState === 'elsewhere');
    const notice = page.locator('.stagebar .savestatus');
    await expect(notice).toBeVisible();
    await expect(notice).toHaveText(NOTICE);
    const reload = page.getByRole('button', { name: 'Reload', exact: true });
    await expect(reload).toBeVisible();
    const box = await reload.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    // The taller toolbar is reserved for, so a focused control is not under it.
    await expect.poll(() => page.evaluate(() => {
      const stage = document.querySelector('.stage');
      const reserved = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop);
      return reserved >= parseFloat(getComputedStyle(stage).top) + stage.offsetHeight;
    })).toBe(true);

    // On a phone the toolbar shows exactly the notice states, this one included.
    const shown = await page.evaluate(() => {
      const el = document.querySelector('.stagebar .savestatus'), was = el.dataset.state, out = {};
      for (const s of Object.keys(cornhole.SAVE_TEXT)) { el.dataset.state = s; out[s] = getComputedStyle(el).display !== 'none'; }
      el.dataset.state = was;
      return out;
    });
    const notices = await page.evaluate(() => cornhole.NOTICE_STATES);
    expect(notices).toContain('elsewhere');
    expect(shown).toEqual(Object.fromEntries(Object.keys(shown).map((s) => [s, notices.includes(s)])));

    await reload.focus();
    await reloadWith(page, () => page.keyboard.press('Enter'));
    expect(await words(page)).toBe('FROM THE OTHER TAB');
    await expect(page.locator('.stagebar .savestatus')).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await other.close();
  });
});

/* Where the toolbar under the boards can be out of view while someone
   edits - a wide screen at the top of the page, where the stage runs
   below the fold, or a phone so short that its board scrolls away - the
   notice and Reload sit in a line under the tabs that stays in view. */
const inView = (locator) => locator.evaluate((el) => {
  const r = el.getBoundingClientRect(), header = document.querySelector('header.top').getBoundingClientRect().bottom;
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return r.height > 0 && r.top >= header - 0.5 && r.bottom <= innerHeight + 0.5 && Boolean(hit) && (hit === el || el.contains(hit));
});
for (const viewport of [{ width: 1280, height: 900 }, { width: 320, height: 568 }, { width: 375, height: 420 }]) test.describe(`the other-tab notice at ${viewport.width} x ${viewport.height}`, () => {
  test.use({ viewport });

  test('stays in view with its Reload beside it on every tab while a field is being used, and nothing overflows', async ({ page, context }) => {
    const other = await twoTabs(page, context);
    await edit(other, 'FROM THE OTHER TAB');
    await page.waitForFunction(() => cornhole.saveState === 'elsewhere');
    const notice = page.locator('#tabnotice .savestatus');
    const reload = page.getByRole('button', { name: 'Reload', exact: true });
    await expect(reload, 'one Reload, the one beside the notice').toHaveCount(1);
    await expect(page.locator('#tabnotice')).toContainText(NOTICE);
    await expect(page.locator('#tabnotice').getByRole('button', { name: 'Reload', exact: true })).toBeVisible();
    await expect(page.locator('.stagebar .savestatus'), 'the toolbar leaves that notice to the line').toBeHidden();
    await expect(page.locator('#project .savestatus'), 'and so does the Start pane').toBeHidden();

    for (const name of ['Text', 'Board', 'Art', 'Order', 'Start']) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.getByRole('tab', { name, exact: true }).click();
      const field = page.locator('.pane[data-open="true"]').locator('input:not([type=file]):not([type=checkbox]):not([type=color]):not([type=range]), select, textarea').filter({ visible: true }).first();
      await field.focus();
      await page.waitForTimeout(100);
      expect(await inView(notice), name + ': the notice is in view').toBe(true);
      expect(await inView(reload), name + ': Reload is in view').toBe(true);
      const covered = await page.locator('#tabnotice').evaluate((el) => el.getBoundingClientRect().bottom);
      expect(await field.evaluate((el) => el.getBoundingClientRect().top), name + ': the field is not under it').toBeGreaterThanOrEqual(covered - 0.5);
      // And with the foot of the pane at the foot of the screen.
      await page.locator('.pane[data-open="true"]').evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().bottom + scrollY - innerHeight));
      await page.waitForTimeout(100);
      expect(await inView(notice), name + ': still in view at the foot of the pane').toBe(true);
      expect(await inView(reload)).toBe(true);
    }
    const box = await reload.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);

    await reload.focus();
    await reloadWith(page, () => page.keyboard.press('Enter'));
    expect(await words(page)).toBe('FROM THE OTHER TAB');
    await expect(page.locator('#tabnotice')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Reload', exact: true })).toHaveCount(0);
    await other.close();
  });
});
