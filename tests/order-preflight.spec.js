import { test, expect } from '@playwright/test';
import { open, reset, picture, settled } from './helpers.js';

async function review(page) {
  await page.getByRole('tab', { name: 'Order', exact: true }).click();
  await page.click('#toreview');
}

async function fillDetails(page) {
  await page.fill('#name', 'Pat Example');
  await page.fill('#email', 'pat@example.com');
  await page.fill('#line1', '1 Main St');
  await page.fill('#city', 'Austin');
  await page.selectOption('#state', 'TX');
  await page.fill('#postal', '78701');
}

test('adding sample words after review requires confirmation before checkout', async ({ page }) => {
  await open(page); await reset(page);
  await review(page);
  await page.click('#tocheckout');
  await fillDetails(page);
  let posted = null;
  await page.route('**/api/order', async route => {
    posted = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 'CH-PREFLIGHT', total: 30800 }) });
  });
  // Tabs remain available from the address form. A new text layer contains
  // sample wording until the buyer personalizes it.
  await page.getByRole('tab', { name: 'Text', exact: true }).click();
  await page.click('#addtext');
  await page.getByRole('tab', { name: 'Order', exact: true }).click();
  if (await page.locator('#checkout').isVisible()) await page.click('#checkout');
  await expect(page.locator('#samplewarn'), 'new sample wording must return the buyer to its review').toBeVisible();
  await expect(page.locator('#keepsamples')).not.toBeChecked();
  await expect(page.locator('#tocheckout')).toBeDisabled();
  expect(posted, 'unreviewed sample words must not be sent to the order API').toBeNull();
  await page.check('#keepsamples');
  await page.click('#tocheckout');
  await page.click('#checkout');
  await expect(page.locator('#orderstatus')).toContainText('CH-PREFLIGHT');
  expect(posted.design.a.elements.some(el => el.text === 'NEW TEXT')).toBe(true);
});

test('confirming one set of sample words does not confirm different words added later', async ({ page }) => {
  await open(page);
  await review(page);
  await expect(page.locator('#sampletext')).toContainText('YOUR TEAM');
  await page.check('#keepsamples');
  await page.click('#backtoedit');
  await page.locator('#texts .item').first().click();
  await page.fill('#ttext', 'YOUR NAME');
  await review(page);
  await expect(page.locator('#sampletext')).toContainText('YOUR NAME');
  await expect(page.locator('#keepsamples'), 'confirmation belongs to the words the buyer reviewed').not.toBeChecked();
  await expect(page.locator('#tocheckout')).toBeDisabled();
});

test('a review opened during restored image loading includes that picture once it is ready', async ({ page }) => {
  await open(page); await reset(page);
  const file = await picture(page, 32, 32, 'image/png', 'g.fillStyle="#ff0000"; g.fillRect(0,0,w,h);');
  await page.setInputFiles('#addimage', file);
  await page.waitForFunction(() => cornhole.design.a.elements.some(el => el.type === 'image'));
  await settled(page);
  const source = await page.evaluate(() => cornhole.design.a.elements.find(el => el.type === 'image').src);
  // Delay one genuine restored PNG below the application cache, so the
  // browser's load/complete/naturalWidth behavior remains real.
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let requested = false;
  await page.route('**/delayed-preview.png', async route => {
    requested = true;
    await gate;
    await route.fulfill({ status: 200, contentType: 'image/png', body: file.buffer });
  });
  await page.addInitScript(source => {
    const src = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    Object.defineProperty(HTMLImageElement.prototype, 'src', {
      ...src,
      set(value) { src.set.call(this, value === source ? '/delayed-preview.png' : value); },
    });
  }, source);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.cornhole?.loaded);
  await expect.poll(() => requested).toBe(true);
  await review(page);
  await expect(page.locator('#tocheckout'), 'incomplete images cannot advance to checkout').toBeDisabled();
  release();
  await page.evaluate(() => cornhole.preloadImages(['a'], { print: false }));
  await expect.poll(async () => page.evaluate(async () => {
    const img = document.querySelector('#reviewboards img');
    if (!img) return null;
    await img.decode();
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    return Array.from(g.getImageData(c.width / 2, c.height * 30 / 48, 1, 1).data);
  }), 'the review preview must contain the red uploaded picture').toEqual([255, 0, 0, 255]);
});

test('an edit during checkout preparation returns to review before sending an order', async ({ page }) => {
  await open(page); await reset(page);
  await review(page);
  await page.click('#tocheckout');
  await fillDetails(page);
  const posted = [];
  await page.route('**/api/order', async route => {
    posted.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 'CH-LATEST', total: 30800 }) });
  });
  // Only defer the actual browser readiness result, modelling fonts finishing
  // while a customer continues editing on a slower connection.
  await page.evaluate(() => {
    const ready = document.fonts.ready;
    const gate = new Promise(resolve => { window.releaseOrderFonts = resolve; });
    Object.defineProperty(document.fonts, 'ready', { configurable: true, get() { window.orderFontsWaiting = true; return ready.then(() => gate); } });
  });
  await page.click('#checkout');
  await page.waitForFunction(() => window.orderFontsWaiting);
  await page.getByRole('tab', { name: 'Text', exact: true }).click();
  await page.locator('#texts .item').first().click();
  await page.fill('#ttext', 'LATEST DESIGN');
  await page.evaluate(() => window.releaseOrderFonts());
  await expect(page.getByRole('heading', { name: 'Review your order', exact: true })).toBeVisible();
  await expect(page.locator('#tocheckout')).toBeEnabled();
  expect(posted, 'checkout must not send a design that changed during preparation').toEqual([]);
  await page.click('#tocheckout');
  await expect(page.locator('#name')).toHaveValue('Pat Example');
  await page.click('#checkout');
  await expect(page.locator('#orderstatus')).toContainText('CH-LATEST');
  expect(posted).toHaveLength(1);
  expect(posted[0].design.a.elements[0].text).toBe('LATEST DESIGN');
});

test('changing personalized words from the details step requires a fresh design review', async ({ page }) => {
  await open(page); await reset(page);
  await review(page);
  await page.click('#tocheckout');
  await fillDetails(page);
  const posted = [];
  await page.route('**/api/order', async route => {
    posted.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 'CH-REVIEWED', total: 30800 }) });
  });
  await page.getByRole('tab', { name: 'Text', exact: true }).click();
  await page.locator('#texts .item').first().click();
  await page.fill('#ttext', 'THE JOHNSONS');
  await page.getByRole('tab', { name: 'Order', exact: true }).click();
  await expect(page.locator('#reviewchanged')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Review your order', exact: true })).toBeVisible();
  await expect(page.locator('#tocheckout')).toBeEnabled();
  expect(posted, 'the previous review no longer represents the design being ordered').toEqual([]);
  await page.click('#tocheckout');
  await page.click('#checkout');
  await expect(page.locator('#orderstatus')).toContainText('CH-REVIEWED');
  expect(posted).toHaveLength(1);
  expect(posted[0].design.a.elements[0].text).toBe('THE JOHNSONS');
});

test('a failed review picture sends no order and can be removed before retrying', async ({ page }) => {
  await open(page); await reset(page);
  await review(page);
  await page.click('#tocheckout');
  await fillDetails(page);
  const posted = [];
  await page.route('**/api/order', async route => {
    posted.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 'CH-RECOVERED', total: 30800 }) });
  });
  // Model a legacy/restored raster that the browser cannot decode. New file
  // imports already validate their pixels before replacing the current draft.
  await page.evaluate(async () => {
    const source = structuredClone(cornhole.design);
    const src = 'data:image/png;base64,AAAA';
    source.a.elements.push({ type: 'image', id: 'failed-picture', src, x: 12, y: 20, width: 6, rotation: 0, opacity: 1 });
    cornhole.setDesign(source);
    await new Promise(resolve => { const probe = new Image(); probe.onerror = resolve; probe.src = src; });
  });
  await page.click('#checkout');
  await expect(page.locator('#reviewboards')).toContainText('could not be prepared');
  await expect(page.locator('#tocheckout')).toBeDisabled();
  await expect(page.locator('#checkout')).toBeEnabled();
  expect(posted).toEqual([]);
  await page.getByRole('tab', { name: 'Art', exact: true }).click();
  await page.locator('#images .itemdel').click();
  await page.getByRole('tab', { name: 'Order', exact: true }).click();
  await page.getByRole('button', { name: 'Try preview again' }).click();
  await page.click('#tocheckout');
  await page.click('#checkout');
  await expect(page.locator('#orderstatus')).toContainText('CH-RECOVERED');
  expect(posted).toHaveLength(1);
  expect(posted[0].design.a.elements.some(el => el.type === 'image')).toBe(false);
});

test('checkout revalidates address fields changed while fonts are preparing', async ({ page }) => {
  await open(page); await reset(page);
  await review(page);
  await page.click('#tocheckout');
  await fillDetails(page);
  const posted = [];
  await page.route('**/api/order', async route => {
    posted.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 'CH-VALID', total: 30800 }) });
  });
  await page.evaluate(() => {
    const ready = document.fonts.ready;
    const gate = new Promise(resolve => { window.releaseOrderFonts = resolve; });
    Object.defineProperty(document.fonts, 'ready', { configurable: true, get() { window.orderFontsWaiting = true; return ready.then(() => gate); } });
  });
  await page.click('#checkout');
  await page.waitForFunction(() => window.orderFontsWaiting);
  await page.fill('#email', '');
  await page.evaluate(() => window.releaseOrderFonts());
  await expect(page.locator('#checkout')).toBeEnabled();
  await expect(page.locator('#email')).toBeFocused();
  expect(posted, 'the final payload must still satisfy the form requirements').toEqual([]);
  await page.fill('#email', 'pat@example.com');
  await page.click('#checkout');
  await expect(page.locator('#orderstatus')).toContainText('CH-VALID');
  expect(posted).toHaveLength(1);
  expect(posted[0].customer.email).toBe('pat@example.com');
});

test('a picture still processing cannot be left out of checkout and refreshes review on completion', async ({ page }) => {
  await open(page); await reset(page);
  await review(page);
  await page.click('#tocheckout');
  await fillDetails(page);
  const posted = [];
  await page.route('**/api/order', async route => {
    posted.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 'CH-PICTURE', total: 30800 }) });
  });
  const file = await picture(page, 80, 40, 'image/jpeg', 'g.fillStyle="#ff0000"; g.fillRect(0,0,w,h);');
  // Preserve the real decoder/reader, deferring only completion of the master.
  await page.evaluate(() => {
    const read = FileReader.prototype.readAsDataURL;
    FileReader.prototype.readAsDataURL = function (file) {
      const loaded = this.onload;
      this.onload = event => { window.releaseOrderUpload = () => loaded.call(this, event); };
      return read.call(this, file);
    };
  });
  await page.getByRole('tab', { name: 'Art', exact: true }).click();
  await page.setInputFiles('#addimage', file);
  await page.waitForFunction(() => window.releaseOrderUpload);
  await page.getByRole('tab', { name: 'Order', exact: true }).click();
  await page.click('#checkout');
  await expect(page.locator('#orderstatus')).toContainText('still processing');
  expect(posted).toEqual([]);
  await page.click('#backtoorder');
  await expect(page.locator('#reviewboards')).toContainText('still processing');
  await expect(page.locator('#tocheckout')).toBeDisabled();
  await page.evaluate(() => window.releaseOrderUpload());
  await expect(page.locator('#tocheckout')).toBeEnabled();
  await expect(page.locator('#reswarn')).toBeVisible();
  await page.click('#tocheckout');
  await page.click('#checkout');
  await expect(page.locator('#orderstatus')).toContainText('CH-PICTURE');
  expect(posted).toHaveLength(1);
  expect(posted[0].design.a.elements.filter(el => el.type === 'image')).toHaveLength(1);
});

test('the full-size file warning includes the finished preview bytes at the payload limit', async ({ page }) => {
  await open(page); await reset(page);
  const noise = `
    const pixels = g.createImageData(w, h);
    let seed = 42;
    for (let i = 0; i < pixels.data.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        pixels.data[i + c] = seed >>> 24;
      }
      pixels.data[i + 3] = 255;
    }
    g.putImageData(pixels, 0, 0);
  `;
  const preview = await picture(page, 240, 480, 'image/png', noise);
  const master = await picture(page, 1700, 1700, 'image/jpeg', noise);
  const src = 'data:image/png;base64,' + preview.buffer.toString('base64');
  const orig = 'data:image/jpeg;base64,' + master.buffer.toString('base64');
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/near-limit-preview.png', async route => {
    await gate;
    await route.fulfill({ status: 200, contentType: 'image/png', body: preview.buffer });
  });
  await page.evaluate(({ src, orig }) => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    Object.defineProperty(HTMLImageElement.prototype, 'src', {
      ...descriptor,
      set(value) { descriptor.set.call(this, value === src ? '/near-limit-preview.png' : value); },
    });
    const design = structuredClone(cornhole.design);
    design.a.elements = [{ type: 'image', id: 'near-limit-picture', src, orig, width: 24, x: 12, y: 24, px: [1700, 1700] }];
    cornhole.setDesign(design);
  }, { src, orig });
  expect(await page.evaluate(() => cornhole.orderPayload().options.assets), 'placeholder preview bytes are small enough to include the master').toBe('included');
  await review(page);
  await expect(page.locator('#tocheckout')).toBeDisabled();
  release();
  await expect(page.locator('#tocheckout')).toBeEnabled();
  expect(await page.evaluate(() => cornhole.orderPayload().options.assets), 'the real completed preview puts this order over the limit').toBe('pending');
  await expect(page.locator('#assetwarn'), 'the ready review must disclose the same omitted master as checkout').toBeVisible();
});
