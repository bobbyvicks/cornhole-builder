/* CLIP ART, as vector paths. Imported by app.mjs; see the note at the top
   of the table. Everything here is pure drawing: no DOM. */
const rad = (d) => d * Math.PI / 180;

/* A small seeded generator, so the grain is the same picture every render
   and on the print file - a different pattern of lines each frame would
   shimmer under the pointer. */
export function prng(seed) {
  let s = 0; for (const c of seed) s = (s * 31 + c.charCodeAt(0)) >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* ====================================================================
   CLIP ART. Each piece is drawn into a 100 x 100 box, centred on (50,50),
   as vector paths: it is scaled to inches at render time, so it is as
   sharp on the 2400 x 4800 print file as in the preview. `aspect` is the
   ink's height over its width, for the hit box. `mode: 'stroke'` pieces
   are drawn as a line of width `lw` instead of filled.
   ==================================================================== */
const poly = (p, pts) => { pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y))); p.closePath(); };
const circle = (p, cx, cy, r, ccw = false) => { p.moveTo(cx + r, cy); p.arc(cx, cy, r, 0, Math.PI * 2, ccw); p.closePath(); };
const ring = (p, cx, cy, ro, ri) => { circle(p, cx, cy, ro); circle(p, cx, cy, ri, true); };
const ellipse = (p, cx, cy, rx, ry, rot = 0) => { p.moveTo(cx + rx * Math.cos(rot), cy + rx * Math.sin(rot)); p.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2); p.closePath(); };
const rrect = (p, x, y, w, h, r) => { p.roundRect(x, y, w, h, r); };
const rect = (p, x, y, w, h) => poly(p, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]);
const star = (p, cx, cy, ro, ri, n = 5, rot = -90) => { const pts = []; for (let i = 0; i < n * 2; i++) { const a = rad(rot + i * 180 / n), r = i % 2 ? ri : ro; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } poly(p, pts); };
const ngon = (p, cx, cy, r, n, rot = -90) => { const pts = []; for (let i = 0; i < n; i++) { const a = rad(rot + i * 360 / n); pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } poly(p, pts); };
const rotPts = (pts, cx, cy, deg) => { const a = rad(deg), c = Math.cos(a), s = Math.sin(a); return pts.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]); };
export function heart(p, cx, cy, s, deg = 0) {
  const c = Math.cos(rad(deg)), n = Math.sin(rad(deg));
  const X = (x, y) => cx + ((x - 50) * c - (y - 50) * n) * s, Y0 = (x, y) => cy + ((x - 50) * n + (y - 50) * c) * s;
  /* Every point goes through the same rotation; the bezier calls below
     pass x and y to both mappers. */
  const pts = []; const Y = (y) => { pts.push(y); return y; };
  const B = (x1, y1, x2, y2, x3, y3) => p.bezierCurveTo(X(x1, y1), Y0(x1, y1), X(x2, y2), Y0(x2, y2), X(x3, y3), Y0(x3, y3));
  p.moveTo(X(50, 90), Y0(50, 90));
  B(18, 66, 4, 46, 4, 30); B(4, 13, 18, 5, 31, 5); B(41, 5, 48, 12, 50, 20); B(52, 12, 59, 5, 69, 5); B(82, 5, 96, 13, 96, 30); B(96, 46, 82, 66, 50, 90);
  p.closePath();
}
function heartOld(p, cx, cy, s) {
  const X = (x) => cx + (x - 50) * s, Y = (y) => cy + (y - 50) * s;
  p.moveTo(X(50), Y(90));
  p.bezierCurveTo(X(18), Y(66), X(4), Y(46), X(4), Y(30)); p.bezierCurveTo(X(4), Y(13), X(18), Y(5), X(31), Y(5));
  p.bezierCurveTo(X(41), Y(5), X(48), Y(12), X(50), Y(20)); p.bezierCurveTo(X(52), Y(12), X(59), Y(5), X(69), Y(5));
  p.bezierCurveTo(X(82), Y(5), X(96), Y(13), X(96), Y(30)); p.bezierCurveTo(X(96), Y(46), X(82), Y(66), X(50), Y(90));
  p.closePath();
}
/* The part of circle 1 that lies outside circle 2: the two circles'
   intersection points, then the outer arc of one and the inner arc of
   the other, each direction chosen by testing its midpoint. */
function crescent(p, c1, r1_, c2, r2) {
  const dx = c2[0] - c1[0], dy = c2[1] - c1[1], d = Math.hypot(dx, dy);
  const a = (r1_ * r1_ - r2 * r2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, r1_ * r1_ - a * a));
  const mx = c1[0] + a * dx / d, my = c1[1] + a * dy / d;
  const i1 = [mx + h * dy / d, my - h * dx / d], i2 = [mx - h * dy / d, my + h * dx / d];
  const ang = (c, q) => Math.atan2(q[1] - c[1], q[0] - c[0]);
  const mid = (a1, a2, ccw) => ccw ? a1 - ((a1 - a2 + Math.PI * 2) % (Math.PI * 2)) / 2 : a1 + ((a2 - a1 + Math.PI * 2) % (Math.PI * 2)) / 2;
  const pt = (c, r, t) => [c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)];
  const a1 = ang(c1, i1), a2 = ang(c1, i2);
  const ccw1 = Math.hypot(...[pt(c1, r1_, mid(a1, a2, true))].map((q) => q[0] - c2[0])) === 0 ? false
    : (Math.hypot(pt(c1, r1_, mid(a1, a2, true))[0] - c2[0], pt(c1, r1_, mid(a1, a2, true))[1] - c2[1]) > r2);
  const b2 = ang(c2, i2), b1 = ang(c2, i1);
  const ccw2 = Math.hypot(pt(c2, r2, mid(b2, b1, true))[0] - c1[0], pt(c2, r2, mid(b2, b1, true))[1] - c1[1]) < r1_;
  p.moveTo(i1[0], i1[1]);
  p.arc(c1[0], c1[1], r1_, a1, a2, ccw1);
  p.arc(c2[0], c2[1], r2, b2, b1, ccw2);
  p.closePath();
}
function flute(p, cx, tilt) {
  const pivot = [cx, 80];
  poly(p, rotPts([[cx - 8, 8], [cx + 8, 8], [cx + 4, 46], [cx - 4, 46]], ...pivot, tilt));
  poly(p, rotPts([[cx - 1.6, 46], [cx + 1.6, 46], [cx + 1.6, 81], [cx - 1.6, 81]], ...pivot, tilt));
  const [bx, by] = rotPts([[cx, 84]], ...pivot, tilt)[0];
  ellipse(p, bx, by, 11, 3.5, rad(tilt));
}
function laurel(p) {
  for (const side of [-1, 1]) for (let i = 0; i < 9; i++) {
    const t = rad(90 + side * (12 + i * 16.5)), r = 34 + (i % 2 ? 2.5 : -2.5);
    ellipse(p, 50 + r * Math.cos(t), 52 + r * Math.sin(t), 9, 4, t + Math.PI / 2);
  }
}
function sun(p) {
  circle(p, 50, 50, 21);
  for (let i = 0; i < 12; i++) {
    const a = rad(i * 30), b = rad(6);
    poly(p, [[50 + 46 * Math.cos(a), 50 + 46 * Math.sin(a)], [50 + 27 * Math.cos(a + b), 50 + 27 * Math.sin(a + b)], [50 + 27 * Math.cos(a - b), 50 + 27 * Math.sin(a - b)]]);
  }
}
function snowflake(p) {
  for (let k = 0; k < 6; k++) {
    const a = rad(k * 60);
    p.moveTo(50, 50); p.lineTo(50 + 42 * Math.cos(a), 50 + 42 * Math.sin(a));
    const bx = 50 + 27 * Math.cos(a), by = 50 + 27 * Math.sin(a);
    for (const s of [-1, 1]) { p.moveTo(bx, by); p.lineTo(bx + 11 * Math.cos(a + s * rad(55)), by + 11 * Math.sin(a + s * rad(55))); }
  }
}
function pine(p) {
  poly(p, [[50, 4], [25, 40], [75, 40]]); poly(p, [[50, 24], [18, 64], [82, 64]]); poly(p, [[50, 44], [10, 88], [90, 88]]);
  rect(p, 44, 88, 12, 10);
}
/* A curved band: the arc of a circle between two angles, `w` wide. With
   an even-odd fill inside a disc it reads as a seam on a ball. */
function band(p, cx, cy, r, a0, a1, w, n = 20) {
  const pts = [];
  for (let i = 0; i <= n; i++) { const a = rad(a0 + (a1 - a0) * i / n); pts.push([cx + (r + w / 2) * Math.cos(a), cy + (r + w / 2) * Math.sin(a)]); }
  for (let i = n; i >= 0; i--) { const a = rad(a0 + (a1 - a0) * i / n); pts.push([cx + (r - w / 2) * Math.cos(a), cy + (r - w / 2) * Math.sin(a)]); }
  poly(p, pts);
}
function bell(p, cx, cy, deg, k = 1) {
  const c = Math.cos(rad(deg)), n = Math.sin(rad(deg));
  const M = (x, y) => [cx + (x * c - y * n) * k, cy + (x * n + y * c) * k];
  const pt = (x, y) => M(x, y);
  p.moveTo(...pt(-18, 10)); p.bezierCurveTo(...pt(-18, -20), ...pt(-8, -28), ...pt(0, -28)); p.bezierCurveTo(...pt(8, -28), ...pt(18, -20), ...pt(18, 10)); p.closePath();
  const [rx, ry] = pt(0, 12); ellipse(p, rx, ry, 22 * k, 6 * k, rad(deg));
  const [kx, ky] = pt(0, 20); circle(p, kx, ky, 5 * k);
  const [tx, ty] = pt(0, -31); circle(p, tx, ty, 4 * k);
}
function confetti(p) {
  const rnd = prng('confetti');
  for (let i = 0; i < 22; i++) {
    const x = 8 + rnd() * 84, y = 8 + rnd() * 84, a = rnd() * 180;
    if (i % 4 === 0) circle(p, x, y, 3.5); else poly(p, rotPts([[x - 5, y - 2.5], [x + 5, y - 2.5], [x + 5, y + 2.5], [x - 5, y + 2.5]], x, y, a));
  }
}
export const CLIPS = {
  // love and weddings
  heart: { label: 'Heart', cat: 'love', path: (p) => heart(p, 50, 50, 0.95) },
  hearts: { label: 'Two hearts', cat: 'love', path: (p) => { heart(p, 36, 58, 0.62); heart(p, 64, 40, 0.62); } },
  'heart-outline': { label: 'Heart outline', cat: 'love', mode: 'stroke', lw: 8, path: (p) => heart(p, 50, 50, 0.86) },
  rings: { label: 'Wedding rings', cat: 'love', aspect: 0.85, path: (p) => { ring(p, 37, 55, 25, 18); ring(p, 63, 45, 25, 18); } },
  'diamond-ring': { label: 'Diamond ring', cat: 'love', path: (p) => { ring(p, 50, 62, 30, 22); poly(p, [[50, 6], [68, 22], [50, 42], [32, 22]]); } },
  infinity: { label: 'Infinity', cat: 'love', mode: 'stroke', lw: 9, aspect: 0.5, path: (p) => { p.moveTo(50, 50); p.bezierCurveTo(50, 22, 8, 22, 8, 50); p.bezierCurveTo(8, 78, 50, 78, 50, 50); p.bezierCurveTo(50, 22, 92, 22, 92, 50); p.bezierCurveTo(92, 78, 50, 78, 50, 50); } },
  champagne: { label: 'Champagne', cat: 'love', path: (p) => { flute(p, 38, 14); flute(p, 62, -14); } },
  wine: { label: 'Wine glass', cat: 'love', aspect: 0.8, path: (p) => { p.moveTo(30, 10); p.lineTo(70, 10); p.bezierCurveTo(72, 45, 55, 50, 52, 52); p.lineTo(52, 80); p.lineTo(66, 88); p.lineTo(34, 88); p.lineTo(48, 80); p.lineTo(48, 52); p.bezierCurveTo(45, 50, 28, 45, 30, 10); p.closePath(); } },
  laurel: { label: 'Laurel wreath', cat: 'love', path: laurel },
  flower: { label: 'Flower', cat: 'love', path: (p) => { for (let i = 0; i < 6; i++) { const a = rad(i * 60); ellipse(p, 50 + 18 * Math.cos(a), 50 + 18 * Math.sin(a), 21, 10, a); } circle(p, 50, 50, 10); } },
  'bow-tie': { label: 'Bow tie', cat: 'love', aspect: 0.6, path: (p) => { poly(p, [[6, 22], [46, 44], [46, 56], [6, 78]]); poly(p, [[94, 22], [54, 44], [54, 56], [94, 78]]); rrect(p, 43, 40, 14, 20, 4); } },
  cross: { label: 'Cross', cat: 'love', path: (p) => poly(p, [[40, 5], [60, 5], [60, 35], [90, 35], [90, 55], [60, 55], [60, 95], [40, 95], [40, 55], [10, 55], [10, 35], [40, 35]]) },
  // celebrations
  balloons: { label: 'Balloons', cat: 'party', path: (p) => { ellipse(p, 30, 40, 19, 24); poly(p, [[25, 63], [35, 63], [30, 58]]); ellipse(p, 70, 40, 19, 24); poly(p, [[65, 63], [75, 63], [70, 58]]); ellipse(p, 50, 28, 19, 24); poly(p, [[45, 51], [55, 51], [50, 46]]); poly(p, [[29, 63], [31, 63], [51, 96], [49, 96]]); poly(p, [[69, 63], [71, 63], [51, 96], [49, 96]]); poly(p, [[49, 51], [51, 51], [51, 96], [49, 96]]); } },
  cake: { label: 'Cake', cat: 'party', aspect: 0.9, path: (p) => { rrect(p, 14, 62, 72, 30, 4); rrect(p, 26, 40, 48, 24, 4); rect(p, 33, 20, 4, 20); rect(p, 48, 14, 4, 26); rect(p, 63, 20, 4, 20); ellipse(p, 35, 14, 3, 5); ellipse(p, 50, 8, 3, 5); ellipse(p, 65, 14, 3, 5); } },
  gift: { label: 'Gift', cat: 'party', path: (p) => { rrect(p, 16, 42, 68, 50, 3); rrect(p, 10, 30, 80, 14, 3); ellipse(p, 38, 22, 12, 7, -0.6); ellipse(p, 62, 22, 12, 7, 0.6); circle(p, 50, 24, 6); } },
  trophy: { label: 'Trophy', cat: 'party', path: (p) => { poly(p, [[24, 12], [76, 12], [68, 56], [32, 56]]); ring(p, 21, 30, 13, 7); ring(p, 79, 30, 13, 7); rect(p, 45, 56, 10, 16); rrect(p, 32, 72, 36, 9, 2); rrect(p, 26, 82, 48, 9, 2); } },
  crown: { label: 'Crown', cat: 'party', aspect: 0.8, path: (p) => { poly(p, [[10, 82], [10, 36], [30, 56], [50, 20], [70, 56], [90, 36], [90, 82]]); circle(p, 10, 36, 5); circle(p, 50, 20, 5); circle(p, 90, 36, 5); } },
  star: { label: 'Star', cat: 'party', path: (p) => star(p, 50, 52, 46, 19) },
  'star-outline': { label: 'Star outline', cat: 'party', mode: 'stroke', lw: 7, path: (p) => star(p, 50, 52, 42, 17) },
  'three-stars': { label: 'Three stars', cat: 'party', aspect: 0.7, path: (p) => { star(p, 22, 56, 20, 8); star(p, 50, 40, 27, 11); star(p, 78, 56, 20, 8); } },
  badge: { label: 'Badge', cat: 'party', rule: 'evenodd', path: (p) => { star(p, 50, 50, 47, 41, 16); circle(p, 50, 50, 33); } },
  banner: { label: 'Banner', cat: 'party', aspect: 0.4, path: (p) => poly(p, [[4, 32], [96, 32], [86, 50], [96, 68], [4, 68], [14, 50]]) },
  'grad-cap': { label: 'Graduation', cat: 'party', aspect: 0.6, path: (p) => { poly(p, [[50, 18], [96, 38], [50, 58], [4, 38]]); rrect(p, 32, 48, 36, 22, 3); rect(p, 88, 38, 3, 24); circle(p, 89.5, 64, 3); } },
  'music-note': { label: 'Music note', cat: 'party', path: (p) => { ellipse(p, 34, 78, 15, 10, -0.35); rect(p, 45, 18, 5, 60); p.moveTo(50, 18); p.bezierCurveTo(62, 28, 80, 30, 70, 56); p.bezierCurveTo(73, 42, 60, 40, 50, 36); p.closePath(); } },
  // sports and fun
  football: { label: 'Football', cat: 'sport', aspect: 0.56, rule: 'evenodd', path: (p) => { ellipse(p, 50, 50, 46, 26); rect(p, 35, 48.5, 30, 3); for (let i = 0; i < 5; i++) rect(p, 38 + i * 6, 43, 2.5, 14); } },
  paw: { label: 'Paw print', cat: 'sport', path: (p) => { ellipse(p, 50, 66, 22, 18); ellipse(p, 25, 44, 9, 13, -0.35); ellipse(p, 42, 30, 9, 13, -0.12); ellipse(p, 58, 30, 9, 13, 0.12); ellipse(p, 75, 44, 9, 13, 0.35); } },
  lightning: { label: 'Lightning', cat: 'sport', path: (p) => poly(p, [[56, 4], [24, 54], [45, 54], [38, 96], [76, 40], [55, 40], [70, 4]]) },
  flame: { label: 'Flame', cat: 'sport', path: (p) => { p.moveTo(50, 95); p.bezierCurveTo(20, 95, 15, 70, 30, 55); p.bezierCurveTo(32, 65, 40, 68, 42, 62); p.bezierCurveTo(30, 40, 45, 20, 50, 5); p.bezierCurveTo(55, 25, 75, 35, 70, 55); p.bezierCurveTo(65, 50, 62, 48, 60, 52); p.bezierCurveTo(85, 65, 80, 95, 50, 95); p.closePath(); } },
  horseshoe: { label: 'Horseshoe', cat: 'sport', mode: 'stroke', lw: 11, path: (p) => { p.moveTo(50 + 32 * Math.cos(rad(150)), 54 + 32 * Math.sin(rad(150))); p.arc(50, 54, 32, rad(150), rad(390)); } },
  fish: { label: 'Fish', cat: 'sport', aspect: 0.7, path: (p) => { ellipse(p, 42, 50, 30, 17); poly(p, [[66, 50], [94, 30], [94, 70]]); } },
  anchor: { label: 'Anchor', cat: 'sport', mode: 'stroke', lw: 8, path: (p) => { p.moveTo(57, 14); p.arc(50, 14, 7, 0, Math.PI * 2); p.moveTo(50, 21); p.lineTo(50, 86); p.moveTo(30, 36); p.lineTo(70, 36); p.moveTo(50 + 34 * Math.cos(rad(25)), 52 + 34 * Math.sin(rad(25))); p.arc(50, 52, 34, rad(25), rad(155)); } },
  // nature and home
  sun: { label: 'Sun', cat: 'nature', path: sun },
  moon: { label: 'Moon', cat: 'nature', path: (p) => crescent(p, [48, 50], 40, [64, 44], 33) },
  pine: { label: 'Pine tree', cat: 'nature', path: pine },
  mountains: { label: 'Mountains', cat: 'nature', aspect: 0.75, path: (p) => poly(p, [[2, 88], [30, 30], [44, 52], [64, 14], [98, 88]]) },
  cactus: { label: 'Cactus', cat: 'nature', path: (p) => { rrect(p, 42, 12, 16, 84, 8); rrect(p, 16, 34, 12, 30, 6); rect(p, 22, 56, 20, 10); rrect(p, 72, 22, 12, 32, 6); rect(p, 58, 46, 20, 10); } },
  house: { label: 'House', cat: 'nature', path: (p) => { poly(p, [[50, 8], [4, 50], [96, 50]]); rect(p, 18, 50, 64, 44); rect(p, 66, 16, 10, 20); } },
  // shapes
  circle: { label: 'Circle', cat: 'shape', path: (p) => circle(p, 50, 50, 46) },
  square: { label: 'Square', cat: 'shape', path: (p) => rect(p, 8, 8, 84, 84) },
  'rounded-square': { label: 'Rounded square', cat: 'shape', path: (p) => rrect(p, 8, 8, 84, 84, 14) },
  diamond: { label: 'Diamond', cat: 'shape', path: (p) => poly(p, [[50, 4], [96, 50], [50, 96], [4, 50]]) },
  triangle: { label: 'Triangle', cat: 'shape', path: (p) => poly(p, [[50, 6], [96, 90], [4, 90]]) },
  hexagon: { label: 'Hexagon', cat: 'shape', path: (p) => ngon(p, 50, 50, 46, 6, 0) },
  octagon: { label: 'Octagon', cat: 'shape', path: (p) => ngon(p, 50, 50, 48, 8, 22.5) },
  shield: { label: 'Shield', cat: 'shape', path: (p) => { p.moveTo(50, 5); p.lineTo(90, 18); p.bezierCurveTo(90, 60, 70, 85, 50, 95); p.bezierCurveTo(30, 85, 10, 60, 10, 18); p.closePath(); } },
  arrow: { label: 'Arrow', cat: 'shape', aspect: 0.65, path: (p) => poly(p, [[5, 38], [60, 38], [60, 20], [95, 50], [60, 80], [60, 62], [5, 62]]) },
  check: { label: 'Check mark', cat: 'shape', mode: 'stroke', lw: 13, aspect: 0.7, path: (p) => { p.moveTo(14, 54); p.lineTo(40, 80); p.lineTo(88, 24); } },
  // more love and weddings
  dove: { label: 'Dove', cat: 'love', aspect: 0.7, path: (p) => { ellipse(p, 48, 56, 23, 13, -0.15); circle(p, 69, 42, 8); poly(p, [[76, 41], [85, 44], [76, 47]]); ellipse(p, 44, 40, 15, 6, -0.95); poly(p, [[30, 56], [8, 66], [12, 54], [8, 46], [30, 50]]); } },
  'arrow-heart': { label: 'Heart and arrow', cat: 'love', path: (p) => { heart(p, 50, 50, 0.8); poly(p, rotPts([[0, 47.5], [96, 47.5], [96, 52.5], [0, 52.5]], 50, 50, -32)); poly(p, rotPts([[100, 50], [86, 41], [86, 59]], 50, 50, -32)); poly(p, rotPts([[0, 50], [10, 40], [16, 46], [8, 50], [16, 54], [10, 60]], 50, 50, -32)); } },
  bells: { label: 'Wedding bells', cat: 'love', path: (p) => { bell(p, 36, 54, -18, 0.95); bell(p, 64, 54, 18, 0.95); } },
  rose: { label: 'Rose', cat: 'love', mode: 'stroke', lw: 5, path: (p) => { p.moveTo(50, 44); for (let t = 0; t <= Math.PI * 4.2; t += 0.15) { const r = 2 + t * 2.6; p.lineTo(50 + r * Math.cos(t), 44 + r * Math.sin(t)); } p.moveTo(50, 78); p.lineTo(50, 96); ellipse(p, 40, 86, 9, 4, -0.6); ellipse(p, 60, 90, 9, 4, 0.6); } },
  lips: { label: 'Lips', cat: 'love', aspect: 0.5, path: (p) => { p.moveTo(8, 50); p.bezierCurveTo(20, 30, 40, 34, 50, 44); p.bezierCurveTo(60, 34, 80, 30, 92, 50); p.closePath(); p.moveTo(8, 50); p.bezierCurveTo(20, 74, 80, 74, 92, 50); p.closePath(); } },
  'oval-frame': { label: 'Oval frame', cat: 'love', rule: 'evenodd', path: (p) => { ellipse(p, 50, 50, 40, 48); ellipse(p, 50, 50, 32, 40); } },
  frame: { label: 'Frame', cat: 'love', rule: 'evenodd', path: (p) => { rrect(p, 6, 6, 88, 88, 6); rrect(p, 16, 16, 68, 68, 3); } },
  leaf: { label: 'Leaf', cat: 'love', path: (p) => { p.moveTo(50, 92); p.bezierCurveTo(8, 70, 10, 30, 50, 4); p.bezierCurveTo(90, 30, 92, 70, 50, 92); p.closePath(); rect(p, 48, 86, 4, 12); } },
  branch: { label: 'Branch', cat: 'love', path: (p) => { poly(p, rotPts([[6, 48.5], [94, 48.5], [94, 51.5], [6, 51.5]], 50, 50, -45)); for (let i = 0; i < 6; i++) { const t = 0.12 + i * 0.15, x = 6 + 88 * t, y = 94 - 88 * t, side = i % 2 ? 1 : -1; ellipse(p, x + side * 6, y + side * 6, 9, 4.5, rad(-45 + side * 50)); } } },
  sunflower: { label: 'Sunflower', cat: 'love', path: (p) => { for (let i = 0; i < 14; i++) { const a = rad(i * 360 / 14); ellipse(p, 50 + 24 * Math.cos(a), 50 + 24 * Math.sin(a), 19, 6, a); } circle(p, 50, 50, 16); } },
  // more celebrations
  confetti: { label: 'Confetti', cat: 'party', path: confetti },
  'party-hat': { label: 'Party hat', cat: 'party', path: (p) => { poly(p, [[50, 10], [20, 80], [80, 80]]); circle(p, 50, 10, 7); ellipse(p, 50, 80, 32, 7); } },
  cupcake: { label: 'Cupcake', cat: 'party', path: (p) => { poly(p, [[22, 56], [78, 56], [70, 94], [30, 94]]); circle(p, 32, 52, 13); circle(p, 50, 44, 16); circle(p, 68, 52, 13); circle(p, 50, 25, 6); } },
  cocktail: { label: 'Cocktail', cat: 'party', aspect: 0.85, path: (p) => { poly(p, [[10, 10], [90, 10], [52, 50], [48, 50]]); rect(p, 48, 50, 4, 34); ellipse(p, 50, 86, 18, 4); } },
  fireworks: { label: 'Fireworks', cat: 'party', mode: 'stroke', lw: 5, path: (p) => { for (let i = 0; i < 10; i++) { const a = rad(i * 36 - 90); p.moveTo(50 + 14 * Math.cos(a), 46 + 14 * Math.sin(a)); p.lineTo(50 + 40 * Math.cos(a), 46 + 40 * Math.sin(a)); circle(p, 50 + 44 * Math.cos(a), 46 + 44 * Math.sin(a), 2); } } },
  medal: { label: 'Medal', cat: 'party', path: (p) => { poly(p, [[36, 4], [64, 4], [58, 50], [42, 50]]); ring(p, 50, 68, 26, 17); star(p, 50, 68, 13, 5); } },
  ticket: { label: 'Ticket', cat: 'party', aspect: 0.5, rule: 'evenodd', path: (p) => { rrect(p, 6, 28, 88, 44, 5); circle(p, 6, 50, 7); circle(p, 94, 50, 7); } },
  'disco-ball': { label: 'Disco ball', cat: 'party', rule: 'evenodd', path: (p) => { circle(p, 50, 54, 40); rect(p, 10, 37, 80, 2); rect(p, 10, 53, 80, 2); rect(p, 10, 69, 80, 2); rect(p, 33, 14, 2, 80); rect(p, 49, 14, 2, 80); rect(p, 65, 14, 2, 80); rect(p, 48, 4, 4, 12); } },
  // more sports and fun
  baseball: { label: 'Baseball', cat: 'sport', rule: 'evenodd', path: (p) => { circle(p, 50, 50, 46); band(p, 2, 50, 62, -36, 36, 4); band(p, 98, 50, 62, 144, 216, 4); } },
  basketball: { label: 'Basketball', cat: 'sport', rule: 'evenodd', path: (p) => { circle(p, 50, 50, 46); rect(p, 48.5, 4, 3, 92); rect(p, 4, 48.5, 92, 3); band(p, -22, 50, 62, -40, 40, 3); band(p, 122, 50, 62, 140, 220, 3); } },
  soccer: { label: 'Soccer ball', cat: 'sport', path: (p) => { ring(p, 50, 50, 46, 41); ngon(p, 50, 50, 13, 5, -90); for (let i = 0; i < 5; i++) { const a = -90 + 36 + i * 72; ngon(p, 50 + 31 * Math.cos(rad(a)), 50 + 31 * Math.sin(rad(a)), 10, 5, a); } } },
  'golf-flag': { label: 'Golf flag', cat: 'sport', path: (p) => { rect(p, 46, 8, 4, 82); poly(p, [[50, 8], [84, 20], [50, 32]]); ellipse(p, 50, 90, 22, 5); circle(p, 28, 84, 6); } },
  'bat-ball': { label: 'Bat and ball', cat: 'sport', path: (p) => { poly(p, rotPts([[6, 53], [64, 45], [90, 43], [95, 50], [90, 57], [64, 55], [6, 57]], 50, 50, -35)); circle(p, 74, 74, 11); } },
  dumbbell: { label: 'Dumbbell', cat: 'sport', aspect: 0.5, path: (p) => { rrect(p, 10, 30, 14, 40, 3); rect(p, 24, 37, 8, 26); rect(p, 32, 46, 36, 8); rect(p, 68, 37, 8, 26); rrect(p, 76, 30, 14, 40, 3); } },
  target: { label: 'Target', cat: 'sport', rule: 'evenodd', path: (p) => { circle(p, 50, 50, 46); circle(p, 50, 50, 36); circle(p, 50, 50, 26); circle(p, 50, 50, 16); circle(p, 50, 50, 6); } },
  'cornhole-board': { label: 'Cornhole board', cat: 'sport', aspect: 1, rule: 'evenodd', path: (p) => { rrect(p, 24, 4, 52, 92, 3); circle(p, 50, 22, 8); } },
  'bean-bag': { label: 'Bean bag', cat: 'sport', path: (p) => poly(p, rotPts([[22, 22], [78, 22], [78, 78], [22, 78]], 50, 50, 15)) },
  dice: { label: 'Dice', cat: 'sport', rule: 'evenodd', path: (p) => { rrect(p, 10, 10, 80, 80, 12); for (const [x, y] of [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]]) circle(p, x, y, 7); } },
  tent: { label: 'Tent', cat: 'sport', aspect: 0.8, rule: 'evenodd', path: (p) => { poly(p, [[50, 10], [97, 88], [3, 88]]); poly(p, [[50, 46], [64, 88], [36, 88]]); } },
  campfire: { label: 'Campfire', cat: 'sport', path: (p) => { poly(p, rotPts([[8, 76], [92, 76], [92, 86], [8, 86]], 50, 81, 18)); poly(p, rotPts([[8, 76], [92, 76], [92, 86], [8, 86]], 50, 81, -18)); poly(p, [[50, 6], [63, 36], [72, 28], [74, 58], [50, 74], [26, 58], [28, 28], [37, 36]]); } },
  // food and drink
  pizza: { label: 'Pizza slice', cat: 'food', rule: 'evenodd', path: (p) => { poly(p, [[50, 96], [8, 22], [92, 22]]); rect(p, 8, 12, 84, 10); for (const [x, y, r] of [[50, 40, 6], [34, 32, 5], [66, 34, 5], [50, 64, 5], [40, 50, 4], [60, 52, 4]]) circle(p, x, y, r); } },
  burger: { label: 'Burger', cat: 'food', path: (p) => { p.moveTo(10, 40); p.bezierCurveTo(10, 12, 90, 12, 90, 40); p.closePath(); rrect(p, 8, 44, 84, 11, 4); rrect(p, 12, 59, 76, 16, 7); } },
  coffee: { label: 'Coffee', cat: 'food', path: (p) => { rrect(p, 14, 28, 54, 54, 6); ring(p, 72, 54, 17, 9); ellipse(p, 41, 88, 36, 5); } },
  bottle: { label: 'Bottle', cat: 'food', aspect: 0.6, path: (p) => { rect(p, 42, 4, 16, 8); rect(p, 44, 12, 12, 24); poly(p, [[44, 36], [56, 36], [66, 52], [66, 90], [34, 90], [34, 52]]); rrect(p, 34, 84, 32, 12, 4); } },
  'ice-cream': { label: 'Ice cream', cat: 'food', path: (p) => { poly(p, [[30, 48], [70, 48], [50, 96]]); circle(p, 38, 38, 15); circle(p, 62, 38, 15); circle(p, 50, 22, 15); } },
  beer: { label: 'Beer', cat: 'food', path: (p) => { rrect(p, 18, 24, 48, 64, 5); ring(p, 72, 56, 16, 9); circle(p, 26, 24, 9); circle(p, 42, 19, 12); circle(p, 58, 24, 9); } },
  // nature and holidays
  palm: { label: 'Palm tree', cat: 'nature', path: (p) => { poly(p, [[45, 96], [55, 96], [53, 48], [47, 48]]); for (const a of [-165, -125, -88, -50, -12]) ellipse(p, 50 + 18 * Math.cos(rad(a)), 46 + 12 * Math.sin(rad(a)), 20, 5.5, rad(a)); circle(p, 46, 51, 4); circle(p, 54, 51, 4); } },
  wave: { label: 'Wave', cat: 'nature', aspect: 0.6, path: (p) => { p.moveTo(2, 82); p.bezierCurveTo(8, 38, 40, 36, 52, 62); p.bezierCurveTo(62, 80, 78, 22, 98, 44); p.lineTo(98, 82); p.closePath(); } },
  cloud: { label: 'Cloud', cat: 'nature', aspect: 0.7, path: (p) => { circle(p, 30, 60, 16); circle(p, 48, 48, 20); circle(p, 68, 56, 16); circle(p, 52, 66, 14); rect(p, 28, 62, 44, 14); } },
  tree: { label: 'Round tree', cat: 'nature', path: (p) => { circle(p, 50, 38, 30); rect(p, 44, 60, 12, 36); } },
  pumpkin: { label: 'Pumpkin', cat: 'holiday', path: (p) => { ellipse(p, 34, 58, 18, 26); ellipse(p, 66, 58, 18, 26); ellipse(p, 50, 58, 20, 28); rect(p, 47, 22, 6, 14); } },
  ghost: { label: 'Ghost', cat: 'holiday', rule: 'evenodd', path: (p) => { p.moveTo(20, 96); p.lineTo(20, 45); p.bezierCurveTo(20, 18, 80, 18, 80, 45); p.lineTo(80, 96); p.lineTo(70, 86); p.lineTo(60, 96); p.lineTo(50, 86); p.lineTo(40, 96); p.lineTo(30, 86); p.closePath(); ellipse(p, 40, 46, 5, 7); ellipse(p, 60, 46, 5, 7); } },
  clover: { label: 'Clover', cat: 'holiday', path: (p) => { heart(p, 50, 34, 0.42, 0); heart(p, 32, 64, 0.42, -120); heart(p, 68, 64, 0.42, 120); poly(p, [[48, 60], [52, 60], [56, 96], [50, 96]]); } },
  snowman: { label: 'Snowman', cat: 'holiday', path: (p) => { circle(p, 50, 76, 20); circle(p, 50, 46, 15); circle(p, 50, 22, 11); rect(p, 42, 6, 16, 9); rect(p, 36, 14, 28, 3); } },
  'candy-cane': { label: 'Candy cane', cat: 'holiday', mode: 'stroke', lw: 9, aspect: 0.6, path: (p) => { p.moveTo(60, 92); p.lineTo(60, 28); p.arc(45, 28, 15, 0, Math.PI, true); } },
  ornament: { label: 'Ornament', cat: 'holiday', path: (p) => { circle(p, 50, 60, 32); rect(p, 44, 18, 12, 10); ring(p, 50, 12, 6, 3); } },
  'xmas-tree': { label: 'Christmas tree', cat: 'holiday', path: (p) => { pine(p); star(p, 50, 9, 9, 4); } },
  snowflake: { label: 'Snowflake', cat: 'holiday', mode: 'stroke', lw: 6, path: snowflake },
  flag: { label: 'Flag', cat: 'holiday', path: (p) => { rect(p, 14, 6, 5, 88); p.moveTo(19, 10); p.bezierCurveTo(40, 0, 60, 20, 86, 10); p.lineTo(86, 52); p.bezierCurveTo(60, 62, 40, 42, 19, 52); p.closePath(); } },
  compass: { label: 'Compass', cat: 'nature', path: (p) => { ring(p, 50, 50, 46, 40); star(p, 50, 50, 36, 9, 4, -90); } },
  truck: { label: 'Pickup truck', cat: 'nature', aspect: 0.6, path: (p) => { poly(p, [[6, 66], [6, 36], [48, 36], [48, 24], [72, 24], [86, 42], [94, 42], [94, 66]]); circle(p, 24, 68, 10); circle(p, 76, 68, 10); } },
  boat: { label: 'Sailboat', cat: 'nature', path: (p) => { poly(p, [[6, 66], [94, 66], [80, 86], [20, 86]]); rect(p, 48, 6, 4, 60); poly(p, [[54, 10], [86, 60], [54, 60]]); poly(p, [[46, 20], [46, 60], [16, 60]]); } },
  // more shapes
  'circle-outline': { label: 'Ring', cat: 'shape', path: (p) => ring(p, 50, 50, 46, 36) },
  'square-outline': { label: 'Square frame', cat: 'shape', rule: 'evenodd', path: (p) => { rrect(p, 8, 8, 84, 84, 6); rrect(p, 18, 18, 64, 64, 3); } },
  oval: { label: 'Oval', cat: 'shape', aspect: 0.65, path: (p) => ellipse(p, 50, 50, 46, 30) },
  'speech-bubble': { label: 'Speech bubble', cat: 'shape', path: (p) => { rrect(p, 6, 10, 88, 60, 12); poly(p, [[30, 68], [52, 68], [24, 92]]); } },
  burst: { label: 'Burst', cat: 'shape', path: (p) => star(p, 50, 50, 48, 34, 16) },
  pill: { label: 'Pill', cat: 'shape', aspect: 0.45, path: (p) => rrect(p, 4, 30, 92, 40, 20) },
  'x-mark': { label: 'X mark', cat: 'shape', mode: 'stroke', lw: 13, path: (p) => { p.moveTo(20, 20); p.lineTo(80, 80); p.moveTo(80, 20); p.lineTo(20, 80); } },
  hashtag: { label: 'Hashtag', cat: 'shape', mode: 'stroke', lw: 8, path: (p) => { p.moveTo(38, 12); p.lineTo(30, 88); p.moveTo(70, 12); p.lineTo(62, 88); p.moveTo(14, 38); p.lineTo(90, 38); p.moveTo(10, 64); p.lineTo(86, 64); } },
};
export const CLIP_CATS = { love: 'Love and weddings', party: 'Celebrate', sport: 'Sports and fun', food: 'Food and drink', nature: 'Nature and travel', holiday: 'Holidays', shape: 'Shapes' };
