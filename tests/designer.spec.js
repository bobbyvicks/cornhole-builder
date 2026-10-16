import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { open, reset, reloaded, settled, picture, pixelAt, count, bounds, setInput, chip, clientPoint, handlePoint, WHITE, NAVY, RED, CREAM } from './helpers.js';

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
    await page.evaluate(() => { cornhole.select('t1'); document.getElementById('canvasA').focus(); });
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
    expect(await page.isHidden('#boardactions')).toBe(true);
    await page.click('#boardmode .chip[data-v="b"]');
    expect(await page.isHidden('#boardactions')).toBe(false);
    expect(await page.evaluate(() => cornhole.design.b.elements.length), 'B copied A').toBe(1);
    expect(await page.evaluate(() => cornhole.design.b.elements[0].id)).not.toBe('t1');
    expect(await page.evaluate(() => cornhole.active)).toBe('b');
    expect(await page.textContent('#boardB .label')).toContain('editing');
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
    await settled(page);
    await reloaded(page);
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
    await page.click('#toreview');
    await page.click('#tocheckout');
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
    await page.click('#boardmode .chip[data-v="a"]');
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
    await page.click('#toreview');
    await page.click('#tocheckout');
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

  test('coming back from a cancelled payment reports the verified pending order and how to pay again', async ({ page }) => {
    await page.route('**/api/order?code=*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      code: 'CH-ABC234', status: 'pending', product: 'set', quantity: 1, amount_cents: 30800, currency: 'usd',
    }) }));
    await open(page, { query: '?order=cancelled&code=CH-ABC234' });
    expect(await page.isHidden('#done')).toBe(false);
    expect(await page.textContent('#donebody')).toContain('CH-ABC234');
    await expect(page.locator('#done')).toContainText(/payment.*not.*confirmed|not.*confirmed.*payment/i);
    await expect(page.locator('#done')).toContainText('open the Order tab, review it and continue to payment again');
    await expect(page.locator('#done')).not.toContainText(/no charge|nothing was charged/i);
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
    await page.evaluate(() => { cornhole.select('t1'); document.getElementById('textmore').open = true; });
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
    await page.evaluate(() => { cornhole.select(cornhole.activeBoard().elements[1].id); document.getElementById('artmore').open = true; });
    await page.click('#iback');
    expect(await page.evaluate(() => cornhole.activeBoard().elements[0].type)).toBe('clip');
    await page.click('#iforward');
    expect(await page.evaluate(() => cornhole.activeBoard().elements[0].type)).toBe('text');
    await page.evaluate(() => { document.getElementById('canvasA').focus(); });
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
    await reloaded(page);
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
    const expected = 24900 + 2000 + 3500 + 5900;
    expect(await page.textContent('#headtotal')).toBe('$' + (expected / 100).toFixed(2));
    await expect(page.locator('#needbyhint')).toContainText('Plenty of time');
    await page.click('#toreview');
    await page.click('#tocheckout');
    await page.fill('#giftnote', 'Congratulations, both of you');
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
    await page.click('#backtoorder'); await page.click('#backtooptions');
    const soon = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
    await setInput(page, 'needby', soon);
    await expect(page.locator('#needbyhint')).toContainText('Rush');
  });
});

test.describe('removing, two boards, the order steps and the phone layout', () => {
  test('the red x on a selected element takes it off the board, and undo brings it back', async ({ page }) => {
    await open(page); await reset(page);
    await page.evaluate(() => cornhole.select('t1'));
    const x = await handlePoint(page, 't1', 'delete');
    await page.mouse.click(x.x, x.y);
    expect(await page.evaluate(() => cornhole.activeBoard().elements.length)).toBe(0);
    expect(await page.evaluate(() => cornhole.selected)).toBeNull();
    expect(await page.locator('#texts .item').count()).toBe(0);
    await page.click('#undo');
    expect(await page.evaluate(() => cornhole.activeBoard().elements.length)).toBe(1);
  });

  test('a small element is still picked up by its middle, and its x still removes it', async ({ page }) => {
    await open(page); await reset(page);
    await page.evaluate(() => { const t = cornhole.activeBoard().elements[0]; t.text = 'HI'; t.size = 1; cornhole.select('t1'); cornhole.paint(); });
    const c = await clientPoint(page, 'a', 12, 30), to = await clientPoint(page, 'a', 12, 40);
    await page.mouse.move(c.x, c.y); await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 5 }); await page.mouse.up();
    expect(await page.evaluate(() => cornhole.activeBoard().elements.length), 'moved, not removed').toBe(1);
    expect(await page.evaluate(() => cornhole.activeBoard().elements[0].y)).toBe(40);
    const x = await handlePoint(page, 't1', 'delete');
    await page.mouse.click(x.x, x.y);
    expect(await page.evaluate(() => cornhole.activeBoard().elements.length)).toBe(0);
  });

  test('every row in the text and art lists has its own remove button', async ({ page }) => {
    await open(page); await reset(page);
    await page.evaluate(() => { cornhole.addClip('heart'); cornhole.select(null); cornhole.showTab('art'); });
    expect(await page.locator('#images .itemdel').count()).toBe(1);
    await page.click('#images .itemdel');
    expect(await page.evaluate(() => cornhole.activeBoard().elements.map((e) => e.type))).toEqual(['text']);
    await page.evaluate(() => cornhole.showTab('text'));
    await page.click('#texts .itemdel');
    expect(await page.evaluate(() => cornhole.activeBoard().elements.length)).toBe(0);
    expect(await page.locator('#texts .item').count()).toBe(0);
  });

  test('picking something up on the board opens the tab that edits it', async ({ page }) => {
    await open(page); await reset(page);
    expect(await page.getAttribute('#tab-board', 'data-open')).toBe('true');
    const p = await clientPoint(page, 'a', 12, 30);
    await page.mouse.click(p.x, p.y);
    expect(await page.evaluate(() => cornhole.selected)).toBe('t1');
    expect(await page.getAttribute('#tab-text', 'data-open')).toBe('true');
    expect(await page.isHidden('#textprops')).toBe(false);
  });

  test('with two boards, one tap copies this board to the other or makes the other its colour opposite', async ({ page }) => {
    await open(page); await reset(page);
    await page.click('#boardmode .chip[data-v="a"]');
    await page.click('#paints .sw[data-v="#c8102e"]');
    /* A: a red board with white text. B: the opposite. */
    await page.click('#swapcolours');
    const b = await page.evaluate(() => cornhole.design.b);
    expect(b.base.color).toBe('#ffffff');
    expect(b.elements[0].color).toBe('#c8102e');
    expect(b.elements[0].text).toBe('HELLO');
    expect(b.elements[0].id).not.toBe('t1');
    expect(await pixelAt(page, 'b', 2, 40)).toEqual([...WHITE, 255]);
    expect(await pixelAt(page, 'a', 2, 40)).toEqual([...RED, 255]);
    expect(await page.evaluate(() => cornhole.active), 'still editing A').toBe('a');
    await page.click('#copyother');
    expect((await page.evaluate(() => cornhole.design.b)).base.color).toBe('#c8102e');
    expect(await pixelAt(page, 'b', 2, 40)).toEqual([...RED, 255]);
    await page.click('#boardmode .chip[data-v="same"]');
    expect(await page.evaluate(() => cornhole.design.same)).toBe(true);
    expect(await page.isHidden('#boardactions')).toBe(true);
  });

  test('the order tab is three screens the height of the other tabs: options and price, review, then the address', async ({ page }) => {
    await open(page); await reset(page);
    const heightOf = async (tab) => { await page.evaluate((t) => cornhole.showTab(t), tab); return (await page.locator('#tab-' + tab).boundingBox()).height; };
    const board = await heightOf('board');
    const order1 = await heightOf('order');
    expect(await page.isHidden('#orderstep1')).toBe(false);
    expect(await page.isHidden('#orderstep2')).toBe(true);
    expect(order1, 'the first step is about the height of the Board tab').toBeLessThan(board + 150);
    await page.click('#toreview');
    expect(await page.isHidden('#orderstep1')).toBe(true);
    expect(await page.isHidden('#orderstep2')).toBe(false);
    await expect(page.locator('#reviewlist')).toContainText('Set of 2 boards');
    expect((await page.locator('#tab-order').boundingBox()).height, 'the review too').toBeLessThan(board + 260);
    await page.click('#tocheckout');
    expect(await page.isHidden('#orderstep3')).toBe(false);
    await expect(page.locator('#ordersummary')).toContainText('Set of 2 boards');
    expect((await page.locator('#tab-order').boundingBox()).height, 'and the address').toBeLessThan(board + 150);
    await page.click('#backtoorder');
    expect(await page.isHidden('#orderstep2')).toBe(false);
    await page.click('#backtooptions');
    expect(await page.isHidden('#orderstep1')).toBe(false);
  });

  test('on a phone the board pins under the header, the handles grow to finger size, and both boards show when they differ', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page); await reset(page);
    const canvas = await page.locator('#canvasA').boundingBox();
    expect(canvas.width, 'a board small enough to leave room for the controls').toBeLessThan(200);
    expect(await page.isHidden('#boardB'), 'B is a copy of A, so it stays out of the way').toBe(true);
    expect(await page.isHidden('nav.site a')).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 450));
    await page.waitForTimeout(100);
    const after = await page.locator('#canvasA').boundingBox();
    expect(after.y, 'still on screen after scrolling to the controls').toBeGreaterThanOrEqual(50);
    expect(after.y, 'pinned just under the header').toBeLessThan(150);
    /* Handles are sized in screen pixels: the rotate handle sits well clear of the box. */
    const spots = await page.evaluate(() => { cornhole.paint(); const b = cornhole.boxes.get('t1'); return { top: 30 - b.h / 2 - 0.15, rotate: cornhole.handlePoints('t1').rotate.y }; });
    expect(spots.top - spots.rotate).toBeGreaterThan(2);
    /* A tap selects and opens the Text tab. */
    await page.evaluate(() => window.scrollTo(0, 0));
    const p = await clientPoint(page, 'a', 12, 30);
    await page.mouse.click(p.x, p.y);
    expect(await page.evaluate(() => cornhole.selected)).toBe('t1');
    expect(await page.getAttribute('#tab-text', 'data-open')).toBe('true');
    /* Two different boards: on a phone only the one being edited shows. */
    await page.click('#boardmode .chip[data-v="b"]');
    expect(await page.isHidden('#boardB')).toBe(false);
    expect(await page.isHidden('#boardA'), 'one compact preview').toBe(true);
    await page.click('#boardmode .chip[data-v="a"]');
    expect(await page.isHidden('#boardA')).toBe(false);
    expect(await page.isHidden('#boardB')).toBe(true);
  });
});

test.describe('the audit: saving, keyboard, guidance, pricing, review and print quality', () => {
  const RED_JPEG = 'g.fillStyle = "#ff0000"; g.fillRect(0, 0, w, h);';

  test('a customised design asks before a template replaces it, and still asks after a reload', async ({ page }) => {
    await open(page); await reset(page);
    await page.evaluate(() => { cornhole.activeBoard().elements[0].text = 'THE MILLERS'; cornhole.commit(); });
    await settled(page);
    await reloaded(page);
    expect(await page.evaluate(() => cornhole.design.a.elements[0].text), 'the work came back').toBe('THE MILLERS');
    expect(await page.evaluate(() => cornhole.isPristine())).toBe(false);
    let asked = 0;
    page.on('dialog', (d) => { asked++; d.dismiss(); });
    await page.evaluate(() => cornhole.showTab('templates'));
    await page.click('#templates .tpl[data-id="team"]');
    await page.waitForTimeout(150);
    expect(asked, 'it asked').toBe(1);
    expect(await page.evaluate(() => cornhole.design.a.elements[0].text), 'and no was no').toBe('THE MILLERS');
    /* A design nobody touched is replaced without a question. */
    await page.evaluate(() => cornhole.applyTemplate('wedding'));
    await page.evaluate(() => cornhole.showTab('templates'));
    await page.click('#templates .tpl[data-id="team"]');
    await page.waitForTimeout(150);
    expect(asked).toBe(1);
    expect(await page.evaluate(() => cornhole.design.a.elements.some((e) => e.text === 'YOUR TEAM'))).toBe(true);
  });

  test('the boards, a picture with its master, and every order choice survive a reload', async ({ page }) => {
    await open(page); await reset(page);
    await page.click('#paints .sw[data-v="#c8102e"]');
    await page.setInputFiles('#addimage', await picture(page, 2000, 1000, 'image/jpeg', RED_JPEG));
    await page.waitForFunction(() => cornhole.activeBoard().elements.some((e) => e.type === 'image'));
    await page.evaluate(() => cornhole.showTab('order'));
    await chip(page, 'finish', 'gloss');
    await chip(page, 'bags', 'regulation');
    await setInput(page, 'bag1', '#00ff00');
    await page.check('#carrycase'); await page.check('#rush');
    await setInput(page, 'qty', 2);
    await page.selectOption('#occasion', 'family');
    await setInput(page, 'needby', '2999-06-14');
    await page.click('#toreview'); await page.click('#tocheckout');
    await page.fill('#giftnote', 'Happy birthday, Dad');
    await settled(page);
    await reloaded(page);
    const d = await page.evaluate(() => cornhole.design);
    expect(d.a.base.color).toBe('#c8102e');
    const img = d.a.elements.find((e) => e.type === 'image');
    expect(img.px).toEqual([2000, 1000]);
    expect(img.orig, 'the master travelled with it').toMatch(/^data:image\/jpeg;base64,/);
    const sizes = await page.evaluate((el) => Promise.all([el.src, el.orig].map((s) => new Promise((r) => { const i = new Image(); i.onload = () => r(i.naturalWidth); i.src = s; }))), img);
    expect(sizes, 'preview at 1600, master at 2000').toEqual([1600, 2000]);
    expect(await page.evaluate(() => ({ ...cornhole.order }))).toEqual({ product: 'set', quantity: 2, finish: 'gloss', bags: 'regulation', bagColors: ['#00ff00', '#1f3a93'], rush: true, carryCase: true, occasion: 'family', needBy: '2999-06-14', giftNote: 'Happy birthday, Dad' });
    expect(await page.textContent('#headtotal')).toBe('$' + ((2 * (24900 + 4000 + 4500 + 3500) + 5000 + 5900 + 2500) / 100).toFixed(2));
    expect(await page.textContent('.stagebar .savestatus')).toContain('Saved on this device');
  });

  test('when the browser cannot store the project it says so, offers the export, and keeps the pictures', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'indexedDB', { get: () => undefined });
      Storage.prototype.setItem = function () { throw new Error('QuotaExceededError'); };
    });
    await open(page); await reset(page);
    await page.setInputFiles('#addimage', await picture(page, 400, 400, 'image/png', RED_JPEG));
    await page.waitForFunction(() => cornhole.activeBoard().elements.some((e) => e.type === 'image'));
    await page.waitForFunction(() => cornhole.saveState === 'error');
    expect(await page.textContent('.stagebar .savestatus')).toContain('Not saved');
    expect(await page.textContent('#savealert'), 'the one live region speaks for trouble').toContain('Not saved');
    expect(await page.isHidden('#exportlink'), 'the way out is offered').toBe(false);
    expect(await page.evaluate(() => cornhole.activeBoard().elements.filter((e) => e.type === 'image').length), 'nothing was dropped').toBe(1);
    const dl = page.waitForEvent('download');
    await page.click('#exportlink');
    expect((await dl).suggestedFilename()).toMatch(/^cornhole-project-.*\.json$/);
  });

  test('an exported project file is editable JSON, and importing it brings everything back', async ({ page }) => {
    await open(page); await reset(page);
    await page.click('#paints .sw[data-v="#c8102e"]');
    await page.evaluate(() => { cornhole.activeBoard().elements[0].text = 'EXPORTED'; cornhole.commit(); cornhole.setOrder({ finish: 'gloss', quantity: 3 }); });
    const dl = page.waitForEvent('download');
    await page.evaluate(() => cornhole.showTab('templates'));
    await page.click('#exportbtn');
    const file = await (await dl).path();
    const json = JSON.parse(readFileSync(file, 'utf8'));
    expect(json.app).toBe('cornhole-builder');
    expect(json.design.a.elements[0].text).toBe('EXPORTED');
    expect(json.order.finish).toBe('gloss');
    /* Edit the file by hand, then bring it back over a different design. */
    json.design.a.elements[0].text = 'EDITED BY HAND';
    await page.evaluate(() => { cornhole.applyTemplate('wedding'); cornhole.setOrder({ finish: 'satin', quantity: 1 }); });
    page.once('dialog', dialog => dialog.accept());
    await page.setInputFiles('#importfile', { name: 'p.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(json)) });
    await page.waitForFunction(() => cornhole.design.a.elements[0] && cornhole.design.a.elements[0].text === 'EDITED BY HAND');
    expect(await page.evaluate(() => cornhole.design.a.base.color)).toBe('#c8102e');
    expect(await page.evaluate(() => cornhole.order.finish)).toBe('gloss');
    expect(await page.evaluate(() => cornhole.order.quantity)).toBe(3);
    expect(await pixelAt(page, 'a', 2, 40)).toEqual([...RED, 255]);
  });

  test('Delete and the arrows leave the artwork alone while a tab, a slider or a field has the focus; the board takes them', async ({ page }) => {
    await open(page); await reset(page);
    await page.evaluate(() => { cornhole.select('t1'); cornhole.showTab('board'); });
    await page.focus('#tabbtn-board');
    await page.keyboard.press('Delete');
    await page.keyboard.press('ArrowRight');
    expect(await page.evaluate(() => cornhole.activeBoard().elements.length), 'a Delete on the tab bar removes nothing').toBe(1);
    expect(await page.evaluate(() => cornhole.activeBoard().elements[0].x)).toBe(12);
    await page.focus('#patsize');
    await page.keyboard.press('Delete'); await page.keyboard.press('ArrowUp');
    expect(await page.evaluate(() => cornhole.activeBoard().elements.length)).toBe(1);
    expect(await page.evaluate(() => cornhole.activeBoard().elements[0].y)).toBe(30);
    await page.evaluate(() => cornhole.showTab('text'));
    await page.focus('#ttext');
    await page.keyboard.press('Delete');
    expect(await page.evaluate(() => cornhole.activeBoard().elements.length)).toBe(1);
    /* The board itself: a click gives it the focus, then the keys work. */
    const p = await clientPoint(page, 'a', 12, 30);
    await page.mouse.click(p.x, p.y);
    expect(await page.evaluate(() => document.activeElement && document.activeElement.id)).toBe('canvasA');
    await page.keyboard.press('ArrowRight');
    expect(await page.evaluate(() => cornhole.activeBoard().elements[0].x)).toBeCloseTo(12.1, 5);
    await page.keyboard.press('Delete');
    expect(await page.evaluate(() => cornhole.activeBoard().elements.length)).toBe(0);
  });

  test('the tabs are one tab stop and move with the arrow keys; sliders and colours are labelled', async ({ page }) => {
    await open(page); await reset(page);
    await page.focus('#tabbtn-board');
    await page.keyboard.press('ArrowRight');
    expect(await page.getAttribute('#tab-text', 'data-open')).toBe('true');
    expect(await page.evaluate(() => document.activeElement.id)).toBe('tabbtn-text');
    await page.keyboard.press('End');
    expect(await page.getAttribute('#tab-order', 'data-open')).toBe('true');
    await page.keyboard.press('ArrowRight');
    expect(await page.getAttribute('#tab-templates', 'data-open')).toBe('true');
    expect(await page.locator('.tabs [role=tab][tabindex="0"]').count(), 'one tab in the Tab order').toBe(1);
    const unlabelled = await page.evaluate(() => {
      const out = [];
      for (const i of document.querySelectorAll('input[type=range], input[type=color]')) {
        const ok = i.getAttribute('aria-label') || (i.id && document.querySelector('label[for="' + i.id + '"]')) || i.closest('label');
        if (!ok) out.push(i.id || i.outerHTML.slice(0, 60));
      }
      return out;
    });
    expect(unlabelled).toEqual([]);
  });

  test('templates are grouped by occasion with a blank start, and a template hands over its first words', async ({ page }) => {
    await open(page); await reset(page);
    expect(await page.locator('#templates .tplgroup').count()).toBeGreaterThanOrEqual(6);
    await expect(page.locator('#templates .tplgroup').first()).toHaveText('Weddings');
    page.on('dialog', (d) => d.accept());
    await page.evaluate(() => cornhole.showTab('templates'));
    await page.click('#templates .tpl[data-id="team"]');
    await page.waitForTimeout(150);
    expect(await page.getAttribute('#tab-text', 'data-open'), 'straight to the words').toBe('true');
    const first = await page.evaluate(() => cornhole.design.a.elements.find((e) => e.type === 'text').id);
    expect(await page.evaluate(() => cornhole.selected)).toBe(first);
    expect(await page.evaluate(() => document.activeElement.id)).toBe('ttext');
    expect(await page.evaluate(() => document.activeElement.selectionEnd)).toBe('YOUR TEAM'.length);
    await page.keyboard.type('THE MILLERS');
    expect(await page.evaluate(() => cornhole.design.a.elements.find((e) => e.type === 'text').text)).toBe('THE MILLERS');
    await page.evaluate(() => cornhole.showTab('templates'));
    await page.click('#startblank');
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => cornhole.design.a.elements.length), 'blank means blank').toBe(0);
    expect(await pixelAt(page, 'a', 12, 30)).toEqual([...NAVY, 255]);
  });

  test('the words are changed straight from the list, and the focus stays in the row while typing', async ({ page }) => {
    await open(page); await reset(page);
    await page.evaluate(() => { cornhole.addClip('heart'); cornhole.select(null); cornhole.showTab('text'); });
    const q = page.locator('#texts textarea.quick');
    expect(await q.count()).toBe(1);
    await q.fill('');
    await q.type('SMITH FAMILY');
    expect(await page.evaluate(() => cornhole.design.a.elements[0].text)).toBe('SMITH FAMILY');
    expect(await page.evaluate(() => document.activeElement.classList.contains('quick')), 'the field kept the focus').toBe(true);
    expect(await page.evaluate(() => cornhole.selected), 'typing in a row selects it').toBe('t1');
    const ink = await bounds(page, 'a', WHITE);
    expect(ink.x1 - ink.x0, 'the board shows the new words').toBeGreaterThan(8);
    /* Advanced controls are tucked away; the everyday ones are not. */
    expect(await page.isHidden('#tsize')).toBe(false);
    expect(await page.evaluate(() => document.getElementById('textmore').open)).toBe(false);
    expect(await page.isHidden('#tarc')).toBe(true);
  });

  test('the review shows the boards, the choices and the breakdown, and holds sample words until they are confirmed', async ({ page }) => {
    await open(page);
    /* The page's own default still says YOUR TEAM. */
    await page.evaluate(() => { cornhole.showTab('order'); cornhole.showOrderStep(2); });
    expect(await page.locator('#reviewboards img').count()).toBe(1);
    await expect(page.locator('#reviewlist')).toContainText('Set of 2 boards');
    await expect(page.locator('#reviewquote')).toContainText('$308.00');
    await expect(page.locator('#reviewnote')).toContainText('Bags are not included');
    await expect(page.locator('#reviewnote')).toContainText('not guarantees');
    await expect(page.locator('#reviewlist')).toContainText('Dispatch');
    expect(await page.isHidden('#samplewarn')).toBe(false);
    await expect(page.locator('#sampletext')).toContainText('YOUR TEAM');
    expect(await page.isDisabled('#tocheckout'), 'not past the sample words without a say-so').toBe(true);
    await page.check('#keepsamples');
    expect(await page.isDisabled('#tocheckout')).toBe(false);
    await page.click('#backtoedit');
    expect(await page.getAttribute('#tab-text', 'data-open')).toBe('true');
    await page.evaluate(() => { cornhole.design.a.elements[0].text = 'OUR REUNION'; cornhole.commit(); cornhole.setMode('b'); cornhole.showTab('order'); cornhole.showOrderStep(2); });
    expect(await page.isHidden('#samplewarn')).toBe(true);
    expect(await page.isDisabled('#tocheckout')).toBe(false);
    expect(await page.locator('#reviewboards img').count(), 'two different boards, two pictures').toBe(2);
  });

  test('the date helper counts business days and never recommends a rush that cannot be done', async ({ page }) => {
    await open(page); await reset(page);
    await page.evaluate(() => cornhole.showTab('order'));
    const plus = (days) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
    await setInput(page, 'needby', plus(3));
    await expect(page.locator('#needbyhint')).toContainText('cannot be ready');
    await expect(page.locator('#needbyhint')).not.toContainText('tick Rush');
    await setInput(page, 'needby', plus(14));
    await expect(page.locator('#needbyhint')).toContainText('tick Rush build');
    await expect(page.locator('#needbyhint')).toContainText('delivery takes time on top');
    await page.check('#rush');
    await expect(page.locator('#needbyhint')).toContainText('cannot promise an arrival date');
    await setInput(page, 'needby', plus(60));
    await expect(page.locator('#needbyhint')).toContainText('Plenty of time');
    await expect(page.locator('#leadtime')).toContainText('Dispatch');
    await expect(page.locator('#leadtime')).toContainText('not guaranteed');
  });

  test('pricing is explained from the price list: the default is $249 plus $59 shipping, bags extra, contiguous US', async ({ page }) => {
    await open(page); await reset(page);
    await page.evaluate(() => cornhole.showTab('order'));
    expect(await page.textContent('#headtotal')).toBe('$308.00');
    await expect(page.locator('#quote')).toContainText('Shipping (contiguous US)');
    await expect(page.locator('#quote tr.total')).toContainText('USD, before tax');
    await expect(page.locator('#pricenote')).toContainText('2 regulation boards');
    await expect(page.locator('#pricenote')).toContainText('Bags are not included');
    await expect(page.locator('#pricenote')).toContainText('contiguous United States');
    await page.click('#toreview');
    await expect(page.locator('#shipnote')).toContainText('contiguous United States');
    await expect(page.locator('#howdispatch')).toContainText('15 business days');
    const states = await page.evaluate(() => [...document.querySelectorAll('#state option')].map((o) => o.value));
    expect(states).not.toContain('AK'); expect(states).not.toContain('HI'); expect(states).toContain('TX');
  });

  test('the header link to How it works opens the steps it names, and so does a link to #how', async ({ page }) => {
    await open(page); await reset(page);
    const firstStep = page.locator('#how .step').first();
    await expect(firstStep).toBeHidden();
    await page.click('nav.site a[href="#how"]');
    await expect(page.locator('#how > details')).toHaveJSProperty('open', true);
    await expect(firstStep).toBeVisible();
    await expect(page.locator('#howdispatch')).toBeInViewport();
    await page.goto('about:blank');
    await open(page, { query: '#how' });
    await expect(page.locator('#how > details')).toHaveJSProperty('open', true);
    await expect(firstStep).toBeVisible();
  });

  test('a picture keeps its full-size master apart from the preview, warns when printed too big, and prints from the master', async ({ page }) => {
    await open(page); await reset(page);
    await page.evaluate(() => { cornhole.activeBoard().elements = []; });
    await page.setInputFiles('#addimage', await picture(page, 1200, 600, 'image/jpeg', RED_JPEG));
    await page.waitForFunction(() => cornhole.activeBoard().elements.some((e) => e.type === 'image'));
    const el = await page.evaluate(() => cornhole.activeBoard().elements[0]);
    expect(el.px).toEqual([1200, 600]);
    expect(el.orig).toMatch(/^data:image\/jpeg/);
    expect(await page.isHidden('#ireswarn'), '120 dots per inch at 10" wide is fine').toBe(true);
    await setInput(page, 'iwidth', 24);
    expect(await page.isHidden('#ireswarn')).toBe(false);
    await expect(page.locator('#ireswarn')).toContainText('50 dots per inch');
    await expect(page.locator('#ireswarn')).toContainText('blurry');
    await page.evaluate(() => { cornhole.showTab('order'); cornhole.showOrderStep(2); });
    expect(await page.isHidden('#reswarn')).toBe(false);
    await expect(page.locator('#reswarn')).toContainText('50 dots per inch');
    const printed = await page.evaluate(async () => { await cornhole.preloadImages(); const g = cornhole.printCanvas('a').getContext('2d'); return Array.from(g.getImageData(1200, 3000, 1, 1).data); });
    expect(printed[0], 'red, within JPEG rounding').toBeGreaterThan(250); expect(printed[1]).toBeLessThan(6); expect(printed[2]).toBeLessThan(6);
    const payload = await page.evaluate(() => cornhole.orderPayload());
    expect(payload.options.assets).toBe('included');
    expect(payload.design.a.elements[0].orig).toMatch(/^data:image\/jpeg/);
  });

  test('a lossless logo no bigger than the preview is kept once, and a huge one is re-encoded for print', async ({ page }) => {
    await open(page); await reset(page);
    await page.evaluate(() => { cornhole.activeBoard().elements = []; });
    await page.setInputFiles('#addimage', await picture(page, 400, 400, 'image/png', RED_JPEG));
    await page.waitForFunction(() => cornhole.activeBoard().elements.some((e) => e.type === 'image'));
    let el = await page.evaluate(() => cornhole.activeBoard().elements[0]);
    expect(el.orig).toBeUndefined(); expect(el.px).toEqual([400, 400]);
    await page.evaluate(() => { cornhole.activeBoard().elements = []; });
    await page.setInputFiles('#addimage', await picture(page, 5000, 2500, 'image/png', RED_JPEG));
    await page.waitForFunction(() => cornhole.activeBoard().elements.some((e) => e.type === 'image'));
    el = await page.evaluate(() => cornhole.activeBoard().elements[0]);
    expect(el.px, 'the master is capped at 4000 on the long side').toEqual([4000, 2000]);
    expect(el.orig.length).toBeLessThan(3_000_000 * 1.4);
  });

  for (const width of [360, 375, 390]) {
    test('at ' + width + 'px the board stays pinned, the Review bar covers nothing, and a tap selects without the page dragging', async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await open(page); await reset(page);
      expect(await page.locator('#canvasA').boundingBox().then((b) => b.width)).toBeLessThan(200);
      expect(await page.isHidden('#mobilebar')).toBe(false);
      const bar = await page.locator('#mobilebar').boundingBox();
      const pad = await page.evaluate(() => parseFloat(getComputedStyle(document.body).paddingBottom));
      expect(pad, 'the page leaves room for the bar').toBeGreaterThanOrEqual(bar.height - 2);
      /* The controls are right under the board, not a screen away. */
      const canvas = await page.locator('#canvasA').boundingBox(), tabs = await page.locator('.tabs').boundingBox();
      expect(tabs.y - (canvas.y + canvas.height)).toBeLessThan(120);
      expect(await page.evaluate(() => getComputedStyle(document.getElementById('canvasA')).touchAction), 'a finger on the board scrolls').toContain('pan-y');
      const p = await clientPoint(page, 'a', 12, 30);
      await page.mouse.click(p.x, p.y);
      expect(await page.evaluate(() => cornhole.selected)).toBe('t1');
      expect(await page.evaluate(() => getComputedStyle(document.getElementById('canvasA')).touchAction), 'with a selection the board takes the drag').toBe('none');
      await page.evaluate(() => window.scrollTo(0, 500));
      await page.waitForTimeout(100);
      const after = await page.locator('#canvasA').boundingBox();
      expect(after.y).toBeGreaterThanOrEqual(50); expect(after.y).toBeLessThan(180);
      await page.click('#reviewbtn');
      expect(await page.getAttribute('#tab-order', 'data-open')).toBe('true');
      expect(await page.isHidden('#orderstep2')).toBe(false);
      expect(await page.isHidden('#mobilebar'), 'the bar steps aside on the order tab').toBe(true);
      await page.evaluate(() => cornhole.setMode('b'));
      expect(await page.isHidden('#canvasA'), 'one compact preview: the board being edited').toBe(true);
      expect(await page.isHidden('#canvasB')).toBe(false);
      await expect(page.locator('#boardmode .chip[aria-pressed="true"]')).toHaveText('Board B');
    });
  }

  test('on a tablet two different boards sit side by side under the switch', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await open(page); await reset(page);
    await page.evaluate(() => cornhole.setMode('b'));
    const [a, b] = await Promise.all([page.locator('#canvasA').boundingBox(), page.locator('#canvasB').boundingBox()]);
    expect(a).not.toBeNull(); expect(b).not.toBeNull();
    expect(Math.abs(a.y - b.y)).toBeLessThan(2);
    expect(await page.isHidden('#mobilebar')).toBe(false);
  });
});

test.describe('the second audit round: saving as you type, focus that never falls off the page, honest pictures and orders', () => {
  const RED = 'g.fillStyle = "#ff0000"; g.fillRect(0, 0, w, h);';
  const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200"><rect width="300" height="200" fill="#ff0000"/></svg>';

  test('words typed into the field are on the device before the field is left', async ({ page }) => {
    await open(page); await reset(page);
    await page.evaluate(() => { cornhole.select('t1'); cornhole.showTab('text'); });
    await settled(page);
    await page.focus('#ttext');
    await page.keyboard.press('End');
    await page.keyboard.type(' WORLD');
    expect(await page.evaluate(() => cornhole.saveState), 'says so while it is on its way').toBe('saving');
    await settled(page);
    expect(await page.evaluate(() => document.activeElement.id), 'the field was never left').toBe('ttext');
    await reloaded(page);
    expect(await page.evaluate(() => cornhole.design.a.elements[0].text)).toBe('HELLO WORLD');
  });

  test('the save status is one quiet line, not a live region that chatters', async ({ page }) => {
    await open(page); await reset(page);
    expect(await page.locator('.savestatus[role=status]').count()).toBe(0);
    expect(await page.locator('#savealert').count()).toBe(1);
    await page.evaluate(() => { cornhole.select('t1'); cornhole.showTab('text'); });
    await page.focus('#ttext'); await page.keyboard.type('!');
    await settled(page);
    expect(await page.textContent('#savealert'), 'nothing to announce when all is well').toBe('');
  });

  test('the quantity can be cleared and retyped without jumping to 10', async ({ page }) => {
    await open(page); await reset(page);
    await page.evaluate(() => cornhole.showTab('order'));
    await page.click('#qty');
    await page.keyboard.press('Control+a'); await page.keyboard.press('Backspace');
    await page.keyboard.type('3');
    expect(await page.inputValue('#qty')).toBe('3');
    expect(await page.evaluate(() => cornhole.order.quantity)).toBe(3);
    await page.keyboard.press('Tab');
    expect(await page.inputValue('#qty')).toBe('3');
    expect(await page.textContent('#headtotal')).toBe('$' + ((3 * 24900 + 5900 + 2 * 2500) / 100).toFixed(2));
  });

  test('keys with Ctrl, Cmd or Alt held are the browser\'s, even on the focused board', async ({ page }) => {
    await open(page); await reset(page);
    const p = await clientPoint(page, 'a', 12, 30);
    await page.mouse.click(p.x, p.y);
    expect(await page.evaluate(() => cornhole.selected)).toBe('t1');
    await page.keyboard.press('Control+='); await page.keyboard.press('Control+-'); await page.keyboard.press('Alt+ArrowRight');
    const el = await page.evaluate(() => cornhole.activeBoard().elements[0]);
    expect(el.size).toBe(4); expect(el.x).toBe(12);
    await page.keyboard.press('=');
    expect(await page.evaluate(() => cornhole.activeBoard().elements[0].size)).toBe(4.2);
  });

  test('Remove in the props and the last x in a list hand the focus to the list or the add button, never to nowhere', async ({ page }) => {
    await open(page); await reset(page);
    await page.evaluate(() => { cornhole.showTab('text'); document.getElementById('addtext').click(); });
    await page.evaluate(() => cornhole.select('t1'));
    await page.focus('#tdel'); await page.keyboard.press('Enter');
    expect(await page.evaluate(() => cornhole.activeBoard().elements.filter((e) => e.type === 'text').length)).toBe(1);
    expect(await page.evaluate(() => document.activeElement.classList.contains('item')), 'on the remaining layer, ready to edit').toBe(true);
    await page.focus('#texts .itemdel');
    await page.keyboard.press('Enter');
    expect(await page.evaluate(() => document.activeElement.id), 'the list is empty: the add button').toBe('addtext');
    await page.evaluate(() => { cornhole.addClip('heart'); cornhole.showTab('art'); });
    await page.focus('#images .itemdel'); await page.keyboard.press('Enter');
    expect(await page.evaluate(() => cornhole.activeBoard().elements.length)).toBe(0);
    expect(await page.evaluate(() => document.activeElement.id)).toBe('addimagebtn');
  });

  test('Import project and Add a picture are real buttons in the Tab order; the file inputs are not', async ({ page }) => {
    await open(page); await reset(page);
    await page.evaluate(() => cornhole.showTab('templates'));
    await page.focus('#exportbtn'); await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement.id)).toBe('importbtn');
    expect(await page.evaluate(() => document.activeElement.tagName)).toBe('BUTTON');
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement.id)).not.toBe('importfile');
    expect(await page.getAttribute('#addimage', 'tabindex')).toBe('-1');
    expect(await page.evaluate(() => document.getElementById('addimagebtn').tagName)).toBe('BUTTON');
  });

  test('importing a file asks before it replaces a customised design', async ({ page }) => {
    await open(page); await reset(page);
    let asked = 0;
    page.on('dialog', (d) => { asked++; d.dismiss(); });
    const json = await page.evaluate(() => ({ app: 'cornhole-builder', ...cornhole.projectRecord() }));
    json.design.a.elements[0].text = 'FROM THE FILE';
    await page.evaluate(() => { cornhole.activeBoard().elements[0].text = 'MY OWN WORK'; cornhole.commit(); });
    await page.setInputFiles('#importfile', { name: 'p.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(json)) });
    await page.waitForTimeout(200);
    expect(asked).toBe(1);
    expect(await page.evaluate(() => cornhole.design.a.elements[0].text), 'declined: nothing replaced').toBe('MY OWN WORK');
  });

  test('moving between the order steps carries the keyboard focus along; Back to editing lands on the tab', async ({ page }) => {
    await open(page); await reset(page);
    await page.evaluate(() => cornhole.showTab('order'));
    await page.focus('#toreview'); await page.keyboard.press('Enter');
    expect(await page.evaluate(() => document.activeElement.textContent)).toBe('Review your order');
    await page.focus('#tocheckout'); await page.keyboard.press('Enter');
    expect(await page.evaluate(() => document.activeElement.textContent)).toBe('Your details');
    await page.focus('#backtoorder'); await page.keyboard.press('Enter');
    expect(await page.evaluate(() => document.activeElement.textContent)).toBe('Review your order');
    await page.focus('#backtoedit'); await page.keyboard.press('Enter');
    expect(await page.evaluate(() => document.activeElement.id)).toBe('tabbtn-board');
  });

  test('clearing the words leaves nothing behind, and the row\'s buttons are named after the words as they change', async ({ page }) => {
    await open(page); await reset(page);
    await page.evaluate(() => { cornhole.select('t1'); cornhole.showTab('text'); });
    await page.fill('#ttext', '');
    expect(await page.evaluate(() => cornhole.activeBoard().elements[0].text)).toBe('');
    await page.keyboard.type('SMITHS');
    expect(await page.evaluate(() => cornhole.activeBoard().elements[0].text)).toBe('SMITHS');
    expect(await page.getAttribute('#texts .itemdel', 'aria-label')).toBe('Remove "SMITHS"');
    expect(await page.getAttribute('#texts .item', 'aria-label')).toBe('Select "SMITHS"');
    const q = page.locator('#texts textarea.quick');
    await q.fill('JONES');
    expect(await page.getAttribute('#texts .itemdel', 'aria-label')).toBe('Remove "JONES"');
    /* An empty text is not sent with an order. */
    await page.fill('#ttext', '');
    const payload = await page.evaluate(() => cornhole.orderPayload());
    expect(payload.design.a.elements.filter((e) => e.type === 'text')).toEqual([]);
  });

  test('with two different boards, the board that takes the focus is the one the keys edit, and wears its own ring', async ({ page }) => {
    await open(page); await reset(page);
    await page.evaluate(() => { cornhole.setMode('b'); cornhole.select(cornhole.activeBoard().elements[0].id); });
    expect(await page.evaluate(() => cornhole.active)).toBe('b');
    await page.focus('#canvasA');
    expect(await page.evaluate(() => cornhole.active), 'the focused board is the active one').toBe('a');
    await page.keyboard.press('ArrowRight');
    expect(await page.evaluate(() => cornhole.design.b.elements[0].x), 'Board B was left alone').toBe(12);
    expect(await page.evaluate(() => getComputedStyle(document.getElementById('canvasA')).outlineStyle)).toBe('solid');
    await page.focus('#canvasB');
    expect(await page.evaluate(() => getComputedStyle(document.getElementById('canvasA')).outlineStyle), 'the ring is on the board with the focus').not.toBe('solid');
  });

  test('an order with small logos says its pictures are included, and sends only the board being ordered', async ({ page }) => {
    await open(page); await reset(page);
    await page.setInputFiles('#addimage', await picture(page, 400, 400, 'image/png', RED));
    await page.waitForFunction(() => cornhole.activeBoard().elements.some((e) => e.type === 'image'));
    let payload = await page.evaluate(() => cornhole.orderPayload());
    expect(payload.options.assets).toBe('included');
    /* Board B keeps a leftover copy, pictures and all, that the order does not carry. */
    await page.evaluate(() => { cornhole.setMode('b'); cornhole.setMode('same'); });
    expect(await page.evaluate(() => cornhole.design.b.elements.length)).toBe(2);
    payload = await page.evaluate(() => cornhole.orderPayload());
    expect(payload.design.b.elements).toEqual([]);
    expect(payload.design.a.elements.filter((e) => e.type === 'image').length).toBe(1);
  });

  test('a vector logo is drawn large for the preview and larger for print, and a WebP photo is previewed as JPEG with the file as its master', async ({ page }) => {
    await open(page); await reset(page);
    await page.evaluate(() => { cornhole.activeBoard().elements = []; });
    await page.setInputFiles('#addimage', { name: 'logo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(SVG) });
    await page.waitForFunction(() => cornhole.activeBoard().elements.some((e) => e.type === 'image'));
    let el = await page.evaluate(() => cornhole.activeBoard().elements[0]);
    expect(el.px).toEqual([4000, 2667]);
    expect(el.orig).toMatch(/^data:image\/png/);
    const w = await page.evaluate((src) => new Promise((r) => { const i = new Image(); i.onload = () => r(i.naturalWidth); i.src = src; }), el.src);
    expect(w, 'the preview is drawn at full preview size, not at the SVG\'s nominal 300 px').toBe(1600);
    expect(await page.isHidden('#ireswarn')).toBe(true);
    await page.evaluate(() => { cornhole.activeBoard().elements = []; });
    await page.setInputFiles('#addimage', await picture(page, 2000, 1000, 'image/webp', RED));
    await page.waitForFunction(() => cornhole.activeBoard().elements.some((e) => e.type === 'image'));
    el = await page.evaluate(() => cornhole.activeBoard().elements[0]);
    expect(el.src).toMatch(/^data:image\/jpeg/);
    expect(el.orig).toMatch(/^data:image\/webp/);
    expect(el.px).toEqual([2000, 1000]);
  });

  test('photo edits share their image data in undo history and restore exact images', async ({ page }) => {
    await open(page); await reset(page);
    await page.setInputFiles('#addimage', await picture(page, 1600, 1200, 'image/jpeg', RED));
    await page.waitForFunction(() => cornhole.activeBoard().elements.some((e) => e.type === 'image'));
    await settled(page);
    const cdp = await page.context().newCDPSession(page);
    const heap = async () => { await cdp.send('HeapProfiler.collectGarbage'); return (await cdp.send('Runtime.getHeapUsage')).usedSize; };
    const before = await heap();
    await page.evaluate(() => { for (let i = 0; i < 30; i++) { cornhole.activeBoard().elements[0].x += 0.1; cornhole.commit(); } });
    await settled(page);
    expect((await heap()) - before).toBeLessThan(5_000_000);
    await page.evaluate(() => { cornhole.undo(); cornhole.undo(); });
    const img = await page.evaluate(() => cornhole.activeBoard().elements.find((e) => e.type === 'image'));
    expect(img.src, 'undo brings the picture back whole').toMatch(/^data:image\/jpeg;base64,/);
    expect(img.orig).toMatch(/^data:image\/jpeg;base64,/);
    expect(await page.evaluate(() => cornhole.projectRecord().design.a.elements.find((e) => e.type === 'image').src)).toMatch(/^data:image\/jpeg;base64,/);
  });

  test('a gesture the browser cancels puts the element back and records nothing', async ({ page }) => {
    await open(page); await reset(page);
    const p = await clientPoint(page, 'a', 12, 30);
    await page.mouse.click(p.x, p.y);
    expect(await page.evaluate(() => cornhole.selected)).toBe('t1');
    const before = await page.evaluate(() => cornhole.historyLength);
    await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(p.x + 60, p.y + 60, { steps: 4 });
    expect(await page.evaluate(() => cornhole.activeBoard().elements[0].x)).toBeGreaterThan(12);
    await page.evaluate(() => document.getElementById('canvasA').dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, bubbles: true })));
    await page.mouse.up();
    const el = await page.evaluate(() => cornhole.activeBoard().elements[0]);
    expect(el.x).toBe(12); expect(el.y).toBe(30);
    expect(await page.evaluate(() => cornhole.historyLength), 'nothing recorded').toBe(before);
  });

  test('a phone on its side does not pin the board, and an upright one tells the browser what its top is covered by', async ({ page }) => {
    await page.setViewportSize({ width: 740, height: 400 });
    await open(page); await reset(page);
    expect(['static', 'relative']).toContain(await page.evaluate(() => getComputedStyle(document.querySelector('.stage')).position));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.stage')).position)).toBe('sticky');
    const pad = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop));
    const covered = await page.evaluate(() => 60 + document.querySelector('.stage').offsetHeight);
    expect(pad, 'the header plus the stuck stage').toBeGreaterThanOrEqual(covered);
  });

  test('the rush line says about, from the one constant', async ({ page }) => {
    await open(page); await reset(page);
    await page.evaluate(() => cornhole.showTab('order'));
    await expect(page.locator('#rushlabel')).toContainText('about 5 days');
    await page.check('#rush');
    await expect(page.locator('#quote')).toContainText('dispatches in about 5 business days');
    await expect(page.locator('#quote')).not.toContainText('ships in');
  });

  test('a review is of one design: changed since, it is drawn again and says so, and the say-so for sample words is for those words only', async ({ page }) => {
    await open(page);
    await page.evaluate(() => { cornhole.showTab('order'); cornhole.showOrderStep(2); });
    await page.check('#keepsamples');
    expect(await page.isDisabled('#tocheckout')).toBe(false);
    await page.click('#tocheckout');
    expect(await page.isHidden('#orderstep3')).toBe(false);
    await page.evaluate(() => cornhole.showTab('text'));
    await page.click('#addtext');
    await page.evaluate(() => cornhole.showTab('order'));
    expect(await page.isHidden('#orderstep2'), 'back to the review').toBe(false);
    expect(await page.isHidden('#orderstep3')).toBe(true);
    expect(await page.isHidden('#reviewchanged')).toBe(false);
    await expect(page.locator('#sampletext')).toContainText('NEW TEXT');
    expect(await page.isChecked('#keepsamples'), 'different words, a fresh say-so').toBe(false);
    expect(await page.isDisabled('#tocheckout')).toBe(true);
  });

  test('the state has to be chosen, and the bag colours are named in the review', async ({ page }) => {
    await open(page); await reset(page);
    await chip(page, 'bags', 'regulation');
    await page.evaluate(() => cornhole.showTab('order'));
    await page.click('#toreview');
    await expect(page.locator('#reviewlist')).toContainText('4 red and 4 navy');
    expect(await page.locator('#reviewlist .swatchdot').count()).toBe(2);
    expect(await page.evaluate(() => cornhole.colourName('#c8102f'))).toBe('near red');
    await page.click('#tocheckout');
    await page.fill('#name', 'Pat Example'); await page.fill('#email', 'pat@example.com'); await page.fill('#line1', '1 Main St');
    await page.fill('#city', 'Austin'); await page.fill('#postal', '78701');
    expect(await page.inputValue('#state')).toBe('');
    expect(await page.evaluate(() => document.getElementById('orderform').checkValidity()), 'no state, no order').toBe(false);
    await page.selectOption('#state', 'TX');
    expect(await page.evaluate(() => document.getElementById('orderform').checkValidity())).toBe(true);
  });

  test('the fresh page takes no click until the saved project is back, and restores it without writing its initial design over it', async ({ page }) => {
    await open(page); await reset(page);
    await page.evaluate(() => { cornhole.activeBoard().elements[0].text = 'KEPT'; cornhole.commit(); });
    await settled(page);
    /* A slow device: the templates are on screen before the restore lands. */
    await page.addInitScript(() => {
      const openDb = indexedDB.open.bind(indexedDB);
      indexedDB.open = function (...a) {
        const req = openDb(...a);
        let s = null, e = null;
        Object.defineProperty(req, 'onsuccess', { set: (f) => { s = f; }, get: () => s });
        Object.defineProperty(req, 'onerror', { set: (f) => { e = f; }, get: () => e });
        req.addEventListener('success', () => setTimeout(() => s && s(new Event('success')), 1500));
        req.addEventListener('error', () => setTimeout(() => e && e(new Event('error')), 1500));
        return req;
      };
    });
    await page.reload();
    await page.waitForSelector('#templates .tpl');
    expect(await page.evaluate(() => document.body.classList.contains('loading')), 'the builder is shut while the restore runs').toBe(true);
    /* A click on a template does nothing yet: no template, no question. */
    const card = page.locator('#templates .tpl').first();
    await card.scrollIntoViewIfNeeded();
    const box = await card.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    expect(await page.evaluate(() => cornhole.design.a.elements[0].text)).toBe('YOUR TEAM');
    await page.waitForFunction(() => window.cornhole && window.cornhole.loaded);
    expect(await page.evaluate(() => cornhole.design.a.elements[0].text), 'the saved project, not the click').toBe('KEPT');
    expect(await page.evaluate(() => document.body.classList.contains('loading'))).toBe(false);
    expect((await page.evaluate(async () => (await import('/lib/store.mjs')).loadProject())).design.a.elements[0].text, 'and nothing was written over it').toBe('KEPT');
  });
});

test.describe('web fonts', () => {
  test('the font stylesheet does not hold the first paint: the page draws before Google answers, and turns the sheet on when it does', async ({ page }) => {
    /* The markup first. One link to Google, fetched as a print sheet, which
       the browser neither waits for nor applies until its onload turns it
       on; a plain copy inside noscript for a browser with scripts off; and
       the preconnects still ahead of both. */
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const links = [...html.matchAll(/<link\b[^>]*fonts\.googleapis\.com\/css2[^>]*>/g)].map((m) => m[0]);
    expect(links, 'the sheet, and its noscript copy').toHaveLength(2);
    const [sheet, copy] = links;
    expect(sheet).toContain('id="webfonts"');
    expect(sheet).toContain('media="print"');
    expect(sheet).toContain('onload="this.media=\'all\'"');
    expect(copy).not.toMatch(/\b(media|onload)=/);
    expect(html.slice(html.indexOf(sheet), html.indexOf(copy))).toContain('<noscript>');
    const href = (l) => l.match(/href="([^"]+)"/)[1];
    expect(href(copy), 'the same families either way').toBe(href(sheet));
    expect(html.indexOf('<link rel="preconnect" href="https://fonts.googleapis.com">')).toBeLessThan(html.indexOf(sheet));
    expect(html.indexOf('<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>')).toBeLessThan(html.indexOf(sheet));
    expect(html.match(/<link\b[^>]*rel="stylesheet"/g), 'no other stylesheet to wait for').toHaveLength(2);

    /* Then the browser. Google is made to hang, and the page has to come up,
       run and draw its text anyway; a render-blocking sheet would hold the
       module script, and nothing below would happen. */
    let answer;
    const hung = new Promise((r) => { answer = r; });
    await page.route('**/fonts.googleapis.com/**', async (route) => { await hung; await route.fulfill({ status: 200, contentType: 'text/css', body: '' }).catch(() => {}); });
    await page.route('**/fonts.gstatic.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await page.goto('/index.html', { waitUntil: 'commit' });
    await page.waitForFunction(() => window.cornhole && window.cornhole.loaded, null, { timeout: 10_000 });
    await expect(page.locator('.hero h1')).toBeVisible();
    await expect(page.locator('.hero h1')).toHaveText(/cornhole boards/);
    const link = page.locator('#webfonts');
    expect(await link.getAttribute('media'), 'not turned on yet').toBe('print');
    await reset(page);
    expect(await bounds(page, 'a', WHITE), 'the text is on the board, in the fallback face for now').not.toBeNull();
    expect(await page.evaluate(() => [...document.querySelectorAll('#templates .tpl canvas')].length)).toBeGreaterThan(0);

    /* Now Google answers. The sheet is turned on for the screen, and the
       page draws the thumbnails and the boards again, so the canvas asks
       for the faces it uses and the loadingdone repaint has something to
       wait for. Any earlier paint is let land before the watch starts. */
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const drawnAgain = page.evaluate(() => new Promise((res) => {
      const proto = CanvasRenderingContext2D.prototype, clear = proto.clearRect;
      const stop = setTimeout(() => { proto.clearRect = clear; res(false); }, 5000);
      proto.clearRect = function (...a) { proto.clearRect = clear; clearTimeout(stop); res(true); return clear.apply(this, a); };
    }));
    answer();
    await expect.poll(() => link.getAttribute('media'), 'the onload turned it on').toBe('all');
    expect(await drawnAgain, 'drawn again once the sheet is in').toBe(true);
    await page.waitForFunction(() => document.readyState === 'complete');
  });
});
