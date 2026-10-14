import { test, expect } from '@playwright/test';
import { open, reset } from './helpers.js';

// These assertions inspect rendered hit areas and real navigation. A style
// regression that makes a control hard to tap or covers it must fail here.
async function expectTouchTargets(page, selector) {
  const small = await page.locator(selector).evaluateAll((elements) => elements.flatMap((el) => {
    const r = el.getBoundingClientRect();
    return r.width && r.height && (r.width < 43.5 || r.height < 43.5)
      ? [{ control: el.id || el.getAttribute('aria-label') || el.textContent.trim(), width: r.width, height: r.height }]
      : [];
  }));
  expect(small, 'visible controls need a finger-sized hit area').toEqual([]);
}

async function expectNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
    panel: document.querySelector('.panel').scrollWidth,
    available: document.querySelector('.panel').clientWidth,
  }));
  expect(overflow.page, 'the page fits without horizontal scrolling').toBeLessThanOrEqual(overflow.viewport);
  expect(overflow.panel, 'the options stay inside the panel').toBeLessThanOrEqual(overflow.available + 1);
}

test('the first keyboard action can skip directly to the design controls', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to design controls' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect(page.locator('#design-options')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('tab', { name: 'Start', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  const board = page.getByRole('tab', { name: 'Board', exact: true });
  await expect(board).toBeFocused();
  await expect(board).toHaveAttribute('aria-selected', 'true');
  const focus = await board.evaluate((el) => {
    const s = getComputedStyle(el);
    return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
  });
  expect(focus.style).not.toBe('none');
  expect(focus.width).toBeGreaterThanOrEqual(2);
});

test.describe('mobile touch and editing', () => {
  test.use({ hasTouch: true });

  test('at 320px the board choices, swatches, and text actions are easy to tap', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    await open(page);
    await reset(page);
    await expectTouchTargets(page, '#boardmode button, .tabs button, .stagebar button, #tab-board button, #tab-board input[type=color], #mobilebar button');
    const red = page.locator('#paints .sw[data-v="#c8102e"]');
    await red.tap();
    await expect(red).toHaveAttribute('aria-pressed', 'true');
    await page.evaluate(() => { cornhole.showTab('text'); cornhole.select('t1'); });
    await expectTouchTargets(page, '#texts button, #tab-text .btn, #tab-text summary');
    const words = page.locator('#texts input.quick').first();
    await words.fill('FAMILY GAME NIGHT');
    await expect(words).toBeFocused();
    expect(await page.evaluate(() => cornhole.activeBoard().elements[0].text)).toBe('FAMILY GAME NIGHT');
    const fontSize = await words.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(fontSize, 'editable text avoids the small-field zoom trigger on phones').toBeGreaterThanOrEqual(16);
    await page.evaluate(() => cornhole.showTab('templates'));
    await expectTouchTargets(page, '#templatesearch, #templateoccasion, #cleartemplates');
    const occasion = await page.locator('#templateoccasion').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(occasion, 'the occasion filter avoids the zoom trigger too').toBeGreaterThanOrEqual(16);
    await page.evaluate(() => { cornhole.showTab('art'); cornhole.select(cornhole.addClip('heart').id); });
    await expectTouchTargets(page, '#tab-art .btn, #tab-art summary, #tab-art input[type=color], #tab-art label:has(input[type=checkbox])');
  });

  for (const width of [320, 375, 768]) {
    test(`at ${width}px every editing pane and checkout fit the screen`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await open(page);
      await reset(page);
      for (const tab of ['templates', 'board', 'text', 'art', 'order']) {
        await page.evaluate((name) => cornhole.showTab(name), tab);
        if (tab === 'text') {
          await page.evaluate(() => cornhole.select('t1'));
          await page.locator('#textmore').evaluate((el) => { el.open = true; });
        }
        await expectNoHorizontalOverflow(page);
      }
      await page.click('#toreview');
      await page.click('#tocheckout');
      await expect(page.locator('#orderform')).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await expectTouchTargets(page, '#orderform input:not([type=hidden]), #orderform select, #orderform textarea, #orderform button');
    });
  }

  test('a short keyboard-sized viewport keeps the focused text and tabs reachable', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await open(page);
    await reset(page);
    await page.evaluate(() => { cornhole.showTab('text'); cornhole.select('t1'); });
    await page.locator('#ttext').focus();
    await page.setViewportSize({ width: 375, height: 420 });
    await page.locator('#ttext').scrollIntoViewIfNeeded();
    await page.locator('#ttext').fill('READY TO PLAY');
    const visible = await page.locator('#ttext').evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, hit: document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === el };
    });
    expect(visible.top).toBeGreaterThanOrEqual(60);
    expect(visible.bottom).toBeLessThanOrEqual(420);
    expect(visible.hit, 'the sticky preview or review bar does not cover the active field').toBe(true);
    const textTab = page.getByRole('tab', { name: 'Text', exact: true });
    await textTab.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Art', exact: true })).toBeFocused();
    await expect(page.locator('#tab-art')).toBeVisible();
  });

  test('the checkbox toggles keep their finger-sized targets in a browser that does not know :has()', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    await open(page);
    await reset(page);
    // An engine without :has() drops a whole rule when one selector in its
    // list uses it. Stand in for one by making :has() unknown to this one.
    await page.evaluate(() => {
      for (const style of document.querySelectorAll('style')) style.textContent = style.textContent.replace(/:has\(/g, ':unknown-pseudo(');
    });
    expect(await page.evaluate(() => CSS.supports('selector(:unknown-pseudo(a))'))).toBe(false);
    const heights = {};
    for (const [tab, ids] of [['text', ['tshadow']], ['art', ['cflip']], ['order', ['carrycase', 'rush']]]) {
      await page.evaluate((name) => cornhole.showTab(name), tab);
      if (tab === 'text') await page.evaluate(() => cornhole.select('t1'));
      if (tab === 'art') await page.evaluate(() => cornhole.select(cornhole.addClip('heart').id));
      for (const id of ids) heights[id] = await page.locator(`label:has(#${id})`).evaluate((el) => el.getBoundingClientRect().height);
    }
    for (const [id, height] of Object.entries(heights)) expect(height, `the ${id} toggle stays a finger-sized target`).toBeGreaterThanOrEqual(43.5);
  });

  test('the template choices have readable previews and the bottom action leaves room for the page', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    await open(page);
    const preview = await page.locator('#templates .tpl canvas').first().boundingBox();
    expect(preview.width).toBeGreaterThanOrEqual(80);
    expect(preview.height).toBeGreaterThanOrEqual(160);
    const bar = await page.locator('#mobilebar').boundingBox();
    const reserved = await page.evaluate(() => parseFloat(getComputedStyle(document.body).paddingBottom));
    expect(reserved).toBeGreaterThanOrEqual(bar.height);
    await page.evaluate(() => window.scrollTo(0, 500));
    const stage = await page.locator('.stage').boundingBox();
    const choice = await page.locator('#templates .tpl').first().boundingBox();
    expect(bar.y - stage.y - stage.height, 'a complete template choice fits below the pinned preview').toBeGreaterThanOrEqual(choice.height + 8);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const footer = await page.locator('footer').boundingBox();
    expect(footer.y + footer.height, 'the final content is not hidden behind Review order').toBeLessThanOrEqual(bar.y + 1);
  });
});
