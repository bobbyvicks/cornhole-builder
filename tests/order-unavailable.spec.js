import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { open, reset, picture } from './helpers.js';

for (const width of [1280, 375]) {
  test(`unavailable ordering offers an editable copy and preserves details at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 812 });
    await open(page); await reset(page);
    const photo = await picture(page, 24, 24, 'image/png', 'g.fillStyle="#0f8b8d";g.fillRect(0,0,w,h);');
    await page.setInputFiles('#addimage', photo);
    await page.waitForFunction(() => cornhole.design.a.elements.some(el => el.type === 'image'));
    await page.getByRole('tab', { name: 'Order', exact: true }).click();
    await page.click('#toreview'); await page.click('#tocheckout');
    for (const [id, value] of Object.entries({ name: 'Pat Example', email: 'pat@example.com', line1: '1 Main St', city: 'Austin', postal: '78701', notes: 'Keep these details for my retry.' })) await page.fill('#' + id, value);
    await page.selectOption('#state', 'TX');
    const before = await page.evaluate(() => cornhole.projectRecord());
    let requests = 0;
    await page.route('**/api/order', route => {
      requests++;
      return route.fulfill({ status: requests === 1 ? 503 : 200, contentType: 'application/json', body: JSON.stringify(requests === 1 ? { error: 'not_configured' } : { code: 'CH-RETRY', total: 30800 }) });
    });
    await page.locator('#checkout').focus(); await page.keyboard.press('Enter');
    await expect(page.locator('#orderstatus')).toContainText('not switched on');
    await expect(page.locator('#orderstatus')).toContainText('not submitted');
    await expect(page.locator('#orderstatus')).toContainText('Nothing was charged');
    await expect(page.locator('#orderstatus')).not.toContainText('quote it by hand');
    const save = page.getByRole('button', { name: 'Save editable copy', exact: true }).filter({ visible: true });
    await expect(save).toBeVisible();
    await page.locator('#checkout').focus(); await page.keyboard.press('Tab');
    await expect(save).toBeFocused();
    const downloadPromise = page.waitForEvent('download');
    await page.keyboard.press('Enter');
    const downloaded = await downloadPromise;
    const exported = JSON.parse(await readFile(await downloaded.path(), 'utf8'));
    expect(exported.design).toEqual(before.design);
    expect(exported.order).toEqual(before.order);
    expect(exported.customer).toBeUndefined();
    expect(exported.shipping).toBeUndefined();
    expect(requests).toBe(1);
    await expect(page.locator('#email')).toHaveValue('pat@example.com');
    await expect(page.locator('#notes')).toHaveValue('Keep these details for my retry.');
    await page.click('#checkout');
    await expect(page.locator('#orderstatus')).toContainText('CH-RETRY');
    await expect(save).toHaveCount(0);
    expect(requests).toBe(2);
  });
}
