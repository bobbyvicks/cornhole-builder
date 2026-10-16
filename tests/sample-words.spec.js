import { test, expect } from '@playwright/test';
import { open, reloaded, settled } from './helpers.js';

/* Sample words are the placeholders the page puts on a board (YOUR TEAM,
   NEW TEXT) and the words a template arrives with, while they are still
   on the text the template put there. The review asks before printing
   them, and a words field holding them selects them when it takes the
   focus, so typing replaces them. Words a customer typed are theirs,
   even when a template happens to use the same ones: EST. 2026 is the
   Team template's line and a team founded this year. */

const review = async (page) => {
  await page.getByRole('tab', { name: 'Order', exact: true }).click();
  await page.click('#toreview');
  await expect(page.locator('#orderstep2')).toBeVisible();
};
const card = (page, label) => page.getByRole('button', { name: label + ' template', exact: true });
const textNamed = (page, words) => page.evaluate((words) => cornhole.activeBoard().elements.find((e) => e.type === 'text' && e.text === words)?.id, words);
const caret = (locator) => locator.evaluate((el) => ({ start: el.selectionStart, end: el.selectionEnd }));

test('words the customer typed are not called a template\'s sample words, even the Team template\'s own', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: '+ Start with blank boards', exact: true }).click();
  await page.click('#addtext');
  await expect(page.locator('#ttext')).toBeFocused();
  await page.keyboard.type('EST. 2026');
  expect(await page.evaluate(() => cornhole.activeBoard().elements.map((e) => e.text))).toEqual(['EST. 2026']);
  expect(await page.evaluate(() => cornhole.sampleWordsIn())).toEqual([]);
  await review(page);
  await expect(page.locator('#samplewarn')).toBeHidden();
  await expect(page.locator('#tocheckout')).toBeEnabled();
  /* The same in a row of the list, and still after a reload. */
  await page.getByRole('tab', { name: 'Text', exact: true }).click();
  await page.click('#addtext');
  await page.locator('#texts textarea.quick').nth(1).fill('EST. 2018');
  await settled(page); await reloaded(page);
  expect(await page.evaluate(() => cornhole.sampleWordsIn())).toEqual([]);
});

test('the Team template untouched is held for its sample words, EST. 2026 among them', async ({ page }) => {
  await open(page);
  await card(page, 'Team').click();
  await review(page);
  await expect(page.locator('#samplewarn')).toBeVisible();
  await expect(page.locator('#sampletext')).toContainText('“YOUR TEAM”');
  await expect(page.locator('#sampletext')).toContainText('“EST. 2026”');
  await expect(page.locator('#tocheckout')).toBeDisabled();
  /* The template's words keep the mark through a reload. */
  await settled(page); await reloaded(page);
  expect((await page.evaluate(() => cornhole.sampleWordsIn())).sort()).toEqual(['EST. 2026', 'YOUR TEAM']);
});

test('on Wedding with the first line replaced, the review lists the template words still there and not the new ones', async ({ page }) => {
  await open(page);
  await card(page, 'Wedding').click();
  await expect(page.locator('#ttext')).toBeFocused();
  await page.keyboard.type('Emma & James');
  await review(page);
  await expect(page.locator('#samplewarn')).toBeVisible();
  const said = await page.locator('#sampletext').textContent();
  expect(said).toContain('“SMITH”');
  expect(said).toContain('“June 14, 2026”');
  expect(said).not.toContain('Emma');
  expect(said).not.toContain('Mr & Mrs');
  /* Typed back, the template's words are a sample again; a copy of a
     template's line is too, and typing over the copy makes it the
     customer's. */
  await page.getByRole('tab', { name: 'Text', exact: true }).click();
  await page.locator('#texts textarea.quick').first().fill('Mr & Mrs');
  expect(await page.evaluate(() => cornhole.sampleWordsIn())).toContain('Mr & Mrs');
  await page.evaluate(() => cornhole.select(cornhole.activeBoard().elements.find((e) => e.text === 'SMITH').id));
  await page.click('#tdup');
  expect(await page.evaluate(() => cornhole.activeBoard().elements.filter((e) => e.text === 'SMITH').length)).toBe(2);
  expect(await page.evaluate(() => cornhole.sampleWordsIn())).toContain('SMITH');
  await page.locator('#ttext').fill('EST. 2026');
  expect(await page.evaluate(() => cornhole.sampleWordsIn()), 'another template\'s words on a template\'s line are the customer\'s').not.toContain('EST. 2026');
});

test('each words field is named by its place in the list, not by the words a template gave it', async ({ page }) => {
  await open(page);
  await card(page, 'Wedding').click();
  await page.keyboard.type('Sam & Alex');
  const rows = page.locator('#texts textarea.quick');
  await expect(rows).toHaveCount(3);
  for (let i = 0; i < 3; i++) await expect(rows.nth(i)).toHaveAccessibleName('Words ' + (i + 1));
  await expect(page.getByRole('textbox', { name: 'Words 1', exact: true })).toHaveValue('Sam & Alex');
  await expect(page.getByRole('textbox', { name: 'Words 2', exact: true })).toHaveValue('SMITH');
  /* Removed, the rows after it move up a place and are named so. */
  await page.getByRole('button', { name: 'Remove "Sam & Alex"', exact: true }).click();
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toHaveAccessibleName('Words 1');
  await expect(rows.nth(0)).toHaveValue('SMITH');
  await expect(rows.nth(1)).toHaveAccessibleName('Words 2');
});

test('a click in a template\'s words selects them, and one in the customer\'s own words puts the caret there', async ({ page }) => {
  await open(page);
  await card(page, 'Wedding').click();
  const smith = page.locator('#texts textarea.quick').nth(1);
  await expect(smith).toHaveValue('SMITH');
  const box = await smith.boundingBox();
  /* A real click: the button goes down, and comes up a moment later. */
  await page.mouse.move(box.x + 12, box.y + box.height / 2);
  await page.mouse.down(); await page.waitForTimeout(80); await page.mouse.up();
  await expect(smith).toBeFocused();
  await expect.poll(() => caret(smith)).toEqual({ start: 0, end: 5 });
  await page.waitForTimeout(100);
  expect(await caret(smith), 'the selection outlasts the click').toEqual({ start: 0, end: 5 });
  await page.keyboard.type('JONES');
  await expect(smith).toHaveValue('JONES');
  /* Changed, the words are the customer's: a click goes where it lands. */
  await page.locator('#addtext').focus();
  await page.mouse.click(box.x + 12, box.y + box.height / 2);
  await expect(smith).toBeFocused();
  await page.waitForTimeout(100);
  const at = await caret(smith);
  expect(at.start, 'a caret, not a selection').toBe(at.end);
  expect(at.end).toBeLessThan(5);
});

test('reached with Tab, the template\'s words are selected, and so is the selected text\'s field below the list', async ({ page }) => {
  await open(page);
  await card(page, 'Wedding').click();
  await page.keyboard.type('Emma & James');
  await page.locator('#texts .itemrow').nth(1).locator('.item').focus();
  await page.keyboard.press('Tab');
  const smith = page.locator('#texts textarea.quick').nth(1);
  await expect(smith).toBeFocused();
  await expect.poll(() => caret(smith)).toEqual({ start: 0, end: 5 });
  /* The date, picked with its Select button, then the Text field. */
  await page.locator('#texts .itemrow').nth(2).locator('.item').click();
  const ttext = page.locator('#ttext');
  await expect(ttext).toHaveValue('June 14, 2026');
  await ttext.click({ position: { x: 20, y: 12 } });
  await expect.poll(() => caret(ttext)).toEqual({ start: 0, end: 13 });
  await page.keyboard.type('June 6, 2027');
  expect(await page.evaluate(() => cornhole.activeBoard().elements.map((e) => e.text).filter(Boolean))).toContain('June 6, 2027');
  await ttext.blur();
  await ttext.click({ position: { x: 20, y: 12 } });
  await page.waitForTimeout(100);
  const at = await caret(ttext);
  expect(at.start, 'the customer\'s own words are not selected again').toBe(at.end);
});

test('when the list is built again under a template\'s words, the caret comes back, not a selection', async ({ page }) => {
  await open(page);
  await card(page, 'Wedding').click();
  const id = await textNamed(page, 'SMITH');
  const smith = page.locator('#texts textarea.quick[data-id="' + id + '"]');
  await smith.focus();
  await expect.poll(() => caret(smith)).toEqual({ start: 0, end: 5 });
  await smith.evaluate((el) => el.setSelectionRange(2, 2));
  /* The words change places: the rows are built again, and the field
     there now is given the focus and the caret back. */
  await page.evaluate(() => { cornhole.activeBoard().elements.reverse(); cornhole.select(cornhole.selected); });
  await page.waitForTimeout(100);
  await expect(smith).toBeFocused();
  expect(await caret(smith)).toEqual({ start: 2, end: 2 });
  await page.keyboard.type('!');
  await expect(smith).toHaveValue('SM!ITH');
});

test.describe('on a phone', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test('a tap on a template\'s words selects them, typing replaces them, and the next tap leaves the caret', async ({ page }) => {
    await open(page);
    await card(page, 'Wedding').tap();
    const smith = page.locator('#texts textarea.quick').nth(1);
    await expect(smith).toHaveValue('SMITH');
    await smith.scrollIntoViewIfNeeded();
    await smith.tap({ position: { x: 16, y: 20 } });
    await expect(smith).toBeFocused();
    await expect.poll(() => caret(smith)).toEqual({ start: 0, end: 5 });
    await page.keyboard.type('JONES');
    await expect(smith).toHaveValue('JONES');
    const id = await textNamed(page, 'JONES');
    expect(id, 'the board has the new name').toBeTruthy();
    expect(await page.evaluate(() => cornhole.activeBoard().elements.some((e) => e.text === 'SMITH'))).toBe(false);
    await expect(smith, 'the field is not named after the old words').not.toHaveAccessibleName(/SMITH/);
    /* Focused again, the customer's words are left as they are. */
    await page.locator('#addtext').focus();
    await smith.tap({ position: { x: 16, y: 20 } });
    await expect(smith).toBeFocused();
    await page.waitForTimeout(100);
    const at = await caret(smith);
    expect(at.start, 'not selected again').toBe(at.end);
    /* The date is still the template's, and a tap selects it all. */
    const date = page.locator('#texts textarea.quick').nth(2);
    await date.tap({ position: { x: 16, y: 20 } });
    await expect.poll(() => caret(date)).toEqual({ start: 0, end: 13 });
  });
});
