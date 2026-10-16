import { test, expect } from '@playwright/test';
import { open, reset, picture, settled, pixelAt, count } from './helpers.js';

/* New words and new clip art come in charcoal or off-white, whichever
   shows on the spot of the board they land on. Off-white on every painted
   board made ivory, cream or blush words and hearts all but invisible: a
   dashed box and nothing in it, which reads as a broken button. These
   apply templates the way a card does, add text with the button and the
   Heart from the Art tab, and read the preview to see the new item. */

const CHARCOAL = '#36393b', OFFWHITE = '#f5f5f0';
const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const hexOf = (px) => '#' + px.slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join('');
const lum = (hex) => rgbOf(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

/* The board itself at a spot, with none of its items: what a new item
   there is seen against. Read off the print file, which has no bevel. */
const boardAt = (page, x, y) => page.evaluate(([x, y]) => {
  const bare = { ...cornhole.design, same: true, a: { ...cornhole.activeBoard(), elements: [] } };
  const d = cornhole.printCanvas('a', bare).getContext('2d').getImageData(Math.round(x * 100), Math.round(y * 100), 1, 1).data;
  return '#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join('');
}, [x, y]);
const selectedEl = (page) => page.evaluate(() => cornhole.activeBoard().elements.find((e) => e.id === cornhole.selected));

async function addText(page) {
  await page.evaluate(() => cornhole.showTab('text'));
  await page.click('#addtext');
  return selectedEl(page);
}
async function addHeart(page) {
  await page.evaluate(() => cornhole.showTab('art'));
  await page.click('#clips .clip[data-name="heart"]');
  return selectedEl(page);
}

/* Light and soft boards, the ones where off-white vanished. Lake days is
   pale above and deep teal below the middle, where new items land: there
   the dark half decides, and off-white stays, where charcoal - the ink the
   pale base alone would ask for - would sit at 1.3:1 on the teal. */
const LIGHT = ['wedding', 'monogram', 'engagement', 'baby', 'garden', 'bbp1-garden-vows', 'bbp1-lake-days', 'brewery', 'winter'];

for (const id of LIGHT) {
  test('on the ' + id + ' template new words and a new Heart come in an ink that shows on the board', async ({ page }) => {
    await open(page);
    await page.evaluate((id) => cornhole.applyTemplate(id), id);
    const base = await page.evaluate(() => cornhole.activeBoard().base.color.toLowerCase());

    const text = await addText(page);
    expect(text.type).toBe('text');
    const under = await boardAt(page, text.x, text.y);
    if (id === 'bbp1-lake-days') {
      expect(under, 'the teal lower half of the board').toBe('#174e58');
      expect(text.color, 'off-white on the teal, though the base above is pale').toBe(OFFWHITE);
    } else {
      expect(under, 'the new words sit on the base itself').toBe(base);
      expect(text.color, 'charcoal on a light board').toBe(CHARCOAL);
    }
    expect(contrast(text.color, under), text.color + ' on ' + under).toBeGreaterThanOrEqual(3);
    /* The words are drawn in that ink: the board has many more pixels of
       it than before (the template's own words may share it). */
    const inked = await count(page, 'a', rgbOf(text.color));
    await page.click('#undo');
    const without = await count(page, 'a', rgbOf(text.color));
    await page.click('#redo');
    expect(inked - without, 'the new words show on the preview').toBeGreaterThan(500);

    const heart = await addHeart(page);
    expect(heart).toMatchObject({ type: 'clip', name: 'heart' });
    const underHeart = await boardAt(page, heart.x, heart.y);
    expect(heart.color, 'the Heart takes the same ink as words on that spot').toBe(text.color);
    expect(contrast(heart.color, underHeart)).toBeGreaterThanOrEqual(3);
    const middle = hexOf(await pixelAt(page, 'a', heart.x, heart.y));
    expect(middle, 'the middle of the Heart is its own colour').toBe(heart.color);
    expect(middle, 'and not the board under it').not.toBe(underHeart);
  });
}

test('on the default navy board new words and a new Heart are off-white, as before', async ({ page }) => {
  await open(page); await reset(page);
  expect((await addText(page)).color).toBe(OFFWHITE);
  expect((await addHeart(page)).color).toBe(OFFWHITE);
});

test('on wood the stain decides: off-white on the walnut cabin, charcoal on rustic natural wood', async ({ page }) => {
  await open(page);
  await page.evaluate(() => cornhole.applyTemplate('cabin'));
  expect(await page.evaluate(() => cornhole.activeBoard().base)).toMatchObject({ kind: 'wood', stain: 'walnut' });
  expect((await addText(page)).color, 'walnut is dark: charcoal would barely show').toBe(OFFWHITE);
  expect((await addHeart(page)).color).toBe(OFFWHITE);

  await page.evaluate(() => cornhole.applyTemplate('rustic'));
  expect(await page.evaluate(() => cornhole.activeBoard().base)).toMatchObject({ kind: 'wood', stain: 'natural' });
  expect((await addText(page)).color).toBe(CHARCOAL);
  expect((await addHeart(page)).color).toBe(CHARCOAL);
});

test('a fade is read at the height where the new item lands, not by its two ends alone', async ({ page }) => {
  await open(page); await reset(page);
  /* Top to bottom: navy fading to ivory puts the new item low down, on
     the pale end; ivory fading to navy puts it on the dark end. */
  const fade = (color, color2) => page.evaluate(([color, color2]) => {
    const d = cornhole.design;
    cornhole.setDesign({ ...d, a: { ...d.a, base: { kind: 'gradient', color, color2, angle: 180, stain: 'walnut' } } });
  }, [color, color2]);
  await fade('#1f3a93', '#fffaf0');
  expect((await addText(page)).color).toBe(CHARCOAL);
  expect((await addHeart(page)).color).toBe(CHARCOAL);
  await fade('#fffaf0', '#1f3a93');
  expect((await addText(page)).color).toBe(OFFWHITE);
  expect((await addHeart(page)).color).toBe(OFFWHITE);
});

test('a light picture filling a navy board takes charcoal words, and a colour asked for is kept', async ({ page }) => {
  await open(page); await reset(page);
  const file = await picture(page, 400, 800, 'image/png', "g.fillStyle = '#fffaf0'; g.fillRect(0, 0, w, h);");
  await page.setInputFiles('#addimage', file);
  await page.waitForFunction(() => cornhole.activeBoard().elements.some((e) => e.type === 'image'));
  await settled(page);
  await page.evaluate(() => { cornhole.showTab('art'); cornhole.select(cornhole.activeBoard().elements.find((e) => e.type === 'image').id); });
  await page.check('#icover');
  await settled(page);
  expect((await addText(page)).color, 'the picture, not the navy paint under it, is what the words sit on').toBe(CHARCOAL);
  expect((await addHeart(page)).color).toBe(CHARCOAL);
  const red = await page.evaluate(() => cornhole.addClip('heart', { color: '#c8102e' }).color);
  expect(red).toBe('#c8102e');
});
