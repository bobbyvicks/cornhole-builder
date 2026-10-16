import { test, expect } from '@playwright/test';
import { open, reset, setInput, chip, picture } from './helpers.js';

/* A canvas is a picture a screen reader cannot read, so each board carries
   a hidden description that follows the design. These read it the way a
   screen reader does: as the canvas's accessible description, through
   aria-describedby, after the short label that says how to use the board. */

const LABEL = (k) => 'Board ' + k + '. Click or tap something on it to select it; arrow keys move the selection, plus and minus resize it, Delete removes it.';
const board = (page, k) => page.locator('#canvas' + k);

test('after a reset each board is described from its design, and the short label stays as it was', async ({ page }) => {
  await open(page); await reset(page);
  await expect(board(page, 'A')).toHaveAccessibleName(LABEL('A'));
  await expect(board(page, 'B')).toHaveAccessibleName(LABEL('B'));
  await expect(board(page, 'A')).toHaveAccessibleDescription('Painted navy. Words: "HELLO" in Impact.');
  await expect(board(page, 'B'), 'one design on both boards').toHaveAccessibleDescription('The same design as Board A. Painted navy. Words: "HELLO" in Impact.');

  const facts = await page.evaluate(() => ['A', 'B'].map((k) => {
    const id = document.getElementById('canvas' + k).getAttribute('aria-describedby'), el = document.getElementById(id), r = el.getBoundingClientRect();
    return { id, sr: el.classList.contains('sr'), live: Boolean(el.closest('[aria-live], [role="status"], [role="alert"], [role="log"]')), size: [r.width, r.height] };
  }));
  for (const [i, k] of ['A', 'B'].entries()) {
    expect(facts[i].id).toBe('desc' + k);
    expect(facts[i].sr, 'visually hidden, still in the accessibility tree').toBe(true);
    expect(facts[i].live, 'read when the board is reached, never announced as it changes').toBe(false);
    expect(facts[i].size[0]).toBeLessThanOrEqual(1);
  }
});

test('the description follows the paint and the words, and is not rewritten when they stay the same', async ({ page }) => {
  await open(page); await reset(page);
  const A = board(page, 'A');

  /* A swatch, the custom picker, and Undo. */
  await page.click('#paints .sw[data-v="#c8102e"]');
  await expect(A).toHaveAccessibleDescription(/^Painted red\./);
  await setInput(page, 'paintcustom', '#203c90');
  await expect(A, 'a colour off the list is called by the nearest one').toHaveAccessibleDescription(/^Painted near navy\./);
  await page.click('#undo');
  await expect(A).toHaveAccessibleDescription(/^Painted red\./);

  /* The words, from the props field and straight from the list row, then the font. */
  await page.evaluate(() => { cornhole.select('t1'); cornhole.showTab('text'); });
  await page.fill('#ttext', 'SMITH FAMILY');
  await expect(A).toHaveAccessibleDescription('Painted red. Words: "SMITH FAMILY" in Impact.');
  await page.fill('#texts .quick', 'THE SMITHS');
  await expect(A, 'typing in the row follows before the field is left').toHaveAccessibleDescription('Painted red. Words: "THE SMITHS" in Impact.');
  await page.selectOption('#tfont', 'Great Vibes');
  await expect(A).toHaveAccessibleDescription('Painted red. Words: "THE SMITHS" in Great Vibes.');
  await page.click('#addtext');
  await expect(A, 'every text, in layer order').toHaveAccessibleDescription(/^Painted red\. Words: "THE SMITHS" in Great Vibes and ".+" in \w/);

  /* The other bases and a pattern. The fade's second colour and the
     pattern colour only redraw the board, and still reach the words. */
  await page.evaluate(() => { cornhole.setDesign({ ...cornhole.design, a: { ...cornhole.design.a, elements: cornhole.design.a.elements.slice(0, 1) } }); });
  await chip(page, 'basekind', 'gradient');
  await expect(A).toHaveAccessibleDescription(/^A fade from red to sky blue\./);
  await page.evaluate(() => { const e = document.getElementById('paint2'); e.value = '#1f3a93'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await expect(A, 'while the picker is still open').toHaveAccessibleDescription(/^A fade from red to navy\./);
  await chip(page, 'basekind', 'wood');
  await page.click('#stains .sw[data-v="cherry"]');
  await expect(A).toHaveAccessibleDescription(/^Cherry stained wood\./);
  await page.selectOption('#pattern', 'stripes');
  await expect(A).toHaveAccessibleDescription('Cherry stained wood. Pattern: stripes in off-white. Words: "THE SMITHS" in Great Vibes.');
  await page.evaluate(() => { const e = document.getElementById('patcolor'); e.value = '#f2b705'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await expect(A).toHaveAccessibleDescription(/Pattern: stripes in gold\./);

  /* Moving the words changes nothing in the description, so the text
     node is left alone: a screen reader is not handed the same sentence
     again for every nudge. */
  await page.evaluate(() => {
    window.descWrites = 0;
    new MutationObserver((m) => { window.descWrites += m.length; }).observe(document.getElementById('descA'), { childList: true, characterData: true, subtree: true });
    cornhole.select(cornhole.activeBoard().elements[0].id); document.getElementById('canvasA').focus();
  });
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+ArrowDown');
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  expect(await page.evaluate(() => cornhole.activeBoard().elements[0].x), 'the nudges landed').toBeCloseTo(12.5, 5);
  expect(await page.evaluate(() => window.descWrites), 'same words, same text node').toBe(0);
  await page.keyboard.press('Delete');
  await expect(A).toHaveAccessibleDescription('Cherry stained wood. Pattern: stripes in gold. No words or artwork yet.');
  expect(await page.evaluate(() => window.descWrites), 'one change, one write').toBe(1);
});

test('clip art is described by name and pictures by count', async ({ page }) => {
  await open(page); await reset(page);
  const A = board(page, 'A');
  await page.evaluate(() => cornhole.showTab('art'));
  await page.getByRole('button', { name: 'Add Heart', exact: true }).click();
  await expect(A).toHaveAccessibleDescription('Painted navy. Words: "HELLO" in Impact. Clip art: Heart.');
  await page.evaluate(() => { cornhole.addClip('star'); cornhole.addClip('rings'); });
  await expect(A).toHaveAccessibleDescription('Painted navy. Words: "HELLO" in Impact. Clip art: Heart, Star and Wedding rings.');

  const logo = await picture(page, 200, 200, 'image/png', "g.fillStyle='#c8102e'; g.fillRect(0,0,w,h);");
  await page.setInputFiles('#addimage', logo);
  await expect(A).toHaveAccessibleDescription(/Clip art: Heart, Star and Wedding rings\. One picture\.$/);
  await page.setInputFiles('#addimage', logo);
  await expect(A).toHaveAccessibleDescription(/ Two pictures\.$/);

  await page.evaluate(() => { cornhole.select(null); cornhole.activeBoard().elements = cornhole.activeBoard().elements.filter((e) => e.type !== 'clip'); cornhole.render(); cornhole.commit(); });
  await expect(A, 'removed clip art leaves the description').toHaveAccessibleDescription('Painted navy. Words: "HELLO" in Impact. Two pictures.');
});

test('with two different boards each is described on its own and says which one is being edited', async ({ page }) => {
  await open(page); await reset(page);
  const A = board(page, 'A'), B = board(page, 'B');
  await page.click('#boardmode .chip[data-v="b"]');
  await expect(B).toHaveAccessibleDescription('Painted navy. Words: "HELLO" in Impact. This is the board being edited.');
  await expect(A).toHaveAccessibleDescription('Painted navy. Words: "HELLO" in Impact. Board B is being edited.');

  await page.evaluate(() => cornhole.showTab('board'));
  await page.click('#paints .sw[data-v="#1f7a3a"]');
  await page.evaluate(() => cornhole.addClip('star'));
  await expect(B).toHaveAccessibleDescription('Painted green. Words: "HELLO" in Impact. Clip art: Star. This is the board being edited.');
  await expect(A, 'edits to B leave the description of A alone').toHaveAccessibleDescription('Painted navy. Words: "HELLO" in Impact. Board B is being edited.');

  /* The focus on Board A, as a tap on it gives, makes it the one being edited. */
  await page.focus('#canvasA');
  await expect(A).toHaveAccessibleDescription('Painted navy. Words: "HELLO" in Impact. This is the board being edited.');
  await expect(B).toHaveAccessibleDescription('Painted green. Words: "HELLO" in Impact. Clip art: Star. Board A is being edited.');

  /* Back to one design: B is A again, and nothing says which is edited. */
  await page.click('#boardmode .chip[data-v="same"]');
  await expect(A).toHaveAccessibleDescription('Painted navy. Words: "HELLO" in Impact.');
  await expect(B).toHaveAccessibleDescription('The same design as Board A. Painted navy. Words: "HELLO" in Impact.');
});

for (const width of [320, 375, 390]) {
  test(`a long description stays off screen without widening the page at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 740 });
    await open(page); await reset(page);
    await page.evaluate(() => {
      const words = Array.from({ length: 10 }, (_, i) => ({ type: 'text', text: 'A LONG LINE OF WORDS NUMBER ' + i + ' THAT GOES ON AND ON', font: 'Great Vibes', size: 2, color: '#ffffff', x: 12, y: 14 + i * 3 }));
      cornhole.setDesign({ ...cornhole.design, same: false, a: { ...cornhole.design.a, elements: words }, b: { ...cornhole.design.a, elements: words } });
    });
    await expect(board(page, 'A')).toHaveAccessibleDescription(/NUMBER 9 THAT GOES ON AND ON" in Great Vibes\./);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), 'no sideways scroll').toBeLessThanOrEqual(width);
  });
}
