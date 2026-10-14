import { PRICING, quote, money } from './lib/price.mjs';
import { CLIPS, CLIP_CATS, heart, prng } from './lib/clips.mjs';
import { makeTemplates } from './lib/templates.mjs';
import { loadProject, saveProject } from './lib/store.mjs';
import { SITE } from './lib/site.mjs';

/* ====================================================================
   THE BOARD, IN INCHES. Everything about a design is stored in inches on
   a 24 x 48 board, never in pixels, so the same render function draws the
   480-pixel preview and the 2400 x 4800 print file by changing one scale.
   ==================================================================== */
const BOARD = Object.freeze({ w: 24, h: 48, hole: { d: 6, cy: 9 }, radius: 0.6 });
const PRINT_PPI = 100;
const DESIGN_VERSION = 2;
const PROJECT_VERSION = 3;

/* Every paint has a name, so a swatch is announced as "navy" rather than
   read out as a hex code, and the review can say which bag colours were
   picked. A colour that is not on the list is called by the nearest one. */
const PAINTS = [['#1f3a93', 'navy'], ['#1e5bc6', 'royal blue'], ['#4fa3e3', 'sky blue'], ['#0f8b8d', 'teal'], ['#1f7a3a', 'green'], ['#7ac943', 'lime'], ['#f2b705', 'gold'], ['#ffe44d', 'yellow'], ['#f26b1d', 'orange'], ['#c8102e', 'red'],
                ['#6b1d2b', 'maroon'], ['#e75480', 'pink'], ['#5b2a86', 'purple'], ['#8d8d8d', 'grey'], ['#36393b', 'charcoal'], ['#111111', 'black'], ['#f5f5f0', 'off-white'], ['#ffffff', 'white'], ['#0b1b3a', 'midnight blue'], ['#2e7d32', 'forest green']];
const PAINTS_SOFT = [['#f4c2c2', 'blush'], ['#d8a1a6', 'dusty rose'], ['#b48ea0', 'mauve'], ['#c9b7dc', 'lavender'], ['#9caf88', 'sage'], ['#6b8f71', 'eucalyptus'], ['#8fa9c4', 'dusty blue'], ['#5d7a8c', 'slate blue'], ['#f1e3c6', 'champagne'], ['#fffaf0', 'ivory'],
                     ['#f5f0e6', 'cream'], ['#b8a089', 'taupe'], ['#6e1423', 'burgundy'], ['#0f6b4a', 'emerald'], ['#1f4d2e', 'hunter green'], ['#c66a47', 'terracotta'], ['#d4a017', 'mustard'], ['#b87333', 'copper'], ['#d8b25c', 'antique gold'], ['#c0c0c0', 'silver']];
const PAINT_NAME = new Map([...PAINTS, ...PAINTS_SOFT]);
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
const TEMPLATE_GROUPS = [['wedding', 'Weddings'], ['anniversary', 'Anniversaries'], ['birthday', 'Birthdays'], ['family', 'Family and friends'], ['team', 'Teams and schools'], ['business', 'Business'], ['holiday', 'Holidays'], ['other', 'Everything else']];
const US_STATES = 'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ');
/* The states the checkout ships to: the price list says which are not. */
const SHIP_STATES = US_STATES.filter((s) => !PRICING.shipping.excluded.includes(s));
const MAX_IMAGES = 4, MAX_TEXTS = 10, MAX_CLIPS = 12;
/* A picture is kept twice: a preview the board is drawn with, and a print
   master as big as the file came (up to ORIG_SIDE on its long side) that
   the print file and the order use. A master is sized so that one master
   and its preview fit the order; an order that would not fit the server's
   body limit even so leaves the masters out, then shrinks the previews,
   and says so. */
const PREVIEW_SIDE = 1600, PREVIEW_BYTES = 1_500_000, ORIG_SIDE = 4000, ORIG_BYTES = 2_000_000, PAYLOAD_BYTES = 3_800_000;
const SHARP_DPI = 100, SOFT_DPI = 60;

const $ = (id) => document.getElementById(id);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const uid = () => 'e' + Math.random().toString(36).slice(2, 8);
const rad = (d) => d * Math.PI / 180;
const r1 = (v) => Math.round(v * 10) / 10;
const isHex = (c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
function colourName(hex) {
  const h = (hex || '').toLowerCase();
  if (PAINT_NAME.has(h)) return PAINT_NAME.get(h);
  if (!isHex(h)) return h;
  const [r, g, b] = rgb(h);
  let best = h, bd = Infinity;
  for (const [k, name] of PAINT_NAME) { const [r2, g2, b2] = rgb(k); const d = (r - r2) ** 2 + (g - g2) ** 2 + (b - b2) ** 2; if (d < bd) { bd = d; best = name; } }
  return 'near ' + best;
}
const today = () => new Date().toISOString().slice(0, 10);


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
/* The words a template arrives with. A design that still carries one at
   the checkout is almost always a mistake, so the review asks. */
const SAMPLE_WORDS = new Set(['your team', 'new text', 'your name', 'your words']);
for (const t of TEMPLATES) for (const e of t.board().elements) if (e.type === 'text') SAMPLE_WORDS.add(e.text.trim().toLowerCase());

let design = freshDesign();
let active = 'a';           // which board the panel edits
let selected = null;        // element id, on the active board
let history = [], future = [];
let lastEditTab = 'text';
const order = { product: 'set', quantity: 1, finish: 'satin', bags: 'none', bagColors: ['#c8102e', '#1f3a93'], rush: false, carryCase: false, occasion: 'other', needBy: '', giftNote: '' };

const activeBoard = () => design[active];
const boardFor = (key) => design[design.same ? 'a' : key];
const findEl = (id) => activeBoard().elements.find((e) => e.id === id) || null;
const selectedEl = () => (selected ? findEl(selected) : null);
const countOf = (b, type) => b.elements.filter((e) => e.type === type).length;
const limitOf = (type) => ({ text: MAX_TEXTS, image: MAX_IMAGES, clip: MAX_CLIPS })[type];
const boardKeys = () => (order.product === 'set' && !design.same ? ['a', 'b'] : ['a']);

/* A design nobody has touched: the page's own default, a blank board, or
   a template exactly as it came. Anything else is someone's work, and a
   template click asks before replacing it - after a reload too. */
const stripIds = (b) => JSON.stringify({ ...b, elements: b.elements.map(({ id, ...e }) => e) });
const sameBoard = (a, b) => stripIds(a) === stripIds(b);
function isPristine() {
  if (!design.same) return false;
  if (sameBoard(design.a, freshDesign().a) || sameBoard(design.a, freshBoard())) return true;
  return TEMPLATES.some((t) => sameBoard(design.a, t.board()));
}
function sampleWordsIn() {
  const out = new Set();
  for (const k of boardKeys()) for (const e of design[k].elements) if (e.type === 'text' && SAMPLE_WORDS.has(e.text.trim().toLowerCase())) out.add(e.text.trim());
  return [...out];
}

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
const imageLoaded = (src) => new Promise((res) => { const img = imageFor(src); if (img) { res(img); return; } const i = imgCache.get(src); i.addEventListener('load', () => res(i), { once: true }); i.addEventListener('error', () => res(null), { once: true }); });
/* The print file needs every master decoded before it draws. */
async function preloadImages(keys = boardKeys()) {
  const srcs = new Set();
  for (const k of keys) for (const e of boardFor(k).elements) if (e.type === 'image') srcs.add(e.orig || e.src);
  await Promise.all([...srcs].map(imageLoaded));
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
  const source = printing ? (el.orig || el.src) : el.src;
  const img = el.knockout ? knockedOut(source) : imageFor(source);
  const iw = img ? (img.naturalWidth || img.width) : (el.px ? el.px[0] : 1), ih = img ? (img.naturalHeight || img.height) : (el.px ? el.px[1] : 1);
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
  for (const el of b.elements) (DRAWERS[el.type] || (() => {}))(ctx, el);
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
  const r = $('canvasA').getBoundingClientRect();
  const css = r.width > 0 ? r.width / BOARD.w : 12;   // CSS pixels per inch
  HANDLE.size = clamp(14 / css, 0.6, 3);
  HANDLE.hit = clamp(20 / css, 0.9, 4.5);
  HANDLE.rotateGap = HANDLE.size * 1.5;
}
/* Where a selected element's handles sit, in its own (rotated) frame. */
function handleSpots(el) {
  const box = boxes.get(el.id); if (!box) return null;
  const rx = box.w / 2 + 0.15, top = -box.h / 2 - 0.15 + box.oy, bottom = box.h / 2 + 0.15 + box.oy;
  return { resize: [rx, bottom], delete: [rx, top], rotate: [0, top - HANDLE.rotateGap] };
}
/* The same in board inches, for the tests. */
function handlePoints(id) {
  const el = findEl(id), spots = el && handleSpots(el); if (!spots) return null;
  const a = rad(el.rotation), out = {};
  for (const [k, [lx, ly]] of Object.entries(spots)) out[k] = { x: el.x + lx * Math.cos(a) - ly * Math.sin(a), y: el.y + lx * Math.sin(a) + ly * Math.cos(a) };
  return out;
}
const guides = { v: false, h: false };
let raf = 0;
function render() { if (!raf) raf = requestAnimationFrame(paint); }
function paint() {
  raf = 0;
  sizeHandles();
  syncScrollPadding();
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
       dragged; with nothing selected a finger on it scrolls the page. */
    c.classList.toggle('grabbable', Boolean(el && editingHere));
  }
}

/* The print file: 100 pixels per inch, no bevel, hole marked by a hairline,
   pictures drawn from their masters. Call preloadImages first. */
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
   HISTORY, SAVING AND THE PROJECT FILE
   ==================================================================== */
/* A snapshot is the design as a string - with every picture swapped for a
   short token and kept once in `blobs`, so sixty undo steps of a design
   with a photo on it cost sixty small strings, not sixty copies of the
   photo. parseSnapshot puts the pictures back. */
const blobs = new Map(), tokens = new Map();
function tokenFor(s) { let t = tokens.get(s); if (!t) { t = '@blob:' + tokens.size; tokens.set(s, t); blobs.set(t, s); } return t; }
const snapshot = () => JSON.stringify(design, (k, v) => ((k === 'src' || k === 'orig') && typeof v === 'string' && v.length > 64 ? tokenFor(v) : v));
const parseSnapshot = (s) => JSON.parse(s, (k, v) => ((k === 'src' || k === 'orig') && typeof v === 'string' && blobs.has(v) ? blobs.get(v) : v));
function commit() {
  const s = snapshot();
  if (history[history.length - 1] === s) { save(); return; }
  history.push(s); if (history.length > 60) history.shift();
  future = [];
  save();
  syncHistoryButtons();
}
function restore(s) { design = parseSnapshot(s); if (!findEl(selected)) selected = null; save(); syncAll(); }
function undo() { if (history.length < 2) return; future.push(history.pop()); restore(history[history.length - 1]); }
function redo() { if (!future.length) return; const s = future.pop(); history.push(s); restore(s); }
function syncHistoryButtons() { $('undo').disabled = history.length < 2; $('redo').disabled = !future.length; }

/* What is saved: the boards and the order choices together, so a refresh
   brings back the finish, the extras, the quantity and the date as well as
   the design. Saving says what it is doing; a save that fails says so and
   offers the export, and never drops a picture to make itself fit. */
const SAVE_TEXT = {
  new: 'Not saved yet',
  saving: 'Saving…',
  saved: 'Saved on this device',
  error: 'Not saved: this browser cannot store the project (storage full or blocked). Export it to keep it.',
};
let saveState = 'new', saveBusy = false, saveAgain = false, storageReady = false, loaded = false;
/* The status line is not a live region: a screen reader would otherwise
   hear "Saving… Saved" after every keystroke and slider step. The one
   live region speaks when a save fails, and once when saving works again. */
function setSaveState(s) {
  const was = saveState;
  saveState = s;
  for (const el of document.querySelectorAll('.savestatus')) { el.textContent = SAVE_TEXT[s]; el.dataset.state = s; }
  if (s === 'error' || (s === 'saved' && was === 'error')) $('savealert').textContent = SAVE_TEXT[s];
  $('exportlink').hidden = s !== 'error';
}
function projectRecord() { return { version: PROJECT_VERSION, savedAt: new Date().toISOString(), design: parseSnapshot(snapshot()), order: { ...order, bagColors: [...order.bagColors] } }; }
function save() { if (!storageReady) return; clearTimeout(saveTimer); saveTimer = 0; setSaveState('saving'); flush(); }
/* Typing is saved as it happens, a moment after the last key, without a
   history entry per letter; the page says "Saving…" meanwhile, so the
   status is never "Saved" while the board shows words that are not. */
let saveTimer = 0;
function saveSoon() { if (!storageReady) return; setSaveState('saving'); clearTimeout(saveTimer); saveTimer = setTimeout(() => { saveTimer = 0; save(); }, 400); }
const flushSoon = () => { if (saveTimer) save(); };
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSoon(); });
window.addEventListener('pagehide', flushSoon);
async function flush() {
  if (saveBusy) { saveAgain = true; return; }
  saveBusy = true;
  try { await saveProject(projectRecord()); if (!saveAgain) setSaveState('saved'); }
  catch (e) { console.warn('The project could not be saved on this device.', e); setSaveState('error'); }
  saveBusy = false;
  if (saveAgain) { saveAgain = false; flush(); }
}
window.addEventListener('beforeunload', (e) => { if (saveState === 'error') { e.preventDefault(); e.returnValue = ''; } });

/* Order choices from storage or a file, taken only where they are valid. */
function applyOrder(o) {
  if (!o || typeof o !== 'object') return;
  if (PRICING.products[o.product]) order.product = o.product;
  const q = Number(o.quantity); if (Number.isInteger(q) && q >= 1 && q <= PRICING.maxQuantity) order.quantity = q;
  if (PRICING.finishes[o.finish]) order.finish = o.finish;
  if (PRICING.bags[o.bags]) order.bags = o.bags;
  if (Array.isArray(o.bagColors) && o.bagColors.length === 2 && o.bagColors.every(isHex)) order.bagColors = [...o.bagColors];
  order.rush = o.rush === true; order.carryCase = o.carryCase === true;
  if (OCCASIONS[o.occasion]) order.occasion = o.occasion;
  order.needBy = typeof o.needBy === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.needBy) && o.needBy >= today() ? o.needBy : '';
  order.giftNote = typeof o.giftNote === 'string' ? o.giftNote.slice(0, 300) : '';
}
/* The project file: plain JSON, with the pictures' masters, that the
   Import button takes back. */
function exportProject() {
  const blob = new Blob([JSON.stringify({ app: 'cornhole-builder', ...projectRecord() }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'cornhole-project-' + today() + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
function importProject(obj) {
  if (!obj || typeof obj !== 'object' || !obj.design || !obj.design.a || !obj.design.b) throw new Error('that file is not a cornhole project');
  askThenApply('the imported project', () => {
    design = migrate(obj.design);
    if (obj.order) applyOrder(obj.order);
    selected = null; active = 'a';
    syncAll(); commit(); showTab('board');
  });
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
  const spots = handleSpots(el); if (!spots) return null;
  const oy = boxes.get(el.id).oy || 0;
  const l = toLocal(el, ix, iy);
  let best = null, bd = Infinity;
  for (const [name, [x, y]] of Object.entries(spots)) {
    /* A handle reaches HANDLE.hit inches, but never more than part of the
       way to the element's centre, so a small element can still be picked
       up by its middle. The nearest handle within reach wins. */
    const d = Math.hypot(l.x - x, l.y - y), reach = Math.min(HANDLE.hit, 0.6 * Math.hypot(x, y - oy));
    if (d <= reach && d < bd) { bd = d; best = name; }
  }
  return best;
}
function toInches(c, ev) {
  const r = c.getBoundingClientRect();
  return { x: (ev.clientX - r.left) / r.width * BOARD.w, y: (ev.clientY - r.top) / r.height * BOARD.h };
}
const sizeKey = (el) => (el.type === 'text' ? 'size' : 'width');
const sizeMax = (el) => (el.type === 'text' ? 16 : 24);
let drag = null;
for (const c of [$('canvasA'), $('canvasB')]) {
  /* With two different boards, the board that has the keyboard focus is
     the one the keys edit - so tabbing to Board A makes it the active one. */
  c.addEventListener('focus', () => { const key = c.dataset.board; if (!design.same && order.product === 'set' && key !== active) setActive(key); });
  c.addEventListener('pointerdown', (ev) => {
    const key = c.dataset.board;
    if (!design.same && order.product === 'set' && key !== active) setActive(key);
    /* The board takes the focus, so the arrow keys and Delete that follow
       are meant for it - and not when a slider or a tab had the focus. */
    c.focus({ preventScroll: true });
    const p = toInches(c, ev);
    const sel = selectedEl();
    const handle = sel && (design.same ? key === 'a' : key === active) ? handleAt(sel, p.x, p.y) : null;
    if (handle === 'delete') { removeElement(sel.id); ev.preventDefault(); return; }
    let el = sel;
    if (!handle) {
      el = hitTest(activeBoard(), p.x, p.y); select(el ? el.id : null);
      /* Picking something up opens the tab that edits it, so on a phone
         its controls are right under the board. */
      if (el) showTab(el.type === 'text' ? 'text' : 'art');
    }
    if (!el) return;
    const box = boxes.get(el.id) || { oy: 0 };
    const l = toLocal(el, p.x, p.y);
    drag = { id: el.id, mode: handle || 'move', dx: el.x - p.x, dy: el.y - p.y, moved: false,
      d0: Math.max(0.2, Math.hypot(l.x, l.y - box.oy)), size0: el[sizeKey(el)],
      before: { x: el.x, y: el.y, rotation: el.rotation, size: el[sizeKey(el)] } };
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
  /* A gesture the browser takes over (a finger that turned out to be a
     scroll) is cancelled: whatever it moved goes back, and nothing is
     recorded. */
  const end = (ev) => {
    if (!drag) return;
    const el = findEl(drag.id), moved = drag.moved, cancelled = ev && ev.type === 'pointercancel';
    if (cancelled && el) { el.x = drag.before.x; el.y = drag.before.y; el.rotation = drag.before.rotation; el[sizeKey(el)] = drag.before.size; }
    drag = null; guides.v = guides.h = false; c.classList.remove('dragging');
    render(); syncProps(); settleTyping();
    if (moved && !cancelled) commit();
  };
  c.addEventListener('pointerup', end);
  c.addEventListener('pointercancel', end);
}
/* Keyboard. Undo and redo work anywhere but inside a field. The keys that
   edit the artwork - arrows, plus, minus, Delete - work only while a board
   has the focus, so a Delete meant for a tab, a slider or a list never
   takes a word off the board. */
document.addEventListener('keydown', (ev) => {
  if (!loaded) return;
  const t = ev.target, tag = t && t.tagName;
  const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable);
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') { if (typing) return; ev.preventDefault(); ev.shiftKey ? redo() : undo(); return; }
  /* Ctrl and Cmd with plus or minus are the browser's zoom; Alt and the
     arrows are the browser's too. Only plain keys edit the artwork. */
  if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
  if (tag !== 'CANVAS') return;
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

function setActive(key) { active = key; selected = null; syncAll(); }
function select(id) { selected = id; render(); syncLists(); syncProps(); }

/* The tabs: a click or the arrow keys move between them, the selected one
   is the only one in the Tab order, and the Order tab hides the phone's
   Review bar since it is what the bar leads to. */
const TAB_ORDER = ['templates', 'board', 'text', 'art', 'order'];
const tabButtons = [...document.querySelectorAll('.tabs [role=tab]')];
function showTab(name) {
  for (const b of tabButtons) { const on = b.dataset.tab === name; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; }
  for (const p of document.querySelectorAll('.pane')) p.dataset.open = String(p.id === 'tab-' + name);
  if (name !== 'order') lastEditTab = name;
  document.body.classList.toggle('ordering', name === 'order');
  if (name === 'order') reviewIfChanged();
}
document.querySelector('.tabs').addEventListener('click', (ev) => { const b = ev.target.closest('[role=tab]'); if (b) showTab(b.dataset.tab); });
document.querySelector('.tabs').addEventListener('keydown', (ev) => {
  const i = TAB_ORDER.indexOf((ev.target.dataset || {}).tab); if (i < 0) return;
  const j = ev.key === 'ArrowRight' ? (i + 1) % TAB_ORDER.length : ev.key === 'ArrowLeft' ? (i + TAB_ORDER.length - 1) % TAB_ORDER.length : ev.key === 'Home' ? 0 : ev.key === 'End' ? TAB_ORDER.length - 1 : -1;
  if (j < 0) return;
  ev.preventDefault(); showTab(TAB_ORDER[j]); tabButtons[j].focus();
});
/* While a field in the panel has focus on a phone, the keyboard takes half
   the screen: the boards shrink (see the stylesheet) so the field and the
   board both stay in view. */
const panel = document.querySelector('aside.panel');
const TYPING = 'input:not([type=checkbox]):not([type=color]):not([type=range]):not([type=file]), textarea, select';
panel.addEventListener('focusin', (ev) => { if (ev.target.matches(TYPING)) { document.body.classList.add('typing'); render(); } });
/* The board does not change size under a finger: while a drag is on, the
   class stays until the drag ends (a touch on the board blurs the field). */
function settleTyping() {
  if (drag) return;
  const a = document.activeElement;
  if (!a || !panel.contains(a) || !a.matches(TYPING)) { document.body.classList.remove('typing'); render(); }
}
panel.addEventListener('focusout', () => setTimeout(settleTyping, 50));
/* On a phone the header and the pinned stage cover the top of the page, so
   a control the browser scrolls into view on focus would land under them:
   the document says how much of its top is covered. */
function syncScrollPadding() {
  const st = document.querySelector('.stage');
  let pad = '';
  if (window.matchMedia('(max-width: 940px)').matches && getComputedStyle(st).position === 'sticky') pad = (parseFloat(getComputedStyle(st).top) || 0) + st.offsetHeight + 8 + 'px';
  if (document.documentElement.style.scrollPaddingTop !== pad) document.documentElement.style.scrollPaddingTop = pad;
}
/* Bring the controls up under the (sticky) board on a phone. */
function scrollToPanel() {
  const st = document.querySelector('.stage');
  const sticky = window.innerWidth <= 940 ? st.offsetHeight + 8 : 0;
  const top = panel.getBoundingClientRect().top + window.scrollY - 60 - sticky;
  window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
}

// -- templates, grouped by occasion, with a blank start
function applyTemplate(id) {
  const t = TEMPLATES.find((x) => x.id === id); if (!t) return;
  design = { version: DESIGN_VERSION, same: true, a: t.board(), b: freshBoard() };
  selected = null; active = 'a';
  order.occasion = t.occasion;
  syncAll(); commit(); promptForWords();
}
function applyBlank() {
  design = { version: DESIGN_VERSION, same: true, a: freshBoard(), b: freshBoard() };
  selected = null; active = 'a';
  syncAll(); commit(); promptForWords();
}
/* Straight to the words: the first text is selected and ready to type
   over, with a line saying so. */
function promptForWords() {
  const first = design.a.elements.find((e) => e.type === 'text');
  showTab('text');
  const hint = $('texthint');
  if (first) {
    select(first.id);
    hint.textContent = 'Replace the sample words with your own: the names, the date, the team. Each line below is one piece of text on the board.';
    hint.hidden = false;
    const i = $('ttext'); i.focus({ preventScroll: true }); i.select();
  } else {
    hint.textContent = 'A blank board. Add your first words with the button below, then colours and art from the other tabs.';
    hint.hidden = false;
  }
}
const askThenApply = (label, fn) => { if (isPristine() || confirm('Replace your current design with ' + label + '?')) fn(); };
$('startblank').addEventListener('click', () => askThenApply('a blank board', applyBlank));
{
  const host = $('templates');
  for (const [key, label] of TEMPLATE_GROUPS) {
    const ts = TEMPLATES.filter((t) => t.occasion === key); if (!ts.length) continue;
    const h = document.createElement('h3'); h.className = 'tplgroup'; h.textContent = label; host.appendChild(h);
    const grid = document.createElement('div'); grid.className = 'templates'; host.appendChild(grid);
    for (const t of ts) {
      const b = document.createElement('button'); b.className = 'tpl'; b.type = 'button'; b.dataset.id = t.id; b.setAttribute('aria-label', t.label + ' template');
      const c = document.createElement('canvas'); c.width = 64 * 2; c.height = 128 * 2;
      renderBoard(c.getContext('2d'), t.board(), 128 * 2 / BOARD.h);
      const s = document.createElement('span'); s.textContent = t.label;
      b.append(c, s);
      b.addEventListener('click', () => askThenApply('the ' + t.label + ' template', () => applyTemplate(t.id)));
      grid.appendChild(b);
    }
  }
}

// -- board tab
function swatch(parent, v, title, extra) {
  const b = document.createElement('button'); b.type = 'button'; b.className = 'sw' + (extra ? ' ' + extra : ''); b.dataset.v = v; b.title = title; b.setAttribute('aria-label', title); parent.appendChild(b); return b;
}
for (const [hex, name] of PAINTS) swatch($('paints'), hex, name + ' (' + hex + ')').style.background = hex;
for (const [hex, name] of PAINTS_SOFT) swatch($('paints2'), hex, name + ' (' + hex + ')').style.background = hex;
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
/* Two boards: one design on both, or each its own. The switch sits above
   the preview; tapping a board switches too. Going from one design to two
   starts B as a copy of A, with fresh ids, unless B already has a design
   of its own from earlier. */
function withFreshIds(b) { const c = JSON.parse(JSON.stringify(b)); for (const e of c.elements) e.id = uid(); return c; }
function setMode(v) {
  if (v === 'same') { design.same = true; active = 'a'; }
  else {
    if (design.same && !design.b.elements.length && JSON.stringify(design.b) === JSON.stringify(freshBoard())) design.b = withFreshIds(design.a);
    design.same = false; active = v;
  }
  selected = null; syncAll(); commit();
}
chips('boardmode', setMode);
const otherKey = () => (active === 'a' ? 'b' : 'a');
$('copyother').addEventListener('click', () => { design[otherKey()] = withFreshIds(activeBoard()); syncAll(); commit(); });
/* The classic set: the other board is this one with its two main colours
   exchanged - the board colour and the colour of the first text (or clip,
   or the pattern). Everything in either colour switches, and anything
   left that no longer reads against the new board (a second shade of the
   old board colour, say) takes the old board colour instead. */
const lum = (hex) => { const [r, g, b] = rgb(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
function oppositeColours(src) {
  const b = withFreshIds(src);
  const low = (c) => (c || '').toLowerCase();
  const c1 = b.base.kind !== 'wood' ? low(b.base.color) : (b.pattern.kind !== 'none' ? low(b.pattern.color) : '');
  const second = b.elements.find((e) => e.type !== 'image' && low(e.color) !== c1);
  const c2 = second ? low(second.color) : (b.pattern.kind !== 'none' && low(b.pattern.color) !== c1 ? low(b.pattern.color) : '');
  if (!c1 || !c2) return b;
  const sw = (c) => (low(c) === c1 ? c2 : low(c) === c2 ? c1 : c);
  b.base.color = sw(b.base.color); b.base.color2 = sw(b.base.color2); b.pattern.color = sw(b.pattern.color);
  for (const e of b.elements) if (e.type !== 'image') {
    e.color = sw(e.color); e.outline = sw(e.outline);
    if (b.base.kind !== 'wood' && isHex(e.color) && isHex(b.base.color) && contrast(e.color, b.base.color) < 1.8) e.color = c1;
  }
  return b;
}
$('swapcolours').addEventListener('click', () => { design[otherKey()] = oppositeColours(activeBoard()); syncAll(); commit(); });

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
  $('patsize').value = b.pattern.size; $('patsizeval').textContent = b.pattern.size + '"';
  $('patternopts').style.visibility = b.pattern.kind === 'none' ? 'hidden' : 'visible';
  const twoBoards = order.product === 'set', split = twoBoards && !design.same, other = active === 'a' ? 'b' : 'a';
  setChip('boardmode', design.same ? 'same' : active);
  $('boardmode').hidden = !twoBoards;
  $('modehint').hidden = !split;
  $('boardactions').hidden = !split;
  $('copyother').textContent = 'Copy to Board ' + other.toUpperCase();
  $('swapcolours').textContent = 'Board ' + other.toUpperCase() + ' in the opposite colours';
  $('boardshint').textContent = !twoBoards ? 'A single board.'
    : design.same ? 'One design on both boards. For two different boards, pick Board A or Board B above the preview.'
    : 'Editing Board ' + active.toUpperCase() + '. Switch with Board A and Board B above the preview. Both boards match goes back to one design.';
  $('boardB').classList.toggle('hidden', !twoBoards);
  $('boardB').classList.toggle('same', design.same);
  for (const k of ['a', 'b']) {
    const box = $('board' + k.toUpperCase()), editing = split && active === k;
    box.classList.toggle('inactive', split && active !== k);
    box.querySelector('.label').textContent = 'Board ' + k.toUpperCase() + (editing ? ' - editing' : k === 'b' && design.same ? ' (same as A)' : '');
  }
  for (const s of document.querySelectorAll('.activename')) s.textContent = split ? 'board ' + active.toUpperCase() : 'your board';
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
  if (el) { $('texthint').hidden = true; $('ttext').focus(); $('ttext').select(); }
});
const field = (id, key, map = (v) => v, label = null) => {
  $(id).addEventListener('input', () => { const el = selectedEl(); if (!el) return; el[key] = map($(id).value); if (label) $(id + 'val').textContent = label(el[key]); render(); syncLists(); saveSoon(); });
  $(id).addEventListener('change', commit);
};
const toggle = (id, key) => {
  $(id).addEventListener('change', () => { const el = selectedEl(); if (!el) return; el[key] = $(id).checked; render(); commit(); });
};
const inch = (v) => v + '"', deg = (v) => v + '°';
field('ttext', 'text');
$('ttext').addEventListener('input', () => { $('texthint').hidden = true; });
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
$('addimagebtn').addEventListener('click', () => $('addimage').click());
$('addimage').addEventListener('change', async () => {
  const f = $('addimage').files[0]; $('addimage').value = '';
  if (!f) return;
  if (countOf(activeBoard(), 'image') >= MAX_IMAGES) { alert('Up to ' + MAX_IMAGES + ' pictures per board.'); return; }
  try {
    const pic = await readImage(f);
    addElement(withDefaults({ type: 'image', ...pic, width: 10, x: 12, y: 30 }), 'art');
  } catch (e) { alert('Could not read that image: ' + (e && e.message ? e.message : e)); }
});
/* A picture, twice. The preview (1600 px on the long side at most) is what
   the board is drawn with and what travels in every request; the master is
   the file itself when it is a raster that fits, else the same picture
   re-encoded as large as will fit, for the print file and the order. There
   is no master only when the preview IS the file: a lossless picture the
   preview did not have to shrink. A vector (SVG) has no size of its own
   and is drawn as large as the preview and the master allow. The master's
   pixel size is kept so the page can say when a picture is being printed
   bigger than it can take. */
function hasAlpha(img) {
  const k = Math.min(1, 256 / Math.max(img.naturalWidth, img.naturalHeight, 1)), c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
  const g = c.getContext('2d'); g.drawImage(img, 0, 0, c.width, c.height);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 250) return true;
  return false;
}
const readAsDataUrl = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(file); });
async function readImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('not an image')); i.src = url; });
    const W = img.naturalWidth, H = img.naturalHeight;
    if (!W || !H) throw new Error('the picture has no size');
    const isRaster = /^image\/(png|jpeg|webp)$/i.test(file.type);
    /* JPEGs, and WebPs with nothing see-through, are previewed as JPEG;
       anything with a transparent pixel stays PNG so a cut-out stays cut out. */
    const lossy = /jpe?g/i.test(file.type) || (/webp/i.test(file.type) && !hasAlpha(img));
    const encode = (side, bytes, quality) => {
      let s = side, out = null;
      for (let tries = 0; tries < 6; tries++) {
        const k = isRaster ? Math.min(1, s / Math.max(W, H)) : s / Math.max(W, H);
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(W * k)); c.height = Math.max(1, Math.round(H * k));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        out = { url: lossy ? c.toDataURL('image/jpeg', quality) : c.toDataURL('image/png'), px: [c.width, c.height] };
        if (out.url.length <= bytes * 1.37) return out;
        s = Math.round(s * 0.75);
      }
      return out;
    };
    const preview = encode(PREVIEW_SIDE, PREVIEW_BYTES, 0.88);
    const shrunk = preview.px[0] < W || preview.px[1] < H;
    let master = null;
    if (isRaster && file.size <= ORIG_BYTES && Math.max(W, H) <= ORIG_SIDE) {
      if (lossy || shrunk) master = { url: await readAsDataUrl(file), px: [W, H] };
    } else if (shrunk || !isRaster) master = encode(ORIG_SIDE, ORIG_BYTES, 0.92);
    if (master && master.url === preview.url) master = null;
    return master ? { src: preview.url, orig: master.url, px: master.px } : { src: preview.url, px: preview.px };
  } finally { URL.revokeObjectURL(url); }
}
/* A preview re-encoded smaller, for an order that would not fit otherwise. */
async function shrunkPreview(src, k) {
  const img = await imageLoaded(src); if (!img) return src;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return src.startsWith('data:image/jpeg') ? c.toDataURL('image/jpeg', 0.85) : c.toDataURL('image/png');
}
/* Dots per inch a picture prints at, at the width it has on the board. */
const printDpi = (el) => (el.px ? el.px[0] / el.width : null);
function resolutionNote(el, where) {
  const dpi = printDpi(el); if (dpi === null || dpi >= SHARP_DPI) return '';
  return 'The picture' + (where ? ' on ' + where : '') + ' is ' + el.px[0] + ' x ' + el.px[1] + ' pixels: at ' + el.width + '" wide it prints at about ' + Math.round(dpi) + ' dots per inch, which will look ' + (dpi < SOFT_DPI ? 'blurry' : 'soft') + '. ' + SHARP_DPI + ' or more prints sharp: use a bigger file, or make it no wider than ' + (Math.floor(el.px[0] / SHARP_DPI * 4) / 4) + '".';
}
function lowResImages(keys) {
  const out = [];
  for (const k of keys) for (const e of boardFor(k).elements) if (e.type === 'image') { const n = resolutionNote(e, keys.length > 1 ? 'board ' + k.toUpperCase() : ''); if (n) out.push(n); }
  return out;
}
field('iwidth', 'width', Number, inch);
$('iwidth').addEventListener('input', syncProps);
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
    const b = document.createElement('button'); b.type = 'button'; b.className = 'clip'; b.dataset.name = name; b.title = def.label; b.setAttribute('aria-label', 'Add ' + def.label);
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
  const type = (b.elements.find((e) => e.id === id) || {}).type;
  const ae = document.activeElement, fromProps = Boolean(ae && ae.closest('#textprops, #imageprops'));
  b.elements = b.elements.filter((e) => e.id !== id);
  if (selected === id) selected = null;
  render(); syncLists(); syncProps(); commit();
  /* The Remove button in the props hides with the props: the focus moves
     to the list - the next row's remove button, or the button that adds. */
  if (fromProps || document.activeElement === document.body) {
    const list = $(type === 'text' ? 'texts' : 'images');
    const next = list.querySelector('.itemdel') || $(type === 'text' ? 'addtext' : 'addimagebtn');
    if (next) next.focus({ preventScroll: true });
  }
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

/* A row in the Text or Art list. Text rows carry the words in a field, so
   a name or a date is changed right there; every row carries its own
   remove button, so nothing has to be selected first. */
function itemRow(el, pressed, onClick) {
  const row = document.createElement('div'); row.className = 'itemrow';
  const b = document.createElement('button'); b.className = 'item'; b.type = 'button'; b.dataset.id = el.id; b.setAttribute('aria-pressed', String(pressed));
  const t = document.createElement('span'); t.className = 'thumb';
  if (el.type === 'image') t.style.backgroundImage = 'url("' + el.src + '")';
  else if (el.type === 'clip') { t.style.background = 'transparent'; const c = clipThumb(el.name, el.color); c.style.width = c.style.height = '28px'; t.appendChild(c); }
  else { t.style.background = el.color; t.style.boxShadow = 'inset 0 0 0 1px rgba(0,0,0,.15)'; }
  b.appendChild(t);
  if (el.type === 'text') {
    b.classList.add('pick'); b.title = 'Select, to change the font, size and colour';
    const q = document.createElement('input'); q.type = 'text'; q.className = 'quick'; q.value = el.text; q.maxLength = 60; q.dataset.id = el.id;
    q.setAttribute('aria-label', 'Words'); q.style.fontFamily = '"' + el.font + '", Impact, sans-serif';
    q.addEventListener('focus', () => { if (selected !== el.id) select(el.id); });
    q.addEventListener('input', () => { const e = findEl(el.id); if (!e) return; e.text = q.value; $('texthint').hidden = true; render(); labelRow(row, e); if (selected === e.id && document.activeElement !== $('ttext')) $('ttext').value = e.text; saveSoon(); });
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
  return el.type === 'image' ? 'Picture, ' + el.width + '" wide' : (CLIPS[el.name] || {}).label + ', ' + el.width + '"';
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
    if (document.activeElement !== q && q.value !== el.text) q.value = el.text;
  } else if (el.type === 'clip') {
    t.textContent = ''; const c = clipThumb(el.name, el.color); c.style.width = c.style.height = '28px'; t.appendChild(c);
  }
  labelRow(row, el);
}
function syncLists() {
  const b = activeBoard();
  const ae = document.activeElement;
  const cls = ae && ae.dataset && ae.dataset.id ? ['quick', 'item', 'itemdel'].find((c) => ae.classList.contains(c)) : null;
  const keep = cls ? { id: ae.dataset.id, cls, s: ae.selectionStart, e: ae.selectionEnd, list: ae.closest('.items') } : null;
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
    for (const el of els) list.appendChild(itemRow(el, el.id === selected, () => select(el.id)));
  }
  $('addtext').disabled = countOf(b, 'text') >= MAX_TEXTS;
  if (keep && lostFocus) {
    const again = document.querySelector('.' + keep.cls + '[data-id="' + keep.id + '"]') || (keep.list && keep.list.querySelector('.itemdel')) || (keep.list && keep.list.id === 'texts' ? $('addtext') : $('addimagebtn'));
    if (again) { again.focus({ preventScroll: true }); if (keep.cls === 'quick' && keep.s != null && again.setSelectionRange) try { again.setSelectionRange(keep.s, keep.e); } catch (_) {} }
  }
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
    const note = el.type === 'image' ? resolutionNote(el, '') : '';
    $('ireswarn').textContent = note; $('ireswarn').hidden = !note;
    if (el.type === 'image') { $('iflip').checked = !!el.flipH; $('icircle').checked = !!el.circleCrop; $('iknockout').checked = !!el.knockout; }
    else { $('ccolor').value = el.color; $('coutline').value = el.outline; setRange('coutlinew', el.outlineWidth, inch(el.outlineWidth)); $('cflip').checked = !!el.flipH; }
  }
}

// -- order tab: options and price, then the review, then the details
function fillChips(id, table) {
  const box = $(id); box.textContent = '';
  for (const [k, v] of Object.entries(table)) {
    const b = document.createElement('button'); b.className = 'chip'; b.type = 'button'; b.dataset.v = k; b.title = v.label;
    const price = id === 'product' ? money(v.cents) : (v.cents ? '+' + money(v.cents) : '');
    b.textContent = (v.short || v.label) + ' ';
    if (price) { const s = document.createElement('small'); s.textContent = price; b.appendChild(s); }
    box.appendChild(b);
  }
}
fillChips('product', PRICING.products); fillChips('finish', PRICING.finishes); fillChips('bags', PRICING.bags);
$('rushlabel').textContent = (PRICING.rush.short || PRICING.rush.label) + ' (+' + money(PRICING.rush.cents) + ')';
$('caselabel').textContent = (PRICING.carryCase.short || PRICING.carryCase.label) + ' (+' + money(PRICING.carryCase.cents) + ')';
$('finishhint').textContent = 'The guest-book finish is a smooth matte clear coat that takes paint pens: guests sign the boards at the reception, and the signatures are sealed under a second coat of your choice afterwards (we include the kit).';
const SHIP_NOTE = 'We ship by freight to ' + PRICING.shipping.region + ' only (' + money(PRICING.shipping.first) + ' for the first set or board, ' + money(PRICING.shipping.additional) + ' for each one after). Alaska, Hawaii and addresses outside the US are not covered by this checkout.';
$('shipnote2').textContent = 'United States addresses in ' + PRICING.shipping.region + ' only. Payment is taken on a secure Stripe page; sales tax, where it applies, is added there.';
/* Dispatch is ours to state; arrival is not, because freight transit depends
   on the address. The two are kept apart everywhere the page speaks of time. */
const dispatchNote = () => 'Dispatch: about ' + PRICING.leadTimeDays + ' business days after your order (about ' + PRICING.rushDays + ' with a rush build). Delivery: freight transit is on top and depends on your address; we confirm an estimate with your order. Dates are estimates, not guarantees.';
$('leadtime').textContent = 'Dispatch in about ' + PRICING.leadTimeDays + ' business days (' + PRICING.rushDays + ' with a rush build); delivery time is on top and not guaranteed.';
$('howdispatch').textContent = 'Built to order and dispatched in about ' + PRICING.leadTimeDays + ' business days (about ' + PRICING.rushDays + ' with the rush option), then shipped by freight to your door anywhere in ' + PRICING.shipping.region + '. Transit time depends on your address and is confirmed with your order.';
for (const s of SHIP_STATES) { const o = document.createElement('option'); o.value = s; o.textContent = s; $('state').appendChild(o); }
for (const [k, label] of Object.entries(OCCASIONS)) { const o = document.createElement('option'); o.value = k; o.textContent = label; $('occasion').appendChild(o); }
$('needby').min = today();
chips('product', (v) => { order.product = v; if (v === 'single') { design.same = true; setActive('a'); } syncAll(); });
chips('finish', (v) => { order.finish = v; syncOrder(); });
chips('bags', (v) => { order.bags = v; syncOrder(); });
$('qty').addEventListener('input', () => { order.quantity = clamp(Math.round(Number($('qty').value) || 1), 1, PRICING.maxQuantity); syncOrder(); });
$('qty').addEventListener('change', () => { $('qty').value = order.quantity; });
$('rush').addEventListener('change', () => { order.rush = $('rush').checked; syncOrder(); });
$('carrycase').addEventListener('change', () => { order.carryCase = $('carrycase').checked; syncOrder(); });
$('bag1').addEventListener('input', () => { order.bagColors[0] = $('bag1').value; saveSoon(); });
$('bag2').addEventListener('input', () => { order.bagColors[1] = $('bag2').value; saveSoon(); });
$('occasion').addEventListener('change', () => { order.occasion = $('occasion').value; syncOrder(); });
$('needby').addEventListener('change', () => { order.needBy = $('needby').value; syncOrder(); });
$('giftnote').addEventListener('input', () => { order.giftNote = $('giftnote').value; saveSoon(); });
/* Three screens, each about the height of the other tabs: the order and
   its price; the review, with both boards as they will print; the address.
   The button that moves between them hides with its step, so the focus
   goes to the new step's heading - a screen reader hears where it is. */
function showOrderStep(n) {
  $('orderstep1').hidden = n !== 1; $('orderstep2').hidden = n !== 2; $('orderstep3').hidden = n !== 3;
  if (n === 2) renderReview();
  if (n === 3) syncOrder();
  const ae = document.activeElement;
  if (!ae || ae === document.body || ae.offsetParent === null) { const h = $('orderstep' + n).querySelector('h3'); if (h && h.offsetParent !== null) h.focus({ preventScroll: true }); }
}
/* The review is of one design and one set of choices: shown again, after
   either changed, it is drawn afresh - and says so. */
let reviewed = '';
/* The gift note is written on the details step, after the review, so it is
   not part of what the review is of. */
const reviewKey = () => snapshot() + JSON.stringify({ ...order, giftNote: '' });
function reviewIfChanged() {
  if ($('orderstep1').hidden && reviewed !== reviewKey()) { showOrderStep(2); $('reviewchanged').hidden = false; return true; }
  return false;
}
$('toreview').addEventListener('click', () => showOrderStep(2));
$('backtooptions').addEventListener('click', () => showOrderStep(1));
$('backtoedit').addEventListener('click', () => { showTab(lastEditTab); showOrderStep(1); const b = tabButtons.find((x) => x.dataset.tab === lastEditTab); if (b) b.focus({ preventScroll: true }); });
$('tocheckout').addEventListener('click', () => showOrderStep(3));
$('backtoorder').addEventListener('click', () => showOrderStep(2));
/* The say-so for sample words is for the words it was given: different
   words ask again. */
let confirmedSamples = '';
$('keepsamples').addEventListener('change', () => { confirmedSamples = $('keepsamples').checked ? sampleWordsIn().join('|') : ''; $('tocheckout').disabled = !$('keepsamples').checked; });
$('reviewbtn').addEventListener('click', () => { showTab('order'); showOrderStep(2); scrollToPanel(); });

/* Weekdays between today and a date; weekends are not build days. */
function businessDaysUntil(iso) {
  const end = Date.parse(iso + 'T12:00:00'); if (Number.isNaN(end)) return null;
  const d = new Date(); d.setHours(12, 0, 0, 0);
  if ((end - d.getTime()) / 86_400_000 > 400) return 400;
  let n = 0;
  while (d.getTime() < end) { d.setDate(d.getDate() + 1); const w = d.getDay(); if (w !== 0 && w !== 6) n++; }
  return n;
}
function needByHint() {
  if (!order.needBy) return '';
  const n = businessDaysUntil(order.needBy); if (n === null) return '';
  const lead = PRICING.leadTimeDays, rush = PRICING.rushDays;
  if (n < rush) return 'That is only ' + n + ' business day' + (n === 1 ? '' : 's') + ' away. Even a Rush build (dispatch in about ' + rush + ' business days) cannot be ready by then, and delivery takes time on top. Get in touch before ordering.';
  if (n < lead) return order.rush
    ? 'That is ' + n + ' business days away. A Rush build dispatches in about ' + rush + ' business days; freight delivery is on top, so this is tight. We cannot promise an arrival date.'
    : 'That is ' + n + ' business days away. Standard orders dispatch in about ' + lead + ' business days, so tick Rush build (about ' + rush + ') - and remember delivery takes time on top.';
  return 'Plenty of time: standard orders dispatch in about ' + lead + ' business days, then freight delivery.';
}
function fillQuote(table, q) {
  table.textContent = '';
  for (const l of q.lines) { const tr = table.insertRow(); tr.insertCell().textContent = (l.qty > 1 ? l.qty + ' x ' : '') + l.label; tr.insertCell().textContent = money(l.cents); }
  const tr = table.insertRow(); tr.className = 'total'; tr.insertCell().textContent = 'Estimated total (USD, before tax)'; tr.insertCell().textContent = money(q.total);
}
function priceNote(q) {
  const boards = PRICING.products[order.product].boards * order.quantity;
  return 'Includes ' + boards + ' regulation board' + (boards === 1 ? '' : 's') + ' with folding legs, your design printed and sealed under the ' + PRICING.finishes[order.finish].label.toLowerCase() + ', and freight to ' + PRICING.shipping.region + ' (not Alaska, Hawaii or overseas). '
    + (order.bags === 'regulation' ? 'Bags are included. ' : 'Bags are not included: add them above. ')
    + 'US dollars, before sales tax, which is added at checkout.';
}
function syncOrder() {
  setChip('product', order.product); setChip('finish', order.finish); setChip('bags', order.bags);
  if (document.activeElement !== $('qty')) $('qty').value = order.quantity;
  $('rush').checked = order.rush; $('carrycase').checked = order.carryCase;
  $('bagcolors').hidden = order.bags !== 'regulation';
  $('bag1').value = order.bagColors[0]; $('bag2').value = order.bagColors[1];
  $('occasion').value = order.occasion; $('needby').value = order.needBy; $('giftnote').value = order.giftNote;
  const hint = needByHint();
  $('needbyhint').textContent = hint; $('needbyhint').hidden = !hint;
  $('finishhint').hidden = order.finish !== 'guestbook';
  const q = quote(order);
  fillQuote($('quote'), q);
  $('pricenote').textContent = priceNote(q);
  $('headtotal').textContent = money(q.total);
  $('mobiletotal').textContent = money(q.total);
  $('ordersummary').textContent = q.lines.slice(0, -1).map((l) => (l.qty > 1 ? l.qty + ' x ' : '') + l.label).join(', ') + ', shipped to your door: ' + money(q.total) + ' before tax.';
  $('shipnote').textContent = 'Freight to ' + PRICING.shipping.region + ': ' + money(PRICING.shipping.first) + ' for the first set or board, ' + money(PRICING.shipping.additional) + ' for each one after.';
  save();
  return q;
}
function renderReview() {
  const q = quote(order), keys = boardKeys();
  const rb = $('reviewboards'); rb.textContent = '';
  for (const k of keys) {
    const f = document.createElement('figure'), img = new Image(), cap = document.createElement('figcaption');
    img.src = previewDataUrl(k, 8); img.alt = 'Board ' + k.toUpperCase() + ' as it will print';
    cap.textContent = keys.length > 1 ? 'Board ' + k.toUpperCase() : order.product === 'set' ? 'Both boards' : 'Your board';
    f.append(img, cap); rb.appendChild(f);
  }
  const list = $('reviewlist'); list.textContent = '';
  const li = (a, b) => { const l = document.createElement('li'), s1 = document.createElement('span'), s2 = document.createElement('span'); s1.textContent = a; if (typeof b === 'string') s2.textContent = b; else s2.append(...b); l.append(s1, s2); list.appendChild(l); return s2; };
  const dot = (hex) => { const s = document.createElement('span'); s.className = 'swatchdot'; s.style.background = hex; s.setAttribute('aria-hidden', 'true'); return s; };
  li('Product', order.quantity + ' x ' + PRICING.products[order.product].label);
  li('Design', order.product === 'single' ? 'One board' : design.same ? 'The same on both boards' : 'Two different boards');
  li('Finish', PRICING.finishes[order.finish].label);
  li('Bags', order.bags === 'regulation'
    ? [PRICING.bags.regulation.label + ': 4 ', dot(order.bagColors[0]), colourName(order.bagColors[0]) + ' and 4 ', dot(order.bagColors[1]), colourName(order.bagColors[1])]
    : 'Not included');
  li('Extras', [order.carryCase && PRICING.carryCase.label.toLowerCase(), order.rush && 'rush build'].filter(Boolean).join(', ') || 'None');
  li('Dispatch', 'about ' + (order.rush ? PRICING.rushDays : PRICING.leadTimeDays) + ' business days, then freight');
  li('Occasion', OCCASIONS[order.occasion]);
  if (order.needBy) li('Needed by', order.needBy);
  if (order.giftNote.trim()) li('Gift note', order.giftNote.trim());
  fillQuote($('reviewquote'), q);
  $('reviewnote').textContent = priceNote(q) + ' Freight transit is on top of dispatch and depends on your address; we confirm an estimate with your order. Dates are estimates, not guarantees.';
  const samples = sampleWordsIn();
  $('samplewarn').hidden = !samples.length;
  $('sampletext').textContent = samples.length ? 'These look like the sample words a template came with: ' + samples.map((s) => '“' + s + '”').join(', ') + '. They would be printed exactly like that. Go back to editing to change them, or confirm that you want them.' : '';
  $('keepsamples').checked = samples.length > 0 && samples.join('|') === confirmedSamples;
  $('tocheckout').disabled = samples.length > 0 && !$('keepsamples').checked;
  const low = lowResImages(keys);
  $('reswarn').hidden = !low.length; $('reswarn').textContent = low.join(' ');
  reviewed = reviewKey();
  $('reviewchanged').hidden = true;
}

function status(kind, text) { const s = $('orderstatus'); s.dataset.kind = kind; s.textContent = text; }
/* What is posted: only what is ordered. Board B is blank when both boards
   match or a single board is ordered, and empty text is left out. The
   pictures' masters go along when the whole order fits the server's limit;
   otherwise they stay out, and if the previews alone are still too much
   those come down in size, largest first - and options.assets says the
   full-size files are still to come. */
async function orderPayload() {
  const f = $('orderform');
  const v = (id) => f.elements[id].value.trim();
  const previews = [previewDataUrl('a')];
  if (order.product === 'set' && !design.same) previews.push(previewDataUrl('b'));
  const opts = { product: order.product, quantity: order.quantity, finish: order.finish, bags: order.bags, rush: order.rush,
    carryCase: order.carryCase, occasion: order.occasion, giftNote: order.giftNote.trim() };
  if (order.bags === 'regulation') opts.bagColors = [...order.bagColors];
  if (order.needBy) opts.needBy = order.needBy;
  const designOut = parseSnapshot(snapshot());
  if (designOut.same || order.product === 'single') designOut.b = freshBoard();
  for (const k of ['a', 'b']) designOut[k].elements = designOut[k].elements.filter((e) => e.type !== 'text' || e.text.trim());
  const pictures = [];
  for (const k of ['a', 'b']) for (const e of designOut[k].elements) if (e.type === 'image') pictures.push(e);
  const payload = {
    options: opts,
    design: designOut,
    previews,
    customer: { name: v('name'), email: v('email'), phone: v('phone') },
    shipping: { line1: v('line1'), line2: v('line2'), city: v('city'), state: v('state'), postal: v('postal'), country: v('country') },
    notes: v('notes'),
  };
  if (pictures.length) {
    const size = () => JSON.stringify(payload).length;
    let dropped = false;
    if (size() > PAYLOAD_BYTES) for (const e of pictures) if (e.orig) { delete e.orig; dropped = true; }
    for (let tries = 0; tries < 10 && size() > PAYLOAD_BYTES; tries++) {
      const big = pictures.reduce((a, b) => (a.src.length >= b.src.length ? a : b));
      big.src = await shrunkPreview(big.src, 0.7); dropped = true;
    }
    opts.assets = dropped ? 'pending' : 'included';
  }
  return payload;
}
$('orderform').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const f = $('orderform');
  if (!f.checkValidity()) { f.reportValidity(); return; }
  if (reviewIfChanged()) return;
  if (!activeBoard().elements.length && design.a.base.kind === 'paint' && design.a.pattern.kind === 'none') {
    if (!confirm('Your board is a plain colour with nothing on it. Order it like that?')) return;
  }
  const btn = $('checkout'); btn.disabled = true; status('info', 'Sending your design…');
  try {
    const payload = await orderPayload();
    const r = await fetch('api/order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const j = await r.json().catch(() => ({}));
    const files = payload.options.assets === 'pending' ? ' Your pictures were too large to send in full with the order, so we will email you for the full-size files.' : '';
    if (r.status === 503 && j.error === 'not_configured') {
      status('warn', 'Ordering is not switched on for this site yet. Download the print file above and send it to us, and we will quote it by hand.');
    } else if (!r.ok) {
      status('bad', j.message || ('Something went wrong (' + r.status + '). Nothing was charged.'));
    } else if (j.url) {
      status('ok', 'Order ' + j.code + ' saved. Taking you to payment…');
      window.location.assign(j.url);
      return;
    } else {
      status('ok', 'Order ' + j.code + ' received. We will email you an invoice for ' + money(j.total) + ' and start once it is paid.' + files);
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
    $('donebody').innerHTML = '<p>No charge was made, and your design is still here. When you are ready, go to the Order tab, review it and continue to payment again: that places a new order with a new code' + (code ? ', and the unpaid one, <code>' + code.replace(/[^A-Z0-9-]/g, '') + '</code>, is simply left' : '') + '.</p>';
  }
  box.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

// -- stage bar, project buttons
$('undo').addEventListener('click', undo);
$('redo').addEventListener('click', redo);
$('reset').addEventListener('click', () => { if (!confirm('Start over with a blank board? This clears your design.')) return; design = freshDesign(); selected = null; active = 'a'; syncAll(); commit(); });
$('download').addEventListener('click', async () => {
  const keys = boardKeys();
  await preloadImages(keys);
  for (const k of keys) {
    const blob = await new Promise((res) => printCanvas(k).toBlob(res, 'image/png'));
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'cornhole-board-' + k.toUpperCase() + '-24x48in-100ppi.png';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  }
});
$('exportbtn').addEventListener('click', exportProject);
$('exportlink').addEventListener('click', exportProject);
$('importbtn').addEventListener('click', () => $('importfile').click());
$('importfile').addEventListener('change', async () => {
  const f = $('importfile').files[0]; $('importfile').value = '';
  if (!f) return;
  try { importProject(JSON.parse(await f.text())); }
  catch (e) { alert('Could not import that file: ' + (e && e.message ? e.message : e) + '.'); }
});

/* The business behind the site, from lib/site.mjs. A detail that is not
   filled in is said to be on its way, never made up. */
function renderSite() {
  const name = SITE.name || 'Cornhole Board Builder';
  $('brand').textContent = name; document.title = name;
  const contact = [SITE.email && 'Email ' + SITE.email, SITE.phone && 'Phone ' + SITE.phone, SITE.address, SITE.hours].filter(Boolean);
  $('contactcard').textContent = contact.length ? contact.join('. ') + '.' : 'Contact details are being set up. Until then, the notes box on the order form reaches us with your order.';
  $('deliverycard').textContent = SITE.delivery || (SHIP_NOTE + ' ' + dispatchNote());
  $('customcard').textContent = SITE.customOrders || 'Need something the builder cannot do? Say so in the notes box on the order form.';
  $('approvalcard').textContent = SITE.approval || 'The preview is the file we print from: what you see on the board is what we print, with the hole cut where it is shown. Check every word before you pay.';
  const photos = $('photos'); photos.textContent = ''; photos.hidden = !SITE.photos.length;
  for (const p of SITE.photos) { const img = new Image(); img.src = p.src; img.alt = p.alt || ''; img.loading = 'lazy'; photos.appendChild(img); }
  $('footer').textContent = name + '. Boards are regulation ACA/ACL size.' + (contact.length ? ' ' + contact.join('. ') + '.' : '');
}

function syncAll() { syncBoard(); syncLists(); syncProps(); syncOrder(); syncHistoryButtons(); render(); }

/* ====================================================================
   BOOT. The page draws at once, then the saved project (if any) is read
   from the device and put in place. Until then the builder takes no click
   and no key (body.loading), so an edit can never race the restore and
   lose it; nothing is written back until the restore has finished, so a
   restored project is never overwritten by the fresh page. A device that
   does not answer in a few seconds is not waited for: the page goes on,
   and a project that turns up late is offered, not forced.
   ==================================================================== */
history = [snapshot()];
syncAll();
showOutcome();
renderSite();
function restoreProject(p) {
  design = migrate(p.design);
  if (p.order) applyOrder(p.order);
  selected = null; active = 'a';
  history = [snapshot()]; future = [];
  syncAll(); showTab('board');
}
(async () => {
  const loading = loadProject().catch(() => null);
  let p = await Promise.race([loading, new Promise((res) => setTimeout(() => res(undefined), 6000))]);
  if (p === undefined) {
    /* Late: by now the customer may be at work on the fresh page. */
    loading.then((late) => { if (!late) return; if (history.length < 2) { restoreProject(late); setSaveState('saved'); } else if (confirm('A design saved earlier on this device was found. Replace what you have started with it?')) { restoreProject(late); commit(); } });
    p = null;
  }
  if (p) { restoreProject(p); storageReady = true; setSaveState('saved'); }
  else { storageReady = true; setSaveState('new'); }
  loaded = true;
  document.body.classList.remove('loading');
})();
window.addEventListener('resize', render);
/* Web fonts arrive after the first paint; a text set in one is measured
   and drawn in the fallback until then. Repaint when each one lands, and
   redraw the template thumbnails too. */
const refontThumbs = () => { for (const b of document.querySelectorAll('#templates .tpl')) { const t = TEMPLATES.find((x) => x.id === b.dataset.id), c = b.querySelector('canvas'); if (!t || !c) continue; c.getContext('2d').clearRect(0, 0, c.width, c.height); renderBoard(c.getContext('2d'), t.board(), c.height / BOARD.h); } render(); };
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
  get loaded() { return loaded; },
  get saveState() { return saveState; },
  get historyBytes() { return history.reduce((n, s) => n + s.length, 0) + future.reduce((n, s) => n + s.length, 0); },
  setDesign(d) { design = migrate(JSON.parse(JSON.stringify(d))); selected = null; syncAll(); commit(); },
  setOrder(o) { Object.assign(order, o); syncAll(); },
  select, commit, undo, redo, render, paint, showTab, printCanvas, previewDataUrl, orderPayload, preloadImages,
  activeBoard, addClip, applyTemplate, applyBlank, migrate, showOrderStep, renderReview, handlePoints, setMode,
  isPristine, sampleWordsIn, exportProject, importProject, projectRecord, colourName,
};
