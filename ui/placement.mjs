/* Fitting words to their box and finding free space for a new item, so
   it does not land on top of the words already there. Part of app.mjs. */

import { commit, select, showTab } from '../app.mjs';
import {
  CLIPS, BOARD, $, clamp, rad, r1, cleanWords, fills, activeBoard, selectedEl,
  countOf, limitOf, setText
} from './model.mjs';
import { boxes, imageFor, drawText, render } from './draw.mjs';
import { ratio } from './colour.mjs';
import { syncProps } from './panel.mjs';
import { status } from './order.mjs';

/* Fitting belongs to the template's guided text edits. Manual geometry and
   font controls turn it off, so an advanced edit is never silently undone. */
const fitContext = document.createElement('canvas').getContext('2d');
function measureTextBox(el) {
  const id = '__fit_measure__';
  drawText(fitContext, { ...el, id, shadow: false });
  const box = boxes.get(id); boxes.delete(id);
  const angle = rad(el.rotation || 0), cos = Math.abs(Math.cos(angle)), sin = Math.abs(Math.sin(angle));
  return { w: cos * box.w + sin * box.h, h: sin * box.w + cos * box.h, oy: box.oy || 0 };
}
function fittingReference(el) {
  const ref = el.fitReference;
  if (ref && typeof ref.text === 'string' && ref.text.length <= 60 && Number.isFinite(ref.size) && ref.size >= 0.5 && ref.size <= 16 && Number.isFinite(ref.spacing) && ref.spacing >= -0.2 && ref.spacing <= 1.5 && typeof ref.font === 'string' && ref.font.length < 100) return { text: ref.text, size: ref.size, spacing: ref.spacing, font: ref.font };
  return { text: el.text, size: el.size, spacing: el.spacing || 0, font: el.font };
}
function fitLimits(el, ref = fittingReference(el)) {
  const original = measureTextBox({ ...el, ...ref });
  return { w: Math.max(0, Math.min(original.w, 2 * Math.min(el.x - 1, BOARD.w - 1 - el.x))), h: Math.max(0, Math.min(original.h, 2 * Math.min(el.y + original.oy - 1, BOARD.h - 1 - el.y - original.oy))) };
}
function fitTemplateText(el) {
  if (!el.autoFit) return;
  const ref = fittingReference(el), limit = fitLimits(el, ref);
  const fits = ratio => { const b = measureTextBox({ ...el, size: ref.size * ratio, spacing: ref.spacing * ratio }); return b.w <= limit.w && b.h <= limit.h; };
  let lo = 0.5 / ref.size, hi = 1;
  if (fits(1)) lo = 1;
  else if (fits(lo)) for (let n = 0; n < 18; n++) { const mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid; }
  el.size = Math.max(0.5, Math.floor(ref.size * lo * 1000) / 1000);
  el.spacing = Math.round(ref.spacing * lo * 10000) / 10000;
}
function syncPersonalization() {
  const host = $('personalization'); if (!host) return;
  const el = selectedEl(); host.hidden = !el || el.type !== 'text'; if (host.hidden) return;
  if (!host.childElementCount) {
    host.innerHTML = '<div class="personalization-actions"><label><input type="checkbox" id="autofittext"> Auto-fit text</label><button class="btn small" id="fittext" type="button">Fit this line</button></div><p id="fitstatus" class="fit-status sr" role="status" aria-live="polite"></p>';
    $('autofittext').addEventListener('change', () => { const e = selectedEl(); if (!e || e.type !== 'text') return; e.fitReference ||= fittingReference(e); e.autoFit = $('autofittext').checked; fitTemplateText(e); render(); syncProps(); commit(); });
    $('fittext').addEventListener('click', () => { const e = selectedEl(); if (!e || e.type !== 'text') return; e.fitReference ||= fittingReference(e); e.autoFit = true; fitTemplateText(e); render(); syncProps(); commit(); });
  }
  $('autofittext').checked = !!el.autoFit;
  const status = $('fitstatus');
  const say = (state, text, quiet) => { if (status.dataset.state !== state) status.dataset.state = state; status.classList.toggle('sr', quiet); setText(status, text); };
  if (!el.autoFit) { say('manual', '', true); return; }
  const ref = fittingReference(el), limit = fitLimits(el, ref), actual = measureTextBox(el);
  const tooLong = actual.w > limit.w + 0.03 || actual.h > limit.h + 0.03;
  const reduced = el.size < ref.size - 0.01;
  /* Nothing is said while a line simply fits; a reduced or an overlong line
     is, once, in the open. */
  say(tooLong ? 'warning' : 'fit', tooLong ? 'Text is too long. Shorten it or adjust the layout before ordering.' : reduced ? 'Text reduced to fit. Check readability.' : '', !tooLong && !reduced);
}
/* Where a new item lands. Words, clip art and pictures added by hand all
   landed on one spot, 12" across and 36" down (a picture 30" down), on
   top of whatever was there: on most templates a new picture hid the
   names, and new words typed into a ball that was already there could
   not be seen. That spot is still where a new item goes whenever nothing
   is in the way of it, a blank board included. When something is, the
   item goes into the free room below the hole: centred across the board
   where it fits, as near its usual height as it can while keeping up to
   NEW_ROOM clear of its neighbours (enough for new words to take a
   second line without running into them), with a clip art or a picture
   made smaller, down to NEW_MIN_WIDTH, to fit the room there is. Only
   then does it move off to one side. A board with no free room left
   takes it where it covers the fewest words, and then the least
   artwork. Each item counts as the upright box around the box the board
   picks it up by, turned as the item is, and the hole as a box around
   it; a picture filling the board lies under everything and takes no
   room. */
const NEW_AREA = { x0: 1, x1: BOARD.w - 1, y0: 13, y1: 46 }, NEW_GAP = 0.25, NEW_ROOM = 2.5, NEW_MIN_WIDTH = 4;
const HOLE_BOX = { x0: BOARD.w / 2 - BOARD.hole.d / 2 - 0.5, x1: BOARD.w / 2 + BOARD.hole.d / 2 + 0.5, y0: BOARD.hole.cy - BOARD.hole.d / 2 - 0.5, y1: BOARD.hole.cy + BOARD.hole.d / 2 + 0.5 };
/* An item's size before it is turned, as drawing it would make its box. */
function inkSize(el) {
  if (el.type === 'text') {
    const id = '__place_measure__';
    drawText(fitContext, { ...el, id, shadow: false });
    const box = boxes.get(id); boxes.delete(id);
    return box;
  }
  if (el.type === 'clip') return { w: el.width, h: el.width * ((CLIPS[el.name] || {}).aspect || 1), oy: 0 };
  const img = imageFor(el.src), [iw, ih] = img ? [img.naturalWidth, img.naturalHeight] : el.px || [1, 1];
  const h = el.width * ih / iw, d = Math.min(el.width, h);
  return el.circleCrop ? { w: d, h: d, oy: 0 } : { w: el.width, h, oy: 0 };
}
/* The upright box around an item, turned or not, in board inches. */
function boxAround(el, { w, h, oy = 0 }) {
  const a = rad(el.rotation || 0), cos = Math.abs(Math.cos(a)), sin = Math.abs(Math.sin(a));
  const cx = el.x - oy * Math.sin(a), cy = el.y + oy * Math.cos(a), hw = (cos * w + sin * h) / 2, hh = (sin * w + cos * h) / 2;
  return { x0: cx - hw, x1: cx + hw, y0: cy - hh, y1: cy + hh };
}
/* How far apart two boxes are: below zero when they overlap. */
const apart = (p, q) => Math.max(q.x0 - p.x1, p.x0 - q.x1, q.y0 - p.y1, p.y0 - q.y1);
const overlap = (p, q) => Math.max(0, Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0)) * Math.max(0, Math.min(p.y1, q.y1) - Math.max(p.y0, q.y0));
/* Returns { x, y } for words, and { x, y, width } for clip art or a
   picture; shrink: false keeps the width asked for. */
function placeNew(b, el, { shrink = el.type !== 'text' } = {}) {
  const taken = b.elements.filter((e) => e !== el && !fills(e)).map((e) => ({ ...boxAround(e, inkSize(e)), words: e.type === 'text' }));
  taken.push({ ...HOLE_BOX, words: false });
  const home = { x: el.x, y: el.y }, spot = (x, y, width) => (el.type === 'text' ? { x, y } : { x, y, width });
  const here = boxAround(el, inkSize(el));
  if (taken.every((t) => apart(here, t) >= NEW_GAP)) return spot(home.x, home.y, el.width);
  const widths = [el.width];
  if (shrink) for (let w = el.width - 0.25; w >= NEW_MIN_WIDTH - 1e-9; w -= 0.25) widths.push(Math.round(w * 100) / 100);
  /* The box at each width, about the item's own place (0, 0). */
  const shapes = widths.map((width) => ({ width, rel: boxAround({ ...el, x: 0, y: 0 }, inkSize({ ...el, width })) }));
  /* The best height for the item centred at x: of the stretches of the
     area its box can move through without coming within NEW_GAP of an
     item in its way, the one that leaves it most room (up to NEW_ROOM)
     on both sides, then the one nearest its usual height. */
  const column = (x, rel) => {
    const lo = NEW_AREA.y0 - rel.y0, hi = NEW_AREA.y1 - rel.y1;
    if (hi < lo || x + rel.x0 < NEW_AREA.x0 - 1e-9 || x + rel.x1 > NEW_AREA.x1 + 1e-9) return null;
    const blocked = taken.filter((t) => t.x0 - NEW_GAP < x + rel.x1 && x + rel.x0 < t.x1 + NEW_GAP)
      .map((t) => [t.y0 - NEW_GAP - rel.y1, t.y1 + NEW_GAP - rel.y0]).sort((p, q) => p[0] - q[0]);
    let best = null, from = lo;
    const stretch = (a, z) => {
      if (z < a) return;
      const room = Math.min(NEW_ROOM - NEW_GAP, (z - a) / 2), y = clamp(home.y, a + room, z - room);
      if (!best || room > best.room + 1e-9 || (room > best.room - 1e-9 && Math.abs(y - home.y) < Math.abs(best.y - home.y))) best = { y, room };
    };
    for (const [a, z] of blocked) { stretch(from, Math.min(a, hi)); from = Math.max(from, z); }
    stretch(from, hi);
    return best;
  };
  const better = (p, q) => !q || p.room > q.room + 1e-9 || (p.room > q.room - 1e-9 && Math.abs(p.y - home.y) < Math.abs(q.y - home.y));
  /* Centred, at the biggest width that fits; then off to one side, as
     little as will do, at the biggest width that fits there. */
  for (const { width, rel } of shapes) { const c = column(BOARD.w / 2, rel); if (c) return spot(BOARD.w / 2, r1(c.y), width); }
  for (const { width, rel } of shapes) {
    for (let k = 0.5; BOARD.w / 2 - k + rel.x0 >= NEW_AREA.x0 - 1e-9 || BOARD.w / 2 + k + rel.x1 <= NEW_AREA.x1 + 1e-9; k += 0.5) {
      let pick = null;
      for (const x of [BOARD.w / 2 - k, BOARD.w / 2 + k]) { const c = column(x, rel); if (c && better(c, pick)) pick = { ...c, x }; }
      if (pick) return spot(pick.x, r1(pick.y), width);
    }
  }
  /* No room anywhere: the smallest it may be, where it covers the
     fewest words, then the least artwork, then nearest its usual spot. */
  const { width, rel } = shapes[shapes.length - 1];
  const xs = [], ys = [];
  for (let x = Math.ceil((NEW_AREA.x0 - rel.x0) * 2) / 2; x <= NEW_AREA.x1 - rel.x1 + 1e-9; x += 0.5) xs.push(x);
  for (let y = Math.ceil((NEW_AREA.y0 - rel.y0) * 2) / 2; y <= NEW_AREA.y1 - rel.y1 + 1e-9; y += 0.5) ys.push(y);
  let pick = null;
  for (const x of xs.length ? xs : [home.x]) for (const y of ys.length ? ys : [home.y]) {
    const box = { x0: x + rel.x0, x1: x + rel.x1, y0: y + rel.y0, y1: y + rel.y1 };
    let words = 0, art = 0;
    for (const t of taken) { const o = overlap(box, t); if (t.words) words += o; else art += o; }
    const off = Math.abs(x - home.x) + Math.abs(y - home.y);
    if (!pick || words < pick.words - 1e-9 || (words < pick.words + 1e-9 && (art < pick.art - 1e-9 || (art < pick.art + 1e-9 && off < pick.off)))) pick = { x, y, words, art, off };
  }
  return spot(pick.x, pick.y, width);
}
function addElement(el, tab) {
  const b = activeBoard();
  if (countOf(b, el.type) >= limitOf(el.type)) { alert('Up to ' + limitOf(el.type) + ' of those per board.'); return null; }
  b.elements.push(el); select(el.id); if (tab) showTab(tab); commit();
  return el;
}
/* The words fields are textareas: a row for each line of the words, from
   the field's own minimum up to four, past which it scrolls. What is read
   out of one is cleaned as the design is (see cleanWords), and the field is
   written back only when that changed something, with the caret kept. */
function fitRows(area, min) {
  const rows = Math.min(4, Math.max(min, area.value.split('\n').length));
  if (area.rows !== rows) area.rows = rows;
}
function wordsFrom(area, min) {
  const words = cleanWords(area.value);
  if (words !== area.value) { const s = area.selectionStart, e = area.selectionEnd; area.value = words; try { area.setSelectionRange(s, e); } catch (_) {} }
  fitRows(area, min);
  return words;
}

export {
  measureTextBox, fittingReference, fitTemplateText, syncPersonalization,
  placeNew, addElement, fitRows, wordsFrom
};
