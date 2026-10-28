/* The template and clip art pickers: their cards, the thumbnails drawn
   as they scroll into view, and the template search. Part of app.mjs. */

import { applyTemplate, askThenApply, clipCat } from '../app.mjs';
import {
  CLIPS, CLIP_CATS, BOARD, OCCASIONS, TEMPLATE_GROUPS, $, C, TEMPLATES,
  activeBoard, setText
} from './model.mjs';
import { renderOutput } from './draw.mjs';
import { defaultInk } from './colour.mjs';
import { placeNew, addElement } from './placement.mjs';

/* Accents are split off (NFD) and every combining mark dropped, so "café"
   finds "cafe". Written as a Unicode property rather than a range of escaped
   code points: the deploy upload turns such escapes into the characters
   themselves, and the file must arrive byte for byte. */
const normalizeSearch = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
/* The thumbnails - a template's board at 128 x 256, a clip's path at
   72 x 72, 160-odd of them - are drawn as they come into view, not all
   at once while the page is still starting. A template's is drawn again
   when a web font lands; one not drawn yet waits for the font. */
const thumbnails = new Map();   // canvas -> { draw, text }
const thumbnailWatch = typeof IntersectionObserver === 'function' ? new IntersectionObserver((entries) => { for (const e of entries) if (e.isIntersecting) drawThumbnail(e.target); }) : null;
function lazyThumbnail(canvas, draw, text) {
  thumbnails.set(canvas, { draw, text });
  if (thumbnailWatch) thumbnailWatch.observe(canvas); else drawThumbnail(canvas);
}
function drawThumbnail(canvas) {
  const t = thumbnails.get(canvas); if (!t) return;
  t.draw(); canvas.dataset.drawn = 'true';
  if (thumbnailWatch) thumbnailWatch.unobserve(canvas);
}
/* A card is built once; a search shows the cards that match, so a
   keystroke costs a few list operations rather than every thumbnail. */
const templateCards = new Map();
function templateCard(t) {
  let card = templateCards.get(t.id);
  if (card) return card;
  const b = document.createElement('button'); b.className = 'tpl'; b.type = 'button'; b.dataset.id = t.id; b.setAttribute('aria-label', t.label + ' template');
  const c = document.createElement('canvas'); c.width = 64 * 2; c.height = 128 * 2;
  c.setAttribute('aria-hidden', 'true');
  lazyThumbnail(c, () => { const g = c.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height); renderOutput(g, t.board(), c.height / BOARD.h); }, true);
  const s = document.createElement('span'); s.textContent = t.label;
  b.append(c, s);
  b.addEventListener('click', () => askThenApply('the ' + t.label + ' template', () => applyTemplate(t.id)));
  const terms = normalizeSearch([t.label, t.id, OCCASIONS[t.occasion], TEMPLATE_GROUPS.find(g => g[0] === t.occasion)?.[1], ...t.board().elements.map(e => e.text || CLIPS[e.name]?.label || '')].join(' '));
  card = { button: b, terms };
  templateCards.set(t.id, card);
  return card;
}
function renderTemplates() {
  const host = $('templates'); host.textContent = '';
  const words = normalizeSearch($('templatesearch').value).split(/\s+/).filter(Boolean), occasion = $('templateoccasion').value;
  const matches = TEMPLATES.filter(t => (!occasion || t.occasion === occasion) && words.every(word => templateCard(t).terms.includes(word)));
  setText($('templateresults'), matches.length ? matches.length + (matches.length === 1 ? ' template' : ' templates') + ' to personalize' : 'No templates found');
  $('templateempty').hidden = matches.length > 0;
  $('cleartemplates').disabled = !words.length && !occasion;
  for (const [key, label] of TEMPLATE_GROUPS) {
    const ts = matches.filter((t) => t.occasion === key); if (!ts.length) continue;
    const h = document.createElement('h3'); h.className = 'tplgroup'; h.textContent = label; host.appendChild(h);
    const grid = document.createElement('div'); grid.className = 'templates'; host.appendChild(grid);
    for (const t of ts) grid.appendChild(templateCard(t).button);
  }
}
function drawClipThumb(c, name, color) {
  const def = CLIPS[name], g = c.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height); g.scale(0.72, 0.72);
  const p = new Path2D(); def.path(p); g.lineJoin = g.lineCap = 'round';
  if (def.mode === 'stroke') { g.lineWidth = def.lw || 8; g.strokeStyle = color; g.stroke(p); } else { g.fillStyle = color; g.fill(p, def.rule || 'nonzero'); }
}
function clipThumb(name, color = '#1d1b18') {
  const c = document.createElement('canvas'); c.width = c.height = 72;
  drawClipThumb(c, name, color);
  return c;
}
const clipCards = new Map();
function clipCard(name) {
  let card = clipCards.get(name);
  if (card) return card;
  const def = CLIPS[name];
  const b = document.createElement('button'); b.type = 'button'; b.className = 'clip'; b.dataset.name = name; b.title = def.label; b.setAttribute('aria-label', 'Add ' + def.label);
  const thumbnail = document.createElement('canvas'); thumbnail.width = thumbnail.height = 72; thumbnail.setAttribute('aria-hidden', 'true');
  lazyThumbnail(thumbnail, () => drawClipThumb(thumbnail, name, '#1d1b18'), false);
  const label = document.createElement('span'); label.className = 'clip-label'; label.textContent = def.label;
  b.append(thumbnail, label);
  card = { button: b, terms: normalizeSearch([def.label, name.replaceAll('-', ' '), CLIP_CATS[def.cat]].join(' ')) };
  clipCards.set(name, card);
  return card;
}
function fillClips() {
  const box = $('clips'); box.textContent = '';
  const words = normalizeSearch($('clipsearch').value).split(/\s+/).filter(Boolean);
  let count = 0;
  for (const [name, def] of Object.entries(CLIPS)) {
    if (clipCat && def.cat !== clipCat) continue;
    const card = clipCard(name);
    if (!words.every(word => card.terms.includes(word))) continue;
    box.appendChild(card.button); count++;
  }
  setText($('clipresults'), count ? count + (count === 1 ? ' artwork choice' : ' artwork choices') : 'No artwork found');
  $('clipempty').hidden = count > 0;
  $('clearclips').disabled = !words.length && !clipCat;
  $('clipfilterlabel').textContent = 'Browse groups: ' + (CLIP_CATS[clipCat] || 'All artwork');
}
function addClip(name, o = {}) {
  if (!CLIPS[name]) return null;
  const fresh = C(name, { width: 8, x: 12, y: 36, ...o });
  /* The art goes where there is room (placeNew) unless the caller names
     a place; a width the caller names is kept, not made smaller. */
  if (o.x === undefined && o.y === undefined) Object.assign(fresh, placeNew(activeBoard(), fresh, { shrink: o.width === undefined }));
  if (o.color === undefined) fresh.color = defaultInk(activeBoard(), fresh);
  const el = addElement(fresh, 'art');
  if (el) $('iwidth').focus();
  return el;
}

export { thumbnails, renderTemplates, clipThumb, fillClips, addClip };
