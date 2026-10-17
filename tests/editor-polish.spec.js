import { test, expect } from '@playwright/test';
import { open } from './helpers.js';

/* Small things under the customer's eyes on every edit. The swatch whose
   colour is on the board and the swatch the keyboard is on are marked
   differently. An outline's width stays on the line of its slider, and
   the clip-art Flip has a line of its own. On a phone the outline round
   the board being edited clears its label and the board choices. The
   header total is named for a screen reader. And in Stars and stripes the
   stars sit inside the blue square. */

const box = (page, sel) => page.locator(sel).evaluate((el) => {
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom, mid: r.y + r.height / 2 };
});

/* The colour, slider and width of one outline: the width inside the
   slider's line and to its right, the colour on the same line, and the
   slider long enough to drag. */
async function outlineRow(page, which) {
  const colour = await box(page, '#' + which + 'outline'), slider = await box(page, '#' + which + 'outlinew'), value = await box(page, '#' + which + 'outlinewval');
  expect(value.y, which + ': the width is on its slider\'s line').toBeGreaterThanOrEqual(slider.y - 0.5);
  expect(value.bottom, which + ': the width is on its slider\'s line').toBeLessThanOrEqual(slider.bottom + 0.5);
  expect(value.x, which + ': the width is to the right of its slider').toBeGreaterThanOrEqual(slider.right);
  expect(colour.mid, which + ': the outline colour is on the same line').toBeGreaterThan(slider.y);
  expect(colour.mid, which + ': the outline colour is on the same line').toBeLessThan(slider.bottom);
  expect(colour.right, which + ': the colour comes before the slider').toBeLessThanOrEqual(slider.x);
  expect(slider.w, which + ': a slider long enough to drag').toBeGreaterThanOrEqual(80);
  return slider;
}

for (const [width, height] of [[1280, 900], [390, 844], [320, 568]]) {
  test.describe(`${width} x ${height}`, () => {
    test.use({ viewport: { width, height }, hasTouch: width < 900 });

    test('an outline\'s width stays beside its slider, and Flip has a line of its own', async ({ page }) => {
      await open(page);
      await page.evaluate(() => cornhole.applyTemplate('wedding'));
      await page.evaluate(() => { cornhole.showTab('text'); cornhole.select(cornhole.activeBoard().elements.find((e) => e.type === 'text').id); });
      await expect(page.locator('#textprops')).toBeVisible();
      await outlineRow(page, 't');

      await page.evaluate(() => { cornhole.showTab('art'); cornhole.select(cornhole.activeBoard().elements.find((e) => e.type === 'clip').id); });
      await expect(page.locator('#cliponly')).toBeVisible();
      const slider = await outlineRow(page, 'c');
      const flip = await box(page, 'label:has(#cflip)');
      expect(flip.y, 'Flip is on a line below the outline width').toBeGreaterThanOrEqual(slider.bottom);
      expect(flip.h, 'Flip is still a finger-sized target').toBeGreaterThanOrEqual(44);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 'nothing scrolls sideways').toBeLessThanOrEqual(0);
    });
  });
}

for (const [width, height] of [[1280, 900], [390, 844]]) {
  test(`at ${width} x ${height} the header total is named for a screen reader, and the chip holds the amount alone`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await open(page);
    const total = await page.locator('#headtotal').textContent();
    expect(total).toMatch(/^\$\d[\d,]*\.\d\d$/);
    await expect(page.locator('#headtotal')).toBeVisible();
    expect(await page.getByRole('banner').ariaSnapshot()).toContain('Estimated total, before tax ' + total);
  });
}

test('the colour on the board and the swatch the keyboard is on look different', async ({ page }) => {
  await open(page);
  await page.evaluate(() => cornhole.showTab('board'));
  const teal = page.locator('#paints .sw[data-v="#0f8b8d"]'), green = page.locator('#paints .sw[data-v="#1f7a3a"]');
  const look = (sw) => sw.evaluate((el) => { const s = getComputedStyle(el); return { shadow: s.boxShadow, outline: s.outlineStyle, ring: el.matches(':focus-visible') }; });

  /* Enter on teal, then Tab to green, the swatch beside it. */
  await teal.focus();
  await page.keyboard.press('Enter');
  await expect(teal).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => cornhole.activeBoard().base.color)).toBe('#0f8b8d');
  await page.keyboard.press('Tab');
  await expect(green).toBeFocused();
  const chosen = await look(teal), focused = await look(green);
  expect(chosen.shadow, 'the chosen colour has a white frame').toContain('rgb(255, 255, 255) 0px 0px 0px 3px inset');
  expect(chosen.shadow, 'inside a solid navy ring').toContain('rgb(31, 58, 147) 0px 0px 0px 3px');
  expect(chosen.outline).toBe('none');
  expect(focused.ring).toBe(true);
  expect(focused.outline, 'the swatch the keyboard is on has a dashed ring').toBe('dashed');
  expect(focused.shadow, 'and no frame').not.toContain('inset');

  /* Back on the chosen one, both marks show. */
  await page.keyboard.press('Shift+Tab');
  await expect(teal).toBeFocused();
  const both = await look(teal);
  expect(both.outline).toBe('dashed');
  expect(both.shadow).toContain('inset');
});

test.describe('a set on a phone, 390 x 844 with touch', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('the outline round the board being edited clears its label and the board choices', async ({ page }) => {
    await open(page);
    await page.locator('#boardmode .chip[data-v="b"]').tap();
    await expect(page.locator('#boardB .label')).toHaveText('Board B - editing');
    const m = await page.evaluate(() => {
      const c = document.getElementById('canvasB'), s = getComputedStyle(c), r = c.getBoundingClientRect();
      return { style: s.outlineStyle, reach: parseFloat(s.outlineOffset) + parseFloat(s.outlineWidth), top: r.top, bottom: r.bottom,
        label: document.querySelector('#boardB .label').getBoundingClientRect().top, chips: document.getElementById('boardmode').getBoundingClientRect().bottom };
    });
    expect(m.style).toBe('dashed');
    expect(m.label - m.bottom, 'the label starts 10 px or more below the board').toBeGreaterThanOrEqual(10);
    expect(m.label - m.bottom, 'and clear of its outline').toBeGreaterThanOrEqual(m.reach + 3);
    expect(m.top - m.reach, 'the outline stays under the board choices').toBeGreaterThanOrEqual(m.chips);
  });
});

test('Stars and stripes has its stars inside the blue square, clear of USA', async ({ page }) => {
  await open(page);
  await page.evaluate(() => cornhole.applyTemplate('patriotic'));
  const els = await page.evaluate(() => cornhole.activeBoard().elements);
  const square = els.find((e) => e.name === 'rounded-square'), stars = els.find((e) => e.name === 'three-stars');
  /* The boxes the page gives the two pieces. */
  const around = async (el) => {
    const aspect = await page.evaluate((name) => cornhole.CLIPS[name].aspect || 1, el.name);
    return { x0: el.x - el.width / 2, x1: el.x + el.width / 2, y0: el.y - el.width * aspect / 2, y1: el.y + el.width * aspect / 2 };
  };
  const sq = await around(square), st = await around(stars);
  expect(st.x0).toBeGreaterThanOrEqual(sq.x0);
  expect(st.x1).toBeLessThanOrEqual(sq.x1);
  expect(st.y0).toBeGreaterThanOrEqual(sq.y0);
  expect(st.y1).toBeLessThanOrEqual(sq.y1);

  /* And the ink: each piece drawn by the page alone on a black board, and
     every pixel of the stars on a pixel of the square. */
  const ink = await page.evaluate(() => {
    const els = cornhole.activeBoard().elements;
    const alone = (list) => {
      const board = () => ({ base: { kind: 'paint', color: '#000000', color2: '#000000', angle: 180, stain: 'walnut' }, pattern: { kind: 'none', color: '#000000', size: 3 }, elements: JSON.parse(JSON.stringify(list)) });
      cornhole.setDesign({ version: 2, same: true, a: board(), b: board() });
      cornhole.paint();
      const c = document.getElementById('canvasA'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, ppi = c.width / 24;
      const on = new Uint8Array(c.width * c.height);
      let y0 = Infinity, y1 = -Infinity;
      for (let i = 0; i < on.length; i++) if (Math.max(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]) > 100) { on[i] = 1; const y = Math.floor(i / c.width); y0 = Math.min(y0, y / ppi); y1 = Math.max(y1, (y + 1) / ppi); }
      return { on, y0, y1 };
    };
    const square = alone(els.filter((e) => e.name === 'rounded-square')), stars = alone(els.filter((e) => e.name === 'three-stars')), usa = alone(els.filter((e) => e.text === 'USA'));
    let drawn = 0, outside = 0;
    for (let i = 0; i < stars.on.length; i++) if (stars.on[i]) { drawn++; if (!square.on[i]) outside++; }
    return { drawn, outside, starsBottom: stars.y1, starsTop: stars.y0, squareTop: square.y0, usaTop: usa.y0 };
  });
  expect(ink.drawn, 'the stars are drawn').toBeGreaterThan(5000);
  expect(ink.outside, 'no part of a star is off the blue square').toBe(0);
  expect(ink.starsTop - ink.squareTop, 'the middle star\'s tip is inside the top edge').toBeGreaterThanOrEqual(0.5);
  expect(ink.usaTop - ink.starsBottom, 'the stars end above USA').toBeGreaterThanOrEqual(0.5);
});
