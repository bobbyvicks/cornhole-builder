import { test, expect } from '@playwright/test';
import { open, reset, settled } from './helpers.js';

const CODE = 'CH-ABC234';
const endpoint = '**/api/order**';
const outcome = (status) => ({ code: CODE, status, product: 'set', quantity: 1, amount_cents: 30800, currency: 'usd' });
const reply = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const query = (kind = 'success', code = CODE) => '?order=' + kind + (code === null ? '' : '&code=' + encodeURIComponent(code));

async function noFalseAssurance(page) {
  await expect(page.locator('#done')).not.toContainText(/your order is in|Stripe is emailing|boards ship|no charge|nothing was charged|refunded/i);
}

async function retryReady(page) {
  await expect(page.locator('#retryorder')).toBeVisible();
  await expect(page.locator('#retryorder')).toBeEnabled();
  await expect(page.locator('#donestatus')).toHaveAttribute('role', 'status');
}

test('a delayed return lookup stays neutral, preserves the saved design and makes only one GET', async ({ page }) => {
  await open(page); await reset(page); await settled(page);
  const before = await page.evaluate(() => structuredClone(cornhole.design));
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const methods = [];
  await page.route(endpoint, async route => { methods.push(route.request().method()); await gate; await reply(route, outcome('pending')); });
  await open(page, { query: query() });
  await expect(page.locator('#done')).toContainText(/checking/i);
  await expect(page.locator('#done')).toContainText(CODE);
  await noFalseAssurance(page);
  await expect(page.locator('#retryorder')).toBeDisabled();
  await expect(page.locator('#retryorder')).toHaveAttribute('aria-busy', 'true');
  expect(methods).toEqual(['GET']);
  await page.getByRole('tab', { name: 'Text', exact: true }).click();
  const words = page.locator('#texts .quick').first();
  await words.focus();
  await words.evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  const scrollBefore = await page.evaluate(() => scrollY);
  release();
  await expect(page.locator('#done')).toContainText(/payment.*not.*confirmed|not.*confirmed.*payment/i);
  await noFalseAssurance(page);
  await retryReady(page);
  await expect(words).toBeFocused();
  expect(await page.evaluate(() => scrollY)).toBeCloseTo(scrollBefore, 0);
  expect(await page.evaluate(() => cornhole.design)).toEqual(before);
  expect(methods).toEqual(['GET']);
});

for (const [status, label] of [['paid', /paid|payment confirmed/i], ['in_production', /in production/i], ['shipped', /shipped/i]]) {
  test('a verified ' + status + ' order displays the server status and order summary', async ({ page }) => {
    const methods = [];
    await page.route(endpoint, route => { methods.push(route.request().method()); return reply(route, outcome(status)); });
    await open(page, { query: query() });
    await expect(page.locator('#done')).toContainText(label);
    await expect(page.locator('#done')).toContainText(CODE);
    await expect(page.locator('#done')).toContainText('Set of 2 boards');
    await expect(page.locator('#done')).toContainText('$308.00');
    await retryReady(page);
    expect(methods).toEqual(['GET']);
  });
}

test('a cancelled return URL uses a paid server record instead of claiming no charge', async ({ page }) => {
  const methods = [];
  await page.route(endpoint, route => { methods.push(route.request().method()); return reply(route, outcome('paid')); });
  await open(page, { query: query('cancelled') });
  await expect(page.locator('#done')).toContainText(/paid|payment confirmed/i);
  await expect(page.locator('#done')).not.toContainText(/no charge|nothing was charged|payment cancelled/i);
  expect(methods).toEqual(['GET']);
});

test('a server-cancelled order is labelled cancelled without claiming a refund or no charge', async ({ page }) => {
  await page.route(endpoint, route => reply(route, outcome('cancelled')));
  await open(page, { query: query() });
  await expect(page.locator('#done')).toContainText(/cancelled/i);
  await noFalseAssurance(page);
  await retryReady(page);
});

test('a missing order can be checked again without creating another order', async ({ page }) => {
  const methods = [];
  await page.route(endpoint, route => {
    methods.push(route.request().method());
    return methods.length === 1 ? reply(route, { error: 'not_found' }, 404) : reply(route, outcome('paid'));
  });
  await open(page, { query: query() });
  await expect(page.locator('#done')).toContainText(/not found|could not find|couldn't find/i);
  await expect(page.locator('#done')).toContainText(CODE);
  await noFalseAssurance(page);
  await retryReady(page);
  await page.click('#retryorder');
  await expect(page.locator('#done')).toContainText(/paid|payment confirmed/i);
  expect(methods).toEqual(['GET', 'GET']);
});

test('unavailable and malformed lookups never become a payment confirmation', async ({ page }) => {
  const cases = [
    { status: 503, body: { error: 'not_configured' } },
    { body: null },
    { body: { status: 'paid' } },
    { body: { ...outcome('paid'), code: 'CH-WRONG1' } },
    { body: outcome('unrecognised') },
    { body: outcome(['paid']) },
    { body: { ...outcome('paid'), product: ['set'] } },
    { body: { ...outcome('paid'), product: 'unknown' } },
    { body: { ...outcome('paid'), quantity: 0 } },
    { body: { ...outcome('paid'), amount_cents: '30800' } },
    { body: { ...outcome('paid'), currency: 'eur' } },
    { raw: '<not-json>' },
  ];
  for (const entry of cases) {
    await page.unroute(endpoint);
    const methods = [];
    await page.route(endpoint, route => {
      methods.push(route.request().method());
      return entry.raw ? route.fulfill({ status: 200, contentType: 'application/json', body: entry.raw }) : reply(route, entry.body, entry.status || 200);
    });
    await open(page, { query: query() });
    await expect(page.locator('#done')).toContainText(/unable|could not|couldn't|cannot|can't|not.*confirm|unavailable/i);
    await noFalseAssurance(page);
    await retryReady(page);
    expect(methods).toEqual(['GET']);
  }
});

test('an offline lookup offers a retry which can confirm payment', async ({ page }) => {
  const methods = [];
  await page.route(endpoint, route => {
    methods.push(route.request().method());
    return methods.length === 1 ? route.abort('internetdisconnected') : reply(route, outcome('paid'));
  });
  await open(page, { query: query() });
  await expect(page.locator('#done')).toContainText(/unable|could not|couldn't|cannot|can't|not.*confirm/i);
  await noFalseAssurance(page);
  await retryReady(page);
  await page.click('#retryorder');
  await expect(page.locator('#done')).toContainText(/paid|payment confirmed/i);
  expect(methods).toEqual(['GET', 'GET']);
});

test('missing and invalid order codes make no lookup and show no success', async ({ page }) => {
  const methods = [];
  await page.route(endpoint, route => { methods.push(route.request().method()); return reply(route, outcome('paid')); });
  for (const code of [null, 'not-a-code', 'CH-ABC23!']) {
    await open(page, { query: query('success', code) });
    await expect(page.locator('#done')).toContainText(/order code/i);
    await noFalseAssurance(page);
    await expect(page.locator('#retryorder')).toBeHidden();
  }
  expect(methods).toEqual([]);
});

test('a lookup that never answers times out and permits a fresh status check', async ({ page }) => {
  await page.clock.install();
  const methods = [];
  await page.route(endpoint, route => {
    methods.push(route.request().method());
    if (methods.length > 1) return reply(route, outcome('paid'));
    // No response: exercise the real browser request timeout.
  });
  await open(page, { query: query() });
  await expect(page.locator('#retryorder')).toBeDisabled();
  await page.clock.fastForward(8100);
  await expect(page.locator('#done')).toContainText(/unable|could not|couldn't|cannot|can't|not.*confirm|timed out/i);
  await noFalseAssurance(page);
  await retryReady(page);
  await page.click('#retryorder');
  await expect(page.locator('#done')).toContainText(/paid|payment confirmed/i);
  expect(methods).toEqual(['GET', 'GET']);
});

test('a stalled response body also times out before a fresh retry succeeds', async ({ page }) => {
  await page.clock.install();
  await page.addInitScript(() => {
    const fetchOriginal = window.fetch;
    let first = true;
    window.fetch = async (...args) => {
      const response = await fetchOriginal(...args);
      if (first && String(args[0]).includes('api/order?code=')) {
        first = false;
        return new Response(new ReadableStream({
          start(controller) { controller.enqueue(new TextEncoder().encode('{"status":')); },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return response;
    };
  });
  const methods = [];
  await page.route(endpoint, route => { methods.push(route.request().method()); return reply(route, outcome('paid')); });
  await open(page, { query: query() });
  await expect(page.locator('#retryorder')).toBeDisabled();
  await page.clock.fastForward(8100);
  await expect(page.locator('#done')).toContainText(/unable|could not|couldn't|cannot|can't|not.*confirm|timed out/i);
  await noFalseAssurance(page);
  await retryReady(page);
  await page.click('#retryorder');
  await expect(page.locator('#done')).toContainText(/paid|payment confirmed/i);
  expect(methods).toEqual(['GET', 'GET']);
});

test('a phone user can retry by keyboard and read the result without losing focus', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const methods = [];
  await page.route(endpoint, route => {
    methods.push(route.request().method());
    return methods.length === 1 ? reply(route, { error: 'not_found' }, 404) : reply(route, outcome('pending'));
  });
  await open(page, { query: query('cancelled') });
  await retryReady(page);
  const retry = page.locator('#retryorder');
  await retry.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#done')).toContainText(/payment.*not.*confirmed|not.*confirmed.*payment/i);
  await expect(retry).toBeFocused();
  await retry.scrollIntoViewIfNeeded();
  expect(await retry.evaluate(el => {
    const r = el.getBoundingClientRect();
    return r.top >= document.querySelector('header.top').getBoundingClientRect().bottom && r.bottom <= innerHeight &&
      document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === el;
  })).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
  await page.screenshot({ path: testInfo.outputPath('phone-order-status.png') });
  expect(methods).toEqual(['GET', 'GET']);
});

test('finishing a keyboard retry preserves a newer focus choice and text edit', async ({ page }) => {
  await open(page); await reset(page); await settled(page);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const methods = [];
  await page.route(endpoint, async route => {
    methods.push(route.request().method());
    if (methods.length > 1) await gate;
    await reply(route, outcome(methods.length === 1 ? 'pending' : 'paid'));
  });
  await open(page, { query: query() });
  await retryReady(page);
  await page.locator('#retryorder').focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#retryorder')).toBeDisabled();
  await page.getByRole('tab', { name: 'Text', exact: true }).click();
  const words = page.locator('#texts .quick').first();
  await words.fill('EDITED WHILE CHECKING');
  await words.evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  release();
  await expect(page.locator('#done')).toContainText(/paid|payment confirmed/i);
  await expect(words).toBeFocused();
  await expect(words).toHaveValue('EDITED WHILE CHECKING');
  expect(await words.evaluate(el => {
    const r = el.getBoundingClientRect();
    return r.top >= document.querySelector('header.top').getBoundingClientRect().bottom && r.bottom <= innerHeight;
  })).toBe(true);
  expect(methods).toEqual(['GET', 'GET']);
});
