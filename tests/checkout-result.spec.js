import { test, expect } from '@playwright/test';
import { open, reset } from './helpers.js';

/* Continue to payment, after the tap: the answer is on screen, the focus
   stays where the customer left it, and one order is sent per reviewed
   design. The order API is stubbed throughout; nothing is placed. */

async function details(page) {
  await page.getByRole('tab', { name: 'Order', exact: true }).click();
  await page.click('#toreview');
  await page.click('#tocheckout');
  for (const [id, value] of Object.entries({ name: 'Pat Example', email: 'pat@example.com', line1: '1 Main St', city: 'Austin', postal: '78701' })) await page.fill('#' + id, value);
  await page.selectOption('#state', 'TX');
}

const focusedId = (page) => page.evaluate(() => document.activeElement && document.activeElement.id);

/* Hold document.fonts.ready, which every output waits for, until released. */
const holdFonts = (page) => page.evaluate(() => {
  window.fontsWaiting = false;
  const ready = new Promise((resolve) => { window.releaseFonts = resolve; });
  Object.defineProperty(document.fonts, 'ready', { configurable: true, get() { window.fontsWaiting = true; return ready; } });
});

test('an order to be invoiced is sent once: the button goes, the code stays, and only a changed order brings it back', async ({ page }) => {
  await open(page); await reset(page);
  await details(page);
  let hits = 0;
  await page.route('**/api/order', (route) => {
    hits++;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 'CH-TEST0' + hits, url: null, total: 72200, payment: 'invoice' }) });
  });
  await page.locator('#checkout').focus();
  await page.keyboard.press('Enter');
  const answer = page.locator('#orderstatus');
  await expect(answer).toContainText('CH-TEST01');
  await expect(answer).toContainText('$722.00');
  await expect(page.locator('#checkout'), 'no button offers to pay for an order that is placed').toBeHidden();
  await expect(answer, 'the focus moves from the button that went to the answer').toBeFocused();
  // Neither a script nor Enter in a field sends it again.
  await page.evaluate(() => document.getElementById('orderform').requestSubmit());
  await page.locator('#postal').focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  expect(hits).toBe(1);
  await expect(answer).toContainText('CH-TEST01');
  // Looking at the review again changes nothing.
  await page.click('#backtoorder');
  await page.click('#tocheckout');
  await expect(page.locator('#checkout')).toBeHidden();
  await expect(answer).toContainText('CH-TEST01');
  // A changed order goes through the review and is a new order.
  await page.click('#backtoorder');
  await page.click('#backtooptions');
  await page.check('#rush');
  await page.click('#toreview');
  await page.click('#tocheckout');
  await expect(page.locator('#checkout')).toBeVisible();
  await expect(page.locator('#checkout')).toBeEnabled();
  await page.click('#checkout');
  await expect(answer).toContainText('CH-TEST02');
  expect(hits).toBe(2);
  await expect(page.locator('#checkout')).toBeHidden();
});

for (const [width, height] of [[1280, 900], [390, 844]]) {
  test(`at ${width} x ${height} the answer and Save editable copy come into view while the button keeps the focus`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await open(page); await reset(page);
    await details(page);
    let hits = 0, release;
    const held = new Promise((resolve) => { release = resolve; });
    await page.route('**/api/order', async (route) => {
      hits++;
      await held;
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'not_configured' }) });
    });
    await page.locator('#checkout').focus();
    // The button at the foot of the screen: everything under it is out of view.
    await page.evaluate(() => window.scrollBy(0, document.getElementById('checkout').getBoundingClientRect().bottom - innerHeight + 2));
    expect(await page.evaluate(() => document.getElementById('orderform').getBoundingClientRect().bottom)).toBeGreaterThan(height - 12);
    await page.keyboard.press('Enter');
    const answer = page.locator('#orderstatus');
    await expect(answer).toContainText('Sending');
    expect(await focusedId(page), 'focus stays on the button while it works').toBe('checkout');
    await expect(page.locator('#checkout')).toBeDisabled();
    await expect(answer).toBeInViewport({ ratio: 1 });
    release();
    await expect(answer).toContainText('not switched on');
    const save = page.locator('#saveunsubmitted');
    for (const el of [answer, save]) {
      await expect(el).toBeInViewport({ ratio: 1 });
      // In view and not under the board pinned at the top on a phone.
      expect(await el.evaluate((e) => {
        const r = e.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return e.contains(hit);
      })).toBe(true);
    }
    expect(await focusedId(page)).toBe('checkout');
    await expect(page.locator('#checkout')).toBeEnabled();
    expect(hits).toBe(1);
  });
}

test('the button stays held while the payment page opens, and a return through the back-forward cache releases it', async ({ page }) => {
  await open(page); await reset(page);
  await details(page);
  let hits = 0;
  // A link within this page stands in for the payment page: the browser
  // goes to it and stays here, as it does until a slow payment page loads.
  await page.route('**/api/order', (route) => {
    hits++;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 'CH-PAY001', url: '#payment-page', total: 30800, payment: 'stripe' }) });
  });
  await page.locator('#checkout').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#orderstatus')).toContainText('Taking you to payment');
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#payment-page');
  await page.evaluate(() => document.getElementById('orderform').requestSubmit());
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  expect(hits, 'a second tap while the payment page opens sends nothing').toBe(1);
  expect(await focusedId(page)).toBe('checkout');
  await expect(page.locator('#checkout')).toBeDisabled();
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await expect(page.locator('#checkout')).toBeEnabled();
  await expect(page.locator('#orderstatus')).toContainText('CH-PAY001');
  await expect(page.locator('#orderstatus')).toContainText('has not been confirmed');
  await expect(page.locator('#orderstatus')).not.toContainText('Taking you to payment');
});

test('Download print file and Share preview keep the keyboard focus while they work', async ({ page }) => {
  await open(page); await reset(page);
  await page.evaluate(() => Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true }));
  const downloads = [];
  page.on('download', (d) => downloads.push(d.suggestedFilename()));

  await holdFonts(page);
  await page.locator('#download').focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(50);
  expect(await focusedId(page)).toBe('download');
  await page.waitForFunction(() => window.fontsWaiting);
  await expect(page.locator('#download')).toBeDisabled();
  await expect(page.locator('#download')).toContainText('Preparing');
  await page.keyboard.press('Enter');
  await page.evaluate(() => window.releaseFonts());
  await expect.poll(() => downloads.length).toBe(1);
  await expect(page.locator('#download')).toBeEnabled();
  await expect(page.locator('#download')).not.toContainText('Preparing');
  expect(await focusedId(page), 'focus is still on the button after the file is made').toBe('download');
  await page.waitForTimeout(300);
  expect(downloads, 'a second Enter while it worked made no second file').toEqual(['cornhole-board-A-24x48in-100ppi.png']);

  await page.evaluate(() => cornhole.showTab('templates'));
  await holdFonts(page);
  await page.locator('#sharepreview').focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(50);
  expect(await focusedId(page)).toBe('sharepreview');
  await page.waitForFunction(() => window.fontsWaiting);
  await expect(page.locator('#sharepreview')).toBeDisabled();
  await page.keyboard.press('Enter');
  await page.evaluate(() => window.releaseFonts());
  await expect(page.locator('#sharestatus')).toContainText('downloaded');
  await expect(page.locator('#sharepreview')).toBeEnabled();
  expect(await focusedId(page)).toBe('sharepreview');
  await page.waitForTimeout(300);
  expect(downloads.filter((name) => name.startsWith('cornhole-preview-'))).toHaveLength(1);
});
