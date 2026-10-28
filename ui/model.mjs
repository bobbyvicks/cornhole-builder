/* The design and what it is made of: the board, the paints, fonts and
   patterns, the defaults for each kind of item, a fresh or migrated design,
   and the sample words a template arrives with. Part of app.mjs, which
   holds the design itself (design, active, selected); this reads them. */

import { PRICING } from '../lib/price.mjs';
import { CLIPS as CORE_CLIPS, CLIP_CATS as CORE_CLIP_CATS } from '../lib/clips.mjs';
import { makeTemplates } from '../lib/templates.mjs';
import { PACK_CLIPS, PACK_CATEGORIES, makeCreativeTemplates } from '../lib/creative-pack.mjs';
import { design, active, selected } from '../app.mjs';

const CLIPS = { ...CORE_CLIPS, ...PACK_CLIPS };
const CLIP_CATS = { ...CORE_CLIP_CATS, ...PACK_CATEGORIES };

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
   and its preview fit the order: what the request budget has left after
   the preview and PAYLOAD_MARGIN for the board previews and the details,
   and never more than ORIG_BYTES. An order that would not fit the
   server's body limit even so leaves the masters out, then shrinks the
   previews, and says so. */
const PREVIEW_SIDE = 1600, PREVIEW_BYTES = 1_500_000, ORIG_SIDE = 4000, ORIG_BYTES = 3_000_000, PAYLOAD_BYTES = 3_800_000, PAYLOAD_MARGIN = 200_000;
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
/* A picture with cover set fills the whole board, under everything else
   (see drawImage); its own place, width, turn and circle crop are kept
   for when it is put back. One picture per board fills it at a time. */
const IMAGE_DEFAULTS = { rotation: 0, opacity: 1, flipH: false, circleCrop: false, knockout: false, cover: false };
const CLIP_DEFAULTS = { color: '#f5f5f0', outline: '#111111', outlineWidth: 0, rotation: 0, opacity: 1, flipH: false, width: 8 };
/* Words may run over several lines, so a line break stays, and the
   carriage return of a file written elsewhere, alone or before a line
   feed, becomes a line break too. Any other control character - a tab
   pasted in - prints as nothing and the order would refuse it, so it
   becomes a space. A field's value never holds a carriage return, so
   there the change is one character for one and the caret stays put. */
const cleanWords = (text) => String(text).replace(/\r\n?/g, '\n').replace(/\p{Cc}/gu, (c) => (c === '\n' ? c : ' '));
function withDefaults(el) {
  const d = el.type === 'text' ? TEXT_DEFAULTS : el.type === 'image' ? IMAGE_DEFAULTS : CLIP_DEFAULTS;
  const out = { ...d, ...el, id: el.id || uid() };
  if (out.type === 'text' && typeof out.text === 'string') out.text = cleanWords(out.text);
  return out;
}
const T = (text, o) => withDefaults({ type: 'text', text, font: 'Anton', size: 4, color: '#f5f5f0', x: 12, y: 30, ...o });
const C = (name, o) => withDefaults({ type: 'clip', name, x: 12, y: 20, ...o });

/* Whether an item is a picture filling its board, and the one that does. */
const fills = (el) => el.type === 'image' && el.cover === true;
const coverOf = (b) => b.elements.find(fills) || null;
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
  /* A picture saved before Fill the board existed has no cover field and
     gets false from the defaults. A file that marks two pictures on one
     board keeps the first, as the page itself only ever allows one. */
  for (const key of ['a', 'b']) {
    const cover = coverOf(out[key]);
    for (const e of out[key].elements) if (e.type === 'image' && e !== cover) e.cover = false;
  }
  return out;
}

const TEMPLATES = [
  ...makeTemplates({ T, C, freshBoard }),
  ...makeCreativeTemplates({ T, C, freshBoard }),
];
/* Sample words: the placeholders the page itself puts on a board, and
   the words a template arrives with. A design that still carries one at
   the checkout is almost always a mistake, so the review asks; and a
   words field holding one selects it all when it takes the focus, so
   typing replaces it.
   Words compare with their spaces and line breaks evened out, so sample
   words only broken onto two lines still count. */
const sampleKey = (text) => text.trim().replace(/\s+/g, ' ').toLowerCase();
const PLACEHOLDER_WORDS = new Set(['your team', 'new text', 'your name', 'your words']);
const TEMPLATE_WORDS = new Set();
for (const t of TEMPLATES) for (const e of t.board().elements) if (e.type === 'text') TEMPLATE_WORDS.add(sampleKey(e.text));
/* A placeholder is a sample whoever typed it. A template's words are a
   sample only on a text the template put there, while they are still
   its words: applyTemplate keeps them as the text's fitReference. The
   same words typed by the customer - EST. 2026, for a team founded this
   year - are theirs. */
function isSampleText(el) {
  if (!el || el.type !== 'text') return false;
  const key = sampleKey(el.text), ref = el.fitReference;
  if (PLACEHOLDER_WORDS.has(key)) return true;
  return !!ref && typeof ref.text === 'string' && sampleKey(ref.text) === key && TEMPLATE_WORDS.has(key);
}
const order = { product: 'set', quantity: 1, finish: 'satin', bags: 'none', bagColors: ['#c8102e', '#1f3a93'], rush: false, carryCase: false, occasion: 'other', needBy: '', giftNote: '' };

const activeBoard = () => design[active];
const boardFor = (key, source = design) => source[source.same ? 'a' : key];
const findEl = (id) => activeBoard().elements.find((e) => e.id === id) || null;
const selectedEl = () => (selected ? findEl(selected) : null);
const countOf = (b, type) => b.elements.filter((e) => e.type === type).length;
const limitOf = (type) => ({ text: MAX_TEXTS, image: MAX_IMAGES, clip: MAX_CLIPS })[type];
const boardKeys = () => (order.product === 'set' && !design.same ? ['a', 'b'] : ['a']);

/* A design nobody has touched: the page's own default, a blank board, or
   a template exactly as it came. Anything else is someone's work, and a
   template click asks before replacing it - after a reload too.
   No template and no blank board has a picture on it, so a board with one
   is someone's work without comparing anything: written out, the photos'
   data made every template tap freeze a phone for two seconds before its
   question. Otherwise the board is written out once and compared with
   each untouched board in turn. (A template given a picture one day
   would only make a tap ask first, never replace work unasked.) */
const stripIds = (b) => JSON.stringify({ ...b, elements: b.elements.map(({ id, fitReference, autoFit, ...e }) => e) });
function isPristine() {
  if (!design.same) return false;
  if (design.a.elements.some((e) => e.type === 'image')) return false;
  const board = stripIds(design.a);
  if (board === stripIds(freshDesign().a) || board === stripIds(freshBoard())) return true;
  return TEMPLATES.some((t) => board === stripIds(t.board()));
}
function sampleWordsIn() {
  const out = new Set();
  for (const k of boardKeys()) for (const e of design[k].elements) if (isSampleText(e)) out.add(e.text.trim());
  return [...out];
}
/* Same words, same text node: a status region announces a change, and
   setting what it already says would have a screen reader read the whole
   sentence again after every character typed. */
function setText(el, text) { if (el.textContent !== text) el.textContent = text; }

export {
  CLIPS, CLIP_CATS, BOARD, PRINT_PPI, DESIGN_VERSION, PROJECT_VERSION, PAINTS,
  PAINTS_SOFT, STAINS, FONTS, FONT_WEIGHT, PATTERNS, OCCASIONS,
  TEMPLATE_GROUPS, SHIP_STATES, MAX_IMAGES, MAX_TEXTS, PREVIEW_SIDE,
  PREVIEW_BYTES, ORIG_BYTES, PAYLOAD_BYTES, PAYLOAD_MARGIN, ORIG_SIDE,
  SHARP_DPI, SOFT_DPI, $, clamp, uid, rad, r1, isHex, rgb, colourName, today,
  cleanWords, withDefaults, T, C, fills, coverOf, freshBoard, freshDesign,
  migrate, TEMPLATES, isSampleText, order, activeBoard, boardFor, findEl,
  selectedEl, countOf, limitOf, boardKeys, isPristine, sampleWordsIn, setText
};
