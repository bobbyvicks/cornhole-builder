/* The editing panel: the list of items on each board, the controls for
   the selected one, the board's own settings and the opposite-colours
   offer. Part of app.mjs. */

import {
  design, active, selected, commit, saveSoon, setChip, setRange, select,
  removeElement
} from '../app.mjs';
import {
  CLIPS, BOARD, MAX_TEXTS, $, clamp, uid, r1, isHex, fills, isSampleText,
  order, activeBoard, findEl, selectedEl, countOf, limitOf
} from './model.mjs';
import { render } from './draw.mjs';
import { oppositePair } from './colour.mjs';
import {
  fitTemplateText, syncPersonalization, addElement, fitRows, wordsFrom
} from './placement.mjs';
import { syncPictureButton, resolutionNote } from './pictures.mjs';
import { clipThumb } from './cards.mjs';

function syncBoard() {
  const b = activeBoard();
  setChip('basekind', b.base.kind);
  $('paintopts').hidden = b.base.kind === 'wood';
  $('gradopts').hidden = b.base.kind !== 'gradient';
  $('woodopts').hidden = b.base.kind !== 'wood';
  for (const s of document.querySelectorAll('#paints .sw, #paints2 .sw')) s.setAttribute('aria-pressed', String(b.base.kind !== 'wood' && s.dataset.v === b.base.color));
  for (const s of $('stains').querySelectorAll('.sw')) s.setAttribute('aria-pressed', String(b.base.kind === 'wood' && s.dataset.v === b.base.stain));
  if (isHex(b.base.color)) $('paintcustom').value = b.base.color;
  if (isHex(b.base.color2 || '')) $('paint2').value = b.base.color2;
  $('paintval').textContent = b.base.color;
  $('gradangle').value = b.base.angle; $('gradangleval').textContent = b.base.angle + '°';
  $('pattern').value = b.pattern.kind;
  $('patcolor').value = b.pattern.color;
  $('patsize').min = b.pattern.kind === 'border' ? '0.1' : '0.5';
  // Preserve exact template/imported widths rather than letting the range
  // round them to its usual half-inch step while the label shows another value.
  $('patsize').step = b.pattern.kind === 'border' || b.pattern.size % 0.5 !== 0 ? '0.01' : '0.5';
  $('patsize').value = b.pattern.size; $('patsizeval').textContent = b.pattern.size + '"';
  $('patternopts').style.visibility = b.pattern.kind === 'none' ? 'hidden' : 'visible';
  const twoBoards = order.product === 'set', split = twoBoards && !design.same;
  setChip('boardmode', design.same ? 'same' : active);
  $('boardmode').hidden = !twoBoards;
  syncBoardActions();
  $('boardB').classList.toggle('hidden', !twoBoards);
  $('boardB').classList.toggle('same', design.same);
  for (const k of ['a', 'b']) {
    const box = $('board' + k.toUpperCase()), editing = split && active === k;
    box.classList.toggle('inactive', split && active !== k);
    box.querySelector('.label').textContent = 'Board ' + k.toUpperCase() + (editing ? ' - editing' : k === 'b' && design.same ? ' (same as A)' : '');
  }
  for (const s of document.querySelectorAll('.activename')) s.textContent = split ? 'board ' + active.toUpperCase() : 'your board';
}
/* A set offers the opposite-colours board from the start; with matching
   boards it makes B and splits the pair. It is offered only where it
   changes colours (see oppositePair), so it follows the board's words and
   art as well as its base: commit calls this too. Copy needs two designs
   to copy between, so it shows once they are split. The opposite colours
   come first in the row, so the button that is tapped stays under the
   finger when Copy appears after it. */
function syncBoardActions() {
  const twoBoards = order.product === 'set', split = twoBoards && !design.same, other = active === 'a' ? 'B' : 'A';
  const noOpposite = !twoBoards || !oppositePair(activeBoard());
  $('swapcolours').hidden = noOpposite;
  $('copyother').hidden = !split;
  $('boardactions').hidden = noOpposite && !split;
  $('copyother').textContent = 'Copy to Board ' + other;
  $('swapcolours').textContent = 'Make Board ' + other + ' the opposite colours';
}
/* A words field that takes the focus while its text is still a sample
   (isSampleText) has the words selected, so the first key typed replaces
   them, the way a template's first words already arrive. It waits a
   moment, since in some browsers the tap or the click that brought the
   focus goes on to put the caret where it landed. A key pressed first
   wins, and so does a field given its focus back by syncLists, which
   puts back the caret it had. Words the customer has changed keep the
   caret where it lands. */
let restoringFocus = false;
function selectSampleOnFocus(area, textOf) {
  let pending = 0;
  const cancel = () => clearTimeout(pending);
  area.addEventListener('focus', () => {
    cancel();
    if (restoringFocus || !isSampleText(textOf())) return;
    pending = setTimeout(() => { if (document.activeElement === area) area.setSelectionRange(0, area.value.length); });
  });
  for (const type of ['keydown', 'input', 'blur']) area.addEventListener(type, cancel);
}
const field = (id, key, map = (v) => v, label = null) => {
  $(id).addEventListener('input', () => {
    const el = selectedEl(); if (!el) return; el[key] = map($(id).value);
    if (el.type === 'text') {
      if (key === 'text') fitTemplateText(el);
      else if (['font', 'size', 'spacing', 'arc', 'rotation', 'x', 'y', 'outlineWidth'].includes(key)) el.autoFit = false;
    }
    if (label) $(id + 'val').textContent = label(el[key]);
    render(); syncLists(); syncPersonalization();
    if (key === 'text') syncProps();
    saveSoon();
  });
  $(id).addEventListener('change', commit);
};
const toggle = (id, key) => {
  $(id).addEventListener('change', () => { const el = selectedEl(); if (!el) return; el[key] = $(id).checked; render(); commit(); });
};
const inch = (v) => v + '"', deg = (v) => v + '°';
function copyToOther() {
  const el = selectedEl(); if (!el || design.same) return;
  const key = active === 'a' ? 'b' : 'a', other = design[key], limit = limitOf(el.type);
  if (countOf(other, el.type) >= limit) {
    const board = 'Board ' + key.toUpperCase(), items = { image: 'pictures', text: 'text items', clip: 'clip art items' }[el.type];
    alert(board + ' has reached its limit of ' + limit + ' ' + items + '. Remove ' + items + ' from ' + board + ' to make room, then copy again.');
    return;
  }
  const copy = { ...JSON.parse(JSON.stringify(el)), id: uid() };
  /* A copy of a picture filling this board fills the other one, in place
     of any picture that filled it before. */
  if (fills(copy)) for (const e of other.elements) if (e.type === 'image') e.cover = false;
  other.elements.push(copy);
  render(); commit();
}
function duplicate() {
  const el = selectedEl(); if (!el) return;
  const copy = { ...JSON.parse(JSON.stringify(el)), id: uid(), x: clamp(r1(el.x + 1), -4, BOARD.w + 4), y: clamp(r1(el.y + 1), -4, BOARD.h + 4) };
  /* Only one picture fills a board: a copy of it is an ordinary picture,
     at the place the original keeps for when it is put back. */
  if (fills(copy)) copy.cover = false;
  addElement(copy, null);
}
function moveLayer(dir) {
  const el = selectedEl(); if (!el) return;
  const els = activeBoard().elements, i = els.indexOf(el), j = i + dir;
  if (j < 0 || j >= els.length) return;
  els.splice(i, 1); els.splice(j, 0, el);
  render(); syncLists(); commit();
}

/* A row in the Text or Art list. Text rows carry the words in a field, so
   a name or a date is changed right there; every row carries its own
   remove button, so nothing has to be selected first. A words field is
   named by its place in the list (Words 1, Words 2), not by the words a
   template gave it, which the customer may have typed over; the words
   themselves are its value. A change of order or a removal builds the
   rows again, so the numbers stay right. */
function itemRow(el, pressed, onClick, place) {
  const row = document.createElement('div'); row.className = 'itemrow';
  const b = document.createElement('button'); b.className = 'item'; b.type = 'button'; b.dataset.id = el.id; b.setAttribute('aria-pressed', String(pressed));
  const t = document.createElement('span'); t.className = 'thumb';
  if (el.type === 'image') t.style.backgroundImage = 'url("' + el.src + '")';
  else if (el.type === 'clip') { t.style.background = 'transparent'; const c = clipThumb(el.name, el.color); c.style.width = c.style.height = '28px'; t.appendChild(c); }
  else { t.style.background = el.color; t.style.boxShadow = 'inset 0 0 0 1px rgba(0,0,0,.15)'; }
  b.appendChild(t);
  if (el.type === 'text') {
    b.classList.add('pick'); b.title = 'Select, to change the font, size and colour';
    const q = document.createElement('textarea'); q.className = 'quick words'; q.setAttribute('wrap', 'off'); q.value = el.text; q.maxLength = 60; q.dataset.id = el.id;
    fitRows(q, 1);
    q.setAttribute('aria-label', 'Words ' + place); q.style.fontFamily = '"' + el.font + '", Impact, sans-serif';
    q.addEventListener('focus', () => { if (selected !== el.id) select(el.id); });
    selectSampleOnFocus(q, () => findEl(el.id));
    q.addEventListener('input', () => { const e = findEl(el.id); if (!e) return; e.text = wordsFrom(q, 1); fitTemplateText(e); render(); updateRow(row, e, selected === e.id); if (selected === e.id) syncProps(); saveSoon(); });
    q.addEventListener('change', commit);
    row.append(b, q);
  } else {
    const n = document.createElement('span'); n.className = 'name'; b.appendChild(n);
    row.appendChild(b);
  }
  b.addEventListener('click', onClick);
  const x = document.createElement('button'); x.type = 'button'; x.className = 'itemdel'; x.dataset.id = el.id;
  x.title = 'Remove'; x.textContent = '×';
  x.addEventListener('click', () => removeElement(el.id));
  row.appendChild(x);
  labelRow(row, el);
  return row;
}
/* What a row is called, for the eye and for a screen reader: the words, or
   the kind of picture and its width. Kept current as the words change. */
function rowName(el) {
  if (el.type === 'text') return el.text.trim() ? '"' + el.text + '"' : 'the empty text';
  if (el.type === 'image') return fills(el) ? 'Picture, filling the board' : 'Picture, ' + el.width + '" wide';
  return (CLIPS[el.name] || {}).label + ', ' + el.width + '"';
}
function labelRow(row, el) {
  const name = rowName(el);
  row.querySelector('.item').setAttribute('aria-label', 'Select ' + name);
  row.querySelector('.itemdel').setAttribute('aria-label', 'Remove ' + name);
  const n = row.querySelector('.name'); if (n) n.textContent = name;
}
/* The lists are rebuilt from the design; the focus goes back to the row it
   was on, with the caret where it was, so typing in a row is not cut off
   by the rebuild it causes. */
function updateRow(row, el, pressed) {
  const b = row.querySelector('.item'); b.setAttribute('aria-pressed', String(pressed));
  const t = row.querySelector('.thumb');
  if (el.type === 'text') {
    t.style.background = el.color;
    const q = row.querySelector('.quick'); q.style.fontFamily = '"' + el.font + '", Impact, sans-serif';
    if (document.activeElement !== q && q.value !== el.text) { q.value = el.text; fitRows(q, 1); }
  } else if (el.type === 'clip') {
    t.textContent = ''; const c = clipThumb(el.name, el.color); c.style.width = c.style.height = '28px'; t.appendChild(c);
  }
  labelRow(row, el);
}
function syncLists() {
  const b = activeBoard();
  const ae = document.activeElement;
  const cls = ae && ae.dataset && ae.dataset.id ? ['quick', 'item', 'itemdel'].find((c) => ae.classList.contains(c)) : null;
  const keep = cls ? { id: ae.dataset.id, cls, s: ae.selectionStart, e: ae.selectionEnd, list: ae.closest('.items'), row: [...(ae.closest('.items') || ae).querySelectorAll('.itemrow')].indexOf(ae.closest('.itemrow')) } : null;
  let lostFocus = false;
  for (const [listId, types, emptyText] of [['texts', ['text'], 'No words yet.'], ['images', ['image', 'clip'], 'No pictures or clip art yet.']]) {
    const list = $(listId);
    const els = b.elements.filter((e) => types.includes(e.type));
    const rows = [...list.querySelectorAll('.itemrow')];
    if (rows.length === els.length && els.length && rows.every((r, i) => r.querySelector('.item').dataset.id === els[i].id)) {
      els.forEach((el, i) => updateRow(rows[i], el, el.id === selected));
      continue;
    }
    if (keep && keep.list === list) lostFocus = true;
    list.textContent = '';
    if (!els.length) { const p = document.createElement('div'); p.className = 'empty'; p.textContent = emptyText; list.appendChild(p); }
    els.forEach((el, i) => list.appendChild(itemRow(el, el.id === selected, () => select(el.id), i + 1)));
  }
  $('addtext').disabled = countOf(b, 'text') >= MAX_TEXTS;
  // Busy only while a picture for this board is on its way.
  syncPictureButton();
  if (keep && lostFocus) {
    /* The row is gone (its own x was pressed): the focus goes to the Select
       button of the row now in its place, or of the last row - never to
       another row's x, where a second press would take a line nobody meant
       to remove. An id from a project file can hold any character. */
    const rows = keep.list ? [...keep.list.querySelectorAll('.itemrow')] : [], row = rows[Math.min(keep.row, rows.length - 1)];
    const again = document.querySelector('.' + keep.cls + '[data-id="' + CSS.escape(keep.id) + '"]') || (row && row.querySelector('.item')) || (keep.list ? $(keep.list.id === 'texts' ? 'addtext' : 'addimagebtn') : null);
    if (again) {
      restoringFocus = true; again.focus({ preventScroll: true }); restoringFocus = false;
      if (keep.cls === 'quick' && keep.s != null && again.setSelectionRange) try { again.setSelectionRange(keep.s, keep.e); } catch (_) {}
    }
  }
}
function syncProps() {
  const el = selectedEl();
  syncPersonalization();
  $('textprops').hidden = !(el && el.type === 'text');
  $('imageprops').hidden = !(el && el.type !== 'text');
  if (!el) return;
  const copyOk = !design.same && order.product === 'set';
  $('tcopy').hidden = $('icopy').hidden = !copyOk;
  if (el.type === 'text') {
    if (document.activeElement !== $('ttext')) { $('ttext').value = el.text; fitRows($('ttext'), 2); }
    $('tfont').value = el.font;
    setRange('tsize', el.size, inch(el.size));
    $('tcolor').value = el.color; $('toutline').value = el.outline;
    setRange('toutlinew', el.outlineWidth, inch(el.outlineWidth));
    setRange('tarc', el.arc, deg(el.arc));
    setRange('tspacing', el.spacing, inch(el.spacing));
    setRange('trot', el.rotation, deg(el.rotation));
    setRange('tx', el.x, inch(el.x)); setRange('ty', el.y, inch(el.y));
    $('tshadow').checked = !!el.shadow;
  } else {
    $('imageonly').hidden = el.type !== 'image';
    $('cliponly').hidden = el.type !== 'clip';
    /* What a picture filling the board sets aside stays in view, kept for
       when it is put back, but cannot be changed meanwhile. */
    const filling = fills(el);
    for (const id of ['iwidth', 'irot', 'ix', 'iy', 'icircle', 'iforward', 'iback']) $(id).disabled = filling;
    setRange('iwidth', el.width, inch(el.width));
    setRange('irot', el.rotation, deg(el.rotation));
    setRange('iopacity', el.opacity, Math.round(el.opacity * 100) + '%');
    setRange('ix', el.x, inch(el.x)); setRange('iy', el.y, inch(el.y));
    const note = el.type === 'image' ? resolutionNote(el, '') : '';
    $('ireswarn').textContent = note; $('ireswarn').hidden = !note;
    if (el.type === 'image') { $('iflip').checked = !!el.flipH; $('icircle').checked = !!el.circleCrop; $('iknockout').checked = !!el.knockout; $('icover').checked = fills(el); }
    else { $('ccolor').value = el.color; $('coutline').value = el.outline; setRange('coutlinew', el.outlineWidth, inch(el.outlineWidth)); $('cflip').checked = !!el.flipH; }
  }
}

export {
  syncBoard, syncBoardActions, selectSampleOnFocus, field, toggle, inch, deg,
  copyToOther, duplicate, moveLayer, syncLists, syncProps
};
