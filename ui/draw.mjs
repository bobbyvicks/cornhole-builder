/* Drawing the boards: on screen, for the print file and the share
   picture, and read back as pixels for the readability check. Also the
   handles round the selected item, finding what a tap or click is on, and
   the words that describe each board to a screen reader. Part of app.mjs. */

import { heart, prng } from '../lib/clips.mjs';
import { design, active, drag, syncScrollPadding } from '../app.mjs';
import {
  CLIPS, BOARD, PRINT_PPI, STAINS, FONT_WEIGHT, PATTERNS, $, clamp, rad,
  colourName, fills, coverOf, order, boardFor, findEl, selectedEl, boardKeys,
  setText
} from './model.mjs';
import { READ_PPI, inkBackdrop } from './colour.mjs';

/* ====================================================================
   RENDERING. ctx is scaled so one unit is one inch.
   ==================================================================== */
const boxes = new Map();  // element id -> { w, h, oy } in inches, from the last render, for hit testing
const imgCache = new Map();
let curPpi = 20;
let printing = false;     // the print file draws from the pictures' masters

function imageFor(src) {
  let img = imgCache.get(src);
  if (!img) {
    img = new Image();
    img.onload = () => render();
    img.src = src;
    imgCache.set(src, img);
  }
  return img.complete && img.naturalWidth ? img : null;
}
const imageLoaded = (src) => new Promise((res) => {
  const img = imageFor(src); if (img) { res(img); return; }
  const i = imgCache.get(src);
  if (i.complete) { res(null); return; }
  i.addEventListener('load', () => res(i), { once: true });
  i.addEventListener('error', () => res(null), { once: true });
});
/* The print file needs every master decoded before it draws. */
async function preloadImages(keys = boardKeys(), { print = true, source = design } = {}) {
  const srcs = new Set();
  for (const k of keys) for (const e of boardFor(k, source).elements) if (e.type === 'image') srcs.add(print ? e.orig || e.src : e.src);
  const images = await Promise.all([...srcs].map(imageLoaded));
  if (images.some(img => !img)) throw new Error('A picture could not be loaded. Remove it and upload the original again.');
}
/* "Remove white background": a logo on a white JPEG becomes a cut-out.
   Anything near white goes transparent, fading in over the last few
   levels so edges stay soft. Done once per picture and kept. */
const knockCache = new Map();
function knockedOut(src) {
  if (knockCache.has(src)) return knockCache.get(src);
  const img = imageFor(src); if (!img) return null;
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  const px = d.data;
  for (let i = 0; i < px.length; i += 4) {
    const m = Math.min(px[i], px[i + 1], px[i + 2]);
    if (m > 200) px[i + 3] = Math.round(px[i + 3] * clamp((238 - m) / 38, 0, 1));
  }
  g.putImageData(d, 0, 0);
  knockCache.set(src, c);
  return c;
}

function boardPath(ctx) {
  const r = BOARD.radius, w = BOARD.w, h = BOARD.h;
  ctx.beginPath();
  ctx.moveTo(r, 0); ctx.lineTo(w - r, 0); ctx.arcTo(w, 0, w, r, r); ctx.lineTo(w, h - r);
  ctx.arcTo(w, h, w - r, h, r); ctx.lineTo(r, h); ctx.arcTo(0, h, 0, h - r, r); ctx.lineTo(0, r); ctx.arcTo(0, 0, r, 0, r);
  ctx.closePath();
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a.toFixed(3) + ')';
}
function drawWood(ctx, stain) {
  const st = STAINS[stain] || STAINS.walnut;
  ctx.fillStyle = st.color;
  ctx.fillRect(0, 0, BOARD.w, BOARD.h);
  const rnd = prng('grain-' + stain);
  ctx.lineCap = 'round';
  for (let i = 0; i < 110; i++) {
    const y0 = rnd() * BOARD.h, amp = 0.15 + rnd() * 0.5, freq = 0.08 + rnd() * 0.18, ph = rnd() * 6.3;
    const light = rnd() < 0.3;
    ctx.strokeStyle = light ? 'rgba(255,255,255,' + (0.04 + rnd() * 0.08).toFixed(3) + ')' : hexA(st.grain, 0.06 + rnd() * 0.16);
    ctx.lineWidth = 0.03 + rnd() * 0.14;
    ctx.beginPath();
    for (let x = -1; x <= BOARD.w + 1; x += 0.5) {
      const y = y0 + amp * Math.sin(freq * x + ph) + 0.08 * Math.sin(1.7 * x + ph);
      x < 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}
function drawBase(ctx, base) {
  if (base.kind === 'wood') { drawWood(ctx, base.stain); return; }
  if (base.kind === 'gradient') {
    /* The angle is the direction the second colour lies in: 180 is a
       fade from the top colour down to the bottom one. */
    const a = rad((Number(base.angle) || 0) - 90), cx = BOARD.w / 2, cy = BOARD.h / 2;
    const L = Math.abs(Math.cos(a)) * BOARD.w / 2 + Math.abs(Math.sin(a)) * BOARD.h / 2;
    const g = ctx.createLinearGradient(cx - Math.cos(a) * L, cy - Math.sin(a) * L, cx + Math.cos(a) * L, cy + Math.sin(a) * L);
    g.addColorStop(0, base.color); g.addColorStop(1, base.color2 || base.color);
    ctx.fillStyle = g;
  } else ctx.fillStyle = base.color;
  ctx.fillRect(0, 0, BOARD.w, BOARD.h);
}

function drawPattern(ctx, p) {
  if (!p || p.kind === 'none') return;
  const s = clamp(Number(p.size) || 3, p.kind === 'border' ? 0.1 : 0.5, 12), w = BOARD.w, h = BOARD.h;
  ctx.fillStyle = p.color;
  const bands = (len, step, draw) => { for (let v = 0; v < len; v += 2 * step) draw(v); };
  switch (p.kind) {
    case 'top': ctx.fillRect(0, 0, w, h / 2); break;
    case 'bottom': ctx.fillRect(0, h / 2, w, h / 2); break;
    case 'left': ctx.fillRect(0, 0, w / 2, h); break;
    case 'right': ctx.fillRect(w / 2, 0, w / 2, h); break;
    case 'diagonal': ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w, 0); ctx.lineTo(0, h); ctx.closePath(); ctx.fill(); break;
    case 'stripes': bands(h, s, (y) => ctx.fillRect(0, y, w, s)); break;
    case 'vstripes': bands(w, s, (x) => ctx.fillRect(x, 0, s, h)); break;
    case 'dstripes':
      ctx.save(); ctx.translate(w / 2, h / 2); ctx.rotate(Math.PI / 4);
      for (let v = -60; v < 60; v += 2 * s) ctx.fillRect(-60, v, 120, s);
      ctx.restore(); break;
    case 'border':
      ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.rect(s, s, w - 2 * s, h - 2 * s); ctx.fill('evenodd'); break;
    case 'checker':
      for (let r = 0; r * s < h; r++) for (let c = 0; c * s < w; c++) if ((r + c) % 2 === 0) ctx.fillRect(c * s, r * s, s, s);
      break;
    case 'plaid':
      ctx.globalAlpha = 0.55;
      bands(h, s, (y) => ctx.fillRect(0, y, w, s)); bands(w, s, (x) => ctx.fillRect(x, 0, s, h));
      ctx.globalAlpha = 1; break;
    case 'dots':
      for (let r = 0; r * s <= h + s; r++) for (let c = 0; c * s <= w + s; c++) {
        ctx.beginPath(); ctx.arc(c * s + (r % 2 ? s / 2 : 0), r * s, s * 0.28, 0, Math.PI * 2); ctx.fill();
      }
      break;
    case 'diamonds':
      for (let r = 0; r * s <= h + s; r++) for (let c = 0; c * s <= w + s; c++) {
        const x = c * s + (r % 2 ? s / 2 : 0), y = r * s, d = s * 0.32;
        ctx.beginPath(); ctx.moveTo(x, y - d); ctx.lineTo(x + d, y); ctx.lineTo(x, y + d); ctx.lineTo(x - d, y); ctx.closePath(); ctx.fill();
      }
      break;
    case 'hearts':
      for (let r = 0; r * s <= h + s; r++) for (let c = 0; c * s <= w + s; c++) {
        const x = c * s + (r % 2 ? s / 2 : 0), y = r * s, pth = new Path2D(); heart(pth, 0, 0, s * 0.006);
        ctx.save(); ctx.translate(x, y); ctx.fill(pth); ctx.restore();
      }
      break;
    case 'chevron':
      for (let y = -8; y < h + 8; y += 2 * s) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w / 2, y + 6); ctx.lineTo(w, y); ctx.lineTo(w, y + s); ctx.lineTo(w / 2, y + 6 + s); ctx.lineTo(0, y + s); ctx.closePath(); ctx.fill();
      }
      break;
    case 'rings': {
      const cx = w / 2, cy = BOARD.hole.cy, r0 = BOARD.hole.d / 2;
      for (let r = r0 + s; r < 60; r += 2 * s) {
        ctx.beginPath(); ctx.arc(cx, cy, r + s, 0, Math.PI * 2); ctx.arc(cx, cy, r, 0, Math.PI * 2, true); ctx.fill('evenodd');
      }
      break;
    }
    case 'sunburst': {
      const cx = w / 2, cy = BOARD.hole.cy, n = Math.max(6, Math.round(36 / s)) * 2;
      for (let i = 0; i < n; i += 2) {
        const a0 = i * Math.PI * 2 / n, a1 = (i + 1) * Math.PI * 2 / n;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + 80 * Math.cos(a0), cy + 80 * Math.sin(a0)); ctx.lineTo(cx + 80 * Math.cos(a1), cy + 80 * Math.sin(a1)); ctx.closePath(); ctx.fill();
      }
      break;
    }
    case 'cross': ctx.fillRect(w / 2 - s / 2, 0, s, h); ctx.fillRect(0, h / 2 - s / 2, w, s); break;
  }
}

const fontString = (el) => (FONT_WEIGHT[el.font] || 400) + ' ' + el.size + 'px "' + el.font + '", Impact, sans-serif';

/* Text: straight, or bent along an arc, on one line or several. The words
   break into lines at each line break; every line is centred across the
   element, the lines sit LINE_HEIGHT x the size apart, and the block of
   lines is centred on the element's position. Each glyph is measured, so
   a bent word keeps its spacing. Spacing and curve apply to every line on
   its own: each line is spaced and bent through the same angle about its
   own middle, exactly as a single line is, so a name over a date arches
   both. The ascent and descent of the tallest line serve every line, so
   the baselines stay evenly spaced. The hit box of a line is its ink (for
   a bent line, the chord plus the sagitta); the box of several lines is
   all of theirs together, and never shorter than lines x line height. */
const LINE_HEIGHT = 1.15;
const textLines = (text) => String(text).split('\n');
function drawText(ctx, el) {
  ctx.save();
  ctx.translate(el.x, el.y);
  ctx.rotate(rad(el.rotation));
  ctx.font = fontString(el);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lines = textLines(el.text), n = lines.length, lh = LINE_HEIGHT * el.size;
  const metrics = lines.map((line) => ctx.measureText(line));
  /* An empty line has no ink to measure, but it still takes its place. */
  const inked = metrics.filter((m, i) => n === 1 || lines[i]);
  const most = (key) => (inked.length ? Math.max(...inked.map((m) => m[key])) : 0);
  const asc = most('actualBoundingBoxAscent') || el.size * 0.7, desc = most('actualBoundingBoxDescent') || el.size * 0.2;
  const dy = (asc - desc) / 2;   // centre the ink, not the em box
  const ow = el.outlineWidth || 0, spacing = el.spacing || 0, arc = el.arc || 0;
  const draw = (str, x, y, rot) => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    if (el.shadow) { ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 0.1 * curPpi; ctx.shadowOffsetX = 0.07 * curPpi; ctx.shadowOffsetY = 0.09 * curPpi; }
    if (ow > 0) { ctx.lineJoin = 'round'; ctx.lineWidth = ow * 2; ctx.strokeStyle = el.outline; ctx.strokeText(str, 0, dy); ctx.shadowColor = 'transparent'; }
    ctx.fillStyle = el.color; ctx.fillText(str, 0, dy);
    ctx.restore();
  };
  /* One line, its middle at `cy` below the element's centre; the box it
     returns is centred `oy` below that middle. */
  const drawLine = (line, m, cy) => {
    const chars = [...line], widths = chars.map((c) => ctx.measureText(c).width);
    const total = (spacing || arc) ? widths.reduce((s, w) => s + w, 0) + spacing * Math.max(0, chars.length - 1) : m.width;
    if (!arc && !spacing) {
      draw(line, 0, cy, 0);
      return { w: total + 2 * ow, h: asc + desc + 2 * ow, oy: 0 };
    }
    if (!arc) {
      let x = -total / 2;
      chars.forEach((c, i) => { draw(c, x + widths[i] / 2, cy, 0); x += widths[i] + spacing; });
      return { w: total + 2 * ow, h: asc + desc + 2 * ow, oy: 0 };
    }
    const theta = rad(Math.abs(arc)), r = total / theta, up = arc > 0 ? 1 : -1;
    let s = -total / 2;
    chars.forEach((c, i) => {
      const phi = (s + widths[i] / 2) / r;
      draw(c, r * Math.sin(phi), cy + up * (r - r * Math.cos(phi)), up * phi);
      s += widths[i] + spacing;
    });
    const chord = 2 * r * Math.sin(Math.min(theta, Math.PI) / 2), sag = r * (1 - Math.cos(Math.min(theta, Math.PI) / 2));
    return { w: chord + asc + desc + 2 * ow, h: sag + asc + desc + 2 * ow, oy: up * sag / 2 };
  };
  const parts = lines.map((line, i) => { const cy = (i - (n - 1) / 2) * lh; return { cy, ...drawLine(line, metrics[i], cy) }; });
  let box = parts[0];
  if (n > 1) {
    const top = Math.min(...parts.map((p) => p.cy + p.oy - p.h / 2)), bottom = Math.max(...parts.map((p) => p.cy + p.oy + p.h / 2));
    box = { w: Math.max(...parts.map((p) => p.w)), h: Math.max(bottom - top, n * lh), oy: (top + bottom) / 2 };
  }
  boxes.set(el.id, { w: Math.max(0.5, box.w), h: Math.max(0.5, box.h), oy: box.oy });
  ctx.restore();
}

/* A picture is drawn at its place, or, when it fills the board, scaled
   so that it covers all of the 24 x 48 (as CSS object-fit: cover does):
   centred, the overflowing edges cut off by the board's outline, with its
   place, width, turn and circle crop set aside until it is put back. Its
   opacity, flip and white-background removal still apply. Its hit box is
   the whole board; hitTest picks it only where nothing else is. */
function drawImage(ctx, el) {
  const source = printing ? (el.orig || el.src) : el.src;
  const img = el.knockout ? knockedOut(source) : imageFor(source);
  const iw = img ? (img.naturalWidth || img.width) : (el.px ? el.px[0] : 1), ih = img ? (img.naturalHeight || img.height) : (el.px ? el.px[1] : 1);
  if (fills(el)) {
    const k = Math.max(BOARD.w / iw, BOARD.h / ih), w = iw * k, h = ih * k;
    boxes.set(el.id, { w: BOARD.w, h: BOARD.h, oy: 0 });
    ctx.save();
    ctx.translate(BOARD.w / 2, BOARD.h / 2);
    ctx.globalAlpha = el.opacity;
    if (el.flipH) ctx.scale(-1, 1);
    if (img) ctx.drawImage(img, -w / 2, -h / 2, w, h);
    else { ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.fillRect(-BOARD.w / 2, -BOARD.h / 2, BOARD.w, BOARD.h); }
    ctx.restore();
    return;
  }
  let w = el.width, h = w * ih / iw;
  if (el.circleCrop) { const d = Math.min(w, h); boxes.set(el.id, { w: d, h: d, oy: 0 }); }
  else boxes.set(el.id, { w, h, oy: 0 });
  ctx.save();
  ctx.translate(el.x, el.y);
  ctx.rotate(rad(el.rotation));
  ctx.globalAlpha = el.opacity;
  if (el.flipH) ctx.scale(-1, 1);
  if (el.circleCrop) { ctx.beginPath(); ctx.arc(0, 0, Math.min(w, h) / 2, 0, Math.PI * 2); ctx.clip(); }
  if (img) ctx.drawImage(img, -w / 2, -h / 2, w, h);
  else { ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.fillRect(-w / 2, -h / 2, w, h); }
  ctx.restore();
}

function drawClip(ctx, el) {
  const def = CLIPS[el.name]; if (!def) return;
  const w = el.width, h = w * (def.aspect || 1);
  boxes.set(el.id, { w, h, oy: 0 });
  ctx.save();
  ctx.translate(el.x, el.y);
  ctx.rotate(rad(el.rotation));
  ctx.globalAlpha = el.opacity;
  if (el.flipH) ctx.scale(-1, 1);
  const k = w / 100;
  ctx.scale(k, k); ctx.translate(-50, -50);
  const p = new Path2D(); def.path(p);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (def.mode === 'stroke') { ctx.lineWidth = def.lw || 8; ctx.strokeStyle = el.color; ctx.stroke(p); }
  else {
    if (el.outlineWidth > 0) { ctx.lineWidth = el.outlineWidth * 2 / k; ctx.strokeStyle = el.outline; ctx.stroke(p); }
    ctx.fillStyle = el.color; ctx.fill(p, def.rule || 'nonzero');
  }
  ctx.restore();
}

function drawHole(ctx, print) {
  const cx = BOARD.w / 2, cy = BOARD.hole.cy, r = BOARD.hole.d / 2;
  ctx.save();
  if (print) {
    /* The print file leaves the hole area untouched: it is cut out. A hairline
       shows the shop where. */
    ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 0.02;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  } else {
    const g = ctx.createRadialGradient(cx, cy - 0.6, r * 0.2, cx, cy, r);
    g.addColorStop(0, '#2a2420'); g.addColorStop(1, '#0d0b0a');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 0.08;
    ctx.beginPath(); ctx.arc(cx, cy, r - 0.04, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

const DRAWERS = { text: drawText, image: drawImage, clip: drawClip };

/* Draw one board onto a context whose (0,0) is the board's top-left, at
   `ppi` pixels per inch. */
function renderBoard(ctx, b, ppi, { print = false } = {}) {
  curPpi = ppi; printing = print;
  ctx.save();
  ctx.scale(ppi, ppi);
  boardPath(ctx);
  ctx.clip();
  drawBase(ctx, b.base);
  drawPattern(ctx, b.pattern);
  /* A picture that fills the board goes down first, over the base and the
     pattern (which show through where it is see-through) and under every
     other item, wherever it sits in the list. */
  const cover = coverOf(b);
  if (cover) drawImage(ctx, cover);
  for (const el of b.elements) if (el !== cover) (DRAWERS[el.type] || (() => {}))(ctx, el);
  drawHole(ctx, print);
  if (!print) {
    /* A soft bevel so the preview reads as an object, not a flat rectangle. */
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = 'rgba(0,0,0,.22)';
    boardPath(ctx); ctx.stroke();
  }
  ctx.restore();
  printing = false;
}

/* Handle geometry, in inches, set at each paint from the preview's size on
   screen: a handle is about 14 px wide on a phone and on a desktop alike,
   though the 24" board shows at 150 px on one and 300 px on the other. */
const HANDLE = { size: 0.6, rotateGap: 0.9, hit: 0.9 };
function sizeHandles() {
  const r = $('canvas' + active.toUpperCase()).getBoundingClientRect();
  const css = r.width > 0 ? r.width / BOARD.w : 12;   // CSS pixels per inch
  HANDLE.size = clamp(14 / css, 0.6, 3);
  HANDLE.hit = clamp(20 / css, 0.9, 4.5);
  HANDLE.rotateGap = HANDLE.size * 1.5;
}
/* Where a selected element's handles sit, in its own (rotated) frame. A
   picture filling the board has none: it has no size or turn of its own
   to change, and a red x in the board's corner would sit where people
   reach for the artwork above it. It is removed like anything else from
   its row's x in the Art list, the Remove button under it, or the Delete
   key while the board has the focus. */
function handleSpots(el) {
  if (fills(el)) return null;
  const box = boxes.get(el.id); if (!box) return null;
  const rx = box.w / 2 + 0.15, top = -box.h / 2 - 0.15 + box.oy, bottom = box.h / 2 + 0.15 + box.oy;
  return { resize: [rx, bottom], delete: [rx, top], rotate: [0, top - HANDLE.rotateGap] };
}
/* While the Order tab is open the board shows the design as it will
   print, with no selection outline and no handles, so a tap cannot reach
   a handle nobody can see either. The selection itself is kept for when
   editing goes on. A board with the keyboard focus still outlines what
   its keys would move or remove. */
const showsSelection = (c) => !document.body.classList.contains('ordering') || document.activeElement === c;
/* The same in board inches, for the tests. */
function handlePoints(id) {
  const el = findEl(id), spots = el && handleSpots(el); if (!spots) return null;
  const a = rad(el.rotation), out = {};
  for (const [k, [lx, ly]] of Object.entries(spots)) out[k] = { x: el.x + lx * Math.cos(a) - ly * Math.sin(a), y: el.y + lx * Math.sin(a) + ly * Math.cos(a) };
  return out;
}
/* Each board in words, for a screen reader: a canvas is a picture it
   cannot read. The hidden element the canvas points at with
   aria-describedby says what is drawn - the base, the pattern if there is
   one, every text with its words and its font, the clip art by name, the
   pictures by count - and, with two different boards, which of them the
   panel is editing. The canvas keeps its short label; this is the detail
   read after it. It is made again at every paint, a few string joins, so
   it never lags behind the board, and the text node is only written when
   the words change. It is not a live region: nothing is announced while
   someone edits, it is read when the board is reached. */
const COUNT_WORDS = ['no', 'one', 'two', 'three', 'four'];
const listed = (items) => (items.length < 2 ? items.join('') : items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1]);
const sentence = (s) => s.charAt(0).toUpperCase() + s.slice(1) + '.';
function baseWords(base) {
  if (base.kind === 'wood') return (STAINS[base.stain] || STAINS.walnut).label.toLowerCase() + ' stained wood';
  if (base.kind === 'gradient') return 'a fade from ' + colourName(base.color) + ' to ' + colourName(base.color2 || base.color);
  return 'painted ' + colourName(base.color);
}
function describeBoard(key) {
  const b = boardFor(key), split = order.product === 'set' && !design.same;
  const words = [], clips = [];
  let pictures = 0;
  for (const e of b.elements) {
    if (e.type === 'text') words.push(e.text.trim() ? '"' + e.text.trim() + '" in ' + e.font : 'an empty text');
    else if (e.type === 'clip') clips.push((CLIPS[e.name] || {}).label || 'clip art');
    else if (e.type === 'image') pictures++;
  }
  const out = [];
  if (key === 'b' && design.same) out.push('The same design as Board A.');
  out.push(sentence(baseWords(b.base)));
  if (b.pattern.kind !== 'none') out.push('Pattern: ' + (PATTERNS[b.pattern.kind] || b.pattern.kind).toLowerCase() + ' in ' + colourName(b.pattern.color) + '.');
  if (words.length) out.push('Words: ' + listed(words) + '.');
  if (clips.length) out.push('Clip art: ' + listed(clips) + '.');
  if (pictures) out.push(sentence((COUNT_WORDS[pictures] || String(pictures)) + (pictures === 1 ? ' picture' : ' pictures') + (coverOf(b) ? (pictures === 1 ? ', filling the board' : ', one filling the board') : '')));
  if (!b.elements.length) out.push('No words or artwork yet.');
  if (split) out.push(key === active ? 'This is the board being edited.' : 'Board ' + active.toUpperCase() + ' is being edited.');
  return out.join(' ');
}
function describeBoards() {
  for (const key of ['a', 'b']) setText($('desc' + key.toUpperCase()), describeBoard(key));
}

const guides = { v: false, h: false };
let raf = 0;
function render() { if (!raf) raf = requestAnimationFrame(paint); }
function paint() {
  raf = 0;
  sizeHandles();
  syncScrollPadding();
  describeBoards();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const ppi = 20 * dpr;
  for (const key of ['a', 'b']) {
    const c = $('canvas' + key.toUpperCase());
    const W = Math.round(BOARD.w * ppi), H = Math.round(BOARD.h * ppi);
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    const ctx = c.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    renderBoard(ctx, boardFor(key), ppi);
    const el = showsSelection(c) ? selectedEl() : null;
    const editingHere = design.same ? key === 'a' : key === active;
    // Keyboard navigation reaches the canvas whose selection the controls
    // edit. A second preview must not receive keys intended for that selection.
    c.tabIndex = editingHere ? 0 : -1;
    if (el && editingHere && fills(el)) {
      /* A picture filling the board is outlined just inside the board's
         edge, with no handles (see handleSpots). */
      ctx.save(); ctx.scale(ppi, ppi);
      const inset = 0.35;
      ctx.setLineDash([8 / ppi, 5 / ppi]); ctx.lineWidth = 2 / ppi;
      ctx.strokeStyle = '#ffffff'; ctx.strokeRect(inset, inset, BOARD.w - 2 * inset, BOARD.h - 2 * inset);
      ctx.lineDashOffset = 8 / ppi; ctx.strokeStyle = '#1f3a93'; ctx.strokeRect(inset, inset, BOARD.w - 2 * inset, BOARD.h - 2 * inset);
      ctx.restore();
    } else if (el && editingHere) {
      const box = boxes.get(el.id);
      if (box) {
        ctx.save(); ctx.scale(ppi, ppi);
        if (drag && (guides.v || guides.h)) {
          ctx.setLineDash([0.3, 0.2]); ctx.lineWidth = 2 / ppi; ctx.strokeStyle = '#e75480';
          if (guides.v) { ctx.beginPath(); ctx.moveTo(BOARD.w / 2, 0); ctx.lineTo(BOARD.w / 2, BOARD.h); ctx.stroke(); }
          if (guides.h) { ctx.beginPath(); ctx.moveTo(0, BOARD.h / 2); ctx.lineTo(BOARD.w, BOARD.h / 2); ctx.stroke(); }
          ctx.setLineDash([]);
        }
        ctx.translate(el.x, el.y); ctx.rotate(rad(el.rotation));
        const x0 = -box.w / 2 - 0.15, y0 = -box.h / 2 - 0.15 + box.oy, bw = box.w + 0.3, bh = box.h + 0.3;
        ctx.setLineDash([8 / ppi, 5 / ppi]); ctx.lineWidth = 2 / ppi;
        ctx.strokeStyle = '#ffffff'; ctx.strokeRect(x0, y0, bw, bh);
        ctx.lineDashOffset = 8 / ppi; ctx.strokeStyle = '#1f3a93'; ctx.strokeRect(x0, y0, bw, bh);
        ctx.setLineDash([]);
        /* The handles: a square at the bottom-right corner to resize, a
           circle above the top edge to rotate, a red x at the top-right
           corner to remove. */
        const hs = HANDLE.size;
        ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#1f3a93'; ctx.lineWidth = 2 / ppi;
        ctx.fillRect(x0 + bw - hs / 2, y0 + bh - hs / 2, hs, hs); ctx.strokeRect(x0 + bw - hs / 2, y0 + bh - hs / 2, hs, hs);
        ctx.beginPath(); ctx.moveTo(0, y0); ctx.lineTo(0, y0 - HANDLE.rotateGap + hs / 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, y0 - HANDLE.rotateGap, hs / 2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        const dx = x0 + bw, dr = hs * 0.6, k = hs * 0.25;
        ctx.beginPath(); ctx.arc(dx, y0, dr, 0, Math.PI * 2); ctx.fillStyle = '#b3261e'; ctx.fill();
        ctx.strokeStyle = '#ffffff'; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(dx - k, y0 - k); ctx.lineTo(dx + k, y0 + k); ctx.moveTo(dx + k, y0 - k); ctx.lineTo(dx - k, y0 + k); ctx.stroke();
        ctx.restore();
      }
    }
    c.classList.toggle('active', !design.same && key === active && order.product === 'set');
    /* With something selected the board takes the touch so it can be
       dragged; with nothing selected a finger on it scrolls the page. A
       picture filling the board is never dragged, so with it selected
       the board still scrolls the page. */
    c.classList.toggle('grabbable', Boolean(el && editingHere && !fills(el)));
  }
}

/* Offscreen output must not replace the live editor's hit-testing geometry. */
function renderOutput(ctx, board, ppi, options) {
  const liveBoxes = new Map(boxes), livePpi = curPpi, livePrinting = printing;
  try { renderBoard(ctx, board, ppi, options); }
  finally {
    boxes.clear();
    for (const [id, box] of liveBoxes) boxes.set(id, box);
    curPpi = livePpi; printing = livePrinting;
  }
}

/* The print file: 100 pixels per inch, no bevel, hole marked by a hairline,
   pictures drawn from their masters. Call preloadImages first. */
function printCanvas(key, source = design) {
  const c = document.createElement('canvas');
  c.width = BOARD.w * PRINT_PPI; c.height = BOARD.h * PRINT_PPI;
  renderOutput(c.getContext('2d'), boardFor(key, source), PRINT_PPI, { print: true });
  return c;
}
function previewDataUrl(key, ppi = 10, source = design) {
  const c = document.createElement('canvas');
  c.width = BOARD.w * ppi; c.height = BOARD.h * ppi;
  renderOutput(c.getContext('2d'), boardFor(key, source), ppi);
  return c.toDataURL('image/png');
}
let readCanvases = null;
/* Draws a board at READ_PPI an item at a time, in layer order: the base,
   the pattern and a picture filling the board, then the items. Each text
   with words and each clip art is handed to visit with the colours under
   its ink (inkBackdrop), the hole cut out of it, and is drawn onto the
   board after the visit, so a visit may change its colour first. Drawing
   sets the hit boxes and the scale the shadows use; the live board's are
   put back after, as renderOutput does. */
function readBoard(b, visit) {
  const W = BOARD.w * READ_PPI, H = BOARD.h * READ_PPI;
  if (!readCanvases) readCanvases = [0, 1].map(() => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; });
  const [under, alone] = readCanvases.map((c) => c.getContext('2d', { willReadFrequently: true }));
  if (!under || !alone) return;
  const liveBoxes = new Map(boxes), livePpi = curPpi, livePrinting = printing;
  curPpi = READ_PPI; printing = false;
  try {
    under.setTransform(1, 0, 0, 1, 0, 0); under.clearRect(0, 0, W, H);
    under.save(); under.scale(READ_PPI, READ_PPI); boardPath(under); under.clip();
    drawBase(under, b.base); drawPattern(under, b.pattern);
    const cover = coverOf(b);
    if (cover) drawImage(under, cover);
    for (const el of b.elements) {
      if (el === cover) continue;
      const draw = DRAWERS[el.type];
      if (!draw) continue;
      if ((el.type === 'text' && el.text.trim()) || el.type === 'clip') {
        alone.setTransform(1, 0, 0, 1, 0, 0); alone.clearRect(0, 0, W, H);
        alone.save(); alone.scale(READ_PPI, READ_PPI); boardPath(alone); alone.clip();
        draw(alone, el);
        alone.globalCompositeOperation = 'destination-out';
        alone.beginPath(); alone.arc(BOARD.w / 2, BOARD.hole.cy, BOARD.hole.d / 2, 0, Math.PI * 2); alone.fill();
        alone.restore();
        visit(el, inkBackdrop(under, alone, el));
      }
      draw(under, el);
    }
    under.restore();
  } finally {
    boxes.clear();
    for (const [id, box] of liveBoxes) boxes.set(id, box);
    curPpi = livePpi; printing = livePrinting;
  }
}

export {
  boxes, imgCache, imageFor, imageLoaded, preloadImages, boardPath, drawBase,
  drawPattern, drawText, drawImage, HANDLE, handleSpots, showsSelection,
  handlePoints, guides, render, paint, renderOutput, printCanvas,
  previewDataUrl, readBoard
};
