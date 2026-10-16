import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { open, reset, settled, reloaded, clientPoint, bounds, WHITE } from './helpers.js';

/* Words on more than one line: a name over a date. A line break in the
   words starts a new line on the board, each line centred, the lines
   1.15 x the size apart and the block centred on the words' position. */

/* The rows of Board A that hold white ink, gathered into bands - one band
   for each line of the white words - in inches, with each band's left and
   right edges. The selection outline is taken down for the read. */
const inkBands = (page) => page.evaluate(() => {
  const prev = cornhole.selected; if (prev) cornhole.select(null); cornhole.paint();
  const c = document.getElementById('canvasA'), W = c.width, H = c.height, ppi = W / 24;
  const d = c.getContext('2d').getImageData(0, 0, W, H).data;
  const bands = [];
  let band = null;
  for (let y = 0; y < H; y++) {
    let x0 = -1, x1 = -1;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (d[i] === 255 && d[i + 1] === 255 && d[i + 2] === 255 && d[i + 3] === 255) { if (x0 < 0) x0 = x; x1 = x; }
    }
    if (x0 >= 0) {
      if (!band) { band = { y0: y / ppi, x0: x0 / ppi, x1: x1 / ppi }; bands.push(band); }
      band.y1 = (y + 1) / ppi; band.x0 = Math.min(band.x0, x0 / ppi); band.x1 = Math.max(band.x1, (x1 + 1) / ppi);
    } else band = null;
  }
  if (prev) { cornhole.select(prev); cornhole.paint(); }
  return bands;
});
const middle = (band) => (band.y0 + band.y1) / 2;
const words = (page) => page.evaluate(() => cornhole.design.a.elements.find((e) => e.id === 't1').text);

async function textTab(page) {
  await page.evaluate(() => { cornhole.showTab('text'); cornhole.select('t1'); });
}

test('Enter in a words field starts a second line, painted as its own band of ink below the first', async ({ page }) => {
  await open(page); await reset(page); await textTab(page);
  expect(await inkBands(page), 'one line of words is one band').toHaveLength(1);
  const row = page.locator('#texts textarea.quick');
  await row.focus();
  await row.press('End');
  await row.press('Enter');
  await row.pressSequentially('2028');
  expect(await words(page)).toBe('HELLO\n2028');
  await expect(row, 'the row stays in the field it was typed in').toBeFocused();
  await expect(row).toHaveJSProperty('rows', 2);
  await expect(page.locator('#ttext')).toHaveValue('HELLO\n2028');

  const bands = await inkBands(page);
  expect(bands, 'two lines are two bands').toHaveLength(2);
  const [first, second] = bands;
  expect(second.y0 - first.y1, 'with clear board between them').toBeGreaterThan(0.4);
  expect(middle(second) - middle(first), 'the lines sit 1.15 x the 4" size apart').toBeCloseTo(4.6, 0);
  expect((first.y0 + second.y1) / 2, 'the block is centred on the words\' position, 30" down').toBeCloseTo(30, 0);
  for (const band of bands) expect((band.x0 + band.x1) / 2, 'each line is centred across the board').toBeCloseTo(12, 0);
  expect(second.x1 - second.x0, 'each line is as wide as its own words').toBeLessThan(first.x1 - first.x0);

  /* The selected words field takes a line break as well. */
  await page.locator('#ttext').focus();
  await page.locator('#ttext').press('Control+End');
  await page.locator('#ttext').press('Enter');
  await page.locator('#ttext').pressSequentially('USA');
  expect(await words(page)).toBe('HELLO\n2028\nUSA');
  expect(await inkBands(page)).toHaveLength(3);
});

test('when the list is rebuilt under a two-line field, the focus and the caret on its second line come back', async ({ page }) => {
  await open(page); await reset(page);
  await page.evaluate(() => {
    const d = structuredClone(cornhole.design);
    d.a.elements.push({ ...d.a.elements[0], id: 't2', text: 'SECOND', y: 40 });
    cornhole.setDesign(d); cornhole.showTab('text');
  });
  const row = page.locator('#texts textarea.quick[data-id="t1"]');
  await row.fill('HELLO\nWORLD');
  await row.evaluate((el) => el.setSelectionRange(8, 8));
  /* The words change places: the rows are built again. */
  const after = await page.evaluate(() => {
    const els = cornhole.activeBoard().elements; els.reverse(); cornhole.select(cornhole.selected);
    const a = document.activeElement;
    return { id: a.dataset.id, quick: a.classList.contains('quick'), start: a.selectionStart, end: a.selectionEnd, value: a.value, first: document.querySelector('#texts .quick').dataset.id };
  });
  expect(after.first, 'the list was rebuilt in the new order').toBe('t2');
  expect(after).toMatchObject({ id: 't1', quick: true, start: 8, end: 8, value: 'HELLO\nWORLD' });
  await page.keyboard.type('!');
  expect(await page.evaluate(() => cornhole.design.a.elements.find((e) => e.id === 't1').text), 'typing goes on where it was').toBe('HELLO\nWO!RLD');
});

test('the box around two lines covers both: either line picks the words up, and the handles sit outside them', async ({ page }) => {
  await open(page); await reset(page); await textTab(page);
  await page.locator('#ttext').fill('HELLO\nWORLD');
  const bands = await inkBands(page);
  expect(bands).toHaveLength(2);
  const box = await page.evaluate(() => cornhole.boxes.get('t1'));
  expect(box.h, 'at least two lines of 1.15 x 4"').toBeGreaterThanOrEqual(2 * 1.15 * 4 - 1e-9);
  const top = 30 + box.oy - box.h / 2, bottom = 30 + box.oy + box.h / 2;
  expect(top).toBeLessThanOrEqual(bands[0].y0);
  expect(bottom).toBeGreaterThanOrEqual(bands[1].y1);
  const handles = await page.evaluate(() => cornhole.handlePoints('t1'));
  expect(handles.resize.y, 'the resize handle is below the second line').toBeGreaterThan(bands[1].y1);
  expect(handles.delete.y, 'the remove handle is above the first line').toBeLessThan(bands[0].y0);

  for (const band of bands) {
    await page.evaluate(() => { cornhole.select(null); cornhole.paint(); });
    const p = await clientPoint(page, 'a', 12, middle(band));
    await page.mouse.click(p.x, p.y);
    expect(await page.evaluate(() => cornhole.selected), 'a click on either line picks the words up').toBe('t1');
  }
  await page.evaluate(() => { cornhole.select(null); cornhole.paint(); });
  const below = await clientPoint(page, 'a', 12, bottom + 1.5);
  await page.mouse.click(below.x, below.y);
  expect(await page.evaluate(() => cornhole.selected), 'the board below the words is not the words').toBe(null);
  expect(await page.evaluate(() => cornhole.design.a.elements[0].y), 'nothing moved').toBe(30);

  /* Curved and spaced, every line bends; the box still holds all the ink. */
  for (const [arc, spacing] of [[90, 0], [-120, 0.3], [0, 0.4]]) {
    await page.evaluate(([arc, spacing]) => { const e = cornhole.design.a.elements[0]; e.arc = arc; e.spacing = spacing; cornhole.paint(); }, [arc, spacing]);
    const curved = await page.evaluate(() => cornhole.boxes.get('t1'));
    const ink = await bounds(page, 'a', WHITE);
    const pad = 0.06;
    expect(ink.y0, 'curve ' + arc + ': top of the ink inside the box').toBeGreaterThanOrEqual(30 + curved.oy - curved.h / 2 - pad);
    expect(ink.y1, 'curve ' + arc + ': bottom of the ink inside the box').toBeLessThanOrEqual(30 + curved.oy + curved.h / 2 + pad);
    expect(ink.x0, 'curve ' + arc + ': left of the ink inside the box').toBeGreaterThanOrEqual(12 - curved.w / 2 - pad);
    expect(ink.x1, 'curve ' + arc + ': right of the ink inside the box').toBeLessThanOrEqual(12 + curved.w / 2 + pad);
    expect(curved.h).toBeGreaterThanOrEqual(2 * 1.15 * 4 - 1e-9);
  }
});

test('a line break survives a reload, undo and redo, and a saved copy opened again', async ({ page }) => {
  await open(page); await reset(page); await textTab(page);
  await page.locator('#ttext').fill('THE SMITHS\nEST. 2020');
  await page.locator('#ttext').blur();
  await settled(page);
  await reloaded(page);
  expect(await words(page)).toBe('THE SMITHS\nEST. 2020');
  await textTab(page);
  await expect(page.locator('#ttext')).toHaveValue('THE SMITHS\nEST. 2020');
  await expect(page.locator('#texts textarea.quick')).toHaveValue('THE SMITHS\nEST. 2020');
  await expect(page.locator('#texts textarea.quick'), 'the row shows both lines').toHaveJSProperty('rows', 2);
  expect(await inkBands(page)).toHaveLength(2);

  await page.locator('#ttext').fill('ONE LINE');
  await page.locator('#ttext').blur();
  await page.evaluate(() => cornhole.undo());
  expect(await words(page), 'undo brings both lines back').toBe('THE SMITHS\nEST. 2020');
  await page.evaluate(() => cornhole.redo());
  expect(await words(page)).toBe('ONE LINE');
  await page.evaluate(() => cornhole.undo());
  await expect(page.locator('#texts textarea.quick')).toHaveValue('THE SMITHS\nEST. 2020');

  await page.evaluate(() => cornhole.showTab('templates'));
  const download = page.waitForEvent('download');
  await page.click('#exportbtn');
  const file = JSON.parse(readFileSync(await (await download).path(), 'utf8'));
  expect(file.design.a.elements[0].text, 'the saved copy keeps the line break').toBe('THE SMITHS\nEST. 2020');
  await page.evaluate(() => { cornhole.design.a.elements[0].text = 'SOMETHING ELSE'; cornhole.commit(); });
  page.on('dialog', (dialog) => dialog.accept());
  await page.setInputFiles('#importfile', { name: 'project.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
  await expect.poll(() => words(page), { message: 'the opened copy has both lines' }).toBe('THE SMITHS\nEST. 2020');
});

test('the order sends the line break, and sample words broken over two lines are still caught', async ({ page }) => {
  await open(page);
  /* The page's own default words, only broken onto two lines. */
  await page.evaluate(() => { cornhole.showTab('text'); cornhole.select(cornhole.activeBoard().elements[0].id); });
  await page.locator('#ttext').fill('YOUR\nTEAM');
  expect(await page.evaluate(() => cornhole.sampleWordsIn())).toEqual(['YOUR\nTEAM']);
  await page.locator('#ttext').fill('THE SMITHS\nEST. 2020');
  expect(await page.evaluate(() => cornhole.sampleWordsIn())).toEqual([]);

  await page.getByRole('tab', { name: 'Order', exact: true }).click();
  await page.click('#toreview');
  await expect(page.locator('#samplewarn')).toBeHidden();
  await page.click('#tocheckout');
  await page.fill('#name', 'Pat Example');
  await page.fill('#email', 'pat@example.com');
  await page.fill('#line1', '1 Main St');
  await page.fill('#city', 'Austin');
  await page.selectOption('#state', 'TX');
  await page.fill('#postal', '78701');
  let posted = null;
  await page.route('**/api/order', (route) => {
    posted = route.request().postDataJSON();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 'CH-TWOLNS', total: 30800 }) });
  });
  await page.click('#checkout');
  await expect(page.locator('#orderstatus')).toContainText('CH-TWOLNS');
  expect(posted.design.a.elements.filter((e) => e.type === 'text').map((e) => e.text)).toEqual(['THE SMITHS\nEST. 2020']);
});

test('a tab pasted into the words becomes a space, since the order refuses any control character but a line break', async ({ page }) => {
  await open(page); await reset(page); await textTab(page);
  const row = page.locator('#texts textarea.quick');
  await row.fill('THE\tSMITHS\nEST.\t2020');
  expect(await words(page)).toBe('THE SMITHS\nEST. 2020');
  await expect(row).toHaveValue('THE SMITHS\nEST. 2020');
  await page.locator('#ttext').fill('A\tB');
  expect(await words(page)).toBe('A B');
  /* A project written elsewhere, with carriage returns, opens with plain line breaks. */
  await page.evaluate(() => {
    const d = structuredClone(cornhole.design); d.a.elements[0].text = 'ONE\r\nTWO\rTHREE'; cornhole.setDesign(d);
  });
  expect(await words(page)).toBe('ONE\nTWO\nTHREE');
  expect(await page.evaluate(() => cornhole.orderPayload().design.a.elements[0].text)).toBe('ONE\nTWO\nTHREE');
});

test('auto-fit keeps a name and a second line inside the template\'s original space', async ({ page }) => {
  await open(page);
  await page.evaluate(() => cornhole.applyTemplate('bbp1-garden-vows'));
  const line = await page.evaluate(() => {
    cornhole.paint();
    const e = cornhole.activeBoard().elements.find((item) => item.type === 'text' && item.text === 'AVERY');
    return { id: e.id, size: e.size, x: e.x, y: e.y, box: { ...cornhole.boxes.get(e.id) } };
  });
  await page.evaluate((id) => { cornhole.showTab('text'); cornhole.select(id); }, line.id);
  await page.locator('#ttext').fill('AVERY\nSMITH');
  const fitted = await page.evaluate((id) => {
    cornhole.paint();
    const e = cornhole.activeBoard().elements.find((item) => item.id === id);
    return { text: e.text, size: e.size, x: e.x, y: e.y, box: { ...cornhole.boxes.get(id) } };
  }, line.id);
  expect(fitted.text).toBe('AVERY\nSMITH');
  expect(fitted.size, 'two lines are made smaller to fit').toBeLessThan(line.size);
  expect(fitted.box.h, 'no taller than the one line was').toBeLessThanOrEqual(line.box.h + 0.03);
  expect(fitted.box.w).toBeLessThanOrEqual(line.box.w + 0.03);
  expect([fitted.x, fitted.y]).toEqual([line.x, line.y]);
  await expect(page.locator('#fitstatus')).toHaveAttribute('data-state', 'fit');
  /* Back to one line, back to the size it came with. */
  await page.locator('#ttext').fill('AVERY');
  expect(await page.evaluate((id) => cornhole.activeBoard().elements.find((item) => item.id === id).size, line.id)).toBe(line.size);
  expect(await page.evaluate(() => cornhole.sampleWordsIn())).toContain('AVERY');
  await page.locator('#ttext').fill('AVERY\n');
  expect(await page.evaluate(() => cornhole.sampleWordsIn()), 'a sample word with a line break after it is still the sample').toContain('AVERY');
});

test.describe('on a phone', () => {
  test.use({ hasTouch: true });
  for (const width of [320, 375, 390]) {
    test(`at ${width}px the words fields are finger-sized, 16px, take a new line and fit the screen`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await open(page); await reset(page); await textTab(page);
      await page.locator('#textmore').evaluate((el) => { el.open = true; });
      const fields = page.locator('#texts textarea.quick, #ttext');
      await expect(fields).toHaveCount(2);
      await page.locator('#texts textarea.quick').fill('ALEXANDRIA AND CHRISTOPHER\nSEPTEMBER 24, 2028');
      await page.locator('#ttext').focus();
      await page.locator('#ttext').press('Control+End');
      await page.locator('#ttext').press('Enter');
      await page.locator('#ttext').pressSequentially('NY');
      expect(await words(page)).toBe('ALEXANDRIA AND CHRISTOPHER\nSEPTEMBER 24, 2028\nNY');
      for (const field of await fields.all()) {
        const look = await field.evaluate((el) => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return { h: r.height, w: r.width, font: parseFloat(s.fontSize), label: el.labels?.[0]?.textContent || el.getAttribute('aria-label') }; });
        expect(look.h, 'a finger-sized field').toBeGreaterThanOrEqual(44);
        expect(look.font, 'no zoom on focus').toBeGreaterThanOrEqual(16);
        expect(look.label, 'a named field').toBeTruthy();
      }
      const overflow = await page.evaluate(() => ({
        page: document.documentElement.scrollWidth, viewport: window.innerWidth,
        panel: document.querySelector('.panel').scrollWidth, available: document.querySelector('.panel').clientWidth,
      }));
      expect(overflow.page, 'no sideways scrolling').toBeLessThanOrEqual(overflow.viewport);
      expect(overflow.panel).toBeLessThanOrEqual(overflow.available + 1);
    });
  }
});
