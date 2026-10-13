import { PRICING, quote, money } from './lib/price.mjs';
import { CLIPS, CLIP_CATS, heart, prng } from './lib/clips.mjs';
import { makeTemplates } from './lib/templates.mjs';

/* ====================================================================
   THE BOARD, IN INCHES. Everything about a design is stored in inches on
   a 24 x 48 board, never in pixels, so the same render function draws the
   480-pixel preview and the 2400 x 4800 print file by changing one scale.
   ==================================================================== */
const BOARD = Object.freeze({ w: 24, h: 48, hole: { d: 6, cy: 9 }, radius: 0.6 });
const PRINT_PPI = 100;
const DESIGN_VERSION = 2;

const PAINTS = ['#1f3a93', '#1e5bc6', '#4fa3e3', '#0f8b8d', '#1f7a3a', '#7ac943', '#f2b705', '#ffe44d', '#f26b1d', '#c8102e',
                '#6b1d2b', '#e75480', '#5b2a86', '#8d8d8d', '#36393b', '#111111', '#f5f5f0', '#ffffff', '#0b1b3a', '#2e7d32'];
const PAINTS_SOFT = ['#f4c2c2', '#d8a1a6', '#b48ea0', '#c9b7dc', '#9caf88', '#6b8f71', '#8fa9c4', '#5d7a8c', '#f1e3c6', '#fffaf0',
                     '#f5f0e6', '#b8a089', '#6e1423', '#0f6b4a', '#1f4d2e', '#c66a47', '#d4a017', '#b87333', '#d8b25c', '#c0c0c0'];
const STAINS = {
  natural: { label: 'Natural', color: '#dcb98a', grain: '#8a5a2b' },
  honey:   { label: 'Honey',   color: '#c68f4a', grain: '#6e4414' },
  cherry:  { label: 'Cherry',  color: '#8b3a2a', grain: '#3f160e' },
  walnut:  { label: 'Walnut',  color: '#5a3a24', grain: '#2a170c' },
  grey:    { label: 'Driftwood', color: '#8d8a82', grain: '#4c4943' },
  ebony:   { label: 'Ebony',   color: '#2b2622', grain: '#0d0b0a' },
};
/* Every family in the <link> above, with the weight that was loaded, so
   the canvas asks for the face that exists rather than a synthesised one. */
const FONTS = [
  ['Bold and sporty', [['Anton', 400], ['Archivo Black', 400], ['Bebas Neue', 400], ['Oswald', 700], ['Alfa Slab One', 400], ['Black Ops One', 400], ['Bungee', 400], ['Righteous', 400], ['Impact', 400]]],
  ['Script and wedding', [['Great Vibes', 400], ['Parisienne', 400], ['Allura', 400], ['Sacramento', 400], ['Tangerine', 700], ['Dancing Script', 700], ['Satisfy', 400], ['Pacifico', 400], ['Lobster', 400], ['Kaushan Script', 400], ['Courgette', 400]]],
  ['Elegant serif', [['Playfair Display', 700], ['Cinzel', 700], ['Cormorant Garamond', 600], ['Libre Baskerville', 700], ['Abril Fatface', 400], ['Georgia', 700]]],
  ['Modern', [['Montserrat', 800], ['Poppins', 700], ['Raleway', 800], ['Fredoka', 700]]],
  ['Fun', [['Bangers', 400], ['Luckiest Guy', 400], ['Permanent Marker', 400], ['Chewy', 400], ['Rye', 400], ['Special Elite', 400], ['Monoton', 400], ['Press Start 2P', 400]]],
];
const FONT_WEIGHT = Object.fromEntries(FONTS.flatMap(([, fs]) => fs));
const PATTERNS = {
  none: 'None', top: 'Top half', bottom: 'Bottom half', left: 'Left half', right: 'Right half', diagonal: 'Diagonal split',
  stripes: 'Stripes', vstripes: 'Vertical stripes', dstripes: 'Diagonal stripes', border: 'Border', checker: 'Checkerboard',
  plaid: 'Buffalo check', dots: 'Polka dots', diamonds: 'Diamonds', hearts: 'Hearts', chevron: 'Chevrons',
  rings: 'Rings around the hole', sunburst: 'Sunburst from the hole', cross: 'Cross',
};
const OCCASIONS = { wedding: 'A wedding', anniversary: 'An anniversary', birthday: 'A birthday', family: 'The family', business: 'A business', team: 'A team or school', holiday: 'A holiday', other: 'Just because' };
const US_STATES = 'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ');
const MAX_IMAGES = 4, MAX_TEXTS = 10, MAX_CLIPS = 12, MAX_IMAGE_BYTES = 1_500_000;

const $ = (id) => document.getElementById(id);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const uid = () => 'e' + Math.random().toString(36).slice(2, 8);
const rad = (d) => d * Math.PI / 180;
const r1 = (v) => Math.round(v * 10) / 10;


/* ====================================================================
   STATE
   ==================================================================== */
const TEXT_DEFAULTS = { outline: '#111111', outlineWidth: 0, rotation: 0, arc: 0, spacing: 0, shadow: false };
const IMAGE_DEFAULTS = { rotation: 0, opacity: 1, flipH: false, circleCrop: false, knockout: false };
const CLIP_DEFAULTS = { color: '#f5f5f0', outline: '#111111', outlineWidth: 0, rotation: 0, opacity: 1, flipH: false, width: 8 };
function withDefaults(el) {
  const d = el.type === 'text' ? TEXT_DEFAULTS : el.type === 'image' ? IMAGE_DEFAULTS : CLIP_DEFAULTS;
  return { ...d, ...el, id: el.id || uid() };
}
const T = (text, o) => withDefaults({ type: 'text', text, font: 'Anton', size: 4, color: '#f5f5f0', x: 12, y: 30, ...o });
const C = (name, o) => withDefaults({ type: 'clip', name, x: 12, y: 20, ...o });

function freshBoard(o = {}) {
  return {
    base: { kind: 'paint', color: '#1f3a93', color2: '#4fa3e3', angle: 180, stain: 'walnut', ...(o.base || {}) },
    pattern: { kind: 'none', color: '#f5f5f0', size: 3, ...(o.pattern || {}) },
    elements: (o.elements || []).map(withDefaults),
  };
}
function freshDesign() {
  return { version: DESIGN_VERSION, same: true, a: freshBoard({ elements: [T('YOUR TEAM', {})] }), b: freshBoard() };
}
/* Designs saved by the first version of the page, and designs handed in
   by tests, are brought up to date rather than refused. */
function migrate(d) {
  if (!d || !d.a || !d.b) return freshDesign();
  const out = { version: DESIGN_VERSION, same: d.same !== false, a: freshBoard(d.a), b: freshBoard(d.b) };
  return out;
}

const TEMPLATES = makeTemplates({ T, C, freshBoard });

let design = freshDesign();
let active = 'a';           // which board the panel edits
let selected = null;        // element id, on the active board
let history = [], future = [];
const order = { product: 'set', quantity: 1, finish: 'satin', bags: 'none', bagColors: ['#c8102e', '#1f3a93'], rush: false, carryCase: false, occasion: 'other', needBy: '', giftNote: '' };

const activeBoard = () => design[active];
const boardFor = (key) => design[design.same ? 'a' : key];
const findEl = (id) => activeBoard().elements.find((e) => e.id === id) || null;
const selectedEl = () => (selected ? findEl(selected) : null);
const countOf = (b, type) => b.elements.filter((e) => e.type === type).length;
const limitOf = (type) => ({ text: MAX_TEXTS, image: MAX_IMAGES, clip: MAX_CLIPS })[type];

/* ====================================================================
   RENDERING. ctx is scaled so one unit is one inch.
   ==================================================================== */
const boxes = new Map();  // element id -> { w, h, oy } in inches, from the last render, for hit testing
const imgCache = new Map();
let curPpi = 20;

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
  const s = clamp(Number(p.size) || 3, 0.5, 12), w = BOARD.w, h = BOARD.h;
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

/* Text: straight, or bent along an arc. Each glyph is measured, so a bent
   word keeps its spacing, and the hit box is the chord plus the sagitta. */
function drawText(ctx, el) {
  ctx.save();
  ctx.translate(el.x, el.y);
  ctx.rotate(rad(el.rotation));
  ctx.font = fontString(el);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const m = ctx.measureText(el.text);
  const asc = m.actualBoundingBoxAscent || el.size * 0.7, desc = m.actualBoundingBoxDescent || el.size * 0.2;
  const dy = (asc - desc) / 2;   // centre the ink, not the em box
  const ow = el.outlineWidth || 0, spacing = el.spacing || 0, arc = el.arc || 0;
  const chars = [...el.text], widths = chars.map((c) => ctx.measureText(c).width);
  const total = (spacing || arc) ? widths.reduce((n, w) => n + w, 0) + spacing * (chars.length - 1) : m.width;
  const draw = (str, x, y, rot) => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    if (el.shadow) { ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 0.1 * curPpi; ctx.shadowOffsetX = 0.07 * curPpi; ctx.shadowOffsetY = 0.09 * curPpi; }
    if (ow > 0) { ctx.lineJoin = 'round'; ctx.lineWidth = ow * 2; ctx.strokeStyle = el.outline; ctx.strokeText(str, 0, dy); ctx.shadowColor = 'transparent'; }
    ctx.fillStyle = el.color; ctx.fillText(str, 0, dy);
    ctx.restore();
  };
  if (!arc && !spacing) {
    draw(el.text, 0, 0, 0);
    boxes.set(el.id, { w: Math.max(0.5, total + 2 * ow), h: Math.max(0.5, asc + desc + 2 * ow), oy: 0 });
  } else if (!arc) {
    let x = -total / 2;
    chars.forEach((c, i) => { draw(c, x + widths[i] / 2, 0, 0); x += widths[i] + spacing; });
    boxes.set(el.id, { w: Math.max(0.5, total + 2 * ow), h: Math.max(0.5, asc + desc + 2 * ow), oy: 0 });
  } else {
    const theta = rad(Math.abs(arc)), r = total / theta, up = arc > 0 ? 1 : -1;
    let s = -total / 2;
    chars.forEach((c, i) => {
      const phi = (s + widths[i] / 2) / r;
      draw(c, r * Math.sin(phi), up * (r - r * Math.cos(phi)), up * phi);
      s += widths[i] + spacing;
    });
    const chord = 2 * r * Math.sin(Math.min(theta, Math.PI) / 2), sag = r * (1 - Math.cos(Math.min(theta, Math.PI) / 2));
    boxes.set(el.id, { w: Math.max(0.5, chord + asc + desc + 2 * ow), h: Math.max(0.5, sag + asc + desc + 2 * ow), oy: up * sag / 2 });
  }
  ctx.restore();
}

function drawImage(ctx, el) {
  const img = el.knockout ? knockedOut(el.src) : imageFor(el.src);
  const iw = img ? (img.naturalWidth || img.width) : 1, ih = img ? (img.naturalHeight || img.height) : 1;
  let w = el.width, h = img ? w * ih / iw : w;
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
  curPpi = ppi;
  ctx.save();
  ctx.scale(ppi, ppi);
  boardPath(ctx);
  ctx.clip();
  drawBase(ctx, b.base);
  drawPattern(ctx, b.pattern);
  for (const el of b.elements) (DRAWERS[el.type] || (() => {}))(ctx, el);
  drawHole(ctx, print);
  if (!print) {
    /* A soft bevel so the preview reads as an object, not a flat rectangle. */
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = 'rgba(0,0,0,.22)';
    boardPath(ctx); ctx.stroke();
  }
  ctx.restore();
}

const HANDLE = { size: 0.6, rotateGap: 0.9, hit: 0.9 };
const guides = { v: false, h: false };
let raf = 0;
function render() { if (!raf) raf = requestAnimationFrame(paint); }
function paint() {
  raf = 0;
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
    const el = selectedEl();
    const editingHere = design.same ? key === 'a' : key === active;
    if (el && editingHere) {
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
           circle above the top edge to rotate. */
        const hs = HANDLE.size;
        ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#1f3a93'; ctx.lineWidth = 2 / ppi;
        ctx.fillRect(x0 + bw - hs / 2, y0 + bh - hs / 2, hs, hs); ctx.strokeRect(x0 + bw - hs / 2, y0 + bh - hs / 2, hs, hs);
        ctx.beginPath(); ctx.moveTo(0, y0); ctx.lineTo(0, y0 - HANDLE.rotateGap + hs / 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, y0 - HANDLE.rotateGap, hs / 2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.restore();
      }
    }
    c.classList.toggle('active', !design.same && key === active && order.product === 'set');
  }
}

/* The print file: 100 pixels per inch, no bevel, hole marked by a hairline. */
function printCanvas(key) {
  const c = document.createElement('canvas');
  c.width = BOARD.w * PRINT_PPI; c.height = BOARD.h * PRINT_PPI;
  renderBoard(c.getContext('2d'), boardFor(key), PRINT_PPI, { print: true });
  return c;
}
function previewDataUrl(key, ppi = 10) {
  const c = document.createElement('canvas');
  c.width = BOARD.w * ppi; c.height = BOARD.h * ppi;
  renderBoard(c.getContext('2d'), boardFor(key), ppi);
  return c.toDataURL('image/png');
}

/* ====================================================================
   HISTORY AND SAVING
   ==================================================================== */
const snapshot = () => JSON.stringify(design);
function commit() {
  const s = snapshot();
  if (history[history.length - 1] === s) return;
  history.push(s); if (history.length > 60) history.shift();
  future = [];
  save();
  syncHistoryButtons();
}
function restore(s) { design = JSON.parse(s); if (!findEl(selected)) selected = null; save(); syncAll(); }
function undo() { if (history.length < 2) return; future.push(history.pop()); restore(history[history.length - 1]); }
function redo() { if (!future.length) return; const s = future.pop(); history.push(s); restore(s); }
function syncHistoryButtons() { $('undo').disabled = history.length < 2; $('redo').disabled = !future.length; }

const SAVE_KEY = 'cornhole.design.v1';
function save() {
  try { localStorage.setItem(SAVE_KEY, snapshot()); }
  catch (_) {
    /* Over quota - the images are what is big. Keep the rest, so a reload
       loses the pictures and not the whole evening's work. */
    try {
      const lean = JSON.parse(snapshot());
      for (const k of ['a', 'b']) lean[k].elements = lean[k].elements.filter((e) => e.type !== 'image');
      localStorage.setItem(SAVE_KEY, JSON.stringify(lean));
    } catch (_2) {}
  }
}
function load() {
  try {
    const s = localStorage.getItem(SAVE_KEY);
    if (!s) return false;
    const d = JSON.parse(s);
    if (d && d.a && d.b) { design = migrate(d); return true; }
  } catch (_) {}
  return false;
}

/* ====================================================================
   POINTER: pick up, drag, resize and rotate elements on the preview
   ==================================================================== */
function toLocal(el, ix, iy) {
  const a = -rad(el.rotation), dx = ix - el.x, dy = iy - el.y;
  return { x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a) };
}
function hitTest(b, ix, iy) {
  for (let i = b.elements.length - 1; i >= 0; i--) {
    const el = b.elements[i], box = boxes.get(el.id);
    if (!box) continue;
    const l = toLocal(el, ix, iy);
    const hw = Math.max(box.w, 1) / 2 + 0.2, hh = Math.max(box.h, 1) / 2 + 0.2;
    if (Math.abs(l.x) <= hw && Math.abs(l.y - box.oy) <= hh) return el;
  }
  return null;
}
function handleAt(el, ix, iy) {
  const box = boxes.get(el.id); if (!box) return null;
  const l = toLocal(el, ix, iy);
  const rx = box.w / 2 + 0.15, ry = box.h / 2 + 0.15 + box.oy;
  if (Math.hypot(l.x - rx, l.y - ry) <= HANDLE.hit) return 'resize';
  if (Math.hypot(l.x, l.y - (-box.h / 2 - 0.15 + box.oy - HANDLE.rotateGap)) <= HANDLE.hit) return 'rotate';
  return null;
}
function toInches(c, ev) {
  const r = c.getBoundingClientRect();
  return { x: (ev.clientX - r.left) / r.width * BOARD.w, y: (ev.clientY - r.top) / r.height * BOARD.h };
}
const sizeKey = (el) => (el.type === 'text' ? 'size' : 'width');
const sizeMax = (el) => (el.type === 'text' ? 16 : 24);
let drag = null;
for (const c of [$('canvasA'), $('canvasB')]) {
  c.addEventListener('pointerdown', (ev) => {
    const key = c.dataset.board;
    if (!design.same && order.product === 'set' && key !== active) setActive(key);
    const p = toInches(c, ev);
    const sel = selectedEl();
    const handle = sel && (design.same ? key === 'a' : key === active) ? handleAt(sel, p.x, p.y) : null;
    let el = sel;
    if (!handle) { el = hitTest(activeBoard(), p.x, p.y); select(el ? el.id : null); }
    if (!el) return;
    const box = boxes.get(el.id) || { oy: 0 };
    const l = toLocal(el, p.x, p.y);
    drag = { id: el.id, mode: handle || 'move', dx: el.x - p.x, dy: el.y - p.y, moved: false,
      d0: Math.max(0.2, Math.hypot(l.x, l.y - box.oy)), size0: el[sizeKey(el)] };
    c.setPointerCapture(ev.pointerId);
    c.classList.add('dragging');
    ev.preventDefault();
  });
  c.addEventListener('pointermove', (ev) => {
    if (!drag) return;
    const el = findEl(drag.id); if (!el) return;
    const p = toInches(c, ev);
    if (drag.mode === 'move') {
      let x = clamp(r1(p.x + drag.dx), -4, BOARD.w + 4), y = clamp(r1(p.y + drag.dy), -4, BOARD.h + 4);
      /* Snap to the board's centre lines, and show them while it is snapped. */
      guides.v = Math.abs(x - BOARD.w / 2) < 0.35; if (guides.v) x = BOARD.w / 2;
      guides.h = Math.abs(y - BOARD.h / 2) < 0.35; if (guides.h) y = BOARD.h / 2;
      el.x = x; el.y = y;
    } else if (drag.mode === 'resize') {
      const box = boxes.get(el.id) || { oy: 0 }, l = toLocal(el, p.x, p.y);
      const k = Math.hypot(l.x, l.y - box.oy) / drag.d0;
      el[sizeKey(el)] = clamp(Math.round(drag.size0 * k * 20) / 20, 0.5, sizeMax(el));
    } else {
      let a = Math.atan2(p.y - el.y, p.x - el.x) * 180 / Math.PI + 90;
      a = ((a + 180) % 360 + 360) % 360 - 180;
      for (const snap of [-180, -90, 0, 90, 180]) if (Math.abs(a - snap) < 4) a = snap;
      el.rotation = Math.round(a === -180 ? 180 : a);
    }
    drag.moved = true;
    render(); syncProps();
  });
  const end = () => { if (!drag) return; const moved = drag.moved; drag = null; guides.v = guides.h = false; c.classList.remove('dragging'); render(); if (moved) commit(); };
  c.addEventListener('pointerup', end);
  c.addEventListener('pointercancel', end);
}
document.addEventListener('keydown', (ev) => {
  const t = ev.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') { ev.preventDefault(); ev.shiftKey ? redo() : undo(); return; }
  const el = selectedEl(); if (!el) return;
  const step = ev.shiftKey ? 1 : 0.1;
  const nudge = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[ev.key];
  if (nudge) { el.x = r1(el.x + nudge[0]); el.y = r1(el.y + nudge[1]); render(); syncProps(); commit(); ev.preventDefault(); }
  else if (ev.key === '+' || ev.key === '=' || ev.key === '-') {
    const k = sizeKey(el); el[k] = clamp(Math.round(el[k] * (ev.key === '-' ? 0.95 : 1.05) * 20) / 20, 0.5, sizeMax(el));
    render(); syncProps(); commit(); ev.preventDefault();
  }
  else if (ev.key === 'Delete' || ev.key === 'Backspace') { removeElement(el.id); ev.preventDefault(); }
});

/* ====================================================================
   PANEL
   ==================================================================== */
function chips(id, onPick) {
  const box = $(id);
  box.addEventListener('click', (ev) => {
    const b = ev.target.closest('.chip'); if (!b || !box.contains(b)) return;
    setChip(id, b.dataset.v); onPick(b.dataset.v);
  });
}
function setChip(id, v) { for (const b of $(id).querySelectorAll('.chip')) b.setAttribute('aria-pressed', String(b.dataset.v === v)); }
function setRange(id, v, label) { $(id).value = v; $(id + 'val').textContent = label; }

function setActive(key) { active = key; selected = null; setChip('which', key); syncAll(); }
function select(id) { selected = id; render(); syncLists(); syncProps(); }
function showTab(name) {
  for (const b of document.querySelectorAll('.tabs [role=tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === name));
  for (const p of document.querySelectorAll('.pane')) p.dataset.open = String(p.id === 'tab-' + name);
}
document.querySelector('.tabs').addEventListener('click', (ev) => { const b = ev.target.closest('[role=tab]'); if (b) showTab(b.dataset.tab); });

// -- templates
function applyTemplate(id) {
  const t = TEMPLATES.find((x) => x.id === id); if (!t) return;
  design = { version: DESIGN_VERSION, same: true, a: t.board(), b: freshBoard() };
  selected = null; active = 'a';
  order.occasion = t.occasion;
  syncAll(); commit(); showTab('text');
}
for (const t of TEMPLATES) {
  const b = document.createElement('button'); b.className = 'tpl'; b.type = 'button'; b.dataset.id = t.id;
  const c = document.createElement('canvas'); c.width = 64 * 2; c.height = 128 * 2;
  renderBoard(c.getContext('2d'), t.board(), 128 * 2 / BOARD.h);
  const s = document.createElement('span'); s.textContent = t.label;
  b.append(c, s);
  b.addEventListener('click', () => {
    const untouched = history.length < 2;
    if (untouched || confirm('Replace your current design with the ' + t.label + ' template?')) applyTemplate(t.id);
  });
  $('templates').appendChild(b);
}

// -- board tab
function swatch(parent, v, title, extra) {
  const b = document.createElement('button'); b.type = 'button'; b.className = 'sw' + (extra ? ' ' + extra : ''); b.dataset.v = v; b.title = title; parent.appendChild(b); return b;
}
for (const hex of PAINTS) swatch($('paints'), hex, hex).style.background = hex;
for (const hex of PAINTS_SOFT) swatch($('paints2'), hex, hex).style.background = hex;
for (const [k, st] of Object.entries(STAINS)) swatch($('stains'), k, st.label, 'stain').style.backgroundColor = st.color;
for (const [k, label] of Object.entries(PATTERNS)) { const o = document.createElement('option'); o.value = k; o.textContent = label; $('pattern').appendChild(o); }
const pickPaint = (ev) => {
  const b = ev.target.closest('.sw'); if (!b) return;
  const base = activeBoard().base; base.color = b.dataset.v; if (base.kind === 'wood') base.kind = 'paint';
  syncBoard(); render(); commit();
};
$('paints').addEventListener('click', pickPaint);
$('paints2').addEventListener('click', pickPaint);
$('stains').addEventListener('click', (ev) => { const b = ev.target.closest('.sw'); if (!b) return; activeBoard().base.stain = b.dataset.v; activeBoard().base.kind = 'wood'; syncBoard(); render(); commit(); });
$('paintcustom').addEventListener('input', () => { const base = activeBoard().base; base.color = $('paintcustom').value; if (base.kind === 'wood') base.kind = 'paint'; syncBoard(); render(); });
$('paintcustom').addEventListener('change', commit);
$('paint2').addEventListener('input', () => { activeBoard().base.color2 = $('paint2').value; render(); });
$('paint2').addEventListener('change', commit);
$('gradangle').addEventListener('input', () => { activeBoard().base.angle = Number($('gradangle').value); $('gradangleval').textContent = $('gradangle').value + '°'; render(); });
$('gradangle').addEventListener('change', commit);
chips('basekind', (v) => { activeBoard().base.kind = v; syncBoard(); render(); commit(); });
$('pattern').addEventListener('change', () => { activeBoard().pattern.kind = $('pattern').value; syncBoard(); render(); commit(); });
$('patcolor').addEventListener('input', () => { activeBoard().pattern.color = $('patcolor').value; render(); });
$('patcolor').addEventListener('change', commit);
$('patsize').addEventListener('input', () => { activeBoard().pattern.size = Number($('patsize').value); $('patsizeval').textContent = $('patsize').value + '"'; render(); });
$('patsize').addEventListener('change', commit);
$('same').addEventListener('change', () => {
  design.same = $('same').checked;
  if (!design.same && !design.b.elements.length && JSON.stringify(design.b) === JSON.stringify(freshBoard())) {
    /* Splitting the boards starts B as a copy of A, with fresh ids, so the
       person edits from what they have rather than from a blank board. */
    design.b = JSON.parse(JSON.stringify(design.a));
    for (const e of design.b.elements) e.id = uid();
  }
  if (design.same) setActive('a'); else syncAll();
  commit();
});
chips('which', (v) => setActive(v));

function syncBoard() {
  const b = activeBoard();
  setChip('basekind', b.base.kind);
  $('paintopts').hidden = b.base.kind === 'wood';
  $('gradopts').hidden = b.base.kind !== 'gradient';
  $('woodopts').hidden = b.base.kind !== 'wood';
  for (const s of document.querySelectorAll('#paints .sw, #paints2 .sw')) s.setAttribute('aria-pressed', String(b.base.kind !== 'wood' && s.dataset.v === b.base.color));
  for (const s of $('stains').querySelectorAll('.sw')) s.setAttribute('aria-pressed', String(b.base.kind === 'wood' && s.dataset.v === b.base.stain));
  if (/^#[0-9a-f]{6}$/i.test(b.base.color)) $('paintcustom').value = b.base.color;
  if (/^#[0-9a-f]{6}$/i.test(b.base.color2 || '')) $('paint2').value = b.base.color2;
  $('paintval').textContent = b.base.color;
  $('gradangle').value = b.base.angle; $('gradangleval').textContent = b.base.angle + '°';
  $('pattern').value = b.pattern.kind;
  $('patcolor').value = b.pattern.color;
  $('patsize').value = b.pattern.size; $('patsizeval').textContent = b.pattern.size + '"';
  $('patternopts').style.visibility = b.pattern.kind === 'none' ? 'hidden' : 'visible';
  $('same').checked = design.same;
  const twoBoards = order.product === 'set';
  $('samerow').hidden = !twoBoards;
  $('whichrow').hidden = design.same || !twoBoards;
  $('boardB').classList.toggle('hidden', !twoBoards);
  $('boardB').querySelector('.label').textContent = design.same ? 'Board B (same as A)' : 'Board B';
  for (const s of document.querySelectorAll('.activename')) s.textContent = (design.same || !twoBoards) ? 'your board' : 'board ' + active.toUpperCase();
}

// -- text tab
for (const [cat, fonts] of FONTS) {
  const g = document.createElement('optgroup'); g.label = cat;
  for (const [f] of fonts) { const o = document.createElement('option'); o.value = f; o.textContent = f; o.style.fontFamily = '"' + f + '"'; g.appendChild(o); }
  $('tfont').appendChild(g);
}
function addElement(el, tab) {
  const b = activeBoard();
  if (countOf(b, el.type) >= limitOf(el.type)) { alert('Up to ' + limitOf(el.type) + ' of those per board.'); return null; }
  b.elements.push(el); select(el.id); if (tab) showTab(tab); commit();
  return el;
}
$('addtext').addEventListener('click', () => {
  const b = activeBoard();
  const el = addElement(T('NEW TEXT', { size: 3, y: 36, color: b.base.kind === 'wood' ? '#36393b' : '#f5f5f0' }), 'text');
  if (el) { $('ttext').focus(); $('ttext').select(); }
});
const field = (id, key, map = (v) => v, label = null) => {
  $(id).addEventListener('input', () => { const el = selectedEl(); if (!el) return; el[key] = map($(id).value); if (label) $(id + 'val').textContent = label(el[key]); render(); syncLists(); });
  $(id).addEventListener('change', commit);
};
const toggle = (id, key) => {
  $(id).addEventListener('change', () => { const el = selectedEl(); if (!el) return; el[key] = $(id).checked; render(); commit(); });
};
const inch = (v) => v + '"', deg = (v) => v + '°';
field('ttext', 'text', (v) => v || ' ');
field('tfont', 'font');
field('tsize', 'size', Number, inch);
field('tcolor', 'color');
field('toutline', 'outline');
field('toutlinew', 'outlineWidth', Number, inch);
field('tarc', 'arc', Number, deg);
field('tspacing', 'spacing', Number, inch);
field('trot', 'rotation', Number, deg);
field('tx', 'x', Number, inch);
field('ty', 'y', Number, inch);
toggle('tshadow', 'shadow');
$('tdel').addEventListener('click', () => { if (selected) removeElement(selected); });
$('tcopy').addEventListener('click', copyToOther);
$('tdup').addEventListener('click', duplicate);
$('tforward').addEventListener('click', () => moveLayer(1));
$('tback').addEventListener('click', () => moveLayer(-1));

// -- art tab: pictures and clip art
$('addimage').addEventListener('change', async () => {
  const f = $('addimage').files[0]; $('addimage').value = '';
  if (!f) return;
  if (countOf(activeBoard(), 'image') >= MAX_IMAGES) { alert('Up to ' + MAX_IMAGES + ' pictures per board.'); return; }
  try {
    const src = await shrinkImage(f);
    addElement(withDefaults({ type: 'image', src, width: 10, x: 12, y: 30 }), 'art');
  } catch (e) { alert('Could not read that image: ' + (e && e.message ? e.message : e)); }
});
/* Shrunk before it is kept: a phone photo is 12 MB and the whole order has
   to travel in one request. 1600 px on the long side prints at 100 ppi
   across a 16" logo, which is as big as a logo on a 24" board gets. */
async function shrinkImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('not an image')); i.src = url; });
    const isPhoto = /jpe?g/i.test(file.type);
    let side = 1600, out;
    for (let tries = 0; tries < 5; tries++) {
      const k = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      out = isPhoto ? c.toDataURL('image/jpeg', 0.88) : c.toDataURL('image/png');
      if (out.length <= MAX_IMAGE_BYTES * 1.37) return out;
      side = Math.round(side * 0.7);
    }
    return out;
  } finally { URL.revokeObjectURL(url); }
}
field('iwidth', 'width', Number, inch);
field('irot', 'rotation', Number, deg);
field('iopacity', 'opacity', Number, (v) => Math.round(v * 100) + '%');
field('ix', 'x', Number, inch);
field('iy', 'y', Number, inch);
toggle('iflip', 'flipH'); toggle('icircle', 'circleCrop'); toggle('iknockout', 'knockout');
field('ccolor', 'color'); field('coutline', 'outline'); field('coutlinew', 'outlineWidth', Number, inch);
toggle('cflip', 'flipH');
$('idel').addEventListener('click', () => { if (selected) removeElement(selected); });
$('icopy').addEventListener('click', copyToOther);
$('idup').addEventListener('click', duplicate);
$('iforward').addEventListener('click', () => moveLayer(1));
$('iback').addEventListener('click', () => moveLayer(-1));

let clipCat = 'love';
function clipThumb(name, color = '#1d1b18') {
  const def = CLIPS[name], c = document.createElement('canvas'); c.width = c.height = 72;
  const g = c.getContext('2d'); g.scale(0.72, 0.72);
  const p = new Path2D(); def.path(p); g.lineJoin = g.lineCap = 'round';
  if (def.mode === 'stroke') { g.lineWidth = def.lw || 8; g.strokeStyle = color; g.stroke(p); } else { g.fillStyle = color; g.fill(p, def.rule || 'nonzero'); }
  return c;
}
function fillClips() {
  const box = $('clips'); box.textContent = '';
  for (const [name, def] of Object.entries(CLIPS)) {
    if (def.cat !== clipCat) continue;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'clip'; b.dataset.name = name; b.title = def.label;
    b.appendChild(clipThumb(name)); box.appendChild(b);
  }
}
for (const [k, label] of Object.entries(CLIP_CATS)) { const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.dataset.v = k; b.textContent = label; b.setAttribute('aria-pressed', String(k === clipCat)); $('clipcats').appendChild(b); }
chips('clipcats', (v) => { clipCat = v; fillClips(); });
fillClips();
function addClip(name, o = {}) {
  if (!CLIPS[name]) return null;
  const b = activeBoard();
  const color = b.base.kind === 'wood' || b.base.color === '#fffaf0' || b.base.color === '#f5f0e6' || b.base.color === '#ffffff' ? '#36393b' : '#f5f5f0';
  return addElement(C(name, { color, width: 8, x: 12, y: 36, ...o }), 'art');
}
$('clips').addEventListener('click', (ev) => { const b = ev.target.closest('.clip'); if (b) addClip(b.dataset.name); });

function removeElement(id) {
  const b = activeBoard();
  b.elements = b.elements.filter((e) => e.id !== id);
  if (selected === id) selected = null;
  render(); syncLists(); syncProps(); commit();
}
function copyToOther() {
  const el = selectedEl(); if (!el || design.same) return;
  const other = design[active === 'a' ? 'b' : 'a'];
  if (countOf(other, el.type) >= limitOf(el.type)) return;
  other.elements.push({ ...JSON.parse(JSON.stringify(el)), id: uid() });
  render(); commit();
}
function duplicate() {
  const el = selectedEl(); if (!el) return;
  const copy = { ...JSON.parse(JSON.stringify(el)), id: uid(), x: r1(el.x + 1), y: r1(el.y + 1) };
  addElement(copy, null);
}
function moveLayer(dir) {
  const el = selectedEl(); if (!el) return;
  const els = activeBoard().elements, i = els.indexOf(el), j = i + dir;
  if (j < 0 || j >= els.length) return;
  els.splice(i, 1); els.splice(j, 0, el);
  render(); syncLists(); commit();
}

function itemButton(el, pressed, onClick) {
  const b = document.createElement('button'); b.className = 'item'; b.type = 'button'; b.dataset.id = el.id; b.setAttribute('aria-pressed', String(pressed));
  const t = document.createElement('span'); t.className = 'thumb';
  if (el.type === 'image') t.style.backgroundImage = 'url("' + el.src + '")';
  else if (el.type === 'clip') { t.style.background = 'transparent'; const c = clipThumb(el.name, el.color); c.style.width = c.style.height = '28px'; t.appendChild(c); }
  else { t.style.background = el.color; t.style.boxShadow = 'inset 0 0 0 1px rgba(0,0,0,.15)'; }
  const n = document.createElement('span'); n.className = 'name';
  n.textContent = el.type === 'image' ? 'Picture, ' + el.width + '" wide' : el.type === 'clip' ? (CLIPS[el.name] || {}).label + ', ' + el.width + '"' : el.text;
  if (el.type === 'text') n.style.fontFamily = '"' + el.font + '", Impact, sans-serif';
  b.append(t, n); b.addEventListener('click', onClick);
  return b;
}
function syncLists() {
  const b = activeBoard();
  for (const [listId, types, emptyText] of [['texts', ['text'], 'No text yet.'], ['images', ['image', 'clip'], 'No pictures or clip art yet.']]) {
    const list = $(listId); list.textContent = '';
    const els = b.elements.filter((e) => types.includes(e.type));
    if (!els.length) { const p = document.createElement('div'); p.className = 'empty'; p.textContent = emptyText; list.appendChild(p); }
    for (const el of els) list.appendChild(itemButton(el, el.id === selected, () => select(el.id)));
  }
  $('addtext').disabled = countOf(b, 'text') >= MAX_TEXTS;
}
function syncProps() {
  const el = selectedEl();
  $('textprops').hidden = !(el && el.type === 'text');
  $('imageprops').hidden = !(el && el.type !== 'text');
  if (!el) return;
  const copyOk = !design.same && order.product === 'set';
  $('tcopy').hidden = $('icopy').hidden = !copyOk;
  if (el.type === 'text') {
    if (document.activeElement !== $('ttext')) $('ttext').value = el.text;
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
    setRange('iwidth', el.width, inch(el.width));
    setRange('irot', el.rotation, deg(el.rotation));
    setRange('iopacity', el.opacity, Math.round(el.opacity * 100) + '%');
    setRange('ix', el.x, inch(el.x)); setRange('iy', el.y, inch(el.y));
    if (el.type === 'image') { $('iflip').checked = !!el.flipH; $('icircle').checked = !!el.circleCrop; $('iknockout').checked = !!el.knockout; }
    else { $('ccolor').value = el.color; $('coutline').value = el.outline; setRange('coutlinew', el.outlineWidth, inch(el.outlineWidth)); $('cflip').checked = !!el.flipH; }
  }
}

// -- order tab
function fillChips(id, table) {
  const box = $(id); box.textContent = '';
  for (const [k, v] of Object.entries(table)) {
    const b = document.createElement('button'); b.className = 'chip'; b.type = 'button'; b.dataset.v = k;
    const price = id === 'product' ? money(v.cents) : (v.cents ? '+' + money(v.cents) : '');
    b.textContent = v.label + ' ';
    if (price) { const s = document.createElement('small'); s.textContent = price; b.appendChild(s); }
    box.appendChild(b);
  }
}
fillChips('product', PRICING.products); fillChips('finish', PRICING.finishes); fillChips('bags', PRICING.bags);
$('rushlabel').textContent = PRICING.rush.label + ' (+' + money(PRICING.rush.cents) + ')';
$('caselabel').textContent = PRICING.carryCase.label + ' (+' + money(PRICING.carryCase.cents) + ' each)';
$('leadtime').textContent = 'Built to order. Standard orders ship in about ' + PRICING.leadTimeDays + ' business days.';
$('finishhint').textContent = 'The guest-book finish is a smooth matte clear coat that takes paint pens: guests sign the boards at the reception, and the signatures are sealed under a second coat of your choice afterwards (we include the kit).';
for (const s of US_STATES) { const o = document.createElement('option'); o.value = s; o.textContent = s; $('state').appendChild(o); }
for (const [k, label] of Object.entries(OCCASIONS)) { const o = document.createElement('option'); o.value = k; o.textContent = label; $('occasion').appendChild(o); }
$('needby').min = new Date().toISOString().slice(0, 10);
chips('product', (v) => { order.product = v; if (v === 'single') { design.same = true; setActive('a'); } syncAll(); });
chips('finish', (v) => { order.finish = v; syncOrder(); });
chips('bags', (v) => { order.bags = v; syncOrder(); });
$('qty').addEventListener('input', () => { order.quantity = clamp(Math.round(Number($('qty').value) || 1), 1, PRICING.maxQuantity); syncOrder(); });
$('rush').addEventListener('change', () => { order.rush = $('rush').checked; syncOrder(); });
$('carrycase').addEventListener('change', () => { order.carryCase = $('carrycase').checked; syncOrder(); });
$('bag1').addEventListener('input', () => { order.bagColors[0] = $('bag1').value; });
$('bag2').addEventListener('input', () => { order.bagColors[1] = $('bag2').value; });
$('occasion').addEventListener('change', () => { order.occasion = $('occasion').value; syncOrder(); });
$('needby').addEventListener('change', () => { order.needBy = $('needby').value; syncOrder(); });
$('giftnote').addEventListener('input', () => { order.giftNote = $('giftnote').value; });

function syncOrder() {
  setChip('product', order.product); setChip('finish', order.finish); setChip('bags', order.bags);
  $('qty').value = order.quantity; $('rush').checked = order.rush; $('carrycase').checked = order.carryCase;
  $('bagcolors').hidden = order.bags !== 'regulation';
  $('occasion').value = order.occasion; $('needby').value = order.needBy; $('giftnote').value = order.giftNote;
  /* A date inside the standard lead time is a nudge toward the rush
     option, said plainly rather than discovered after paying. */
  let hint = '';
  if (order.needBy) {
    const days = Math.round((Date.parse(order.needBy) - Date.now()) / 86_400_000);
    const lead = order.rush ? 7 : Math.round(PRICING.leadTimeDays * 1.4) + 7;
    hint = days < lead ? 'That is ' + days + ' days away. Standard orders take about ' + Math.round(PRICING.leadTimeDays * 1.4) + ' days plus shipping' + (order.rush ? ', and even rush is tight - email us first.' : ', so tick Rush build to make it.') : 'Plenty of time - we will plan the build around it.';
  }
  $('needbyhint').textContent = hint;
  const q = quote(order);
  const t = $('quote'); t.textContent = '';
  for (const l of q.lines) {
    const tr = t.insertRow(); tr.insertCell().textContent = (l.qty > 1 ? l.qty + ' x ' : '') + l.label; tr.insertCell().textContent = money(l.cents);
  }
  const tr = t.insertRow(); tr.className = 'total'; tr.insertCell().textContent = 'Total'; tr.insertCell().textContent = money(q.total);
  $('headtotal').textContent = money(q.total);
  return q;
}

function status(kind, text) { const s = $('orderstatus'); s.dataset.kind = kind; s.textContent = text; }
function orderPayload() {
  const f = $('orderform');
  const v = (id) => f.elements[id].value.trim();
  const previews = [previewDataUrl('a')];
  if (order.product === 'set' && !design.same) previews.push(previewDataUrl('b'));
  const opts = { product: order.product, quantity: order.quantity, finish: order.finish, bags: order.bags, rush: order.rush,
    carryCase: order.carryCase, occasion: order.occasion, giftNote: order.giftNote.trim() };
  if (order.bags === 'regulation') opts.bagColors = [...order.bagColors];
  if (order.needBy) opts.needBy = order.needBy;
  return {
    options: opts,
    design: JSON.parse(snapshot()),
    previews,
    customer: { name: v('name'), email: v('email'), phone: v('phone') },
    shipping: { line1: v('line1'), line2: v('line2'), city: v('city'), state: v('state'), postal: v('postal'), country: v('country') },
    notes: v('notes'),
  };
}
$('orderform').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const f = $('orderform');
  if (!f.checkValidity()) { f.reportValidity(); return; }
  if (!activeBoard().elements.length && design.a.base.kind === 'paint' && design.a.pattern.kind === 'none') {
    if (!confirm('Your board is a plain colour with nothing on it. Order it like that?')) return;
  }
  const btn = $('checkout'); btn.disabled = true; status('info', 'Sending your design…');
  try {
    const r = await fetch('api/order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(orderPayload()) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 503 && j.error === 'not_configured') {
      status('warn', 'Ordering is not switched on for this site yet. Download the print file above and email it to us, and we will quote it by hand.');
    } else if (!r.ok) {
      status('bad', j.message || ('Something went wrong (' + r.status + '). Nothing was charged.'));
    } else if (j.url) {
      status('ok', 'Order ' + j.code + ' saved. Taking you to payment…');
      window.location.assign(j.url);
      return;
    } else {
      status('ok', 'Order ' + j.code + ' received. We will email you an invoice for ' + money(j.total) + ' and start once it is paid.');
    }
  } catch (e) {
    status('bad', 'Could not reach the server. Check your connection and try again - nothing was charged.');
  }
  btn.disabled = false;
});

/* The thank-you and the cancelled notes, from the URL Stripe sent the
   customer back to. */
async function showOutcome() {
  const p = new URLSearchParams(location.search);
  const o = p.get('order'), code = (p.get('code') || '').toUpperCase();
  if (!o) return;
  const box = $('done'); box.hidden = false;
  if (o === 'success') {
    $('donetitle').textContent = 'Thank you - your order is in.';
    $('donebody').innerHTML = '<p>Your order code is <code>' + code.replace(/[^A-Z0-9-]/g, '') + '</code>. Keep it for any questions. Stripe is emailing you a receipt, and we will be in touch when your boards ship.</p><p id="donestatus"></p>';
    try {
      const r = await fetch('api/order?code=' + encodeURIComponent(code));
      if (r.ok) { const j = await r.json(); $('donestatus').textContent = 'Status: ' + j.status + '. ' + j.quantity + ' x ' + (PRICING.products[j.product] || {}).label + ', ' + money(j.amount_cents) + '.'; }
    } catch (_) {}
  } else if (o === 'cancelled') {
    box.classList.add('cancelled');
    $('donetitle').textContent = 'Payment cancelled.';
    $('donebody').innerHTML = '<p>No charge was made. Your design is still here' + (code ? ', and order <code>' + code.replace(/[^A-Z0-9-]/g, '') + '</code> is saved unpaid' : '') + ' - press Continue to payment again whenever you are ready.</p>';
  }
  box.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

// -- stage bar
$('undo').addEventListener('click', undo);
$('redo').addEventListener('click', redo);
$('reset').addEventListener('click', () => { if (!confirm('Start over with a blank board? This clears your design.')) return; design = freshDesign(); selected = null; active = 'a'; syncAll(); commit(); });
$('download').addEventListener('click', async () => {
  const keys = order.product === 'set' && !design.same ? ['a', 'b'] : ['a'];
  for (const k of keys) {
    const blob = await new Promise((res) => printCanvas(k).toBlob(res, 'image/png'));
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'cornhole-board-' + k.toUpperCase() + '-24x48in-100ppi.png';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  }
});

function syncAll() { syncBoard(); syncLists(); syncProps(); syncOrder(); syncHistoryButtons(); render(); }

/* ====================================================================
   BOOT
   ==================================================================== */
const hadSave = load();
history = [snapshot()];
syncAll();
showOutcome();
if (hadSave) showTab('board');
window.addEventListener('resize', render);
/* Web fonts arrive after the first paint; a text set in one is measured
   and drawn in the fallback until then. Repaint when each one lands, and
   redraw the template thumbnails too. */
const refontThumbs = () => { for (const b of document.querySelectorAll('#templates .tpl')) { const t = TEMPLATES.find((x) => x.id === b.dataset.id), c = b.querySelector('canvas'); c.getContext('2d').clearRect(0, 0, c.width, c.height); renderBoard(c.getContext('2d'), t.board(), c.height / BOARD.h); } render(); };
if (document.fonts && document.fonts.ready) document.fonts.ready.then(refontThumbs);
if (document.fonts) document.fonts.addEventListener('loadingdone', refontThumbs);

/* For the tests, and for anyone poking at it in the console. The page is a
   module, so nothing here is a global by accident; this is the one on
   purpose. */
window.cornhole = {
  BOARD, PRICING, quote, CLIPS, TEMPLATES, FONTS, PATTERNS,
  get design() { return design; },
  get order() { return order; },
  get selected() { return selected; },
  get active() { return active; },
  get boxes() { return boxes; },
  setDesign(d) { design = migrate(JSON.parse(JSON.stringify(d))); selected = null; syncAll(); commit(); },
  setOrder(o) { Object.assign(order, o); syncAll(); },
  select, commit, undo, redo, render, paint, showTab, printCanvas, previewDataUrl, orderPayload,
  activeBoard, addClip, applyTemplate, migrate,
};
