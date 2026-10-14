import { test, expect } from '@playwright/test';
import { open, reset, clientPoint, handlePoint, settled, reloaded } from './helpers.js';

for (const mode of ['same', 'a', 'b']) {
  test(`keyboard navigation reaches the board being edited in ${mode} mode`, async ({ page }) => {
    await open(page); await reset(page);
    if (mode !== 'same') await page.evaluate((mode) => {
      const d = structuredClone(cornhole.design);
      d.same = false; d.b = structuredClone(d.a); d.b.elements[0].id = 'b1'; d.b.elements[0].text = 'BOARD B';
      cornhole.setDesign(d); cornhole.setMode(mode);
    }, mode);
    await page.getByRole('tab', { name: 'Text', exact: true }).click();
    await page.locator('#texts .item').click();
    await page.getByRole('tab', { name: 'Text', exact: true }).focus();
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Shift+Tab');
      if (await page.evaluate(() => document.activeElement.tagName === 'CANVAS')) break;
    }
    const key = mode === 'b' ? 'b' : 'a', other = key === 'a' ? 'b' : 'a';
    await expect(page.locator('#canvas' + key.toUpperCase())).toBeFocused();
    const untouched = await page.evaluate((key) => structuredClone(cornhole.design[key]), other);
    await page.keyboard.press('ArrowRight');
    expect(await page.evaluate((key) => cornhole.design[key].elements[0].x, key)).toBe(12.1);
    await page.keyboard.press('Delete');
    expect(await page.evaluate((key) => cornhole.design[key].elements.length, key)).toBe(0);
    expect(await page.evaluate((key) => cornhole.design[key], other)).toEqual(untouched);
    await page.keyboard.press('Control+z');
    expect(await page.evaluate((key) => cornhole.design[key].elements[0].x, key)).toBe(12.1);
  });
}

test('focus left on a different board cannot modify the active board', async ({ page }) => {
  await open(page); await reset(page);
  await page.evaluate(() => { cornhole.setMode('a'); cornhole.select('t1'); });
  const before = await page.evaluate(() => structuredClone(cornhole.design));
  await page.locator('#canvasB').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Delete');
  expect(await page.evaluate(() => cornhole.design)).toEqual(before);
});

test('right-clicking a delete handle leaves the design intact', async ({ page }) => {
  await open(page); await reset(page);
  await page.evaluate(() => cornhole.select('t1'));
  const point = await handlePoint(page, 't1', 'delete');
  await page.mouse.click(point.x, point.y, { button: 'right' });
  expect(await page.evaluate(() => cornhole.design.a.elements.length)).toBe(1);
  await page.keyboard.press('Escape');
  await page.mouse.click(point.x, point.y);
  expect(await page.evaluate(() => cornhole.design.a.elements.length)).toBe(0);
});

test('clicking the matching Board B preview keeps keyboard editing on the shared design', async ({ page }) => {
  await open(page); await reset(page);
  const point = await clientPoint(page, 'b', 12, 30);
  await page.mouse.click(point.x, point.y);
  await expect(page.locator('#canvasA')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  expect(await page.evaluate(() => cornhole.design.a.elements[0].x)).toBe(12.1);
  await page.keyboard.press('Delete');
  expect(await page.evaluate(() => cornhole.design.a.elements.length)).toBe(0);
});

test('losing pointer capture finishes the drag once and restores the next interaction', async ({ page }) => {
  await open(page); await reset(page);
  await page.evaluate(() => {
    document.getElementById('canvasA').addEventListener('pointerdown', (e) => { window.dragPointerId = e.pointerId; });
  });
  const start = await clientPoint(page, 'a', 12, 30), moved = await clientPoint(page, 'a', 15, 33);
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(moved.x, moved.y);
  await page.evaluate(() => document.getElementById('canvasA').releasePointerCapture(window.dragPointerId));
  await page.mouse.move(moved.x + 15, moved.y + 15); await page.mouse.up();
  await expect(page.locator('#canvasA')).not.toHaveClass(/dragging/);
  expect(await page.evaluate(() => ({ x: cornhole.design.a.elements[0].x, y: cornhole.design.a.elements[0].y }))).toEqual({ x: 15, y: 33 });
  await page.locator('#undo').click();
  expect(await page.evaluate(() => ({ x: cornhole.design.a.elements[0].x, y: cornhole.design.a.elements[0].y }))).toEqual({ x: 12, y: 30 });
  const restored = await clientPoint(page, 'a', 12, 30);
  await page.mouse.click(restored.x, restored.y);
  await page.keyboard.press('ArrowRight');
  expect(await page.evaluate(() => cornhole.design.a.elements[0].x)).toBe(12.1);
});

test.describe('touch ownership', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true });

  test('a second finger cannot move or finish the first finger’s drag', async ({ page }) => {
    const errors = await open(page); await reset(page);
    await page.evaluate(() => { cornhole.select('t1'); cornhole.paint(); });
    const cdp = await page.context().newCDPSession(page);
    const point = async (id, x, y) => ({ id, ...await clientPoint(page, 'a', x, y) });
    const first = await point(1, 12, 30), moved = await point(1, 14, 32);
    const second = await point(2, 20, 40), secondMoved = await point(2, 21, 41);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [moved] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [moved, second] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [moved, secondMoved] });
    expect(await page.evaluate(() => ({ x: cornhole.design.a.elements[0].x, y: cornhole.design.a.elements[0].y, selected: cornhole.selected }))).toEqual({ x: 14, y: 32, selected: 't1' });
    // CDP lists the contacts being lifted for touchEnd, not those remaining.
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [secondMoved] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [await point(1, 16, 34)] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    expect(await page.evaluate(() => ({ x: cornhole.design.a.elements[0].x, y: cornhole.design.a.elements[0].y }))).toEqual({ x: 16, y: 34 });
    await page.locator('#undo').click();
    expect(await page.evaluate(() => ({ x: cornhole.design.a.elements[0].x, y: cornhole.design.a.elements[0].y }))).toEqual({ x: 12, y: 30 });
    await page.locator('#redo').click();
    await settled(page); await reloaded(page);
    expect(await page.evaluate(() => ({ x: cornhole.design.a.elements[0].x, y: cornhole.design.a.elements[0].y }))).toEqual({ x: 16, y: 34 });
    expect(errors).toEqual([]);
    await cdp.detach();
  });
});
