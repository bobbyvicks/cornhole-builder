/* Shared plumbing for the browser specs.

   The page exposes one global on purpose, window.cornhole, and the specs
   drive the page through it and through its controls - never by
   reimplementing the drawing. Pixel checks read the preview canvases. */

export async function open(page, { query = '' } = {}) {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e.message)));
  /* No web fonts in the suite: the measurements below are of layout and
     colour, not of a typeface, and a fetch to Google that hangs would
     hold the load event. */
  await page.route('**/fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('**/fonts.gstatic.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.goto('/index.html' + query);
  await page.waitForFunction(() => window.cornhole && window.cornhole.design);
  await page.evaluate(() => { try { localStorage.clear(); } catch (_) {} });
  await page.waitForTimeout(100);
  return errors;
}

/** A fresh, known design: painted navy, no pattern, one text in a system font. */
export const reset = (page) => page.evaluate(() => {
  cornhole.setDesign({ version: 2, same: true,
    a: { base: { kind: 'paint', color: '#1f3a93', color2: '#4fa3e3', angle: 180, stain: 'walnut' }, pattern: { kind: 'none', color: '#f5f5f0', size: 3 },
      elements: [{ type: 'text', id: 't1', text: 'HELLO', font: 'Impact', size: 4, color: '#ffffff', outline: '#000000', outlineWidth: 0, x: 12, y: 30, rotation: 0, arc: 0, spacing: 0, shadow: false }] },
    b: { base: { kind: 'paint', color: '#1f3a93', color2: '#4fa3e3', angle: 180, stain: 'walnut' }, pattern: { kind: 'none', color: '#f5f5f0', size: 3 }, elements: [] } });
  cornhole.setOrder({ product: 'set', quantity: 1, finish: 'satin', bags: 'none', rush: false, carryCase: false, occasion: 'other', needBy: '', giftNote: '' });
  cornhole.showTab('board');
  cornhole.paint();
});

/* The pixel readers below measure the ARTWORK: the selection outline and
   its handles are white and navy too, so they are taken down for the
   read and put back after. */
const ART = `const __prev = cornhole.selected; if (__prev) cornhole.select(null); cornhole.paint();`;
const BACK = `if (__prev) { cornhole.select(__prev); cornhole.paint(); }`;


/** Client coordinates of a selected element's handle: 'resize' or 'rotate'. */
export const handlePoint = (page, id, which) => page.evaluate(([id, which]) => {
  cornhole.paint();
  const el = cornhole.activeBoard().elements.find((e) => e.id === id), box = cornhole.boxes.get(id);
  const lx = which === 'resize' ? box.w / 2 + 0.15 : 0;
  const ly = which === 'resize' ? box.h / 2 + 0.15 + box.oy : -box.h / 2 - 0.15 + box.oy - 0.9;
  const a = el.rotation * Math.PI / 180;
  const x = el.x + lx * Math.cos(a) - ly * Math.sin(a), y = el.y + lx * Math.sin(a) + ly * Math.cos(a);
  const r = document.getElementById('canvasA').getBoundingClientRect();
  return { x: r.left + x / 24 * r.width, y: r.top + y / 48 * r.height, bx: x, by: y };
}, [id, which]);

/** The colour under a point given in inches on a board's preview canvas. */
export const pixelAt = (page, key, x, y) => page.evaluate(new Function('a', `const [key, x, y] = a; ${ART}
  const c = document.getElementById('canvas' + key.toUpperCase());
  const ppi = c.width / 24;
  const d = c.getContext('2d').getImageData(Math.round(x * ppi), Math.round(y * ppi), 1, 1).data;
  ${BACK}
  return [d[0], d[1], d[2], d[3]];`), [key, x, y]);

/** How many pixels on a board's preview are exactly this colour. */
export const count = (page, key, rgb) => page.evaluate(new Function('a', `const [key, rgb] = a; ${ART}
  const c = document.getElementById('canvas' + key.toUpperCase());
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] === rgb[0] && d[i + 1] === rgb[1] && d[i + 2] === rgb[2] && d[i + 3] === 255) n++;
  ${BACK}
  return n;`), [key, rgb]);

/** Bounding box of pixels of one colour, in inches. */
export const bounds = (page, key, rgb) => page.evaluate(new Function('a', `const [key, rgb] = a; ${ART}
  const c = document.getElementById('canvas' + key.toUpperCase());
  const W = c.width, H = c.height, ppi = W / 24;
  const d = c.getContext('2d').getImageData(0, 0, W, H).data;
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    if (d[i] === rgb[0] && d[i + 1] === rgb[1] && d[i + 2] === rgb[2] && d[i + 3] === 255) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  ${BACK}
  return x1 < 0 ? null : { x0: x0 / ppi, y0: y0 / ppi, x1: x1 / ppi, y1: y1 / ppi, cx: (x0 + x1) / 2 / ppi, cy: (y0 + y1) / 2 / ppi };`), [key, rgb]);

/** Drive a range/colour/text input the way typing or dragging would. */
export const setInput = (page, id, value) => page.evaluate(([id, value]) => {
  const e = document.getElementById(id);
  e.value = String(value);
  e.dispatchEvent(new Event('input', { bubbles: true }));
  e.dispatchEvent(new Event('change', { bubbles: true }));
}, [id, value]);

/** Click a chip in a chip group, opening the tab it lives in first, the
    way a person has to: a chip in a closed pane is display:none. */
export async function chip(page, group, v) {
  await page.evaluate((g) => cornhole.showTab(document.getElementById(g).closest('.pane').id.replace('tab-', '')), group);
  await page.click('#' + group + ' .chip[data-v="' + v + '"]');
}

/** Client coordinates of a point given in inches on a board canvas. */
export const clientPoint = (page, key, x, y) => page.evaluate(([key, x, y]) => {
  const r = document.getElementById('canvas' + key.toUpperCase()).getBoundingClientRect();
  return { x: r.left + x / 24 * r.width, y: r.top + y / 48 * r.height };
}, [key, x, y]);

export const WHITE = [255, 255, 255], NAVY = [0x1f, 0x3a, 0x93], RED = [0xc8, 0x10, 0x2e], CREAM = [0xf5, 0xf5, 0xf0];
