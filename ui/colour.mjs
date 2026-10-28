/* Colours: contrast, the opposite colours offered for Board B, the ink a
   new item starts in, and the readability warning on the review. Part of
   app.mjs. */

import { design, withFreshIds } from '../app.mjs';
import {
  CLIPS, BOARD, clamp, rad, r1, isHex, rgb, coverOf, boardFor, boardKeys
} from './model.mjs';
import { boxes, boardPath, drawBase, drawPattern, drawImage, readBoard } from './draw.mjs';
import { measureTextBox, fittingReference } from './placement.mjs';

/* The classic set: the other board is this one with its two main colours
   exchanged - the board colour (on wood, the pattern's, since a stain is
   not a colour to give the words) and the colour of the first text or
   clip art in another colour, or else the pattern's. A board without both
   (stained wood with no pattern, or nothing on it in a second colour) has
   no opposite: the button is not offered there, as it would only make a
   copy. */
const linear = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lumOf = (channels) => { const [r, g, b] = channels.map(linear); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const lum = (hex) => lumOf(rgb(hex));
const ratio = (la, lb) => (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
const lowHex = (c) => (c || '').toLowerCase();
function oppositePair(b) {
  const c1 = b.base.kind !== 'wood' ? lowHex(b.base.color) : (b.pattern.kind !== 'none' ? lowHex(b.pattern.color) : '');
  if (!c1) return null;
  const second = b.elements.find((e) => e.type !== 'image' && lowHex(e.color) !== c1);
  const c2 = second ? lowHex(second.color) : (b.pattern.kind !== 'none' && lowHex(b.pattern.color) !== c1 ? lowHex(b.pattern.color) : '');
  return c2 ? [c1, c2] : null;
}
/* Everything in either colour switches. A fade counts as the board
   colour from end to end: an end in one of the two colours switches like
   everything else, and an end in a third colour (Bachelorette's purple)
   takes the new board colour as well, so the new board is plain where
   the old one faded, rather than fading through shades that the words,
   now in the old board colour, are lost on. Then what read on this board should read on the new one. Each text and
   clip art is read against what is really behind it on both boards, in
   layer order (a disc, a pattern band or a fade at its height, not the
   board colour alone; see readBoard). One that stood out at READS or
   more on this board and does not on the new one - a third colour on a
   board that changed colour, or a switched colour on a band that did
   not switch - takes whichever of the two colours stands out more there,
   when that is better. An item that did not stand out to begin with (the
   Nautical disc, ivory on ivory and navy stripes) is left as the
   customer had it. */
const READS = 1.8;
function oppositeColours(src) {
  const b = withFreshIds(src), pair = oppositePair(src);
  if (!pair) return b;
  const [c1, c2] = pair;
  const sw = (c) => (lowHex(c) === c1 ? c2 : lowHex(c) === c2 ? c1 : c);
  b.base.color2 = b.base.kind === 'gradient' && !pair.includes(lowHex(b.base.color2)) ? c2 : sw(b.base.color2);
  b.base.color = sw(b.base.color); b.pattern.color = sw(b.pattern.color);
  for (const e of b.elements) if (e.type !== 'image') { e.color = sw(e.color); e.outline = sw(e.outline); }
  /* The items of the two boards are in the same order. */
  const before = new Map(), seen = new Map();
  readBoard(src, (el, spots) => before.set(src.elements.indexOf(el), inkContrast(spots, el.color, seen)));
  readBoard(b, (el, spots) => {
    const was = before.get(b.elements.indexOf(el)), now = inkContrast(spots, el.color, seen);
    if (!(was >= READS) || now >= READS) return;
    const [best, score] = [c1, c2].filter(isHex).map((c) => [c, inkContrast(spots, c, seen)]).sort((p, q) => q[1] - p[1])[0] || [];
    if (score > now) el.color = best;
  });
  return b;
}
/* New words and new clip art come in one of two inks, charcoal or
   off-white: whichever stands out more from the spot they land on. That
   spot is read off a small drawing of the board under the new item's box:
   the base (a fade at that height, a stain with its grain), the pattern
   and a picture filling the board, but not the hole, which is cut out, or
   the other items, which can be moved. Each ink is scored by the contrast
   that nine tenths of the spot get from it, so a grain line, a thin border
   or an anti-aliased edge does not decide it, but a pattern covering much
   of the spot does. Off-white wins a tie, as it is what a painted board
   always gave. A colour passed to addClip is kept. */
const INKS = ['#f5f5f0', '#36393b'];
const INK_PPI = 4;
let inkCanvas = null;
function defaultInk(b, el) {
  if (!inkCanvas) { inkCanvas = document.createElement('canvas'); inkCanvas.width = BOARD.w * INK_PPI; inkCanvas.height = BOARD.h * INK_PPI; }
  const W = inkCanvas.width, H = inkCanvas.height;
  const ctx = inkCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return INKS[0];
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.scale(INK_PPI, INK_PPI);
  boardPath(ctx); ctx.clip();
  drawBase(ctx, b.base);
  drawPattern(ctx, b.pattern);
  const cover = coverOf(b);
  if (cover) drawImage(ctx, cover);
  ctx.restore();
  const def = CLIPS[el.name];
  const box = el.type === 'text' ? measureTextBox(el) : { w: el.width, h: el.width * ((def && def.aspect) || 1), oy: 0 };
  const cy = el.y + box.oy;
  const x0 = clamp(Math.floor((el.x - box.w / 2) * INK_PPI), 0, W - 1), x1 = clamp(Math.ceil((el.x + box.w / 2) * INK_PPI), x0 + 1, W);
  const y0 = clamp(Math.floor((cy - box.h / 2) * INK_PPI), 0, H - 1), y1 = clamp(Math.ceil((cy + box.h / 2) * INK_PPI), y0 + 1, H);
  const px = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data, spot = [];
  for (let i = 0; i < px.length; i += 4) if (px[i + 3] > 0) spot.push(lumOf([px[i], px[i + 1], px[i + 2]]));
  if (!spot.length) return INKS[0];
  const score = (ink) => { const l = lum(ink), c = spot.map((s) => ratio(l, s)).sort((p, q) => p - q); return c[Math.floor(c.length / 10)]; };
  return score(INKS[1]) > score(INKS[0]) ? INKS[1] : INKS[0];
}
/* Words and art that will not show. A board colour picked by hand can
   leave a line of words as light or as dark as the board, and the small
   preview on a phone hides it, so the review says so, one line for each
   item. Each board is drawn small, an item at a time in layer order, so
   that every word and every piece of clip art is read against what is
   really behind it: the base, the pattern, a picture filling the board
   and the items under it. Each item is also drawn alone, and where its
   own ink lands (not in the hole, which is cut out) the board there is
   compared with its colour. A spot of ink is lost when it is close to
   the board in lightness (a contrast under HIDDEN_CONTRAST) and no
   strong difference of colour sets it apart either; an outline that
   stands out (OUTLINE_CONTRAST) keeps it. The colour difference is the
   distance across CIELAB's a* and b*, the hue and colourfulness, scaled
   by the lightness of the two, since the same difference counts for less
   in dark colours: a red line on a green board, an orange ball on sky
   blue or the gold sun on the Lake and beach sky are as light as what is
   behind them and still plain to see, while burgundy or charcoal words
   on navy are not. An item is called hidden when HIDDEN_SHARE of its
   ink is lost. Comparing with the base colour alone would call items
   hidden that sit on a band of the pattern or on a shape of another
   colour, as several templates do. Pictures are not checked. A line
   that Auto-fit took below SHRUNK of its template size, and to under
   SMALL_PRINT, is named as well, with the size it prints at: the
   templates themselves print lines of about 1 to 1.5 in (a wedding
   date, a web address), so a common surname taken from 2.5 in to 1.4 in
   is not called very small. The review only warns: Continue stays open. */
const READ_PPI = 8, HIDDEN_CONTRAST = 1.35, HIDDEN_COLOUR = 30, HIDDEN_SHARE = 0.8, OUTLINE_CONTRAST = 3, SHRUNK = 0.6, SMALL_PRINT = 1;
const quoted = (el) => '“' + el.text.trim().replace(/\s+/g, ' ') + '”';
/* Lightness for the contrast ratio, and CIELAB (D65) for the colour. */
function colourOf([r, g, b]) {
  const [R, G, B] = [r, g, b].map(linear);
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const Y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const fx = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047), fy = f(Y), fz = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
  return { lum: Y, L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}
const colourGap = (p, q) => Math.hypot(p.a - q.a, p.b - q.b) * (p.L + q.L) / 200;
/* The colours of the board under an item's own ink, as 0xRRGGBB: each
   pixel of the item drawn alone is paired with the drawing of everything
   below it. Only the part of the board around the item is read. */
function inkBackdrop(under, alone, el) {
  const box = boxes.get(el.id);
  if (!box) return [];
  const a = rad(el.rotation || 0), cos = Math.abs(Math.cos(a)), sin = Math.abs(Math.sin(a)), pad = 1;
  const cx = el.x - box.oy * Math.sin(a), cy = el.y + box.oy * Math.cos(a);
  const hw = (cos * box.w + sin * box.h) / 2 + pad, hh = (sin * box.w + cos * box.h) / 2 + pad;
  const W = alone.canvas.width, H = alone.canvas.height;
  const x0 = clamp(Math.floor((cx - hw) * READ_PPI), 0, W), x1 = clamp(Math.ceil((cx + hw) * READ_PPI), 0, W);
  const y0 = clamp(Math.floor((cy - hh) * READ_PPI), 0, H), y1 = clamp(Math.ceil((cy + hh) * READ_PPI), 0, H);
  if (x1 <= x0 || y1 <= y0) return [];
  const ink = alone.getImageData(x0, y0, x1 - x0, y1 - y0).data, back = under.getImageData(x0, y0, x1 - x0, y1 - y0).data, spots = [];
  for (let i = 0; i < ink.length; i += 4) if (ink[i + 3] > 128 && back[i + 3] !== 0) spots.push((back[i] << 16) | (back[i + 1] << 8) | back[i + 2]);
  return spots;
}
function spotColour(key, seen) {
  let spot = seen.get(key);
  if (!spot) { spot = colourOf([key >> 16, (key >> 8) & 255, key & 255]); seen.set(key, spot); }
  return spot;
}
function hiddenShare(spots, el, seen) {
  if (!spots.length || !isHex(el.color)) return 0;
  /* A clip art drawn as a line has no outline (see drawClip). */
  const outlined = el.outlineWidth > 0 && isHex(el.outline) && !(el.type === 'clip' && (CLIPS[el.name] || {}).mode === 'stroke');
  const fill = colourOf(rgb(el.color)), edge = outlined ? lum(el.outline) : null;
  let lost = 0;
  for (const key of spots) {
    const spot = spotColour(key, seen);
    if (ratio(fill.lum, spot.lum) < HIDDEN_CONTRAST && colourGap(fill, spot) < HIDDEN_COLOUR && (edge === null || ratio(edge, spot.lum) < OUTLINE_CONTRAST)) lost++;
  }
  return lost / spots.length;
}
/* The contrast that nine tenths of an item's ink get from what is behind
   it in a colour, scored the way defaultInk scores an ink. */
function inkContrast(spots, colour, seen) {
  if (!spots.length || !isHex(colour)) return Infinity;
  const l = lum(colour), c = spots.map((key) => ratio(l, spotColour(key, seen).lum)).sort((p, q) => p - q);
  return c[Math.floor(c.length / 10)];
}
function readabilityIssues(keys = boardKeys(), source = design) {
  const out = [], seen = new Map();
  for (const k of keys) {
    const where = keys.length > 1 ? ' on Board ' + k.toUpperCase() : ' on your board';
    readBoard(boardFor(k, source), (el, spots) => {
      const name = el.type === 'text' ? quoted(el) : 'The ' + ((CLIPS[el.name] || {}).label || 'clip art').toLowerCase() + ' artwork';
      if (hiddenShare(spots, el, seen) >= HIDDEN_SHARE) out.push(name + where + ' will hardly show against what is behind it.');
      else if (el.type === 'text' && el.autoFit && el.fitReference && el.size < SHRUNK * fittingReference(el).size && el.size < SMALL_PRINT) out.push(name + where + ' was shrunk to fit and will print very small (' + r1(el.size) + ' in).');
    });
  }
  return out;
}

export {
  ratio, oppositePair, oppositeColours, defaultInk, READ_PPI, inkBackdrop,
  readabilityIssues
};
