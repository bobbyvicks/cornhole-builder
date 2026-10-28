/* The customer's own pictures: reading an upload, its preview and print
   copies, and whether it is sharp enough at the size it is shown. Part of
   app.mjs. */

import { syncScrollPadding, ADD_PICTURE } from '../app.mjs';
import {
  BOARD, PREVIEW_SIDE, PREVIEW_BYTES, ORIG_BYTES, PAYLOAD_BYTES,
  PAYLOAD_MARGIN, ORIG_SIDE, SHARP_DPI, SOFT_DPI, $, fills, activeBoard,
  boardFor, boardKeys
} from './model.mjs';
import { imageLoaded } from './draw.mjs';
import { status, busyButton } from './order.mjs';

const pendingImageUploads = new WeakMap();
function hasPendingImageUploads(keys = boardKeys()) {
  return keys.some(key => (pendingImageUploads.get(boardFor(key)) || 0) > 0);
}
function syncPictureButton() {
  const btn = $('addimagebtn'), busy = (pendingImageUploads.get(activeBoard()) || 0) > 0;
  busyButton(btn, busy);
  const label = busy ? 'Preparing picture…' : ADD_PICTURE;
  if (btn.textContent !== label) btn.textContent = label;
}
/* done marks "Picture added": showTab takes that line down when the
   customer moves to another tab. Every other message stays up until the
   next picture is chosen. */
function uploadStatus(message, { done = false } = {}) {
  const status = $('uploadstatus'); status.hidden = false; status.textContent = message;
  status.dataset.done = String(done);
}
/* On a phone a new picture's own controls (Fill the board, Remove white
   background) landed under the bar at the foot, or behind the pinned
   board once the page had been scrolled: they are brought up to sit just
   under the board, by the scroll padding that already allows for it. The
   focus stays where it was. */
function showPictureControls() {
  if (!window.matchMedia('(max-width: 940px)').matches) return;
  syncScrollPadding();
  $('imageprops').scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}
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
  // Inspect the source pixels in small tiles: downsampling can erase a
  // narrow transparent detail and incorrectly turn its preview into JPEG.
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d', { willReadFrequently: true });
  for (let y = 0; y < img.naturalHeight; y += 256) for (let x = 0; x < img.naturalWidth; x += 256) {
    const w = Math.min(256, img.naturalWidth - x), h = Math.min(256, img.naturalHeight - y);
    g.clearRect(0, 0, 256, 256); g.drawImage(img, x, y, w, h, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] < 255) return true;
  }
  return false;
}
const readAsDataUrl = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(file); });
async function readImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('not an image')); i.src = url; });
    const W = img.naturalWidth, H = img.naturalHeight;
    if (!W || !H) throw new Error('the picture has no size');
    const isRaster = /^image\/(png|jpeg|webp)$/i.test(file.type), isVector = /^image\/svg\+xml$/i.test(file.type);
    /* JPEGs, and WebPs with nothing see-through, are previewed as JPEG;
       anything with a transparent pixel stays PNG so a cut-out stays cut out. */
    const lossy = /jpe?g/i.test(file.type) || (/webp/i.test(file.type) && !hasAlpha(img));
    const encode = (side, bytes, quality) => {
      let s = isVector ? side : Math.min(side, Math.max(W, H));
      // Every retry reduces the pixels; stop only when the byte budget
      // fits, rather than retaining an oversized final attempt.
      while (true) {
        const k = isVector ? s / Math.max(W, H) : Math.min(1, s / Math.max(W, H));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(W * k)); c.height = Math.max(1, Math.round(H * k));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        const out = { url: lossy ? c.toDataURL('image/jpeg', quality) : c.toDataURL('image/png'), px: [c.width, c.height] };
        if (out.url.length <= bytes * 1.37) return out;
        if (s <= 1) throw new Error('image encoding exceeds size limit');
        s = Math.max(1, Math.floor(s * 0.75));
      }
    };
    const preview = encode(PREVIEW_SIDE, PREVIEW_BYTES, 0.88);
    const shrunk = preview.px[0] < W || preview.px[1] < H;
    /* The master travels in the same request as its preview, so its budget
       is what the order has left once the preview is in. */
    const masterBytes = Math.min(ORIG_BYTES, Math.floor((PAYLOAD_BYTES - PAYLOAD_MARGIN - preview.url.length) / 1.37));
    let master = null;
    if (isRaster && file.size <= masterBytes && Math.max(W, H) <= ORIG_SIDE) {
      /* Keep the untouched file when preview resizing discarded pixels,
         including small-dimension artwork that exceeds the byte budget. */
      if (lossy || shrunk) master = { url: await readAsDataUrl(file), px: [W, H] };
    } else if (shrunk || !isRaster) {
      master = encode(ORIG_SIDE, masterBytes, 0.92);
      /* A re-encoded master with no more pixels than the preview adds
         nothing a print needs; the untouched file above always does. */
      if (master.px[0] <= preview.px[0] && master.px[1] <= preview.px[1]) master = null;
    }
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
/* The width a picture prints at, in inches: its own, or, filling the
   board, whatever covering 24 x 48 takes - 48" tall for a picture wider
   than the board's shape, 24" wide for a narrower one. */
const printWidth = (el) => (fills(el) && el.px ? Math.max(BOARD.w, BOARD.h * el.px[0] / el.px[1]) : el.width);
/* Dots per inch a picture prints at, at the width it has on the board. */
const printDpi = (el) => (el.px ? el.px[0] / printWidth(el) : null);
function resolutionNote(el, where) {
  const dpi = printDpi(el); if (dpi === null || dpi >= SHARP_DPI) return '';
  const start = 'The picture' + (where ? ' on ' + where : '') + ' is ' + el.px[0] + ' x ' + el.px[1] + ' pixels: ';
  const look = ' dots per inch, which will look ' + (dpi < SOFT_DPI ? 'blurry' : 'soft') + '. ';
  if (fills(el)) {
    /* No file can make this one sharp: covering the board at SHARP_DPI
       takes 4800 pixels down its 48", and the page keeps no more than
       ORIG_SIDE (4000) on a picture's long side. So the note does not
       ask for a bigger file; it offers the picture's own size. */
    const tall = printWidth(el) > BOARD.w;
    return start + 'filling the board, ' + (tall ? BOARD.h + '" tall' : BOARD.w + '" wide') + ', it prints at about ' + Math.round(dpi) + look + 'Untick Fill the board to print it at its own size.';
  }
  return start + 'at ' + el.width + '" wide it prints at about ' + Math.round(dpi) + look + SHARP_DPI + ' or more prints sharp: use a bigger file, or make it no wider than ' + (Math.floor(el.px[0] / SHARP_DPI * 4) / 4) + '".';
}
function lowResImages(keys) {
  const out = [];
  for (const k of keys) for (const e of boardFor(k).elements) if (e.type === 'image') { const n = resolutionNote(e, keys.length > 1 ? 'board ' + k.toUpperCase() : ''); if (n) out.push(n); }
  return out;
}

export {
  pendingImageUploads, hasPendingImageUploads, syncPictureButton, uploadStatus,
  showPictureControls, readImage, shrunkPreview, resolutionNote, lowResImages
};
