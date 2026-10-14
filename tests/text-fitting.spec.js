import { test, expect } from '@playwright/test';
import { open, settled, reloaded, setInput, clientPoint, handlePoint } from './helpers.js';

async function loadLocalFonts(page) {
  await page.addStyleTag({ content: `
    @font-face { font-family: 'Cinzel'; src: url('/asset-pack/fonts/Cinzel.ttf') format('truetype'); font-weight: 100 900; }
    @font-face { font-family: 'Montserrat'; src: url('/asset-pack/fonts/Montserrat.ttf') format('truetype'); font-weight: 100 900; }
    @font-face { font-family: 'Anton'; src: url('/asset-pack/fonts/Anton.ttf') format('truetype'); font-weight: 400; }
  ` });
  const loaded = await page.evaluate(async () => {
    const faces = await Promise.all(['700 32px Cinzel', '800 32px Montserrat', '400 32px Anton'].map(font => document.fonts.load(font)));
    await document.fonts.ready;
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    cornhole.paint();
    return faces.map(face => face.length);
  });
  expect(loaded.every(count => count > 0), 'the tests use the actual bundled fonts').toBe(true);
}

async function garden(page, { fonts = true } = {}) {
  await open(page);
  if (fonts) await loadLocalFonts(page);
  await page.evaluate(() => cornhole.applyTemplate('bbp1-garden-vows'));
  return await page.evaluate(() => {
    cornhole.paint();
    return Object.fromEntries(cornhole.activeBoard().elements.filter(e => e.type === 'text').map(e => [e.text, { ...e, width: cornhole.boxes.get(e.id).w }]));
  });
}

const selectLine = (page, id) => page.evaluate(id => { cornhole.showTab('text'); cornhole.select(id); }, id);
const readLine = (page, id) => page.evaluate(id => {
  cornhole.paint();
  const el = cornhole.activeBoard().elements.find(e => e.id === id);
  return { ...el, width: cornhole.boxes.get(id).w };
}, id);

test('Garden vows fits both long names inside their original spaces within the botanical arch', async ({ page }) => {
  const original = await garden(page);
  for (const [sample, replacement, control] of [
    ['AVERY', 'ALEXANDRIA', 'quick'],
    ['JORDAN', 'CHRISTOPHER', 'selected'],
  ]) {
    const line = original[sample];
    await selectLine(page, line.id);
    const input = control === 'quick' ? page.locator('#texts input.quick[data-id="' + line.id + '"]') : page.locator('#ttext');
    await input.fill(replacement);
    const fitted = await readLine(page, line.id);
    expect(fitted.text).toBe(replacement);
    expect(fitted.size).toBeLessThan(line.size);
    expect(fitted.width).toBeLessThanOrEqual(line.width + 0.03);
    expect(fitted.x).toBe(line.x); expect(fitted.y).toBe(line.y);
    await expect(page.locator('#fitstatus')).toHaveAttribute('data-state', 'fit');
  }
  expect((await readLine(page, original['&'].id)).size, 'the decorative ampersand stays as designed').toBe(original['&'].size);
});

test('a name that cannot fit at minimum size stays intact and shows a warning', async ({ page }) => {
  const original = await garden(page), line = original.AVERY;
  await selectLine(page, line.id);
  const longName = 'W'.repeat(60);
  await page.locator('#ttext').fill(longName);
  const fitted = await readLine(page, line.id);
  expect(fitted.size).toBe(0.5);
  expect(fitted.text).toBe(longName);
  expect(fitted.width).toBeGreaterThan(line.width);
  await expect(page.locator('#fitstatus')).toHaveAttribute('data-state', 'warning');
  await expect(page.locator('#fitstatus')).toContainText('Shorten');
  await page.locator('#ttext').fill('AVA');
  expect((await readLine(page, line.id)).size).toBe(line.size);
  await expect(page.locator('#fitstatus')).toHaveAttribute('data-state', 'fit');
});

test('repeated edits and a reload keep the original name budget instead of progressively shrinking it', async ({ page }) => {
  const original = await garden(page), line = original.AVERY;
  await selectLine(page, line.id);
  await page.locator('#ttext').fill('ALEXANDRIA');
  const firstFit = await readLine(page, line.id);
  for (const words of ['ALEXANDRA', 'ALEX', 'ALEXANDRIA']) await page.locator('#ttext').fill(words);
  expect((await readLine(page, line.id)).size).toBe(firstFit.size);
  await settled(page); await reloaded(page); await loadLocalFonts(page);
  await selectLine(page, line.id);
  expect((await readLine(page, line.id)).fitReference).toEqual(line.fitReference);
  await page.locator('#texts input.quick[data-id="' + line.id + '"]').fill('AVA');
  expect((await readLine(page, line.id)).size).toBe(line.size);
  await page.locator('#ttext').fill('ALEXANDRIA');
  const restored = await readLine(page, line.id);
  expect(restored.size).toBeCloseTo(firstFit.size, 3);
  expect(restored.width).toBeLessThanOrEqual(line.width + 0.03);
});

test('each advanced text control leaves later typing under manual control', async ({ page }) => {
  await garden(page);
  for (const [id, value] of [['tsize', 3.5], ['tspacing', 0.35], ['tarc', 45], ['trot', 25], ['tx', 10], ['ty', 28], ['toutlinew', 0.1], ['tfont', 'Montserrat']]) {
    await page.evaluate(() => cornhole.applyTemplate('bbp1-garden-vows'));
    const lineId = await page.evaluate(() => cornhole.activeBoard().elements.find(e => e.text === 'AVERY').id);
    await selectLine(page, lineId);
    await setInput(page, id, value);
    const manual = await readLine(page, lineId);
    await page.locator('#ttext').fill('ALEXANDRIA');
    const afterTyping = await readLine(page, lineId);
    for (const property of ['size', 'spacing', 'arc', 'rotation', 'x', 'y', 'outlineWidth', 'font']) {
      expect(afterTyping[property], id + ' preserves ' + property).toBe(manual[property]);
    }
    await expect(page.locator('#autofittext')).not.toBeChecked();
  }
});

test('dragging a text resize handle keeps that manual size on the next text edit', async ({ page }) => {
  const original = await garden(page), line = original.AVERY;
  await selectLine(page, line.id);
  const handle = await handlePoint(page, line.id, 'resize');
  const center = await clientPoint(page, 'a', line.x, line.y);
  await page.mouse.move(handle.x, handle.y); await page.mouse.down();
  await page.mouse.move(center.x + (handle.x - center.x) * 1.3, center.y + (handle.y - center.y) * 1.3, { steps: 6 });
  await page.mouse.up();
  const manual = await readLine(page, line.id);
  expect(manual.size, 'the pointer actually resized the line').toBeGreaterThan(line.size);
  await page.locator('#ttext').fill('ALEXANDRIA');
  expect((await readLine(page, line.id)).size, 'typing must not undo the explicit resize').toBe(manual.size);
  await expect(page.locator('#autofittext')).not.toBeChecked();
});

test('keyboard resizing keeps its manual size on the next text edit', async ({ page }) => {
  const original = await garden(page), line = original.AVERY;
  await selectLine(page, line.id);
  await page.focus('#canvasA');
  await page.keyboard.press('+');
  await page.keyboard.press('+');
  const manual = await readLine(page, line.id);
  expect(manual.size).toBeGreaterThan(line.size);
  await page.locator('#ttext').fill('ALEXANDRIA');
  expect((await readLine(page, line.id)).size, 'typing must not undo the keyboard resize').toBe(manual.size);
  await expect(page.locator('#autofittext')).not.toBeChecked();
});

test('late font loading refits guided text against the real original font width', async ({ page }) => {
  const original = await garden(page, { fonts: false }), line = original.AVERY;
  await selectLine(page, line.id);
  await page.locator('#ttext').fill('ALEXANDRIA');
  const fallback = await readLine(page, line.id);
  await loadLocalFonts(page);
  const fitted = await readLine(page, line.id);
  const realOriginalWidth = await page.evaluate(() => {
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = '700 2.45px "Cinzel"';
    return ctx.measureText('AVERY').width;
  });
  expect(realOriginalWidth, 'the fixture must exercise a changed font metric').not.toBeCloseTo(line.width, 2);
  expect(fitted.size, 'the initial fallback fit is reconsidered after font load').not.toBe(fallback.size);
  expect(fitted.width).toBeLessThanOrEqual(realOriginalWidth + 0.03);
  await expect(page.locator('#fitstatus')).toHaveAttribute('data-state', 'fit');
});

test('late font loading leaves an explicitly sized line manual', async ({ page }) => {
  const original = await garden(page, { fonts: false }), line = original.AVERY;
  await selectLine(page, line.id);
  await setInput(page, 'tsize', 3.5);
  await page.locator('#ttext').fill('ALEXANDRIA');
  await loadLocalFonts(page);
  expect((await readLine(page, line.id)).size).toBe(3.5);
  await expect(page.locator('#autofittext')).not.toBeChecked();
});

test('typing in the selected text field updates the displayed spacing after fitting a spaced line', async ({ page }) => {
  const original = await garden(page), line = original['JUNE 14, 2027'];
  await selectLine(page, line.id);
  await page.locator('#ttext').fill('SEPTEMBER 24, 2028');
  const fitted = await readLine(page, line.id);
  expect(fitted.spacing).toBeLessThan(line.spacing);
  expect(await page.locator('#tspacingval').textContent()).toBe(fitted.spacing + '"');
});
