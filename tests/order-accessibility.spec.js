import { test, expect } from '@playwright/test';
import { open, reset } from './helpers.js';

async function enterWithKeyboard(page, selector) {
  await page.locator(selector).focus();
  await page.keyboard.press('Enter');
}

async function openDetails(page) {
  await page.getByRole('tab', { name: 'Order', exact: true }).click();
  await page.click('#toreview');
  await page.click('#tocheckout');
}

test('keyboard order navigation moves focus into each new step and back to the editor', async ({ page }) => {
  await open(page);
  await expect(page.locator('body')).toBeFocused();
  await reset(page);
  await page.getByRole('tab', { name: 'Order', exact: true }).click();
  await enterWithKeyboard(page, '#toreview');
  await expect(page.getByRole('heading', { name: 'Review your order', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#backtooptions')).toBeFocused();
  await enterWithKeyboard(page, '#tocheckout');
  await expect(page.getByRole('heading', { name: 'Your details', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#backtoorder')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Review your order', exact: true })).toBeFocused();
  await enterWithKeyboard(page, '#backtooptions');
  await expect(page.getByRole('heading', { name: "What you're ordering", exact: true })).toBeFocused();
  await enterWithKeyboard(page, '#toreview');
  await enterWithKeyboard(page, '#backtoedit');
  await expect(page.getByRole('tab', { name: 'Board', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Text', exact: true })).toBeFocused();
});

test('the mobile review action focuses a heading that is not covered by the pinned preview', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  await reset(page);
  await page.click('#reviewbtn');
  const heading = page.getByRole('heading', { name: 'Review your order', exact: true });
  await expect(heading).toBeFocused();
  await expect(heading).toBeInViewport();
  const clear = await heading.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === el;
  });
  expect(clear, 'the newly focused step is visibly available').toBe(true);
});

test('checkout requires an explicitly selected shipping state and preserves the choice when going back', async ({ page }) => {
  await open(page);
  await reset(page);
  await openDetails(page);
  await expect(page.locator('#state'), 'the first state must not be chosen silently').toHaveValue('');
  await page.fill('#name', 'Pat Example');
  await page.fill('#email', 'pat@example.com');
  await page.fill('#line1', '1 Main St');
  await page.fill('#city', 'Austin');
  await page.fill('#postal', '78701');
  let posted = null;
  await page.route('**/api/order', async (route) => {
    posted = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 'CH-STATE1', total: 30800 }) });
  });
  await page.click('#checkout');
  await expect(page.locator('#state')).toBeFocused();
  expect(await page.locator('#state').evaluate((el) => el.validity.valueMissing)).toBe(true);
  expect(posted, 'invalid checkout does not send an order').toBeNull();
  await page.selectOption('#state', 'TX');
  await page.click('#backtoorder');
  await page.click('#tocheckout');
  await expect(page.locator('#state')).toHaveValue('TX');
  await page.click('#checkout');
  await expect(page.locator('#orderstatus')).toContainText('CH-STATE1');
  expect(posted.shipping.state).toBe('TX');
});
