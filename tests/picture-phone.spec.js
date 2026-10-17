import { test, expect } from '@playwright/test';
import { open, picture } from './helpers.js';

/* Adding a picture on a phone. Reading a big photo holds the page for
   seconds there, and the line that says so sits above the tabs, scrolled
   away under the header once a picture is on the board. So the button
   that chose the picture says it is working and turns a second tap away
   (that tap used to open the picker again just as the first picture
   landed), and the focus stays on it. Once the picture lands, its own
   controls are brought up under the pinned board and above the bar at
   the foot, however the page was scrolled. "Picture added" goes when the
   customer opens another tab; a picture that was not added keeps its
   message. */

const ADD = '+ Add a picture or logo', BUSY = 'Preparing picture…';
const tab = (page, name) => page.getByRole('tab', { name, exact: true });

async function jpeg(page, name, color) {
  const file = await picture(page, 80, 40, 'image/jpeg', `g.fillStyle='${color}'; g.fillRect(0,0,w,h);`);
  return { ...file, name };
}

/* The browser really decodes and resizes each JPEG; the reader's answer is
   held, the way a slow phone holds it, until the spec lets it go. */
async function holdUploads(page) {
  await page.evaluate(() => {
    const read = FileReader.prototype.readAsDataURL;
    window.pendingUploads = [];
    FileReader.prototype.readAsDataURL = function (file) {
      const onload = this.onload;
      this.onload = (event) => window.pendingUploads.push({ name: file.name, release: () => onload.call(this, event) });
      return read.call(this, file);
    };
  });
}
const releaseUpload = (page, name) => page.evaluate((name) => {
  const i = window.pendingUploads.findIndex((upload) => upload.name === name);
  window.pendingUploads.splice(i, 1)[0].release();
}, name);
const pictures = (page) => page.evaluate(() => cornhole.activeBoard().elements.filter((e) => e.type === 'image').length);

/* Every file chooser the page opens, from the moment this is called. */
function countChoosers(page) {
  const seen = { n: 0, last: null };
  page.on('filechooser', (chooser) => { seen.n++; seen.last = chooser; });
  return seen;
}
/* The way a customer adds one: a tap on the button, a file picked. */
async function choose(page, file, { how = 'tap' } = {}) {
  const chooser = page.waitForEvent('filechooser');
  if (how === 'tap') await page.locator('#addimagebtn').tap();
  else await page.locator('#addimagebtn').press('Enter');
  await (await chooser).setFiles(file);
}

/* Fill the board and Remove white background, the box and its words,
   lie between the pinned board and the bar at the foot, and nothing
   covers the box. */
const controlsInView = (page) => page.evaluate(() => {
  const stage = document.querySelector('.stage').getBoundingClientRect().bottom;
  const bar = document.getElementById('mobilebar').getBoundingClientRect().top;
  return ['icover', 'iknockout'].every((id) => {
    const box = document.getElementById(id);
    for (const el of [box, box.closest('label')]) {
      const r = el.getBoundingClientRect();
      if (!r.height || r.top < stage - 0.5 || r.bottom > bar + 0.5) return false;
    }
    const r = box.getBoundingClientRect();
    return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === box;
  });
});
const expectControlsInView = (page, message) => expect.poll(() => controlsInView(page), { message, timeout: 5000 }).toBe(true);

test.describe('adding a picture at 375 x 812 with touch', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true });

  test('the first picture: its controls come up above the bar at the foot, and the focus stays on the button', async ({ page }) => {
    const errors = await open(page);
    await tab(page, 'Art').tap();
    await page.evaluate(() => window.scrollTo(0, 0));
    await choose(page, await jpeg(page, 'logo.jpg', '#c8102e'));
    await expect.poll(() => pictures(page)).toBe(1);
    await expectControlsInView(page, 'Fill the board and Remove white background are in view, not under the bar');
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.stage')).position), 'the board is still pinned').toBe('sticky');
    await expect(page.locator('#addimagebtn')).toBeFocused();
    await expect(page.locator('#addimagebtn')).toHaveText(ADD);
    await expect(page.locator('#addimagebtn')).not.toHaveAttribute('aria-disabled', 'true');
    expect(errors).toEqual([]);
  });

  test('a second picture with the page scrolled down: the button says it is working and takes no second tap, then the controls come up under the board', async ({ page }) => {
    const errors = await open(page);
    await tab(page, 'Art').tap();
    await choose(page, await jpeg(page, 'logo.jpg', '#c8102e'));
    await expect.poll(() => pictures(page)).toBe(1);
    /* On down the page, the button just under the pinned board, as a
       customer heading for the clip art would have it: the first
       picture's controls are behind the board. */
    await page.evaluate(() => {
      const button = document.getElementById('addimagebtn').getBoundingClientRect(), stage = document.querySelector('.stage').getBoundingClientRect();
      window.scrollBy(0, button.top - stage.bottom - 20);
    });
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(400);
    await expect.poll(() => controlsInView(page)).toBe(false);
    expect(await page.evaluate(() => document.getElementById('icover').getBoundingClientRect().bottom < document.querySelector('.stage').getBoundingClientRect().bottom), 'Fill the board is behind the board').toBe(true);

    await holdUploads(page);
    const choosers = countChoosers(page);
    await choose(page, await jpeg(page, 'photo.jpg', '#2e7d32'));
    await page.waitForFunction(() => window.pendingUploads.length === 1);
    const button = page.locator('#addimagebtn');
    await expect(button).toHaveText(BUSY);
    await expect(button).toHaveAttribute('aria-disabled', 'true');
    await expect(button).toBeFocused();
    // A finger on it, and the keyboard, while it works: no picker opens.
    const box = await button.boundingBox();
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    expect(choosers.n, 'only the picker that chose the photo').toBe(1);
    await expect(button).toBeFocused();
    expect(await pictures(page)).toBe(1);

    await releaseUpload(page, 'photo.jpg');
    await expect.poll(() => pictures(page)).toBe(2);
    expect(await page.evaluate(() => cornhole.activeBoard().elements.find((e) => e.id === cornhole.selected).type), 'the new picture is picked up').toBe('image');
    await expectControlsInView(page, 'the new picture\'s controls are not left behind the pinned board');
    await expect(button).toHaveText(ADD);
    await expect(button).not.toHaveAttribute('aria-disabled', 'true');
    await expect(button).toBeFocused();
    // The same tap now opens the picker: the check above could see one.
    await button.tap();
    await expect.poll(() => choosers.n).toBe(2);
    expect(errors).toEqual([]);
  });

  test('"Picture added" goes when another tab opens; a picture that was not added keeps its message', async ({ page }) => {
    await open(page);
    const status = page.locator('#uploadstatus');
    await tab(page, 'Art').tap();
    await choose(page, await jpeg(page, 'logo.jpg', '#c8102e'));
    await expect(status).toHaveText('Picture added to Board A.');
    await expect(status).toBeVisible();
    await tab(page, 'Order').tap();
    await expect(status).toBeHidden();
    await tab(page, 'Art').tap();
    await expect(status, 'it does not come back').toBeHidden();

    await choose(page, { name: 'broken.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('not an image') });
    await expect(status).toContainText('Could not read that image');
    await expect(page.locator('#addimagebtn')).toHaveText(ADD);
    for (const name of ['Text', 'Order', 'Art']) {
      await tab(page, name).tap();
      await expect(status, 'the error is still there on ' + name).toBeVisible();
      await expect(status).toContainText('Could not read that image');
    }

    // A full board's message stays too.
    await page.evaluate(() => {
      const project = structuredClone(cornhole.design), src = project.a.elements.find((e) => e.type === 'image').src;
      for (let i = 0; i < 3; i++) project.a.elements.push({ type: 'image', id: 'more-' + i, src, width: 2, x: 4 + i * 4, y: 40 });
      cornhole.setDesign(project);
    });
    await page.setInputFiles('#addimage', await jpeg(page, 'fifth.jpg', '#000000'));
    await expect(status).toContainText('already has 4 pictures');
    await tab(page, 'Board').tap();
    await expect(status).toBeVisible();
    await expect(status).toContainText('already has 4 pictures');
  });
});

test('with two boards, the button is busy only on the board its picture is for', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await page.evaluate(() => { cornhole.showTab('board'); });
  await page.locator('#boardmode [data-v="a"]').click();
  await tab(page, 'Art').click();
  await holdUploads(page);
  await page.setInputFiles('#addimage', await jpeg(page, 'for-a.jpg', '#c8102e'));
  await page.waitForFunction(() => window.pendingUploads.length === 1);
  const button = page.locator('#addimagebtn');
  await expect(button).toHaveText(BUSY);
  await page.locator('#boardmode [data-v="b"]').click();
  await expect(button, 'Board B has nothing on its way').toHaveText(ADD);
  await expect(button).not.toHaveAttribute('aria-disabled', 'true');
  await page.locator('#boardmode [data-v="a"]').click();
  await expect(button).toHaveText(BUSY);
  await releaseUpload(page, 'for-a.jpg');
  await expect(button).toHaveText(ADD);
  expect(await page.evaluate(() => cornhole.design.a.elements.filter((e) => e.type === 'image').length)).toBe(1);
});

test('at 1280 x 900 the keyboard keeps its place: Enter while it works opens nothing, and the page does not jump', async ({ page }) => {
  await open(page);
  await tab(page, 'Art').click();
  await holdUploads(page);
  const choosers = countChoosers(page);
  await choose(page, await jpeg(page, 'logo.jpg', '#c8102e'), { how: 'keyboard' });
  await page.waitForFunction(() => window.pendingUploads.length === 1);
  const button = page.locator('#addimagebtn');
  await expect(button).toBeFocused();
  await expect(button).toHaveText(BUSY);
  await expect(button).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Enter');
  await page.keyboard.press(' ');
  await page.waitForTimeout(300);
  expect(choosers.n).toBe(1);
  const before = await page.evaluate(() => scrollY);
  await releaseUpload(page, 'logo.jpg');
  await expect.poll(() => pictures(page)).toBe(1);
  await expect(button).toBeFocused();
  await expect(button).toHaveText(ADD);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => scrollY), 'only a phone brings the controls up').toBe(before);
  await page.keyboard.press('Enter');
  await expect.poll(() => choosers.n).toBe(2);
});
