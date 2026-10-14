import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { open, reset, reloaded, settled, count, bounds, setInput, chip } from './helpers.js';

const COLLECTIONS = [
  ['pack-wedding', 'Wedding collection', ['botanical-arch', 'linked-rings', 'toast', 'love-letter']],
  ['pack-family', 'Family collection', ['family-oak', 'home-heart', 'paw-heart', 'family-crest']],
  ['pack-lake', 'Cabin & lake collection', ['lakeside-cabin', 'canoe-sunset', 'mountain-pines', 'leaping-fish']],
  ['pack-camping', 'Camping collection', ['ridge-tent', 'campfire', 'trail-lantern', 'compass-rose']],
  ['pack-bbq', 'Backyard BBQ collection', ['kettle-grill', 'pitmaster-tools', 'smoker', 'stacked-burger']],
  ['pack-sports', 'Game day collection', ['cornhole-badge', 'varsity-trophy', 'baseball-diamond', 'football-play']],
];
const ICON_IDS = COLLECTIONS.flatMap(([, , ids]) => ids.map((id) => 'bbp1-' + id));
const TEMPLATES = [
  ['bbp1-garden-vows', 'Garden vows', 'AVERY', 'wedding'],
  ['bbp1-family-roots', 'Family roots', 'THE PARKERS', 'family'],
  ['bbp1-lake-days', 'Lake days', 'THE CARTERS', 'other'],
  ['bbp1-off-the-grid', 'Off the grid', 'THE BENNETTS', 'family'],
  ['bbp1-backyard-pitmaster', 'Backyard pitmaster', "MORGAN'S", 'family'],
  ['bbp1-game-on', 'Game on', 'THE WILDCATS', 'team'],
];

test.describe('creative pack integration', () => {
  test('all six collections expose four usable artwork buttons alongside the original library', async ({ page }) => {
    const errors = await open(page);
    await reset(page);
    await page.evaluate(() => cornhole.showTab('art'));
    await expect(page.locator('#clipcats .chip[data-v^="pack-"]')).toHaveCount(6);
    for (const [category, label, ids] of COLLECTIONS) {
      await page.getByRole('button', { name: label, exact: true }).click();
      await expect(page.locator('#clips .clip')).toHaveCount(4);
      for (const id of ids) {
        const button = page.locator('#clips .clip[data-name="bbp1-' + id + '"]');
        await expect(button).toHaveAccessibleName(/^Add .+/);
        await button.click();
        expect(await page.evaluate(() => cornhole.activeBoard().elements.at(-1).name)).toBe('bbp1-' + id);
        expect(await count(page, 'a', [245, 245, 240]), category + ' / ' + id).toBeGreaterThan(100);
        await page.click('#idel');
      }
    }
    await chip(page, 'clipcats', 'love');
    await expect(page.locator('#clips .clip[data-name="heart"]')).toBeVisible();
    await chip(page, 'clipcats', 'shape');
    await expect(page.locator('#clips .clip[data-name="circle"]')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('every icon preserves the approved SVG silhouette and transparent cutouts in preview and print', async ({ page }) => {
    await open(page);
    await reset(page);
    expect(await page.evaluate(() => Object.keys(cornhole.CLIPS).filter((id) => id.startsWith('bbp1-')))).toEqual(ICON_IDS);
    // Standalone approved SVGs are the reference: this catches wrong paths,
    // missing evenodd fills, scaling mistakes, and raster-only registrations.
    const fixtures = ICON_IDS.map((id) => ({ id, svg: readFileSync(new URL('../asset-pack/svg/' + id + '.svg', import.meta.url), 'utf8') }));
    const checks = await page.evaluate(async (fixtures) => {
      const results = [];
      for (const { id, svg } of fixtures) for (const [base, ink] of [['#17364d', '#ffd166'], ['#fffaf0', '#702963']]) {
        cornhole.activeBoard().base = { kind: 'paint', color: base };
        cornhole.activeBoard().pattern.kind = 'none';
        cornhole.activeBoard().elements = [];
        cornhole.addClip(id, { width: 8, x: 12, y: 36, color: ink });
        cornhole.select(null);
        cornhole.paint();
        for (const [mode, actual] of [['preview', document.getElementById('canvasA')], ['print', cornhole.printCanvas('a')]]) {
          const ppi = actual.width / 24, side = 8 * ppi;
          const image = new Image();
          // Match the reference viewport to this preview or print crop.
          image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replaceAll('currentColor', ink).replace('width="512" height="512"', 'width="' + side + '" height="' + side + '"'));
          await image.decode();
          const reference = document.createElement('canvas'); reference.width = reference.height = side;
          const g = reference.getContext('2d');
          g.fillStyle = base; g.fillRect(0, 0, side, side); g.drawImage(image, 0, 0, side, side);
          const expected = g.getImageData(0, 0, side, side).data;
          const pixels = actual.getContext('2d').getImageData(8 * ppi, 32 * ppi, side, side).data;
          let wrong = 0, wrongInterior = 0, inkPixels = 0;
          const rgb = ink.slice(1).match(/../g).map((v) => parseInt(v, 16));
          for (let i = 0; i < pixels.length; i += 4) {
            if (Math.abs(pixels[i] - expected[i]) > 12 || Math.abs(pixels[i + 1] - expected[i + 1]) > 12 || Math.abs(pixels[i + 2] - expected[i + 2]) > 12) {
              wrong++;
              const x = i / 4 % side, y = Math.floor(i / 4 / side);
              let interior = x > 0 && x < side - 1 && y > 0 && y < side - 1;
              for (let dy = -1; dy <= 1 && interior; dy++) for (let dx = -1; dx <= 1; dx++) {
                const adjacent = i + 4 * (dy * side + dx);
                if (expected[adjacent] !== expected[i] || expected[adjacent + 1] !== expected[i + 1] || expected[adjacent + 2] !== expected[i + 2]) interior = false;
              }
              if (interior) wrongInterior++;
            }
            if (pixels[i] === rgb[0] && pixels[i + 1] === rgb[1] && pixels[i + 2] === rgb[2]) inkPixels++;
          }
          results.push({ id, mode, base, wrongRatio: wrong / (side * side), wrongInterior, inkPixels });
        }
      }
      return results;
    }, fixtures);
    for (const check of checks) {
      expect(check.inkPixels, JSON.stringify(check)).toBeGreaterThan(100);
      // Chromium's SVG and Path2D rasterizers differ only along antialiased
      // edges. Every solid interior pixel, including cutouts, must agree.
      expect(check.wrongInterior, JSON.stringify(check)).toBe(0);
      expect(check.wrongRatio, JSON.stringify(check)).toBeLessThan(0.035);
    }
  });

  test('six templates have rendered previews and editable, independent text and art layers', async ({ page }) => {
    const errors = await open(page);
    await reset(page);
    await page.evaluate(() => cornhole.applyBlank());
    for (const [id, label, sample, occasion] of TEMPLATES) {
      await page.evaluate(() => cornhole.showTab('templates'));
      const button = page.getByRole('button', { name: label + ' template', exact: true });
      await expect(button).toBeVisible();
      const colors = await button.locator('canvas').evaluate((canvas) => {
        const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        const found = new Set();
        for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] === 255) found.add(pixels[i] + ',' + pixels[i + 1] + ',' + pixels[i + 2]);
        return found.size;
      });
      expect(colors, label + ' preview contains artwork').toBeGreaterThan(20);
      await button.click();
      const board = await page.evaluate(() => cornhole.design.a);
      expect(board.elements.some((el) => el.type === 'text' && el.text === sample)).toBe(true);
      expect(board.elements.some((el) => el.type === 'clip' && el.name.startsWith('bbp1-'))).toBe(true);
      expect(board.elements.some((el) => el.type === 'image')).toBe(false);
      expect(await page.evaluate(() => cornhole.order.occasion)).toBe(occasion);
      expect(await page.evaluate(() => cornhole.design.same)).toBe(true);
      const independent = await page.evaluate((id) => {
        const template = cornhole.TEMPLATES.find((t) => t.id === id);
        const a = template.board(), b = template.board();
        const before = JSON.stringify(b);
        a.base.color = '#ff00ff'; a.pattern.color = '#00ff00'; a.elements[0].color = '#123456';
        return { differentIds: a.elements.every((el) => !b.elements.some((other) => other.id === el.id)), unaffected: before === JSON.stringify(b), fresh: JSON.stringify(template.board().elements.map(({ id, ...el }) => el)) === JSON.stringify(b.elements.map(({ id, ...el }) => el)) };
      }, id);
      expect(independent).toEqual({ differentIds: true, unaffected: true, fresh: true });
    }
    expect(errors).toEqual([]);
  });

  test('new template artwork supports recolour, undo, transforms, duplication and saved separate boards', async ({ page }) => {
    await open(page);
    await reset(page);
    await page.evaluate(() => cornhole.applyTemplate('bbp1-family-roots'));
    expect(await page.evaluate(() => cornhole.design.a.elements.some((el) => el.name === 'bbp1-family-oak'))).toBe(true);
    const originalA = await page.evaluate(() => JSON.stringify(cornhole.design.a));
    await page.click('#boardmode .chip[data-v="b"]');
    const textId = await page.evaluate(() => cornhole.design.b.elements.find((el) => el.text === 'THE PARKERS').id);
    await page.evaluate((id) => { cornhole.select(id); cornhole.showTab('text'); }, textId);
    await setInput(page, 'ttext', 'THE RIVERS');
    const artId = await page.evaluate(() => cornhole.design.b.elements.find((el) => el.name === 'bbp1-family-oak').id);
    await page.evaluate((id) => { cornhole.select(id); cornhole.showTab('art'); }, artId);
    const before = await page.evaluate(() => cornhole.activeBoard().elements.find((el) => el.id === cornhole.selected).color);
    await setInput(page, 'ccolor', '#ff00ff');
    const recolouredState = await page.evaluate((id) => cornhole.design.b.elements.find((el) => el.id === id), artId);
    const recoloured = await count(page, 'b', [255, 0, 255]);
    expect(recoloured).toBeGreaterThan(1000);
    await page.click('#undo');
    expect(await count(page, 'b', [255, 0, 255])).toBe(0);
    expect(await page.evaluate((id) => cornhole.design.b.elements.find((el) => el.id === id).color, artId)).toBe(before);
    await page.click('#redo');
    expect(await page.evaluate((id) => cornhole.design.b.elements.find((el) => el.id === id), artId)).toEqual(recolouredState);
    expect(Math.abs(await count(page, 'b', [255, 0, 255]) - recoloured) / recoloured).toBeLessThan(0.01);
    const large = await bounds(page, 'b', [255, 0, 255]);
    await setInput(page, 'iwidth', 8);
    const small = await bounds(page, 'b', [255, 0, 255]);
    expect(small.x1 - small.x0).toBeLessThan(large.x1 - large.x0);
    await setInput(page, 'irot', 30);
    await page.check('#cflip');
    await page.click('#idup');
    const saved = await page.evaluate(() => cornhole.design);
    expect(JSON.stringify(saved.a), 'editing Board B leaves Board A untouched').toBe(originalA);
    const oak = saved.b.elements.filter((el) => el.name === 'bbp1-family-oak');
    expect(oak).toHaveLength(2);
    expect(oak[0].id).not.toBe(oak[1].id);
    expect(oak.every((el) => el.color === '#ff00ff' && el.width === 8 && el.rotation === 30 && el.flipH)).toBe(true);
    const printBefore = await page.evaluate(() => cornhole.printCanvas('b').toDataURL());
    await settled(page);
    await reloaded(page);
    expect(await page.evaluate(() => cornhole.design)).toEqual(saved);
    expect(await page.evaluate(() => cornhole.printCanvas('b').toDataURL())).toBe(printBefore);
  });
});
