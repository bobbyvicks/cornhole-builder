import { test, expect } from '@playwright/test';
import { open, reset, pixelAt, count, bounds, setInput, chip, clientPoint, handlePoint, WHITE, NAVY, RED, CREAM } from './helpers.js';

test.describe('the designer', () => {
  test('loads clean and paints the default board: navy base, a hole, and white text', async ({ page }) => {
    const errors = await open(page);
    await reset(page);
    expect(errors).toEqual([]);
    expect(await pixelAt(page, 'a', 2, 40)).toEqual([...NAVY, 255]);
    const hole = await pixelAt(page, 'a', 12, 9);
    expect(hole[0] + hole[1] + hole[2], 'the hole is dark').toBeLessThan(120);
    const text = await bounds(page, 'a', WHITE);
    expect(text, 'the text is on the board').not.toBeNull();
    expect(Math.abs(text.cx - 12), 'centred across').toBeLessThan(0.5);
    expect(Math.abs(text.cy - 30), 'centred on its y').toBeLessThan(0.8);
    /* Board B shows the same design while "same" is on. */
    expect(await count(page, 'b', WHITE)).toBe(await count(page, 'a', WHITE));
  });

  test('a swatch repaints the base and the custom picker follows', async ({ page }) => {
    await open(page); await reset(page);
    await page.click('#paints .sw[data-v="#c8102e"]');
    expect(await pixelAt(page, 'a', 2, 40)).toEqual([...RED, 255]);
    expect(await page.inputValue('#paintcustom')).toBe('#c8102e');
    expect(await page.getAttribute('#paints .sw[data-v="#c8102e"]', 'aria-pressed')).toBe('true');
    await setInput(page, 'paintcustom', '#00ff00');
    expect(await pixelAt(page, 'a', 2, 40)).toEqual([0, 255, 0, 255]);
  });

  test('stained wood is wood-coloured, and the grain is the same picture twice', async ({ page }) => {
    await open(page); await reset(page);
    await chip(page, 'basekind', 'wood');
    await page.click('#stains .sw[data-v="walnut"]');
    expect(await count(page, 'a', NAVY), 'no navy left').toBe(0);
    const p = await pixelAt(page, 'a', 3, 40);
    expect(p[0], 'brown: red over blue').toBeGreaterThan(p[2] + 20);
    const once = await page.evaluate(() => { cornhole.paint(); return document.getElementById('canvasA').toDataURL(); });
    const twice = await page.evaluate(() => { cornhole.paint(); return document.getElementById('canvasA').toDataURL(); });
    expect(once, 'a seeded grain does not shimmer between renders').toBe(twice);
  });

  test('patterns: a top half, a border of the set width, and stripes of the set size', async ({ page }) => {
    await open(page); await reset(page);
    await page.evaluate(() => { cornhole.activeBoard().elements = []; cornhole.render(); });
    await page.selectOption('#pattern', 'top');
    await setInput(page, 'patcolor', '#ffffff');
    expect(await pixelAt(page, 'a', 2, 20)).toEqual([...WHITE, 255]);
    expect(await pixelAt(page, 'a', 2, 40)).toEqual([...NAVY, 255]);

    await page.selectOption('#pattern', 'border');
    await setInput(page, 'patsize', 2);
    expect(await pixelAt(page, 'a', 1, 40)).toEqual([...WHITE, 255]);
    expect(await pixelAt(page, 'a', 3, 40)).toEqual([...NAVY, 255]);
    await setInput(page, 'patsize', 4);
    expect(await pixelAt(page, 'a', 3, 40), 'the border widened').toEqual([...WHITE, 255]);

    await page.selectOption('#pattern', 'stripes');
    await setInput(page, 'patsize', 3);
    /* Sampled at x = 3, clear of the hole (which spans 6" to 12" down). */
    expect(await pixelAt(page, 'a', 3, 1.5)).toEqual([...WHITE, 255]);
    expect(await pixelAt(page, 'a', 3, 4.5)).toEqual([...NAVY, 255]);
    expect(await pixelAt(page, 'a', 3, 7.5)).toEqual([...WHITE, 255]);
    expect(await pixelAt(page, 'a', 12, 9), 'the hole is still a hole').not.toEqual([...WHITE, 255]);
  });

  test('text: typing changes it, size and position sliders move it, and the sliders read the element', async ({ page }) => {
    await open(page); await reset(page);
    await page.evaluate(() => cornhole.select('t1'));
    await page.evaluate(() => cornhole.showTab('text'));
    expect(await page.inputValue('#ttext')).toBe('HELLO');
    expect(await page.inputValue('#tsize')).toBe('4');
    const before = await bounds(page, 'a', WHITE);
    await setInput(page, 'ttext', 'HELLO WORLD');
    const wider = await bounds(page, 'a', WHITE);
    expect(wider.x1 - wider.x0).toBeGreaterThan(before.x1 - before.x0);
    await setInput(page, 'tsize', 8);
    const taller = await bounds(page, 'a', WHITE);
    expect(taller.y1 - taller.y0).toBeGreaterThan((wider.y1 - wider.y0) * 1.6);
    await setInput(page, 'ty', 40);
    const moved = await bounds(page, 'a', WHITE);
    expect(Math.abs(moved.cy - 40)).toBeLessThan(1);
    await setInput(page, 'tcolor', '#ff0000');
    /* Deselect first: the selection outline is dashed in white too. */
    await page.evaluate(() => cornhole.select(null));
    expect(await count(page, 'a', WHITE)).toBe(0);
    expect(await count(page, 'a', [255, 0, 0])).toBeGreaterThan(100);
  });

  test('an outline draws around the letters and grows the hit box', async ({ page }) => {
    await open(page); await reset(page);
    await page.evaluate(() => cornhole.select('t1'));
    const noOutline = await count(page, 'a', [0, 0, 0]);
    await setInput(page, 'toutlinew', 0.3);
    const boxed = await page.evaluate(() => { cornhole.paint(); return cornhole.boxes.get('t1'); });
    expect(await count(page, 'a', [0, 0, 0])).toBeGreaterThan(noOutline + 200);
    expect(boxed.w).toBeGreaterThan(0.5);
  });

  test('adding text puts a selected item on the board and in the list; Remove takes it off both', async ({ page }) => {
    await open(page); await reset(page);
    await page.evaluate(() => cornhole.showTab('text'));
    await page.click('#addtext');
    expect(await page.locator('#texts .item').count()).toBe(2);
    expect(await page.evaluate(() => cornhole.activeBoard().elements.length)).toBe(2);
    expect(await page.evaluate(() => cornhole.selected)).toBe(await page.evaluate(() => cornhole.activeBoard().elements[1].id));
    expect(await page.isHidden('#textprops')).toBe(false);
    await page.click('#tdel');
    expect(await page.locator('#texts .item').count()).toBe(1);
    expect(await page.evaluate(() => cornhole.activeBoard().elements.length)).toBe(1);
    expect(await page.isHidden('#textprops')).toBe(true);
  });

  test('dragging on the preview moves the element under the pointer and nothing else', async ({ page }) => {
    await open(page); await reset(page);
    const from = await clientPoint(page, 'a', 12, 30);
    const to = await clientPoint(page, 'a', 6, 12);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x - 20, from.y - 20, { steps: 4 });
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.up();
    const el = await page.evaluate(() => cornhole.activeBoard().elements[0]);
    expect(Math.abs(el.x - 6)).toBeLessThan(0.3);
    expect(Math.abs(el.y - 12)).toBeLessThan(0.3);
    expect(await page.evaluate(() => cornhole.selected)).toBe('t1');
    /* A press on bare board deselects and moves nothing. */
    const bare = await clientPoint(page, 'a', 12, 44);
    await page.mouse.move(bare.x, bare.y); await page.mouse.down(); await page.mouse.move(bare.x + 30, bare.y, { steps: 3 }); await page.mouse.up();
    expect(await page.evaluate(() => cornhole.selected)).toBeNull();
    expect(await page.evaluate(() => cornhole.activeBoard().elements[0].x)).toBe(el.x);
  });

  test('a rotated element is picked up where it is drawn, not where its unrotated box would be', async ({ page }) => {
    await open(page); await reset(page);
    await page.evaluate(() => { const t = cornhole.activeBoard().elements[0]; t.text = 'LONG LONG TEXT'; t.size = 3; t.rotation = 90; t.x = 12; t.y = 30; cornhole.paint(); });
    /* Rotated 90°, the words run down the board: a point 5" below the centre
       is on the text; a point 5" to the right of it is bare board. */
    const on = await clientPoint(page, 'a', 12, 35), off = await clientPoint(page, 'a', 17, 30);
    await page.mouse.click(off.x, off.y);
    expect(await page.evaluate(() => cornhole.selected)).toBeNull();
    await page.mouse.click(on.x, on.y);
    expect(await page.evaluate(() => cornhole.selected)).toBe('t1');
  });

  test('undo and redo walk the history; arrow keys nudge; Delete removes', async ({ page }) => {
    await open(page); await reset(page);
    await page.click('#paints .sw[data-v="#c8102e"]');
    expect(await pixelAt(page, 'a', 2, 40)).toEqual([...RED, 255]);
    await page.click('#undo');
    expect(await pixelAt(page, 'a', 2, 40)).toEqual([...NAVY, 255]);
    await page.click('#redo');
    expect(await pixelAt(page, 'a', 2, 40)).toEqual([...RED, 255]);
    await page.evaluate(() => { cornhole.select('t1'); document.activeElement && document.activeElement.blur(); });
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Shift+ArrowDown');
    const el = await page.evaluate(() => cornhole.activeBoard().elements[0]);
    expect(el.x).toBeCloseTo(12.1, 5);
    expect(el.y).toBeCloseTo(31, 5);
    await page.keyboard.press('Delete');
    expect(await page.evaluate(() => cornhole.activeBoard().elements.length)).toBe(0);
    await page.keyboard.press('Control+z');
    expect(await page.evaluate(() => cornhole.activeBoard().elements.length)).toBe(1);
  });

  test('an uploaded image lands on the board, is shrunk, and can be resized', async ({ page }) => {
    await open(page); await reset(page);
    /* A 3000 x 1500 red PNG, made in the page: big enough to be shrunk. */
    const png = await page.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 3000; c.height = 1500;
      const g = c.getContext('2d'); g.fillStyle = '#ff0000'; g.fillRect(0, 0, 3000, 1500);
      const b = await new Promise((r) => c.toBlob(r, 'image/png'));
      return Array.from(new Uint8Array(await b.arrayBuffer()));
    });
    await page.setInputFiles('#addimage', { name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from(png) });
    await page.waitForFunction(() => cornhole.activeBoard().elements.some((e) => e.type === 'image'));
    await page.waitForTimeout(300);
    const el = await page.evaluate(() => cornhole.activeBoard().elements.find((e) => e.type === 'image'));
    expect(el.width).toBe(10);
    const img = await page.evaluate((src) => new Promise((r) => { const i = new Image(); i.onload = () => r({ w: i.naturalWidth, h: i.naturalHeight }); i.src = src; }), el.src);
    expect(img.w, 'shrunk to 1600 on the long side').toBe(1600);
    expect(img.h).toBe(800);
    const drawn = await bounds(page, 'a', [255, 0, 0]);
    expect(drawn.x1 - drawn.x0).toBeGreaterThan(9.5);
    expect(drawn.x1 - drawn.x0).toBeLessThan(10.5);
    expect(drawn.y1 - drawn.y0).toBeGreaterThan(4.5);
    expect(drawn.y1 - drawn.y0).toBeLessThan(5.5);
    await setInput(page, 'iwidth', 20);
    const bigger = await bounds(page, 'a', [255, 0, 0]);
    expect(bigger.x1 - bigger.x0).toBeGreaterThan(19.5);
    expect(await page.locator('#images .item').count()).toBe(1);
  });

  test('two different boards: B starts as a copy of A, edits to B leave A alone, and a single board hides B', async ({ page }) => {
    await open(page); await reset(page);
    expect(await page.isHidden('#whichrow')).toBe(true);
    await page.uncheck('#same');
    expect(await page.isHidden('#whichrow')).toBe(false);
    expect(await page.evaluate(() => cornhole.design.b.elements.length), 'B copied A').toBe(1);
    expect(await page.evaluate(() => cornhole.design.b.elements[0].id)).not.toBe('t1');
    await chip(page, 'which', 'b');
    expect(await page.evaluate(() => cornhole.active)).toBe('b');
    await page.click('#paints .sw[data-v="#c8102e"]');
    expect(await pixelAt(page, 'b', 2, 40)).toEqual([...RED, 255]);
    expect(await pixelAt(page, 'a', 2, 40)).toEqual([...NAVY, 255]);
    /* Clicking board A's preview switches the panel to A. */
    const p = await clientPoint(page, 'a', 12, 44);
    await page.mouse.click(p.x, p.y);
    expect(await page.evaluate(() => cornhole.active)).toBe('a');
    await chip(page, 'product', 'single');
    expect(await page.isHidden('#boardB')).toBe(true);
    expect(await page.evaluate(() => cornhole.design.same)).toBe(true);
  });

  test('the design survives a reload', async ({ page }) => {
    await open(page); await reset(page);
    await page.click('#paints .sw[data-v="#c8102e"]');
    await page.selectOption('#pattern', 'checker');
    await page.reload();
    await page.waitForFunction(() => window.cornhole && window.cornhole.design);
    expect(await page.evaluate(() => cornhole.design.a.base.color)).toBe('#c8102e');
    expect(await page.evaluate(() => cornhole.design.a.pattern.kind)).toBe('checker');
  });

  test('the print file is 2400 x 4800 with the hole left as a hairline, not filled', async ({ page }) => {
    await open(page); await reset(page);
    const r = await page.evaluate(() => {
      const c = cornhole.printCanvas('a');
      const g = c.getContext('2d');
      const at = (x, y) => Array.from(g.getImageData(x, y, 1, 1).data);
      return { w: c.width, h: c.height, centre: at(1200, 900), corner: at(200, 4000), edge: at(1200, 600) };
    });
    expect([r.w, r.h]).toEqual([2400, 4800]);
    expect(r.centre, 'the hole area carries the base colour: it is cut, not printed').toEqual([...NAVY, 255]);
    expect(r.corner).toEqual([...NAVY, 255]);
    expect(r.edge, 'a hairline marks the cut').not.toEqual([...NAVY, 255]);
  });
});

test.describe('the quote and the order', () => {
  test('the price follows the options and matches lib/price.mjs', async ({ page }) => {
    await open(page); await reset(page);
    await page.evaluate(() => cornhole.showTab('order'));
    expect(await page.textContent('#headtotal')).toBe('$308.00');
    await chip(page, 'finish', 'gloss');
    await chip(page, 'bags', 'regulation');
    expect(await page.isHidden('#bagcolors')).toBe(false);
    await page.check('#rush');
    await setInput(page, 'qty', 2);
    const expected = await page.evaluate(() => cornhole.quote({ product: 'set', quantity: 2, finish: 'gloss', bags: 'regulation', rush: true }).total);
    expect(expected).toBe(2 * (24900 + 4000 + 4500) + 5000 + 5900 + 2500);
    expect(await page.textContent('#headtotal')).toBe('$' + (expected / 100).toFixed(2));
    expect(await page.locator('#quote tr').count()).toBe(6);
    await chip(page, 'bags', 'none');
    expect(await page.isHidden('#bagcolors')).toBe(true);
    await chip(page, 'product', 'single');
    await setInput(page, 'qty', 1);
    await page.uncheck('#rush');
    await chip(page, 'finish', 'satin');
    expect(await page.textContent('#headtotal')).toBe('$198.00');
  });

  async function fillForm(page) {
    await page.evaluate(() => cornhole.showTab('order'));
    await page.fill('#name', 'Pat Example');
    await page.fill('#email', 'pat@example.com');
    await page.fill('#line1', '1 Main St');
    await page.fill('#city', 'Austin');
    await page.selectOption('#state', 'TX');
    await page.fill('#postal', '78701');
  }

  test('Continue to payment posts the design, the options and the address, then follows the Checkout URL', async ({ page }) => {
    await open(page); await reset(page);
    await chip(page, 'bags', 'regulation');
    await fillForm(page);
    let posted = null;
    await page.route('**/api/order', async (route) => {
      posted = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 'CH-TEST01', url: '/index.html?order=success&code=CH-TEST01', total: 35300, payment: 'stripe' }) });
    });
    await page.click('#checkout');
    await page.waitForURL(/order=success/);
    expect(posted).not.toBeNull();
    expect(posted.options).toEqual({ product: 'set', quantity: 1, finish: 'satin', bags: 'regulation', rush: false, bagColors: ['#c8102e', '#1f3a93'], carryCase: false, occasion: 'other', giftNote: '' });
    expect(posted.options.needBy, 'no date, no field').toBeUndefined();
    expect(posted.customer).toEqual({ name: 'Pat Example', email: 'pat@example.com', phone: '' });
    expect(posted.shipping).toEqual({ line1: '1 Main St', line2: '', city: 'Austin', state: 'TX', postal: '78701', country: 'US' });
    expect(posted.design.a.elements[0].text).toBe('HELLO');
    expect(posted.previews.length, 'one preview for two identical boards').toBe(1);
    expect(posted.previews[0]).toMatch(/^data:image\/png;base64,/);
    /* And the thank-you page shows the code. */
    expect(await page.isHidden('#done')).toBe(false);
    expect(await page.textContent('#donebody')).toContain('CH-TEST01');
  });

  test('two different boards send two previews', async ({ page }) => {
    await open(page); await reset(page);
    await page.uncheck('#same');
    await fillForm(page);
    let posted = null;
    await page.route('**/api/order', async (route) => {
      posted = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 'CH-TEST02', url: null, total: 30800, payment: 'invoice' }) });
    });
    await page.click('#checkout');
    await expect(page.locator('#orderstatus')).toContainText('CH-TEST02');
    expect(posted.previews.length).toBe(2);
    expect(posted.design.same).toBe(false);
    await expect(page.locator('#orderstatus')).toContainText('invoice');
  });

  test('the form refuses to send until it is filled in', async ({ page }) => {
    await open(page); await reset(page);
    await page.evaluate(() => cornhole.showTab('order'));
    let hits = 0;
    await page.route('**/api/order', async (route) => { hits++; await route.fulfill({ status: 200, body: '{}' }); });
    await page.click('#checkout');
    await page.waitForTimeout(200);
    expect(hits).toBe(0);
    expect(await page.evaluate(() => document.getElementById('orderform').checkValidity())).toBe(false);
  });

  test('when ordering is not switched on, the page says so and nothing looks charged', async ({ page }) => {
    await open(page); await reset(page);
    await fillForm(page);
    await page.route('**/api/order', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'not_configured' }) }));
    await page.click('#checkout');
    await expect(page.locator('#orderstatus')).toContainText('not switched on');
    expect(await page.isDisabled('#checkout')).toBe(false);
  });

  test('a server error is shown with its message, and a dead server too', async ({ page }) => {
    await open(page); await reset(page);
    await fillForm(page);
    await page.route('**/api/order', (route) => route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'bad_request', message: 'shipping.postal: a 5-digit ZIP' }) }));
    await page.click('#checkout');
    await expect(page.locator('#orderstatus')).toContainText('shipping.postal');
    await page.unroute('**/api/order');
    await page.route('**/api/order', (route) => route.abort());
    await page.click('#checkout');
    await expect(page.locator('#orderstatus')).toContainText('Could not reach the server');
  });

  test('coming back from a cancelled payment keeps the design and says nothing was charged', async ({ page }) => {
    await open(page, { query: '?order=cancelled&code=CH-ABC234' });
    expect(await page.isHidden('#done')).toBe(false);
    expect(await page.textContent('#donetitle')).toContain('cancelled');
    expect(await page.textContent('#donebody')).toContain('CH-ABC234');
    expect(await page.textContent('#donebody')).toContain('No charge');
  });
});

test.describe('templates, clip art and the richer tools', () => {
  test('the Start tab offers the templates, and one click loads a design with its occasion', async ({ page }) => {
    await open(page); await reset(page);
    expect(await page.locator('#templates .tpl').count()).toBeGreaterThanOrEqual(10);
    await page.evaluate(() => cornhole.showTab('templates'));
    /* The design has one edit in its history after reset, so the template
       asks before replacing it; the test answers yes. */
    page.once('dialog', (d) => d.accept());
    await page.click('#templates .tpl[data-id="wedding"]');
    await page.waitForTimeout(150);
    const d = await page.evaluate(() => cornhole.design);
    expect(d.a.elements.length).toBeGreaterThan(3);
    expect(d.a.elements.some((e) => e.type === 'clip' && e.name === 'laurel')).toBe(true);
    expect(d.a.base.color).toBe('#fffaf0');
    expect(await page.evaluate(() => cornhole.order.occasion)).toBe('wedding');
    expect(await pixelAt(page, 'a', 12, 44)).toEqual([255, 250, 240, 255]);
  });

  test('every template renders without error and keeps its ink on the board', async ({ page }) => {
    await open(page); await reset(page);
    const ids = await page.evaluate(() => cornhole.TEMPLATES.map((t) => t.id));
    for (const id of ids) {
      await page.evaluate((id) => cornhole.applyTemplate(id), id);
      const els = await page.evaluate(() => cornhole.design.a.elements);
      for (const el of els) {
        expect(el.x, id + ' ' + el.id + ' across').toBeGreaterThan(0); expect(el.x).toBeLessThan(24);
        expect(el.y, id + ' ' + el.id + ' down').toBeGreaterThan(0); expect(el.y).toBeLessThan(48);
      }
    }
  });

  test('clip art: added in a colour, recoloured, outlined, flipped, and listed', async ({ page }) => {
    await open(page); await reset(page);
    await page.evaluate(() => { cornhole.activeBoard().elements = []; cornhole.render(); });
    await page.evaluate(() => cornhole.addClip('heart', { color: '#ff0000', width: 10, x: 12, y: 30 }));
    const red = await count(page, 'a', [255, 0, 0]);
    expect(red).toBeGreaterThan(2000);
    const b = await bounds(page, 'a', [255, 0, 0]);
    expect(b.x1 - b.x0).toBeGreaterThan(8); expect(b.x1 - b.x0).toBeLessThan(10.5);
    expect(Math.abs(b.cx - 12)).toBeLessThan(0.5);
    await setInput(page, 'ccolor', '#00ff00');
    expect(await count(page, 'a', [255, 0, 0])).toBe(0);
    expect(await count(page, 'a', [0, 255, 0])).toBeGreaterThan(2000);
    await setInput(page, 'coutline', '#000000');
    await setInput(page, 'coutlinew', 0.3);
    expect(await count(page, 'a', [0, 0, 0])).toBeGreaterThan(300);
    expect(await page.locator('#images .item').count()).toBe(1);
    expect(await page.textContent('#images .item .name')).toContain('Heart');
    /* An asymmetric piece flips: the fish's tail is on the right, so a
       point in the tail has ink before the flip and bare board after. */
    await page.evaluate(() => cornhole.addClip('fish', { color: '#ff00ff', width: 10, x: 12, y: 10 }));
    expect(await pixelAt(page, 'a', 16.2, 10)).toEqual([255, 0, 255, 255]);
    await page.check('#cflip');
    expect(await pixelAt(page, 'a', 16.2, 10)).toEqual([...NAVY, 255]);
    expect(await pixelAt(page, 'a', 7.8, 10)).toEqual([255, 0, 255, 255]);
  });

  test('the clip art grid shows one category at a time and clicking a piece adds it', async ({ page }) => {
    await open(page); await reset(page);
    await page.evaluate(() => cornhole.showTab('art'));
    const love = await page.locator('#clips .clip').count();
    expect(love).toBeGreaterThan(8);
    expect(await page.locator('#clips .clip[data-name="heart"]').count()).toBe(1);
    await chip(page, 'clipcats', 'shape');
    expect(await page.locator('#clips .clip[data-name="heart"]').count()).toBe(0);
    expect(await page.locator('#clips .clip[data-name="circle"]').count()).toBe(1);
    await page.click('#clips .clip[data-name="circle"]');
    const el = await page.evaluate(() => cornhole.activeBoard().elements.find((e) => e.type === 'clip'));
    expect(el.name).toBe('circle');
    expect(await page.evaluate(() => cornhole.selected)).toBe(el.id);
    expect(await page.isHidden('#cliponly')).toBe(false);
    expect(await page.isHidden('#imageonly')).toBe(true);
  });

  test('every piece of clip art draws some ink', async ({ page }) => {
    await open(page); await reset(page);
    const names = await page.evaluate(() => Object.keys(cornhole.CLIPS));
    for (const name of names) {
      await page.evaluate((name) => { cornhole.activeBoard().elements = []; cornhole.addClip(name, { color: '#ff00ff', width: 12, x: 12, y: 30 }); }, name);
      expect(await count(page, 'a', [255, 0, 255]), name).toBeGreaterThan(400);
    }
  });

  test('curved text bends up or down and its box follows', async ({ page }) => {
    await open(page); await reset(page);
    await page.evaluate(() => { const t = cornhole.activeBoard().elements[0]; t.text = 'CURVED WORDS'; t.size = 2.5; cornhole.select('t1'); });
    const straight = await page.evaluate(() => { cornhole.paint(); return { ...cornhole.boxes.get('t1') }; });
    await setInput(page, 'tarc', 90);
    const up = await page.evaluate(() => { cornhole.paint(); return { ...cornhole.boxes.get('t1') }; });
    expect(up.h).toBeGreaterThan(straight.h + 1);
    expect(up.oy).toBeGreaterThan(0.3);
    /* The ends of an upward arch droop below the middle: ink spans well
       below y = 30 and the middle letters stay near it. */
    await page.evaluate(() => cornhole.select(null));
    const ink = await bounds(page, 'a', WHITE);
    expect(ink.y1).toBeGreaterThan(31.5);
    await page.evaluate(() => cornhole.select('t1'));
    await setInput(page, 'tarc', -90);
    const down = await page.evaluate(() => { cornhole.paint(); return { ...cornhole.boxes.get('t1') }; });
    expect(down.oy).toBeLessThan(-0.3);
    await page.evaluate(() => cornhole.select(null));
    const ink2 = await bounds(page, 'a', WHITE);
    expect(ink2.y0).toBeLessThan(28.5);
  });

  test('letter spacing widens a word and a drop shadow adds dark pixels', async ({ page }) => {
    await open(page); await reset(page);
    await page.evaluate(() => { cornhole.select('t1'); cornhole.showTab('text'); });
    const before = await bounds(page, 'a', WHITE);
    await setInput(page, 'tspacing', 0.5);
    await page.evaluate(() => cornhole.select(null));
    const after = await bounds(page, 'a', WHITE);
    expect(after.x1 - after.x0).toBeGreaterThan(before.x1 - before.x0 + 1.5);
    const navyBefore = await count(page, 'a', NAVY);
    await page.evaluate(() => cornhole.select('t1'));
    await page.check('#tshadow');
    await page.evaluate(() => cornhole.select(null));
    expect(await count(page, 'a', NAVY), 'the shadow darkened some navy').toBeLessThan(navyBefore - 200);
  });

  test('a two-colour fade runs from one colour to the other', async ({ page }) => {
    await open(page); await reset(page);
    await page.evaluate(() => { cornhole.activeBoard().elements = []; });
    await chip(page, 'basekind', 'gradient');
    await setInput(page, 'paintcustom', '#ff0000');
    await setInput(page, 'paint2', '#0000ff');
    await setInput(page, 'gradangle', 180);
    const top = await pixelAt(page, 'a', 2, 1), bottom = await pixelAt(page, 'a', 2, 47), mid = await pixelAt(page, 'a', 2, 24);
    expect(top[0]).toBeGreaterThan(230); expect(top[2]).toBeLessThan(30);
    expect(bottom[2]).toBeGreaterThan(230); expect(bottom[0]).toBeLessThan(30);
    expect(Math.abs(mid[0] - mid[2])).toBeLessThan(40);
    await setInput(page, 'gradangle', 90);
    const left = await pixelAt(page, 'a', 1, 40), right = await pixelAt(page, 'a', 23, 40);
    expect(left[0]).toBeGreaterThan(200); expect(right[2]).toBeGreaterThan(200);
    expect(await page.isHidden('#gradopts')).toBe(false);
  });

  test('the new patterns put the pattern colour on the board without covering it', async ({ page }) => {
    await open(page); await reset(page);
    await page.evaluate(() => { cornhole.activeBoard().elements = []; });
    await setInput(page, 'patcolor', '#ffffff');
    const total = 480 * 960;
    for (const kind of ['dots', 'diamonds', 'hearts', 'sunburst', 'bottom', 'right', 'cross']) {
      await page.selectOption('#pattern', kind);
      const white = await count(page, 'a', WHITE), navy = await count(page, 'a', NAVY);
      expect(white, kind + ' draws').toBeGreaterThan(total * 0.02);
      expect(navy, kind + ' leaves base').toBeGreaterThan(total * 0.2);
    }
    /* Buffalo check is translucent bands, so it tints rather than paints:
       no pure white, but much less pure navy, and the crossings darker
       than the single bands. */
    await page.selectOption('#pattern', 'plaid');
    expect(await count(page, 'a', WHITE)).toBe(0);
    expect(await count(page, 'a', NAVY)).toBeLessThan(total * 0.4);
    expect(await count(page, 'a', NAVY)).toBeGreaterThan(total * 0.1);
    await page.selectOption('#pattern', 'bottom');
    expect(await pixelAt(page, 'a', 12, 40)).toEqual([...WHITE, 255]);
    expect(await pixelAt(page, 'a', 12, 20)).toEqual([...NAVY, 255]);
  });

  test('the corner handle resizes and the round handle rotates', async ({ page }) => {
    await open(page); await reset(page);
    await page.evaluate(() => cornhole.select('t1'));
    const h = await handlePoint(page, 't1', 'resize');
    const centre = await clientPoint(page, 'a', 12, 30);
    await page.mouse.move(h.x, h.y); await page.mouse.down();
    /* Pull the corner away from the centre to half again the distance. */
    await page.mouse.move(centre.x + (h.x - centre.x) * 1.5, centre.y + (h.y - centre.y) * 1.5, { steps: 6 });
    await page.mouse.up();
    const size = await page.evaluate(() => cornhole.activeBoard().elements[0].size);
    expect(size).toBeGreaterThan(5.4); expect(size).toBeLessThan(6.6);
    expect(await page.evaluate(() => cornhole.selected), 'still selected').toBe('t1');
    const r = await handlePoint(page, 't1', 'rotate');
    await page.mouse.move(r.x, r.y); await page.mouse.down();
    const right = await clientPoint(page, 'a', 22, 30);
    await page.mouse.move(right.x, right.y, { steps: 6 });
    await page.mouse.up();
    expect(await page.evaluate(() => cornhole.activeBoard().elements[0].rotation)).toBe(90);
    expect(await page.evaluate(() => cornhole.activeBoard().elements[0].x), 'rotating did not move it').toBe(12);
  });

  test('dragging near the centre line snaps to it', async ({ page }) => {
    await open(page); await reset(page);
    await page.evaluate(() => { cornhole.activeBoard().elements[0].x = 8; cornhole.paint(); });
    const from = await clientPoint(page, 'a', 8, 30), to = await clientPoint(page, 'a', 11.8, 20.2);
    await page.mouse.move(from.x, from.y); await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.up();
    const el = await page.evaluate(() => cornhole.activeBoard().elements[0]);
    expect(el.x).toBe(12);
    expect(Math.abs(el.y - 20.2)).toBeLessThan(0.3);
  });

  test('duplicate, forward and back change the stack; + and - resize from the keyboard', async ({ page }) => {
    await open(page); await reset(page);
    await page.evaluate(() => cornhole.addClip('circle', { color: '#ff0000', width: 6, x: 12, y: 30 }));
    await page.click('#idup');
    const els = await page.evaluate(() => cornhole.activeBoard().elements.map((e) => ({ type: e.type, x: e.x })));
    expect(els.length).toBe(3);
    expect(els[2].x).toBe(13);
    await page.evaluate(() => cornhole.select(cornhole.activeBoard().elements[1].id));
    await page.click('#iback');
    expect(await page.evaluate(() => cornhole.activeBoard().elements[0].type)).toBe('clip');
    await page.click('#iforward');
    expect(await page.evaluate(() => cornhole.activeBoard().elements[0].type)).toBe('text');
    await page.evaluate(() => { document.activeElement && document.activeElement.blur(); });
    const w0 = await page.evaluate(() => cornhole.activeBoard().elements.find((e) => e.id === cornhole.selected).width);
    await page.keyboard.press('+');
    await page.keyboard.press('+');
    const w1 = await page.evaluate(() => cornhole.activeBoard().elements.find((e) => e.id === cornhole.selected).width);
    expect(w1).toBeGreaterThan(w0);
    await page.keyboard.press('-');
    expect(await page.evaluate(() => cornhole.activeBoard().elements.find((e) => e.id === cornhole.selected).width)).toBeLessThan(w1);
  });

  test('a picture can be flipped, circle-cropped and have its white background removed', async ({ page }) => {
    await open(page); await reset(page);
    await page.evaluate(() => { cornhole.activeBoard().elements = []; });
    /* A 400 x 400 picture: white, with a red square in its top-left quarter. */
    const png = await page.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 400; c.height = 400;
      const g = c.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, 400, 400); g.fillStyle = '#ff0000'; g.fillRect(0, 0, 200, 200);
      const b = await new Promise((r) => c.toBlob(r, 'image/png'));
      return Array.from(new Uint8Array(await b.arrayBuffer()));
    });
    await page.setInputFiles('#addimage', { name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from(png) });
    await page.waitForFunction(() => cornhole.activeBoard().elements.some((e) => e.type === 'image'));
    await page.waitForTimeout(300);
    /* 10" wide at (12, 30): spans 7..17 across and 25..35 down. Red is the
       top-left quarter, white the rest. */
    expect(await pixelAt(page, 'a', 9, 27)).toEqual([255, 0, 0, 255]);
    expect(await pixelAt(page, 'a', 15, 33)).toEqual([...WHITE, 255]);
    await page.check('#iknockout');
    await page.waitForTimeout(100);
    expect(await pixelAt(page, 'a', 15, 33), 'white became the board').toEqual([...NAVY, 255]);
    expect(await pixelAt(page, 'a', 9, 27), 'red stayed').toEqual([255, 0, 0, 255]);
    await page.uncheck('#iknockout');
    await page.check('#iflip');
    await page.waitForTimeout(100);
    expect(await pixelAt(page, 'a', 15, 27), 'red moved to the right').toEqual([255, 0, 0, 255]);
    expect(await pixelAt(page, 'a', 9, 27)).toEqual([...WHITE, 255]);
    await page.check('#icircle');
    await page.waitForTimeout(100);
    expect(await pixelAt(page, 'a', 7.3, 25.3), 'the corner is cropped away').toEqual([...NAVY, 255]);
    expect(await pixelAt(page, 'a', 12, 30)).not.toEqual([...NAVY, 255]);
  });

  test('a design saved by the first version of the page loads with the new fields filled in', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      localStorage.setItem('cornhole.design.v1', JSON.stringify({ version: 1, same: true,
        a: { base: { kind: 'paint', color: '#c8102e', stain: 'walnut' }, pattern: { kind: 'checker', color: '#ffffff', size: 3 },
          elements: [{ type: 'text', id: 'old1', text: 'OLD', font: 'Anton', size: 4, color: '#ffffff', outline: '#000000', outlineWidth: 0, x: 12, y: 30, rotation: 0 },
                     { type: 'image', id: 'old2', src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', width: 8, x: 12, y: 20, rotation: 0, opacity: 1 }] },
        b: { base: { kind: 'paint', color: '#1f3a93', stain: 'walnut' }, pattern: { kind: 'none', color: '#f5f5f0', size: 3 }, elements: [] } }));
    });
    await page.reload();
    await page.waitForFunction(() => window.cornhole && window.cornhole.design);
    const d = await page.evaluate(() => cornhole.design);
    expect(d.version).toBe(2);
    expect(d.a.base.color).toBe('#c8102e');
    expect(d.a.base.color2).toBeDefined();
    expect(d.a.elements[0]).toMatchObject({ text: 'OLD', arc: 0, spacing: 0, shadow: false });
    expect(d.a.elements[1]).toMatchObject({ flipH: false, circleCrop: false, knockout: false });
    expect(await pixelAt(page, 'a', 1.5, 1.5)).toEqual([...WHITE, 255]);
    /* And what the page sends is the version the server accepts. */
    expect((await page.evaluate(() => cornhole.orderPayload())).design.version).toBe(2);
  });

  test('the order carries the occasion, the date, the gift note, the case and the guest-book finish', async ({ page }) => {
    await open(page); await reset(page);
    await page.evaluate(() => cornhole.showTab('order'));
    await chip(page, 'finish', 'guestbook');
    await page.check('#carrycase');
    await page.selectOption('#occasion', 'wedding');
    await setInput(page, 'needby', '2999-06-14');
    await page.fill('#giftnote', 'Congratulations, both of you');
    const expected = 24900 + 2000 + 3500 + 5900;
    expect(await page.textContent('#headtotal')).toBe('$' + (expected / 100).toFixed(2));
    await expect(page.locator('#needbyhint')).toContainText('Plenty of time');
    await page.fill('#name', 'Pat Example'); await page.fill('#email', 'pat@example.com'); await page.fill('#line1', '1 Main St');
    await page.fill('#city', 'Austin'); await page.selectOption('#state', 'TX'); await page.fill('#postal', '78701');
    let posted = null;
    await page.route('**/api/order', async (route) => {
      posted = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 'CH-TEST03', url: null, total: expected, payment: 'invoice' }) });
    });
    await page.click('#checkout');
    await expect(page.locator('#orderstatus')).toContainText('CH-TEST03');
    expect(posted.options).toEqual({ product: 'set', quantity: 1, finish: 'guestbook', bags: 'none', rush: false, carryCase: true, occasion: 'wedding', needBy: '2999-06-14', giftNote: 'Congratulations, both of you' });
    expect(posted.design.version).toBe(2);
    /* A date too soon nudges toward rush. */
    const soon = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
    await setInput(page, 'needby', soon);
    await expect(page.locator('#needbyhint')).toContainText('Rush');
  });
});
