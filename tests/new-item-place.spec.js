import { test, expect } from '@playwright/test';
import { open, picture, clientPoint, count, CREAM } from './helpers.js';

/* Where new words, clip art and pictures land. They all used to land on
   one spot, 12" across and 36" down (a picture 30" down, 10" wide), over
   whatever was there: a new picture covered a template's words on 29 of
   the 32 templates (all of HAPPY, USA, AHOY and JORDAN), and words added
   to a team board under a basketball went inside the ball, where they
   could not be seen and took the taps meant for it. The usual spot is
   kept when nothing is in it, a blank board included; otherwise the new
   item goes into free room. These read the boxes the board picks items
   up by (cornhole.boxes), as upright boxes around turned items. */

const items = (page) => page.evaluate(() => {
  cornhole.paint();
  return cornhole.activeBoard().elements.map((el) => {
    const b = cornhole.boxes.get(el.id), a = (el.rotation || 0) * Math.PI / 180, cos = Math.abs(Math.cos(a)), sin = Math.abs(Math.sin(a));
    const cx = el.x - (b.oy || 0) * Math.sin(a), cy = el.y + (b.oy || 0) * Math.cos(a), hw = (cos * b.w + sin * b.h) / 2, hh = (sin * b.w + cos * b.h) / 2;
    return { id: el.id, type: el.type, name: el.type === 'text' ? el.text : el.name || 'picture', x: el.x, y: el.y, width: el.width, box: { x0: cx - hw, x1: cx + hw, y0: cy - hh, y1: cy + hh } };
  });
});
const area = (b) => (b.x1 - b.x0) * (b.y1 - b.y0);
const overlap = (p, q) => Math.max(0, Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0)) * Math.max(0, Math.min(p.y1, q.y1) - Math.max(p.y0, q.y0));
/* The square around the 6" hole, 9" down the middle of the board. */
const HOLE = { x0: 9, x1: 15, y0: 6, y1: 12 };
const selectedEl = (page) => page.evaluate(() => cornhole.activeBoard().elements.find((e) => e.id === cornhole.selected));
const tab = (page, name) => page.getByRole('tab', { name, exact: true });

/* The way a customer adds each: the Add text button, the Heart in the
   Art tab, a picture chosen for the picture button. */
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
async function addPicture(page, file) {
  const n = await page.evaluate(() => cornhole.activeBoard().elements.filter((e) => e.type === 'image').length);
  await page.setInputFiles('#addimage', file);
  await page.waitForFunction((n) => cornhole.activeBoard().elements.filter((e) => e.type === 'image').length > n, n);
  return page.evaluate(() => cornhole.activeBoard().elements.filter((e) => e.type === 'image').pop());
}
const photo = (page) => picture(page, 900, 600, 'image/jpeg', "g.fillStyle = '#cc8844'; g.fillRect(0, 0, w, h); g.fillStyle = '#224488'; g.fillRect(w / 8, h / 6, w / 3, h / 2);");

test('on every template new words, the Heart and a picture land clear of the words, the hole and each other', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page);
  const file = await photo(page);
  const ids = await page.evaluate(() => cornhole.TEMPLATES.map((t) => t.id));
  expect(ids).toHaveLength(32);
  for (const id of ids) {
    await page.evaluate((id) => cornhole.applyTemplate(id), id);
    const before = await items(page);
    await addText(page);
    await addHeart(page);
    await addPicture(page, file);
    const after = await items(page);
    const fresh = after.slice(before.length), words = before.filter((e) => e.type === 'text');
    expect(fresh.map((e) => e.type), id).toEqual(['text', 'clip', 'image']);
    for (const f of fresh) {
      const what = id + ': the new ' + f.type;
      for (const w of words) expect(overlap(f.box, w.box) / area(w.box), what + ' over “' + w.name + '”').toBeLessThanOrEqual(0.1);
      expect(overlap(f.box, HOLE), what + ' over the hole').toBe(0);
      expect(f.box.x0 >= 0 && f.box.x1 <= 24 && f.box.y1 <= 48, what + ' on the board').toBe(true);
      for (const g of fresh) if (g !== f) expect(overlap(f.box, g.box), what + ' over the new ' + g.type).toBe(0);
    }
    /* Made smaller to fit, but not past 4" wide. */
    expect(fresh[1].width, id + ': the Heart').toBeGreaterThanOrEqual(4);
    expect(fresh[2].width, id + ': the picture').toBeGreaterThanOrEqual(4);
  }
});

test('on Wedding a new picture leaves SMITH and the date uncovered, and still shows', async ({ page }) => {
  await open(page);
  await page.evaluate(() => cornhole.applyTemplate('wedding'));
  const pic = await addPicture(page, await photo(page));
  const all = await items(page), mine = all.find((e) => e.id === pic.id);
  for (const name of ['Mr & Mrs', 'SMITH', 'June 14, 2026']) expect(overlap(mine.box, all.find((e) => e.name === name).box), name).toBe(0);
  /* Before, it lay 10" wide over the names at (12, 30). */
  expect(pic.y).not.toBe(30);
  expect(pic.width).toBeGreaterThanOrEqual(4);
  expect(pic.width).toBeLessThanOrEqual(10);
});

test('on a blank board new words and the Heart land 36 in down and a picture 30 in down, as before', async ({ page }) => {
  await open(page);
  await page.evaluate(() => cornhole.applyBlank());
  expect(await addText(page)).toMatchObject({ x: 12, y: 36, size: 3 });
  await page.click('#undo');
  expect(await addHeart(page)).toMatchObject({ x: 12, y: 36, width: 8 });
  await page.click('#undo');
  expect(await addPicture(page, await photo(page))).toMatchObject({ x: 12, y: 30, width: 10 });
  /* YOUR TEAM, on the board a first visit opens with, leaves the usual
     spot for words clear, so they still land there. */
  await page.evaluate(() => cornhole.setDesign({ version: 2, same: true, a: { elements: [{ type: 'text', text: 'YOUR TEAM', font: 'Anton', size: 4, color: '#f5f5f0', x: 12, y: 30 }] }, b: {} }));
  expect(await addText(page)).toMatchObject({ x: 12, y: 36 });
});

test('art given a place keeps it, and art given a width keeps that width', async ({ page }) => {
  await open(page);
  const placed = await page.evaluate(() => cornhole.addClip('heart', { x: 12, y: 30 }));
  expect(placed).toMatchObject({ x: 12, y: 30, width: 8 });
  const wide = await page.evaluate(() => cornhole.addClip('star', { width: 10 }));
  expect(wide.width).toBe(10);
  const all = await items(page), star = all.find((e) => e.id === wide.id);
  for (const other of all) if (other !== star) expect(overlap(star.box, other.box), 'the star over ' + other.name).toBe(0);
});

test.describe('a team board on a phone, 360 x 780 with touch', () => {
  test.use({ viewport: { width: 360, height: 780 }, hasTouch: true });

  test('a basketball, then new words: the two apart, the words show, and a tap on the ball picks the ball', async ({ page }) => {
    const errors = await open(page);
    await tab(page, 'Art').tap();
    await page.fill('#clipsearch', 'basketball');
    await page.locator('#clips .clip[data-name="basketball"]').tap();
    const ball = await selectedEl(page);
    expect(ball).toMatchObject({ type: 'clip', name: 'basketball' });
    const creamBefore = await count(page, 'a', CREAM);
    await tab(page, 'Text').tap();
    await page.locator('#addtext').tap();
    await expect(page.locator('#ttext')).toBeFocused();
    await page.keyboard.type('EST.');
    await page.keyboard.press('Enter');
    await page.keyboard.type('2026');
    const words = await selectedEl(page);
    expect(words.text).toBe('EST.\n2026');
    const all = await items(page), box = (id) => all.find((e) => e.id === id).box;
    expect(overlap(box(words.id), box(ball.id)), 'the words and the ball').toBe(0);
    const team = all.find((e) => e.name === 'YOUR TEAM');
    expect(overlap(box(ball.id), team.box), 'the ball and YOUR TEAM').toBe(0);
    expect(overlap(box(words.id), team.box), 'the words and YOUR TEAM').toBe(0);
    /* The words come in the ball's off-white and now add ink of it to the
       board; inside the ball they added none. */
    expect(words.color).toBe('#f5f5f0');
    expect(await count(page, 'a', CREAM) - creamBefore, 'the new words show').toBeGreaterThan(20);
    const middle = await clientPoint(page, 'a', ball.x, ball.y);
    await page.touchscreen.tap(middle.x, middle.y);
    expect(await page.evaluate(() => cornhole.selected), 'the ball, not words hidden in it').toBe(ball.id);
    expect(errors).toEqual([]);
  });
});
