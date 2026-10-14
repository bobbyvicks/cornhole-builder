import { test, expect } from '@playwright/test';
import { open, reset } from './helpers.js';

async function largePictures(page) {
  await open(page); await reset(page);
  return page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1200;
    const g = canvas.getContext('2d'), pixels = g.createImageData(1200, 1200);
    let seed = 42;
    for (let i = 0; i < pixels.data.length; i += 4) {
      for (let channel = 0; channel < 3; channel++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        pixels.data[i + channel] = seed >>> 24;
      }
      pixels.data[i + 3] = 255;
    }
    g.putImageData(pixels, 0, 0);
    const src = canvas.toDataURL('image/jpeg', 0.9), design = structuredClone(cornhole.design);
    for (let i = 0; i < 4; i++) design.a.elements.push({ type: 'image', id: 'photo' + i, src, px: [1200, 1200], width: 8, x: 12, y: 15 + i * 8 });
    cornhole.setDesign(design);
    await cornhole.preloadImages(['a'], { print: false });
    window.originalOrderSources = cornhole.design.a.elements.filter(e => e.type === 'image').map(e => e.src);
    return JSON.stringify(cornhole.orderPayload()).length;
  });
}

async function details(page) {
  await page.getByRole('tab', { name: 'Order', exact: true }).click();
  await page.click('#toreview');
  await expect(page.locator('#assetwarn')).toBeVisible();
  await page.click('#tocheckout');
  for (const [id, value] of Object.entries({ name: 'Pat Example', email: 'pat@example.com', line1: '1 Main St', city: 'Austin', postal: '78701' })) await page.fill('#' + id, value);
  await page.selectOption('#state', 'TX');
}

async function duringShrink(page, change) {
  await page.evaluate(change => {
    const encode = HTMLCanvasElement.prototype.toDataURL;
    window.changedDuringShrink = false;
    HTMLCanvasElement.prototype.toDataURL = function (...args) {
      const result = encode.apply(this, args);
      if (this.width === 840 && !window.changedDuringShrink) {
        window.changedDuringShrink = true;
        if (change === 'design') { cornhole.design.a.elements.find(e => e.type === 'text').text = 'CHANGED DURING PREPARATION'; cornhole.commit(); }
        else document.getElementById(change === 'invalid' ? 'email' : 'city').value = change === 'invalid' ? '' : 'Dallas';
      }
      return result;
    };
  }, change);
}

test('outgoing-only pruning retains unused boards and blank editable text locally', async ({ page }) => {
  await open(page); await reset(page);
  const result = await page.evaluate(() => {
    const source = structuredClone(cornhole.design);
    source.a.elements[0].text = '   ';
    source.b = structuredClone(cornhole.design.a);
    const before = JSON.stringify(source);
    const same = cornhole.orderPayload({ source, options: cornhole.order });
    source.same = false;
    const single = cornhole.orderPayload({ source, options: { ...cornhole.order, product: 'single' } });
    source.same = true;
    return { unchanged: JSON.stringify(source) === before, same: same.design, single: single.design, synchronous: typeof same.then === 'undefined' };
  });
  expect(result.unchanged).toBe(true);
  expect(result.synchronous).toBe(true);
  for (const design of [result.same, result.single]) {
    expect(design.a.elements).toEqual([]);
    expect(design.b.elements).toEqual([]);
  }
});

test('large previews are disclosed before details and fit checkout without changing saved pictures', async ({ page }) => {
  expect(await largePictures(page)).toBeGreaterThan(3_800_000);
  await details(page);
  await duringShrink(page, 'valid');
  let posted;
  await page.route('**/api/order', route => {
    posted = route.request().postDataJSON();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 'CH-SHRUNK', total: 30800 }) });
  });
  await page.click('#checkout');
  await expect(page.locator('#orderstatus')).toContainText('CH-SHRUNK');
  expect(JSON.stringify(posted).length).toBeLessThan(3_800_000);
  expect(posted.options.assets).toBe('pending');
  expect(posted.shipping.city).toBe('Dallas');
  expect(posted.design.a.elements.filter(e => e.type === 'image')).toHaveLength(4);
  expect(await page.evaluate(() => cornhole.design.a.elements.filter(e => e.type === 'image').every((e, i) => e.src === window.originalOrderSources[i] && !e.orig))).toBe(true);
});

for (const change of ['design', 'invalid']) test(change + ' changes during preview shrinking cannot submit stale details', async ({ page }) => {
  await largePictures(page); await details(page); await duringShrink(page, change);
  let requests = 0;
  await page.route('**/api/order', route => { requests++; return route.fulfill({ status: 200, body: '{}' }); });
  await page.click('#checkout');
  await expect.poll(() => page.evaluate(() => window.changedDuringShrink)).toBe(true);
  await expect(page.locator('#checkout')).toBeEnabled();
  if (change === 'design') {
    await expect(page.locator('#orderstep2')).toBeVisible();
    await expect(page.locator('#orderstep3')).toBeHidden();
  } else await expect(page.locator('#email')).toBeFocused();
  expect(requests).toBe(0);
});
