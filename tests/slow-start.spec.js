import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { open, settled } from './helpers.js';

/* A slow phone. On a weak signal the page's markup is on screen for
   seconds before app.mjs has run, so three things matter here.
   The modules in ui/ and lib/ are asked for alongside app.mjs (the head
   lists them all), instead of only once app.mjs has arrived and been read.
   Until the script runs, the markup claims nothing: no $0.00 total, no
   "Not saved yet" to a customer whose design is saved, no Undo or Redo
   that looks ready, and one board, as a phone shows once it has run.
   And with photos on the board a template tap asks its question at once:
   telling an untouched design from someone's work no longer writes the
   photos out for every template. */

/* The modules app.mjs reaches, read from the import lines of each file in
   turn, as paths from the site's root. */
function modulesOf(entry) {
  const seen = new Set([entry]), queue = [entry];
  while (queue.length) {
    const file = queue.shift(), dir = file.includes('/') ? file.slice(0, file.lastIndexOf('/') + 1) : '';
    for (const m of readFileSync(new URL('../' + file, import.meta.url), 'utf8').matchAll(/^import\s[^;]*?\sfrom\s*'(\.{1,2}\/[^']+)'/gm)) {
      const path = new URL(m[1], 'http://site/' + dir).pathname.slice(1);
      if (!seen.has(path)) { seen.add(path); queue.push(path); }
    }
  }
  seen.delete(entry);
  return [...seen];
}
const LIB = modulesOf('app.mjs');
const phone = { viewport: { width: 375, height: 812 }, hasTouch: true };

/* The page loaded with app.mjs held on its way, the way a slow
   connection holds it, until the spec lets it go. The web fonts are
   answered empty, as in open(). */
async function holdApp(page) {
  const requested = new Set();
  page.on('request', (r) => { const u = new URL(r.url()); if (u.hostname === '127.0.0.1') requested.add(u.pathname.slice(1)); });
  await page.route('**/fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('**/fonts.gstatic.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  await page.route('**/app.mjs', async (route) => { await held; await route.continue(); });
  return { requested, release: () => release() };
}
const loaded = (page) => page.waitForFunction(() => window.cornhole && window.cornhole.loaded);
const visibleBoards = (page) => page.locator('.board canvas').evaluateAll((cs) => cs.filter((c) => c.getBoundingClientRect().width > 0).length);

/* While app.mjs is held: every module is on its way, and the page says
   nothing that is not true yet. */
async function expectNeutral(page, requested) {
  expect(LIB.length, 'the import lines were read').toBeGreaterThanOrEqual(17);
  await expect.poll(() => LIB.filter((m) => !requested.has(m)), { message: 'every module was asked for while app.mjs was held' }).toEqual([]);
  expect(requested.has('app.mjs')).toBe(true);
  expect(await page.evaluate(() => typeof window.cornhole), 'the script has not run').toBe('undefined');
  await expect(page.locator('#headtotal')).toHaveText('');
  await expect(page.locator('#mobiletotal')).toHaveText('');
  await expect(page.locator('#headtotal')).toBeHidden();
  const statuses = page.locator('.savestatus');
  await expect(statuses).toHaveCount(3);
  for (const s of await statuses.all()) await expect(s).toHaveText('');
  await expect(page.locator('#undo')).toBeDisabled();
  await expect(page.locator('#redo')).toBeDisabled();
}

test.describe('a slow phone', () => {
  test.use(phone);

  test('a first visit: the modules come with app.mjs, and the page claims no total, save or Undo until it runs', async ({ page }) => {
    const { requested, release } = await holdApp(page);
    await page.goto('/index.html', { waitUntil: 'commit' });
    await page.locator('#mobilebar').waitFor({ state: 'attached' });
    await expectNeutral(page, requested);
    expect(await visibleBoards(page), 'one board, as the phone shows once the script has run').toBe(1);
    await page.waitForTimeout(1500);
    const before = await page.locator('#startblank').boundingBox();

    release();
    await loaded(page);
    const total = await page.evaluate(async () => { const { quote, money } = await import('/lib/price.mjs'); return money(quote(cornhole.order).total); });
    expect(total).not.toBe('$0.00');
    await expect(page.locator('#headtotal')).toHaveText(total);
    await expect(page.locator('#mobiletotal')).toHaveText(total);
    await expect(page.locator('.project .savestatus')).toHaveText('Not saved yet');
    await expect(page.locator('.project .savestatus')).toBeVisible();
    for (const s of await page.locator('.savestatus').all()) await expect(s).toHaveText('Not saved yet');
    expect(await page.evaluate(() => cornhole.saveState)).toBe('new');
    expect(await visibleBoards(page)).toBe(1);
    expect((await page.locator('#startblank').boundingBox()).y, 'nothing above the Start pane moved when the script ran').toBeCloseTo(before.y, 0);

    // Undo is off until there is something to undo, and then it works.
    await expect(page.locator('#undo')).toBeDisabled();
    await page.locator('#templates .tpl[data-id="wedding"]').tap();
    await expect(page.locator('#undo')).toBeEnabled();
    await page.locator('#undo').tap();
    expect(await page.evaluate(() => cornhole.design.a.elements.map((e) => e.text))).toEqual(['YOUR TEAM']);
    await expect(page.locator('#undo')).toBeDisabled();
    await expect(page.locator('#redo')).toBeEnabled();
  });

  test('a return visit: the saved design is not called unsaved while the page loads', async ({ page }) => {
    await open(page);
    await page.evaluate(() => cornhole.applyTemplate('wedding'));
    await settled(page);
    const { requested, release } = await holdApp(page);
    await page.reload({ waitUntil: 'commit' });
    await page.locator('#mobilebar').waitFor({ state: 'attached' });
    await expectNeutral(page, requested);
    release();
    await loaded(page);
    for (const s of await page.locator('.savestatus').all()) await expect(s).toHaveText('Saved on this device');
    expect(await page.evaluate(() => cornhole.design.a.elements.some((e) => e.text === 'SMITH'))).toBe(true);
    await expect(page.locator('#mobiletotal')).not.toHaveText('');
  });
});

/* Four 4000 x 3000 photos, each with its master, the way the uploader
   keeps a phone photo. */
async function fourPhotos(page) {
  await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 4000; c.height = 3000;
    const g = c.getContext('2d'); let seed = 7;
    for (let y = 0; y < c.height; y += 20) for (let x = 0; x < c.width; x += 20) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      g.fillStyle = '#' + (seed >>> 8).toString(16).padStart(6, '0'); g.fillRect(x, y, 20, 20);
    }
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
    const files = new DataTransfer(); files.items.add(new File([blob], 'photo.jpg', { type: 'image/jpeg' }));
    const picker = document.getElementById('addimage'); picker.files = files.files;
    picker.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForFunction(() => cornhole.design.a.elements.some((e) => e.type === 'image'));
  return page.evaluate(() => {
    const photo = cornhole.design.a.elements.find((e) => e.type === 'image');
    const d = structuredClone(cornhole.design);
    d.a.elements = [...d.a.elements.filter((e) => e.type !== 'image'), ...[0, 1, 2, 3].map((i) => ({ ...photo, id: 'photo-' + i, width: 10, x: 7 + 10 * (i % 2), y: 14 + 22 * Math.floor(i / 2) }))];
    cornhole.setDesign(d);
    return { px: photo.px, chars: JSON.stringify(cornhole.design.a).length };
  });
}
const timedPristine = (page) => page.evaluate(() => { const t = performance.now(); const pristine = cornhole.isPristine(); return { pristine, ms: performance.now() - t }; });

test('with four 4000 px photos on the board, telling it from an untouched one takes no time, and a template tap still asks', async ({ page }) => {
  test.setTimeout(60_000);
  await open(page);
  await page.evaluate(() => cornhole.applyTemplate('wedding'));
  const { px, chars } = await fourPhotos(page);
  expect(px[0], 'the photo kept its 4000 px master').toBe(4000);
  expect(chars, 'the board holds the four photos').toBeGreaterThan(4 * 1_000_000);
  const { pristine, ms } = await timedPristine(page);
  expect(pristine).toBe(false);
  expect(ms).toBeLessThan(100);

  let asked = 0;
  page.on('dialog', (d) => { asked++; d.dismiss(); });
  await page.evaluate(() => cornhole.showTab('templates'));
  await page.click('#templates .tpl[data-id="monogram"]');
  await expect.poll(() => asked, { message: 'the template tap asked' }).toBe(1);
  expect(await page.evaluate(() => cornhole.design.a.elements.filter((e) => e.type === 'image').length), 'and no kept the photos').toBe(4);
  await page.click('#startblank');
  await expect.poll(() => asked).toBe(2);
  expect(await page.evaluate(() => cornhole.design.a.elements.filter((e) => e.type === 'image').length)).toBe(4);
});

test('an untouched template, the default board and a blank board are still untouched, and a tap replaces them without asking', async ({ page }) => {
  await open(page);
  let asked = 0;
  page.on('dialog', (d) => { asked++; d.dismiss(); });
  expect((await timedPristine(page)).pristine, 'the default board').toBe(true);
  for (const id of ['wedding', 'monogram', 'team', 'garden']) {
    await page.evaluate(() => cornhole.showTab('templates'));
    await page.click('#templates .tpl[data-id="' + id + '"]');
    await expect.poll(() => page.evaluate(() => cornhole.design.a.elements.filter((e) => e.type === 'text').map((e) => e.text).join(' / ')))
      .toBe(await page.evaluate((id) => cornhole.TEMPLATES.find((t) => t.id === id).board().elements.filter((e) => e.type === 'text').map((e) => e.text).join(' / '), id));
    expect((await timedPristine(page)).pristine, id + ' as it came').toBe(true);
  }
  await page.evaluate(() => cornhole.showTab('templates'));
  await page.click('#startblank');
  await expect.poll(() => page.evaluate(() => cornhole.design.a.elements.length)).toBe(0);
  expect((await timedPristine(page)).pristine, 'a blank board').toBe(true);
  expect(asked, 'nothing asked').toBe(0);

  // A word changed is someone's work, and so are two different boards.
  await page.evaluate(() => cornhole.showTab('templates'));
  await page.click('#templates .tpl[data-id="wedding"]');
  await page.evaluate(() => { cornhole.activeBoard().elements[0].text = 'Sam & Alex'; cornhole.commit(); });
  expect((await timedPristine(page)).pristine).toBe(false);
  await page.evaluate(() => cornhole.applyTemplate('wedding'));
  expect((await timedPristine(page)).pristine).toBe(true);
  await page.evaluate(() => { const d = structuredClone(cornhole.design); d.same = false; cornhole.setDesign(d); });
  expect((await timedPristine(page)).pristine).toBe(false);
});
