import { PRICING, quote, money } from './lib/price.mjs';
import { loadProject, saveProject } from './lib/store.mjs';
import { SITE } from './lib/site.mjs';
import { MAX_PROJECT_BYTES, validateProject } from './lib/project-validation.mjs';
import { copyHistoryState, sameHistoryState } from './lib/history.mjs';
import { pngWithResolution } from './lib/png-resolution.mjs';
import {
  CLIPS, CLIP_CATS, BOARD, PRINT_PPI, DESIGN_VERSION, PROJECT_VERSION, PAINTS,
  PAINTS_SOFT, STAINS, FONTS, FONT_WEIGHT, PATTERNS, OCCASIONS,
  TEMPLATE_GROUPS, SHIP_STATES, MAX_IMAGES, $, clamp, uid, rad, r1, isHex,
  colourName, today, withDefaults, T, fills, coverOf, freshBoard, freshDesign,
  migrate, TEMPLATES, order, activeBoard, boardFor, findEl, selectedEl,
  countOf, boardKeys, isPristine, sampleWordsIn
} from './ui/model.mjs';
import {
  boxes, imgCache, preloadImages, HANDLE, handleSpots, showsSelection,
  handlePoints, guides, render, paint, renderOutput, printCanvas,
  previewDataUrl
} from './ui/draw.mjs';
import { oppositeColours, defaultInk, readabilityIssues } from './ui/colour.mjs';
import { fitTemplateText, placeNew, addElement, wordsFrom } from './ui/placement.mjs';
import {
  pendingImageUploads, hasPendingImageUploads, syncPictureButton, uploadStatus,
  showPictureControls, readImage, lowResImages
} from './ui/pictures.mjs';
import { thumbnails, renderTemplates, fillClips, addClip } from './ui/cards.mjs';
import {
  syncBoard, syncBoardActions, selectSampleOnFocus, field, toggle, inch, deg,
  copyToOther, duplicate, moveLayer, syncLists, syncProps
} from './ui/panel.mjs';
import {
  fillChips, sampleSignature, samplesConfirmed, orderRevision,
  orderReviewRevision, syncReviewContinue, reviewIfChanged, fillQuote,
  priceNote, syncOrder, status, busyButton, orderDetails, orderPayload,
  prepareRequestPayload, showOutcome
} from './ui/order.mjs';
let design = freshDesign();
let active = 'a';           // which board the panel edits
let selected = null;        // element id, on the active board
let history = [], future = [];
let lastEditTab = 'text';

/* ====================================================================
   HISTORY, SAVING AND THE PROJECT FILE
   ==================================================================== */
const snapshot = () => JSON.stringify(design);
function commit() {
  syncBoardActions();
  if (sameHistoryState(history[history.length - 1], design)) { save(); return; }
  const s = copyHistoryState(design);
  history.push(s); if (history.length > 60) history.shift();
  future = [];
  save();
  syncHistoryButtons();
}
function restore(s) {
  const before = design;
  design = copyHistoryState(s);
  // A matching pair or a single board always edits A, including after
  // undoing a switch to B. Otherwise the controls edit an invisible board.
  if (design.same || order.product === 'single') active = 'a';
  else {
    // A step that changed one board only, and not the one on screen,
    // moves to that board on a phone, so the Undo or Redo is seen.
    const changed = ['a', 'b'].filter((k) => !sameHistoryState(boardFor(k, before), design[k]));
    if (changed.length === 1) revealBoard(changed[0]);
  }
  if (!findEl(selected)) selected = null;
  save(); syncAll();
}
function undo() { if (history.length < 2) return; future.push(history.pop()); restore(history[history.length - 1]); }
function redo() { if (!future.length) return; const s = future.pop(); history.push(s); restore(s); }
function syncHistoryButtons() { $('undo').disabled = history.length < 2; $('redo').disabled = !future.length; }

/* What is saved: the boards and the order choices together, so a refresh
   brings back the finish, the extras, the quantity and the date as well as
   the design. Saving says what it is doing; a save that fails says so and
   offers the export, and never drops a picture to make itself fit. */
const SAVE_TEXT = {
  new: 'Not saved yet',
  waiting: 'Still checking this device for a saved project. Keep editing, or export a copy while you wait.',
  unreadable: 'The saved project could not be read. Stored copies are unchanged. Import an editable copy, or make an edit to start a new saved design.',
  saving: 'Saving…',
  saved: 'Saved on this device',
  error: 'Not saved: this browser cannot store the project (storage full or blocked). Export it to keep it.',
  elsewhere: 'This project was changed in another tab. Reload to see the latest; your next change here replaces it.',
};
/* The states that are notices: each is announced once, stays on screen
   until a write succeeds, and is shown in the pinned toolbar on a phone
   (the .stagebar .savestatus rule in index.html lists the same four).
   Where that toolbar is not pinned in view, the other-tab notice and its
   Reload sit in a line under the tabs instead (#tabnotice). */
const NOTICE_STATES = ['error', 'waiting', 'unreadable', 'elsewhere'];
/* The state is 'loading' until the saved project has been read. The
   markup starts with the status empty, since until then nobody knows
   whether the design is saved; and setSaveState ignores a repeat, so
   starting anywhere but 'new' is what lets the boot write "Not saved
   yet" for a first visit. 'loading' has no words and is never set again. */
let saveState = 'loading', saveBusy = false, saveAgain = false, storageReady = false, loaded = false;
let saveTimer = null, saveNeedsAnnouncement = false, restoreTimedOut = false;
let startupSnapshot = null;
let recoverySnapshot = null;
let saveBaseline = null, saveBaselineState = 'new';
const hasStartupEdits = () => startupSnapshot !== null && JSON.stringify({ design, order }) !== startupSnapshot;
/* A notice that storage failed, is still being read, could not be read or
   was changed in another tab stays until a write succeeds: on a phone it
   sits in the pinned toolbar,
   and swapping it for "Saving…" on every keystroke would move the field
   being typed in by the notice's height, twice per key. */
const noticeShowing = () => NOTICE_STATES.includes(saveState);
function setSaveState(s) {
  if (saveState === s) return;
  saveState = s;
  for (const el of document.querySelectorAll('.savestatus')) { el.textContent = SAVE_TEXT[s]; el.dataset.state = s; }
  if (NOTICE_STATES.includes(s)) { saveNeedsAnnouncement = true; $('savealert').textContent = SAVE_TEXT[s]; }
  else if (['new', 'saved'].includes(s) && saveNeedsAnnouncement) { $('savealert').textContent = SAVE_TEXT[s]; saveNeedsAnnouncement = false; }
  $('exportlink').hidden = !['error', 'waiting'].includes(s);
  $('reloadlatest').hidden = s !== 'elsewhere';
  // The line under the tabs that carries the other-tab notice where the
  // toolbar can be out of view (the stylesheet says where).
  $('tabnotice').hidden = s !== 'elsewhere';
  // Recovery notices can resize the pinned toolbar after the last edit.
  render();
}

/* TWO TABS, ONE SAVED PROJECT. The device keeps a single project
   (lib/store.mjs), so two tabs that both make changes take turns at it and
   the last save wins. There is no merge; the point is that nobody is
   surprised. Each page load makes a token of its own and every save
   carries it. After a save the tab sends {tab, savedAt} on a
   BroadcastChannel; a tab that hears of a save newer than anything it has
   read or written itself says the project was changed in another tab,
   offers Reload, and says its next change replaces it. That next change
   saves as usual and puts the status back, and the first tab is then the
   one told. A browser without BroadcastChannel gets the same note through
   the storage event: the saving tab writes it to localStorage, which fires
   the event in the other tabs (and never in itself).
   The token is kept in sessionStorage too, so the tab that wrote the
   saved record can be told from the console or a test. It is made fresh
   at every load rather than read back from there: a duplicated tab starts
   with a copy of its source tab's sessionStorage, and with the same token
   it would take that tab's saves for its own and say nothing. */
const TAB_KEY = 'cornhole.tab', SAVE_NOTE_KEY = 'cornhole.saved', TAB_CHANNEL = 'cornhole.project';
const TAB = (() => {
  let token;
  try { token = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join(''); }
  catch (_) { token = Math.random().toString(36).slice(2) + Date.now().toString(36); }
  try { sessionStorage.setItem(TAB_KEY, token); } catch (_) {}
  return token;
})();
// When the newest save this page has read or made was written, and the
// newest save another tab has told it about, in milliseconds.
let knownSave = -Infinity, heardSave = -Infinity;
const noteTime = (note) => { const t = note && typeof note.savedAt === 'string' ? Date.parse(note.savedAt) : NaN; return Number.isFinite(t) ? t : -Infinity; };
const changedElsewhere = () => heardSave > knownSave;
/* A tab that cannot save keeps saying so: its next change would not
   replace anything. One still reading its own project decides when the
   read is done, against the save it read. */
function showChangedElsewhere() {
  if (storageReady && changedElsewhere() && saveState !== 'error') setSaveState('elsewhere');
}
function heardOfSave(note) {
  if (!note || typeof note !== 'object' || note.tab === TAB) return;
  const time = noteTime(note);
  if (time <= heardSave) return;
  heardSave = time;
  showChangedElsewhere();
}
let tabChannel = null;
try {
  if (typeof BroadcastChannel === 'function') {
    tabChannel = new BroadcastChannel(TAB_CHANNEL);
    tabChannel.onmessage = (e) => heardOfSave(e.data);
  }
} catch (_) { tabChannel = null; }
if (!tabChannel) window.addEventListener('storage', (e) => {
  if (e.key !== SAVE_NOTE_KEY || !e.newValue) return;
  try { heardOfSave(JSON.parse(e.newValue)); } catch (_) {}
});
function tellOtherTabs(record) {
  const note = { tab: TAB, savedAt: record.savedAt };
  if (tabChannel) { try { tabChannel.postMessage(note); } catch (_) {} }
  else { try { localStorage.setItem(SAVE_NOTE_KEY, JSON.stringify(note)); } catch (_) {} }
}
/* A page kept in the back-forward cache hears nothing while it is away,
   so on its return it reads the saved record and checks who wrote it. */
window.addEventListener('pageshow', (e) => {
  if (!e.persisted || !storageReady) return;
  loadProject().then((p) => { if (p) heardOfSave(p); }, () => {});
});
/* The record is a container copy that shares the pictures' strings, as the
   history does: serialising a design with photos in it just to parse it
   back froze the page for a good part of a second per edit on a phone. */
function projectRecord() { return { version: PROJECT_VERSION, savedAt: new Date().toISOString(), design: copyHistoryState(design), order: copyHistoryState(order) }; }
function maySave() {
  // After an unreadable restore, navigation and unchanged inputs must not
  // replace the stored draft with the initial page. A real edit starts saving.
  if (recoverySnapshot !== null) {
    if (JSON.stringify({ design, order }) === recoverySnapshot) return false;
    recoverySnapshot = null;
  }
  if (!storageReady) {
    // Initial rendering and navigation also call save. Only actual edits
    // should take precedence over the project still being read from storage.
    if (hasStartupEdits()) setSaveState(restoreTimedOut ? 'waiting' : 'saving');
    return false;
  }
  return true;
}
function skipUnchangedSave() {
  // Navigation also calls save. Keep an unchanged tab from replacing a
  // newer draft written elsewhere. Container copies share image strings.
  // A pending write must finish first: it may be replacing this baseline.
  // The screen matching this tab's last save says nothing of a newer one
  // another tab has made since, so that notice stays.
  if (saveBusy || !sameHistoryState(saveBaseline, { design, order })) return false;
  setSaveState(changedElsewhere() ? 'elsewhere' : saveBaselineState);
  return true;
}
function save() {
  clearTimeout(saveTimer); saveTimer = null;
  if (!maySave()) return;
  if (skipUnchangedSave()) return;
  if (!noticeShowing()) setSaveState('saving');
  flush();
}
function saveSoon() {
  if (!maySave()) return;
  clearTimeout(saveTimer); saveTimer = null;
  if (skipUnchangedSave()) return;
  if (!noticeShowing()) setSaveState('saving');
  saveTimer = setTimeout(() => { saveTimer = null; flush(); }, 400);
}
async function flush() {
  if (saveBusy) { saveAgain = true; return; }
  if (skipUnchangedSave()) return;
  saveBusy = true;
  // Remember the values sent to storage, not edits made while it writes.
  // The record names this tab; the export file (projectRecord alone) does not.
  const record = { ...projectRecord(), tab: TAB }, written = { design: record.design, order: record.order };
  try {
    await saveProject(record);
    saveBaseline = written; saveBaselineState = 'saved';
    knownSave = Math.max(knownSave, noteTime(record));
    tellOtherTabs(record);
    // Another tab's save that came in while this one was writing, and was
    // made after it, is the one kept: the notice stays.
    if (!saveAgain && !saveTimer) setSaveState(changedElsewhere() ? 'elsewhere' : 'saved');
  }
  catch (e) { console.warn('The project could not be saved on this device.', e); setSaveState('error'); }
  saveBusy = false;
  if (saveAgain) { saveAgain = false; flush(); }
}
document.addEventListener('visibilitychange', () => { if (document.hidden && saveTimer) save(); });
window.addEventListener('pagehide', () => { if (saveTimer) save(); });
window.addEventListener('beforeunload', (e) => { if (saveState === 'error' || saveState === 'saving' || saveTimer || hasStartupEdits() || hasPendingImageUploads(['a', 'b'])) { e.preventDefault(); e.returnValue = ''; } });

/* Order choices from storage or a file, taken only where they are valid. */
function applyOrder(o) {
  if (!o || typeof o !== 'object') return;
  if (Object.hasOwn(PRICING.products, o.product)) order.product = o.product;
  const q = Number(o.quantity); if (Number.isInteger(q) && q >= 1 && q <= PRICING.maxQuantity) order.quantity = q;
  if (Object.hasOwn(PRICING.finishes, o.finish)) order.finish = o.finish;
  if (Object.hasOwn(PRICING.bags, o.bags)) order.bags = o.bags;
  if (Array.isArray(o.bagColors) && o.bagColors.length === 2 && o.bagColors.every(isHex)) order.bagColors = [...o.bagColors];
  order.rush = o.rush === true; order.carryCase = o.carryCase === true;
  if (Object.hasOwn(OCCASIONS, o.occasion)) order.occasion = o.occasion;
  order.needBy = typeof o.needBy === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.needBy) && o.needBy >= today() ? o.needBy : '';
  order.giftNote = typeof o.giftNote === 'string' ? o.giftNote.slice(0, 300) : '';
}
/* The project file: plain JSON, with the pictures' masters, that the
   Import button takes back. */
function exportProject() {
  if (hasPendingImageUploads(['a', 'b'])) { uploadStatus('A picture is still processing. Wait for it to finish before saving an editable copy.'); return; }
  const blob = new Blob([JSON.stringify({ app: 'cornhole-builder', ...projectRecord() }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'cornhole-project-' + today() + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
let projectImportSequence = 0;
function captureImportGuard() {
  const sequence = projectImportSequence, previousDesign = design, previousSnapshot = snapshot(), previousOrder = JSON.stringify(order);
  return () => {
    if (sequence !== projectImportSequence || design !== previousDesign || snapshot() !== previousSnapshot || JSON.stringify(order) !== previousOrder) {
      throw new Error('Your project changed while this file was opening. Open the file again to replace the current project');
    }
  };
}
function importProject(obj, { confirmReplace = false } = {}) {
  validateProject(obj, { clips: CLIPS, patterns: PATTERNS, stains: STAINS, maxQuantity: PRICING.maxQuantity,
    orderChoices: { product: PRICING.products, finish: PRICING.finishes, bags: PRICING.bags, occasion: OCCASIONS } });
  ++projectImportSequence;
  const incoming = JSON.parse(JSON.stringify(obj));
  const nextDesign = migrate(incoming.design);
  const sources = new Map(), previewSources = new Set();
  for (const key of ['a', 'b']) nextDesign[key].elements.forEach((el, index) => {
    if (el.type !== 'image') return;
    const label = 'Board ' + key.toUpperCase() + ' item ' + (index + 1);
    sources.set(el.src, label + ' image');
    previewSources.add(el.src);
    if (el.orig) sources.set(el.orig, label + ' print master');
  });
  const apply = () => {
    if (confirmReplace && !isPristine() && !confirm('Replace your current design with the imported project?')) return;
    design = nextDesign;
    if (incoming.order) applyOrder(incoming.order);
    selected = null; active = 'a';
    syncAll(); commit(); showTab('board');
  };
  // Preserve the synchronous no-picture API. Embedded Base64 must also
  // decode successfully before an image-bearing project replaces a draft.
  if (!sources.size) return apply();
  const assertCurrentProject = captureImportGuard();
  return (async () => {
    const previews = [];
    // Validate masters one at a time and release their decoded pixels.
    // A source shared with any preview stays ready for the first paint.
    for (const [src, label] of sources) {
      const img = new Image(); img.src = src;
      try { await img.decode(); if (!img.naturalWidth || !img.naturalHeight) throw new Error('empty image'); }
      catch (_) { img.src = ''; throw new Error(label + ' could not be loaded. Upload the original picture again'); }
      if (previewSources.has(src)) previews.push([src, img]);
      else img.src = '';
      assertCurrentProject();
    }
    assertCurrentProject();
    for (const [src, img] of previews) imgCache.set(src, img);
    apply();
  })();
}

/* ====================================================================
   POINTER: pick up, drag, resize and rotate elements on the preview
   ==================================================================== */
function toLocal(el, ix, iy) {
  const a = -rad(el.rotation), dx = ix - el.x, dy = iy - el.y;
  return { x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a) };
}
function hitTest(b, ix, iy) {
  const cover = coverOf(b);
  for (let i = b.elements.length - 1; i >= 0; i--) {
    const el = b.elements[i], box = boxes.get(el.id);
    if (!box || el === cover) continue;
    const l = toLocal(el, ix, iy);
    const hw = Math.max(box.w, 1) / 2 + 0.2, hh = Math.max(box.h, 1) / 2 + 0.2;
    if (Math.abs(l.x) <= hw && Math.abs(l.y - box.oy) <= hh) return el;
  }
  /* A picture filling the board lies under everything, so it is picked
     only where nothing else is: the artwork on it stays easy to pick up. */
  return cover && ix >= 0 && ix <= BOARD.w && iy >= 0 && iy <= BOARD.h ? cover : null;
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
/* A press on the picture filling the board, waiting to see whether it is
   a tap: the pointer, the board and where it went down. */
let coverTap = null;
/* How far, in screen pixels, a tap may wander and still be a tap. */
const TAP_SLOP = 10;
for (const c of [$('canvasA'), $('canvasB')]) {
  /* With two different boards, the board that has the keyboard focus is
     the one the keys edit - so tabbing to Board A makes it the active one. */
  /* While ordering, the focus decides whether the selection shows (see
     showsSelection), so the board is drawn again as it comes and goes. */
  c.addEventListener('focus', () => { const key = c.dataset.board; if (!design.same && order.product === 'set' && key !== active) setActive(key); render(); });
  c.addEventListener('blur', () => render());
  c.addEventListener('pointerdown', (ev) => {
    coverTap = null;
    if (drag || !ev.isPrimary || ev.button !== 0) return;
    const key = c.dataset.board;
    // Whether the handles were on screen when the finger came down: taking
    // the focus below would show them.
    const shown = showsSelection(c);
    if (!design.same && order.product === 'set' && key !== active) setActive(key);
    /* The board takes the focus, so the arrow keys and Delete that follow
       are meant for it - and not when a slider or a tab had the focus. */
    $(design.same ? 'canvasA' : c.id).focus({ preventScroll: true });
    const p = toInches(c, ev);
    const sel = selectedEl();
    const handle = sel && shown && (design.same ? key === 'a' : key === active) ? handleAt(sel, p.x, p.y) : null;
    if (handle === 'delete') { removeElement(sel.id); ev.preventDefault(); return; }
    let el = sel;
    if (!handle) {
      el = hitTest(activeBoard(), p.x, p.y);
      /* A picture filling the board is picked by a tap, when the finger
         lifts (see pointerup), not as it lands: it lies under every spot
         nothing else covers, so a swipe that starts there is the page
         being scrolled, and the selection and the open tab stay as they
         were. It is never dragged: it has no place on the board to move to. */
      if (el && fills(el)) { coverTap = { pointerId: ev.pointerId, canvas: c, id: el.id, x: ev.clientX, y: ev.clientY }; return; }
      select(el ? el.id : null);
      /* Picking something up opens the tab that edits it, so on a phone
         its controls are right under the board. */
      if (el) showTab(el.type === 'text' ? 'text' : 'art');
    }
    if (!el || fills(el)) return;
    const box = boxes.get(el.id) || { oy: 0 };
    const l = toLocal(el, p.x, p.y);
    drag = { id: el.id, pointerId: ev.pointerId, canvas: c, board: activeBoard(), mode: handle || 'move', dx: el.x - p.x, dy: el.y - p.y, moved: false,
      before: { x: el.x, y: el.y, rotation: el.rotation, [sizeKey(el)]: el[sizeKey(el)], ...(el.type === 'text' ? { autoFit: el.autoFit } : {}) },
      d0: Math.max(0.2, Math.hypot(l.x, l.y - box.oy)), size0: el[sizeKey(el)] };
    c.setPointerCapture(ev.pointerId);
    c.classList.add('dragging');
    ev.preventDefault();
  });
  c.addEventListener('pointermove', (ev) => {
    if (!ownsPointer(ev)) return;
    if (activeBoard() !== drag.board) { end(ev); return; }
    const el = findEl(drag.id); if (!el) { end(ev); return; }
    if (el.type === 'text') el.autoFit = false;
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
  const ownsPointer = (ev) => drag && drag.canvas === c && drag.pointerId === ev.pointerId;
  const end = (ev) => {
    if (!ownsPointer(ev)) return;
    const { moved, pointerId, board, id, before } = drag;
    const cancelled = ev.type === 'pointercancel';
    let rolledBack = false;
    if (cancelled && (design.a === board || design.b === board)) {
      const el = board.elements.find(item => item.id === id);
      if (el) { Object.assign(el, before); rolledBack = true; }
    }
    drag = null; guides.v = guides.h = false;
    c.classList.remove('dragging');
    if (c.hasPointerCapture(pointerId)) c.releasePointerCapture(pointerId);
    render(); syncProps(); settleTyping();
    /* A cancelled gesture is rolled back, so commit has nothing new to
       record and only repeats the save, undoing one that completed while
       the gesture was in progress. The one exception is a saved design
       offered and declined meanwhile: it took history[0], and the
       rolled-back design is recorded above it, one Undo away from it. */
    if (moved && (!cancelled || rolledBack)) commit();
  };
  c.addEventListener('pointerup', end);
  c.addEventListener('pointercancel', end);
  /* The tap that picks the picture filling the board: the pointer lifts
     close to where it went down. A swipe goes further, or the browser
     takes it over to scroll the page and cancels it, and picks nothing. */
  c.addEventListener('pointerup', (ev) => {
    const tap = coverTap; coverTap = null;
    if (!tap || tap.canvas !== c || tap.pointerId !== ev.pointerId) return;
    if (Math.hypot(ev.clientX - tap.x, ev.clientY - tap.y) > TAP_SLOP) return;
    const el = findEl(tap.id);
    if (!el || !fills(el)) return;
    select(el.id); showTab('art');
  });
  c.addEventListener('pointercancel', (ev) => { if (coverTap && coverTap.pointerId === ev.pointerId) coverTap = null; });
  c.addEventListener('lostpointercapture', end);
}
/* Keyboard. Undo and redo work anywhere but inside a field. The keys that
   edit the artwork - arrows, plus, minus, Delete - work only while a board
   has the focus, so a Delete meant for a tab, a slider or a list never
   takes a word off the board. */
document.addEventListener('keydown', (ev) => {
  const t = ev.target, tag = t && t.tagName;
  const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable);
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') { if (typing) return; ev.preventDefault(); ev.shiftKey ? redo() : undo(); return; }
  /* Ctrl and Cmd with plus or minus are the browser's zoom; Alt and the
     arrows are the browser's too. Only plain keys edit the artwork. */
  if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
  if (tag !== 'CANVAS') return;
  if (t.dataset.board !== active) return;
  const el = selectedEl(); if (!el) return;
  const step = ev.shiftKey ? 1 : 0.1;
  const nudge = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[ev.key];
  /* A picture filling the board neither moves nor resizes: its own place
     and width wait, unchanged, for it to be put back. Delete still works. */
  if (fills(el) && (nudge || ['+', '=', '-'].includes(ev.key))) { ev.preventDefault(); return; }
  /* The keys stop where a drag stops: the server refuses artwork further off the board. */
  if (nudge) { el.x = clamp(r1(el.x + nudge[0]), -4, BOARD.w + 4); el.y = clamp(r1(el.y + nudge[1]), -4, BOARD.h + 4); if (el.type === 'text') el.autoFit = false; render(); syncProps(); commit(); ev.preventDefault(); }
  else if (ev.key === '+' || ev.key === '=' || ev.key === '-') {
    const k = sizeKey(el); el[k] = clamp(Math.round(el[k] * (ev.key === '-' ? 0.95 : 1.05) * 20) / 20, 0.5, sizeMax(el));
    if (el.type === 'text') el.autoFit = false;
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
  /* "Picture added" has done its job once the customer moves to another
     tab; it would otherwise sit above every tab, the review and the
     address included. A picture that was not added keeps its message
     until the next one is chosen (see uploadStatus). */
  const was = tabButtons.find((b) => b.getAttribute('aria-selected') === 'true')?.dataset.tab;
  if (name !== was && $('uploadstatus').dataset.done === 'true') $('uploadstatus').hidden = true;
  for (const b of tabButtons) { const on = b.dataset.tab === name; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; }
  for (const p of document.querySelectorAll('.pane')) p.dataset.open = String(p.id === 'tab-' + name);
  if (name !== 'order') lastEditTab = name;
  document.body.classList.toggle('ordering', name === 'order');
  /* The selection shows or goes with it (see showsSelection), and on a
     phone the board is pinned or not. The scroll padding follows at
     once: the browser keeps the page steady by whatever is in view below
     it, so a padding left over from the pinned board for a frame let the
     review boards, drawn below the heading, push the heading off the top. */
  syncScrollPadding();
  render();
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
  const st = document.querySelector('.stage'), notice = $('tabnotice');
  let pad = '';
  if (window.matchMedia('(max-width: 940px)').matches && getComputedStyle(st).position === 'sticky') pad = (parseFloat(getComputedStyle(st).top) || 0) + st.offsetHeight + 8 + 'px';
  else if (notice.offsetHeight) {
    /* The other-tab notice pins at the top of the panel: on its own on a
       wide screen and on a phone while ordering, with the tabs on a
       short phone. */
    const pinned = getComputedStyle(notice).position === 'sticky' ? notice : notice.parentElement;
    pad = (parseFloat(getComputedStyle(pinned).top) || 0) + pinned.offsetHeight + 16 + 'px';
  }
  if (document.documentElement.style.scrollPaddingTop !== pad) document.documentElement.style.scrollPaddingTop = pad;
}
/* Bring the controls up under the (sticky) board on a phone. */
function scrollToPanel() {
  const st = document.querySelector('.stage');
  const sticky = getComputedStyle(st).position === 'sticky' ? st.offsetHeight + 8 : 0;
  const top = panel.getBoundingClientRect().top + window.scrollY - 60 - sticky;
  window.scrollTo({ top: Math.max(0, top), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

// -- templates, grouped by occasion, with a blank start
function applyTemplate(id) {
  const t = TEMPLATES.find((x) => x.id === id); if (!t) return;
  design = { version: DESIGN_VERSION, same: true, a: t.board(), b: freshBoard() };
  for (const el of design.a.elements) if (el.type === 'text') {
    el.fitReference = { text: el.text, size: el.size, spacing: el.spacing, font: el.font };
    el.autoFit = true;
  }
  selected = null; active = 'a';
  order.occasion = t.occasion;
  syncAll(); commit(); promptForWords();
}
function applyBlank() {
  design = { version: DESIGN_VERSION, same: true, a: freshBoard(), b: freshBoard() };
  selected = null; active = 'a';
  syncAll(); commit(); promptForWords();
}
/* Straight to the words: the first text is selected and ready to type over. */
function promptForWords() {
  const first = design.a.elements.find((e) => e.type === 'text');
  showTab('text');
  if (first) {
    select(first.id);
    const i = $('ttext'); i.focus(); i.select();
  } else {
    $('addtext').focus();
  }
}
const askThenApply = (label, fn) => { if (isPristine() || confirm('Replace your current design with ' + label + '?')) fn(); };
$('startblank').addEventListener('click', () => askThenApply('a blank board', applyBlank));
const templateTools = document.createElement('div'); templateTools.className = 'template-tools';
templateTools.innerHTML = '<label class="template-search" for="templatesearch">Find a design<input id="templatesearch" type="search" maxlength="100" placeholder="Try wedding, lake or team"></label><div class="template-filters"><label for="templateoccasion">Occasion</label><select id="templateoccasion"><option value="">All occasions</option></select><button id="cleartemplates" class="btn small" type="button">Clear filters</button></div><p id="templateresults" class="template-results" role="status" aria-live="polite"></p><p id="templateempty" class="template-empty" hidden>No matching designs. Try a different word or clear the filters.</p>';
$('templates').before(templateTools);
for (const [key, label] of TEMPLATE_GROUPS) { const option = document.createElement('option'); option.value = key; option.textContent = label; $('templateoccasion').appendChild(option); }
$('templatesearch').addEventListener('input', renderTemplates);
$('templateoccasion').addEventListener('change', renderTemplates);
$('cleartemplates').addEventListener('click', () => { $('templatesearch').value = ''; $('templateoccasion').value = ''; renderTemplates(); $('templatesearch').focus(); });
renderTemplates();

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
$('paintcustom').addEventListener('input', () => { const base = activeBoard().base; base.color = $('paintcustom').value; if (base.kind === 'wood') base.kind = 'paint'; syncBoard(); render(); saveSoon(); });
$('paintcustom').addEventListener('change', commit);
$('paint2').addEventListener('input', () => { activeBoard().base.color2 = $('paint2').value; render(); saveSoon(); });
$('paint2').addEventListener('change', commit);
$('gradangle').addEventListener('input', () => { activeBoard().base.angle = Number($('gradangle').value); $('gradangleval').textContent = $('gradangle').value + '°'; render(); });
$('gradangle').addEventListener('change', commit);
chips('basekind', (v) => { activeBoard().base.kind = v; syncBoard(); render(); commit(); });
$('pattern').addEventListener('change', () => {
  const pattern = activeBoard().pattern;
  pattern.kind = $('pattern').value;
  pattern.size = Math.max(pattern.kind === 'border' ? 0.1 : 0.5, pattern.size);
  syncBoard(); render(); commit();
});
$('patcolor').addEventListener('input', () => { activeBoard().pattern.color = $('patcolor').value; render(); saveSoon(); });
$('patcolor').addEventListener('change', commit);
$('patsize').addEventListener('input', () => { activeBoard().pattern.size = Number($('patsize').value); $('patsizeval').textContent = $('patsize').value + '"'; render(); });
$('patsize').addEventListener('change', commit);
for (const id of ['gradangle', 'patsize']) $(id).addEventListener('input', saveSoon);
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
chips('boardmode', (v) => {
  setMode(v);
  if (matchMedia('(max-width: 940px)').matches) {
    scrollToPanel();
    if (getComputedStyle(document.querySelector('.stage')).position !== 'sticky') document.querySelector('.tabs [aria-selected="true"]').focus({ preventScroll: true });
  }
});
const otherKey = () => (active === 'a' ? 'b' : 'a');
/* On a phone only the board being edited is drawn (.board.inactive is
   display: none there), so a change made to the other board - Copy,
   opposite colours, or an Undo or Redo that touched only that board -
   would happen out of sight and look like nothing happened. The panel
   moves to that board instead, so the change is on screen. Where both
   boards show, it stays on the board it was editing. Call it with the
   new design in place; the caller syncs the page afterwards. */
function revealBoard(key) {
  if (key === active) return;
  syncBoard();
  if (getComputedStyle($('board' + key.toUpperCase())).display === 'none') { active = key; selected = null; }
}
/* Copy and opposite colours write the other board. With matching boards
   the other board is B, and writing it splits the pair: that is how a
   set gets its opposite-colours board in one tap. */
function replaceOther(board) {
  const other = otherKey();
  design[other] = board; design.same = false;
  revealBoard(other); syncAll(); commit();
}
/* A double tap or a double click counts once. The tap that splits the
   boards moves the panel to Board B on a phone, so a second tap would
   make Board A from B, and on a wide screen a second click on Copy would
   copy A over the new opposite board. The second click of a pair says so
   in its detail (a key gives 0, so Enter and Space always work). */
const onceOnly = (fn) => (ev) => { if (ev.detail > 1) return; fn(); };
$('copyother').addEventListener('click', onceOnly(() => replaceOther(withFreshIds(activeBoard()))));
$('swapcolours').addEventListener('click', onceOnly(() => replaceOther(oppositeColours(activeBoard()))));

// -- text tab
for (const [cat, fonts] of FONTS) {
  const g = document.createElement('optgroup'); g.label = cat;
  for (const [f] of fonts) { const o = document.createElement('option'); o.value = f; o.textContent = f; o.style.fontFamily = '"' + f + '"'; g.appendChild(o); }
  $('tfont').appendChild(g);
}
$('addtext').addEventListener('click', () => {
  const fresh = T('NEW TEXT', { size: 3, y: 36 });
  Object.assign(fresh, placeNew(activeBoard(), fresh));
  fresh.color = defaultInk(activeBoard(), fresh);
  const el = addElement(fresh, 'text');
  if (el) { $('ttext').focus(); $('ttext').select(); }
});
field('ttext', 'text', () => wordsFrom($('ttext'), 2));
selectSampleOnFocus($('ttext'), selectedEl);
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
/* Reading a big phone photo holds the page for seconds, and the line
   that says so sits above the tabs, often scrolled away under the header.
   So the button that chose the picture says so itself while a picture for
   the board being edited is on its way, and turns a second tap away: that
   tap used to open the picker again just as the first picture landed.
   aria-disabled, not disabled, so the keyboard focus stays on it. A file
   handed to the input some other way still meets the limit check below. */
const ADD_PICTURE = $('addimagebtn').textContent;
$('addimagebtn').addEventListener('click', () => {
  if ($('addimagebtn').getAttribute('aria-disabled') === 'true') return;
  $('addimage').click();
});
$('addimage').addEventListener('change', async () => {
  const f = $('addimage').files[0]; $('addimage').value = '';
  if (!f) return;
  const originalDesign = design, key = active, target = activeBoard();
  const originalSelection = selected, originalTab = document.querySelector('.tabs [aria-selected="true"]')?.dataset.tab;
  const pending = pendingImageUploads.get(target) || 0;
  if (countOf(target, 'image') + pending >= MAX_IMAGES) {
    uploadStatus('Board ' + key.toUpperCase() + ' already has ' + MAX_IMAGES + ' pictures added or processing. ' + (pending ? 'Wait for processing to finish, then remove a picture to add another.' : 'Remove a picture to add another.'));
    return;
  }
  pendingImageUploads.set(target, pending + 1);
  syncPictureButton();
  uploadStatus('Preparing your picture for Board ' + key.toUpperCase() + '.');
  if (!$('orderstep2').hidden && $('tab-order').dataset.open === 'true') renderReview();
  try {
    const pic = await readImage(f);
    if (design !== originalDesign || design[key] !== target || (key === 'b' && (design.same || order.product === 'single'))) {
      uploadStatus('Picture not added because its board changed while it was processing. Choose the picture again for the current design.');
      return;
    }
    if (countOf(target, 'image') >= MAX_IMAGES) {
      uploadStatus('Picture not added: Board ' + key.toUpperCase() + ' now has ' + MAX_IMAGES + ' pictures. Remove one and choose the picture again.');
      return;
    }
    const el = withDefaults({ type: 'image', ...pic, width: 10, x: 12, y: 30 });
    Object.assign(el, placeNew(target, el));
    target.elements.push(el);
    const currentTab = document.querySelector('.tabs [aria-selected="true"]')?.dataset.tab;
    const focused = document.activeElement;
    const editingControl = focused?.closest('#textprops, #imageprops') || focused?.matches('input:not([type="file"]), textarea, select');
    const pickUp = activeBoard() === target && selected === originalSelection && currentTab === originalTab && !editingControl && !drag;
    if (pickUp) { select(el.id); showTab('art'); }
    else { render(); syncLists(); syncProps(); }
    commit();
    uploadStatus('Picture added to Board ' + key.toUpperCase() + '.', { done: true });
    // Last, so nothing written above the controls moves them after.
    if (pickUp) showPictureControls();
  } catch (e) { uploadStatus('Could not read that image: ' + (e && e.message ? e.message : e) + '. Choose another picture and try again.'); }
  finally {
    const remaining = (pendingImageUploads.get(target) || 1) - 1;
    if (remaining) pendingImageUploads.set(target, remaining); else pendingImageUploads.delete(target);
    syncPictureButton();
    if (!$('orderstep2').hidden && $('tab-order').dataset.open === 'true') renderReview();
  }
});
field('iwidth', 'width', Number, inch);
$('iwidth').addEventListener('input', syncProps);
field('irot', 'rotation', Number, deg);
field('iopacity', 'opacity', Number, (v) => Math.round(v * 100) + '%');
field('ix', 'x', Number, inch);
field('iy', 'y', Number, inch);
toggle('iflip', 'flipH'); toggle('icircle', 'circleCrop'); toggle('iknockout', 'knockout');
/* Fill the board: one picture per board at a time, so ticking it for one
   picture unticks it for any other on the same board. Unticking puts the
   picture back where it was, at the size and turn it had. */
$('icover').addEventListener('change', () => {
  const el = selectedEl(); if (!el || el.type !== 'image') return;
  const on = $('icover').checked;
  if (on) for (const e of activeBoard().elements) if (e.type === 'image' && e !== el) e.cover = false;
  el.cover = on;
  render(); syncLists(); syncProps(); commit();
});
field('ccolor', 'color'); field('coutline', 'outline'); field('coutlinew', 'outlineWidth', Number, inch);
toggle('cflip', 'flipH');
$('idel').addEventListener('click', () => { if (selected) removeElement(selected); });
$('icopy').addEventListener('click', copyToOther);
$('idup').addEventListener('click', duplicate);
$('iforward').addEventListener('click', () => moveLayer(1));
$('iback').addEventListener('click', () => moveLayer(-1));

let clipCat = '';
for (const [k, label] of [['', 'All artwork'], ...Object.entries(CLIP_CATS)]) { const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.dataset.v = k; b.textContent = label; b.setAttribute('aria-pressed', String(k === clipCat)); $('clipcats').appendChild(b); }
chips('clipcats', (v) => { clipCat = v; fillClips(); $('clipfilters').open = false; $('clipfilterlabel').focus(); });
$('clipsearch').addEventListener('input', fillClips);
$('clearclips').addEventListener('click', () => { $('clipsearch').value = ''; clipCat = ''; setChip('clipcats', clipCat); fillClips(); $('clipfilters').open = false; $('clipsearch').focus(); });
fillClips();
$('clips').addEventListener('click', (ev) => { const b = ev.target.closest('.clip'); if (b) addClip(b.dataset.name); });

function removeElement(id) {
  const b = activeBoard();
  const el = findEl(id); if (!el) return;
  const fromProps = selected === id && document.activeElement?.closest('#textprops, #imageprops');
  b.elements = b.elements.filter((e) => e.id !== id);
  if (selected === id) selected = null;
  render(); syncLists(); syncProps(); commit();
  // Removing the selection hides its property controls. Keep keyboard
  // focus in this editor instead of leaving it on the page body.
  if (fromProps) {
    const next = $(el.type === 'text' ? 'texts' : 'images').querySelector('.item');
    (next || $(el.type === 'text' ? 'addtext' : 'addimagebtn')).focus();
  }
}

// -- order tab: options and price, then the review, then the details
fillChips('product', PRICING.products); fillChips('finish', PRICING.finishes); fillChips('bags', PRICING.bags);
$('rushlabel').textContent = (PRICING.rush.short || PRICING.rush.label) + ' (+' + money(PRICING.rush.cents) + ')';
$('caselabel').textContent = (PRICING.carryCase.short || PRICING.carryCase.label) + ' (+' + money(PRICING.carryCase.cents) + ')';
$('finishhint').textContent = 'The guest-book finish is a smooth matte clear coat that takes paint pens: guests sign the boards at the reception, and the signatures are sealed under a second coat of your choice afterwards (we include the kit).';
const SHIP_NOTE = 'We ship by freight to ' + PRICING.shipping.region + ' only (' + money(PRICING.shipping.first) + ' for the first set or board, ' + money(PRICING.shipping.additional) + ' for each one after). Alaska, Hawaii and addresses outside the US are not covered by this checkout.';
/* The line under Continue to payment. The server answers with an invoice
   instead of a payment page only when it has no card payments set up
   (api/order.ts), so after such an answer every order in the visit will
   be invoiced too, and the line names the region alone (see the submit
   handler). */
const SHIP_REGION = 'United States addresses in ' + PRICING.shipping.region + ' only.';
$('shipnote2').textContent = SHIP_REGION + ' Payment is taken on a secure Stripe page; sales tax, where it applies, is added there.';
/* Dispatch is ours to state; arrival is not, because freight transit depends
   on the address. The two are kept apart everywhere the page speaks of time. */
const dispatchNote = () => 'Dispatch: about ' + PRICING.leadTimeDays + ' business days after your order (about ' + PRICING.rushDays + ' with a rush build). Delivery: freight transit is on top and depends on your address; we confirm an estimate with your order. Dates are estimates, not guarantees.';
$('leadtime').textContent = 'Dispatch in about ' + PRICING.leadTimeDays + ' business days (' + PRICING.rushDays + ' with a rush build); delivery time is on top and not guaranteed.';
/* The steps sit in a closed disclosure. The header link that names them, or a
   link that arrives at #how, opens it so the steps are what the visitor sees. */
const howSteps = document.querySelector('#how > details');
document.querySelector('nav.site a[href="#how"]').addEventListener('click', () => { howSteps.open = true; });
if (location.hash === '#how') howSteps.open = true;
$('howdispatch').textContent = 'Built to order and dispatched in about ' + PRICING.leadTimeDays + ' business days (about ' + PRICING.rushDays + ' with the rush option), then shipped by freight to your door anywhere in ' + PRICING.shipping.region + '. Transit time depends on your address and is confirmed with your order.';
const statePrompt = document.createElement('option');
statePrompt.value = ''; statePrompt.textContent = 'Select a state';
$('state').appendChild(statePrompt);
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
   its price; the review, with both boards as they will print; the address. */
let confirmedSamples = null, reviewSamples = null, reviewReady = false, reviewSequence = 0, reviewedRevision = null;
/* orderSubmitting holds Continue to payment from the tap until the answer.
   placedRevision is the reviewed design and options of an order the server
   took without a payment page (it will be invoiced): that order is done, so
   the button goes until something changes and is reviewed again.
   placedCode and placedAnswer are its code and the line that said so.
   payingCode is the order whose payment page the browser is opening. */
let orderSubmitting = false, placedRevision = null, placedCode = '', placedAnswer = '', payingCode = null;
function showOrderStep(n, { focus = false } = {}) {
  if (n === 3 && (!reviewReady || reviewedRevision !== orderReviewRevision() || !samplesConfirmed() || hasPendingImageUploads())) n = 2;
  if (n !== 2) reviewSequence++;
  $('orderstep1').hidden = n !== 1; $('orderstep2').hidden = n !== 2; $('orderstep3').hidden = n !== 3;
  // Step 3 opens only on a current review, so this compares what is about
  // to be ordered with the order already placed.
  $('checkout').hidden = placedRevision !== null && placedRevision === reviewedRevision;
  // The line under the button speaks of the order that is placed. Once the
  // design or the options have changed, the button is back, and a tap
  // makes a second order: the line says so, rather than leaving "received"
  // under it as if the button paid for that one.
  if (n === 3 && placedRevision !== null) {
    const [kind, line] = placedRevision === reviewedRevision ? ['ok', placedAnswer]
      : ['info', 'Order ' + placedCode + ' is already placed. Continue to payment places a second, separate order with your changes.'];
    if ($('orderstatus').textContent !== line) status(kind, line, { scroll: false });
  }
  if (n === 2) renderReview();
  if (n === 3) syncOrder();
  if (focus) {
    $('orderstep' + n + '-title').focus({ preventScroll: true });
    scrollToPanel();
  }
}
$('toreview').addEventListener('click', () => showOrderStep(2, { focus: true }));
$('backtooptions').addEventListener('click', () => showOrderStep(1, { focus: true }));
$('backtoedit').addEventListener('click', () => {
  showTab(lastEditTab); showOrderStep(1);
  $('tabbtn-' + lastEditTab).focus({ preventScroll: true });
  scrollToPanel();
});
$('tocheckout').addEventListener('click', () => showOrderStep(3, { focus: true }));
$('backtoorder').addEventListener('click', () => showOrderStep(2, { focus: true }));
$('keepsamples').addEventListener('change', () => {
  confirmedSamples = $('keepsamples').checked && reviewSamples === sampleSignature() ? reviewSamples : null;
  syncReviewContinue();
});
$('reviewbtn').addEventListener('click', () => { showTab('order'); showOrderStep(2, { focus: true }); });
async function renderReview() {
  const sequence = ++reviewSequence, revision = orderRevision(), source = JSON.parse(snapshot()), options = structuredClone(order);
  reviewReady = false;
  $('reviewchanged').hidden = true;
  syncReviewContinue();
  const q = quote(order), keys = boardKeys();
  const rb = $('reviewboards'); rb.textContent = '';
  const message = document.createElement('p'); message.setAttribute('role', 'status');
  message.textContent = hasPendingImageUploads() ? 'Your picture is still processing. The review will update when it is ready.' : 'Preparing your board previews…';
  rb.appendChild(message);
  const list = $('reviewlist'); list.textContent = '';
  const li = (a, b) => { const l = document.createElement('li'), s1 = document.createElement('span'), s2 = document.createElement('span'); s1.textContent = a; if (typeof b === 'string') s2.textContent = b; else s2.append(...b); l.append(s1, s2); list.appendChild(l); return s2; };
  const dot = (hex) => { const s = document.createElement('span'); s.className = 'swatchdot'; s.style.background = hex; s.setAttribute('aria-hidden', 'true'); return s; };
  li('Product', order.quantity + ' x ' + PRICING.products[order.product].label);
  li('Design', order.product === 'single' ? 'One board' : design.same ? 'The same on both boards' : 'Two different boards');
  /* The words on each board as text, in the order the Text list has them,
     a line break shown as a slash: a misspelling, or a name corrected on
     one board and not on the other, is easier to catch here than on a
     picture of the board. */
  const wordsOn = (k) => design[k].elements.filter((e) => e.type === 'text')
    .map((e) => String(e.text || '').split('\n').map((s) => s.trim()).filter(Boolean).join(' / '))
    .filter(Boolean).join(' · ') || 'None';
  for (const k of keys) li(keys.length > 1 ? 'Board ' + k.toUpperCase() + ' words' : 'Words', wordsOn(k));
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
  $('reviewnote').textContent = priceNote(q, { review: true }) + ' Freight transit is on top of dispatch and depends on your address; we confirm an estimate with your order. Dates are estimates, not guarantees.';
  const samples = sampleWordsIn();
  $('samplewarn').hidden = !samples.length;
  $('sampletext').textContent = samples.length ? 'These look like the sample words a template came with: ' + samples.map((s) => '“' + s + '”').join(', ') + '. They would be printed exactly like that. Go back to editing to change them, or confirm that you want them.' : '';
  reviewSamples = sampleSignature();
  $('keepsamples').checked = samples.length > 0 && confirmedSamples === reviewSamples;
  const low = lowResImages(keys);
  $('reswarn').hidden = !low.length; $('reswarn').textContent = low.join(' ');
  $('assetwarn').hidden = true;
  $('readwarn').hidden = true;
  if (hasPendingImageUploads()) return;
  try {
    await prepareOutputFonts(source);
    await preloadImages(keys, { print: false, source });
    if (sequence !== reviewSequence) return;
    if (revision !== orderRevision() || hasPendingImageUploads()) return renderReview();
    const payload = await prepareRequestPayload({ source, options });
    if (sequence !== reviewSequence) return;
    if (revision !== orderRevision() || hasPendingImageUploads()) return renderReview();
    $('assetwarn').hidden = payload.options.assets !== 'pending';
    rb.textContent = '';
    /* 12 pixels per inch: on a phone the review boards are 160 px wide,
       and a sharper picture helps the names be read there. */
    for (const k of keys) {
      const f = document.createElement('figure'), img = new Image(), cap = document.createElement('figcaption');
      img.src = previewDataUrl(k, 12, source); img.alt = 'Board ' + k.toUpperCase() + ' as it will print';
      cap.textContent = keys.length > 1 ? 'Board ' + k.toUpperCase() : order.product === 'set' ? 'Both boards' : 'Your board';
      f.append(img, cap); rb.appendChild(f);
    }
    /* Words or art that will not show, and lines shrunk hard to fit: one
       line each, with the other notes. It warns; it does not hold. */
    const unread = readabilityIssues(keys, source), rw = $('readwarn');
    rw.textContent = '';
    for (const line of unread) { const p = document.createElement('p'); p.textContent = line; rw.appendChild(p); }
    rw.hidden = !unread.length;
    reviewedRevision = orderReviewRevision();
    reviewReady = true;
    syncReviewContinue();
  } catch (_) {
    if (sequence !== reviewSequence) return;
    if (revision !== orderRevision()) return renderReview();
    message.textContent = 'Your board preview could not be prepared. Check your uploaded pictures and try again.';
    const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'btn'; retry.textContent = 'Try preview again';
    retry.addEventListener('click', renderReview); rb.appendChild(retry);
  }
}
$('saveunsubmitted').addEventListener('click', exportProject);
function holdCheckout(on) { orderSubmitting = on; busyButton($('checkout'), on); }
$('orderform').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  if (orderSubmitting) return;
  const f = $('orderform');
  if (!f.checkValidity()) { f.reportValidity(); return; }
  if (!reviewReady || reviewedRevision !== orderReviewRevision() || !samplesConfirmed()) { showOrderStep(2, { focus: true }); return; }
  // This reviewed design and these options are already ordered. Enter in a
  // field still submits through the hidden button: show the answer again.
  if (placedRevision === reviewedRevision) { $('orderstatus').scrollIntoView({ block: 'nearest' }); return; }
  if (hasPendingImageUploads()) { status('warn', 'Your picture is still processing. Wait for it to finish, then review your design before continuing.'); return; }
  if (!activeBoard().elements.length && design.a.base.kind === 'paint' && design.a.pattern.kind === 'none') {
    if (!confirm('Your board is a plain colour with nothing on it. Order it like that?')) return;
  }
  const revision = orderRevision(), source = JSON.parse(snapshot()), options = structuredClone(order);
  const keys = options.product === 'set' && !source.same ? ['a', 'b'] : ['a'];
  holdCheckout(true); status('info', 'Preparing your design…');
  try {
    let payload;
    try {
      await prepareOutputFonts(source);
      await preloadImages(keys, { print: false, source });
      payload = await prepareRequestPayload({ source, options });
    } catch (_) {
      status('bad', 'Your design could not be prepared. Check your uploaded pictures and try again. Nothing was charged.');
      return;
    }
    if (revision !== orderRevision() || hasPendingImageUploads() || !samplesConfirmed()) {
      showTab('order'); showOrderStep(2, { focus: true });
      return;
    }
    if (!f.checkValidity()) { f.reportValidity(); return; }
    Object.assign(payload, orderDetails());
    // What is being sent: the revision check above found nothing changed.
    const sending = orderReviewRevision();
    status('info', 'Sending your design…');
    const r = await fetch('api/order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const j = await r.json().catch(() => ({}));
    const files = payload.options.assets === 'pending' ? ' Your pictures were too large to send in full with the order: keep your originals, as the full-size files will need to be supplied separately.' : '';
    if (r.status === 503 && j.error === 'not_configured') {
      status('warn', 'Ordering is not switched on for this site yet. Your order was not submitted. Nothing was charged. Save an editable copy below to keep your design, then try again when ordering is available.', { offerSave: true });
    } else if (!r.ok) {
      status('bad', j.message || ('Something went wrong (' + r.status + '). Nothing was charged.'));
    } else if (j.url) {
      // The button stays held while the browser opens the payment page: a
      // second tap in that moment would place a second order.
      payingCode = j.code;
      status('ok', 'Order ' + j.code + ' saved. Taking you to payment…');
      window.location.assign(j.url);
      return;
    } else {
      // Placed, to be invoiced. The button goes, so the focus it had moves
      // to the answer that replaces it, unless the customer is elsewhere.
      const here = !document.activeElement || document.activeElement === document.body || $('orderstep3').contains(document.activeElement);
      const earlier = placedCode && placedCode !== j.code ? ' Order ' + placedCode + ' is a separate order.' : '';
      placedRevision = sending; placedCode = j.code;
      placedAnswer = 'Order ' + j.code + ' received. We will email you an invoice for ' + money(j.total) + ' and start once it is paid.' + earlier + files;
      $('checkout').hidden = placedRevision === reviewedRevision;
      $('shipnote2').textContent = SHIP_REGION;
      status('ok', placedAnswer);
      if (here && !$('orderstep3').hidden) $('orderstatus').focus({ preventScroll: true });
    }
  } catch (e) {
    payingCode = null;
    status('bad', 'Could not reach the server. Check your connection and try again - nothing was charged.');
  } finally {
    if (!payingCode) holdCheckout(false);
  }
});
/* Back from the payment page through the back-forward cache, the page is
   as it was left: release the button, and say the payment is not
   confirmed rather than "Taking you to payment". Paying again places a new
   order, as the cancelled-payment return says. */
window.addEventListener('pageshow', (e) => {
  if (!e.persisted || !payingCode) return;
  const code = payingCode; payingCode = null;
  holdCheckout(false);
  status('warn', 'Payment for order ' + code + ' has not been confirmed. To pay, continue to payment again; that places a new order with a new code.');
});

// -- stage bar, project buttons
async function prepareOutputFonts(source) {
  if (document.fonts?.ready) await document.fonts.ready;
  // Fit captured words using the loaded font while leaving live edits alone.
  for (const board of [source.a, source.b]) for (const el of board.elements) {
    if (el.type === 'text' && el.autoFit && el.fitReference && el.text !== el.fitReference.text) fitTemplateText(el);
  }
}
// Share preview and Download print file are held the way checkout is.
let sharingPreview = false, makingPrintFile = false;
async function sharePreview() {
  const btn = $('sharepreview'), message = $('sharestatus');
  if (sharingPreview) return;
  if (hasPendingImageUploads()) { message.hidden = false; message.textContent = 'A picture is still processing. Wait for it to finish, then share your preview.'; return; }
  sharingPreview = true; busyButton(btn, true); message.hidden = false; message.textContent = 'Preparing your preview…';
  try {
    const keys = order.product === 'set' ? ['a', 'b'] : ['a'];
    const source = JSON.parse(snapshot());
    await preloadImages(keys, { print: false, source });
    await prepareOutputFonts(source);
    const ppi = 12, width = BOARD.w * ppi, height = BOARD.h * ppi, pad = 32, gap = 24;
    const canvas = document.createElement('canvas'); canvas.width = pad * 2 + keys.length * width + (keys.length - 1) * gap; canvas.height = height + 124;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#f7f4ed'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#26344c'; ctx.font = '600 20px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('My cornhole board design', canvas.width / 2, 34);
    keys.forEach((key, index) => {
      const x = pad + index * (width + gap); ctx.save(); ctx.translate(x, 56); renderOutput(ctx, boardFor(key, source), ppi); ctx.restore();
      ctx.fillStyle = '#26344c'; ctx.font = '14px sans-serif'; ctx.fillText('Board ' + key.toUpperCase(), x + width / 2, height + 80);
    });
    ctx.fillStyle = '#5c6370'; ctx.font = '12px sans-serif'; ctx.fillText('Design preview · 24 × 48 inch boards', canvas.width / 2, height + 108);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Preview could not be generated.');
    const file = new File([blob], 'cornhole-preview-' + today() + '.png', { type: 'image/png' });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ title: 'My cornhole board design', files: [file] });
        message.textContent = 'Preview shared. Save an editable copy from Start to keep working on another device.'; return;
      } catch (error) { if (error.name === 'AbortError') { message.textContent = 'Sharing cancelled. Your design is still here.'; return; } }
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    message.textContent = 'Preview downloaded. Send the image to someone, or save an editable copy from Start to continue later.';
  } catch (_) { message.textContent = 'The preview could not be prepared. Check your uploaded pictures and try again; your editable design is still here.'; }
  finally { sharingPreview = false; busyButton(btn, false); render(); }
}
$('sharepreview').addEventListener('click', sharePreview);
$('undo').addEventListener('click', undo);
$('redo').addEventListener('click', redo);
$('reset').addEventListener('click', () => { if (!confirm('Start over with the default design? You can restore your current design with Undo.')) return; design = freshDesign(); selected = null; active = 'a'; syncAll(); commit(); });
$('download').addEventListener('click', async () => {
  const btn = $('download'); if (makingPrintFile) return;
  if (hasPendingImageUploads()) { alert('A picture is still processing. Wait for it to finish, then download the print file.'); return; }
  const keys = boardKeys(), source = JSON.parse(snapshot());
  const long = btn.querySelector('.long'), short = btn.querySelector('.short');
  const labels = [long.textContent, short.textContent];
  makingPrintFile = true; busyButton(btn, true);
  long.textContent = 'Preparing print file'; short.textContent = 'Preparing…';
  try {
    await preloadImages(keys, { source });
    await prepareOutputFonts(source);
    for (const k of keys) {
      const blob = await new Promise((res) => printCanvas(k, source).toBlob(res, 'image/png'));
      if (!blob) throw new Error('The browser could not generate the print file. Please try again.');
      const printFile = await pngWithResolution(blob, PRINT_PPI);
      const a = document.createElement('a'); a.href = URL.createObjectURL(printFile); a.download = 'cornhole-board-' + k.toUpperCase() + '-24x48in-100ppi.png';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    }
  } catch (error) { alert(error.message + ' Your design is still here.'); }
  finally {
    makingPrintFile = false; busyButton(btn, false);
    long.textContent = labels[0]; short.textContent = labels[1]; render();
  }
});
$('exportbtn').addEventListener('click', exportProject);
$('exportlink').addEventListener('click', exportProject);
// The latest saved project is whatever another tab wrote last: a reload reads it.
$('reloadlatest').addEventListener('click', () => location.reload());
$('tabreload').addEventListener('click', () => location.reload());
$('importbtn').addEventListener('click', () => $('importfile').click());
let projectFileSequence = 0;
$('importfile').addEventListener('change', async () => {
  const f = $('importfile').files[0]; $('importfile').value = '';
  if (!f) return;
  const sequence = ++projectFileSequence;
  // The latest picker selection owns the operation, even while its file
  // is still being read and an earlier project's pictures are decoding.
  ++projectImportSequence;
  const assertCurrentProject = captureImportGuard();
  try {
    if (f.size > MAX_PROJECT_BYTES) throw new Error('Project files must be 64 MB or smaller');
    const contents = await f.text();
    if (sequence !== projectFileSequence) return;
    assertCurrentProject();
    await importProject(JSON.parse(contents), { confirmReplace: true });
  }
  catch (e) { if (sequence === projectFileSequence) alert('Could not import that file: ' + (e && e.message ? e.message : e) + '.'); }
});

/* The business behind the site, from lib/site.mjs. A detail that is not
   filled in is said to be on its way, never made up. */
function renderSite() {
  const name = SITE.name || 'Cornhole Board Builder';
  $('brand').textContent = name; document.title = name;
  const contact = [SITE.email && 'Email ' + SITE.email, SITE.phone && 'Phone ' + SITE.phone, SITE.address, SITE.hours].filter(Boolean);
  $('contactcard').textContent = contact.length ? contact.join('. ') + '.' : 'Contact details have not been added yet. Order notes are only submitted when an order is successfully received; they are not a separate way to contact the business.';
  $('deliverycard').textContent = SITE.delivery || (SHIP_NOTE + ' ' + dispatchNote());
  $('customcard').textContent = SITE.customOrders || (contact.length ? 'For something the builder cannot do, confirm your requirements with the business before ordering.' : 'Custom-order details have not been added yet. Save an editable copy and wait for a confirmed contact method before ordering a custom request.');
  $('approvalcard').textContent = SITE.approval || 'Check every word, colour and picture in your board design before ordering. Share preview creates an image for showing others; Print file creates full-size artwork. Save editable copy keeps a project you can reopen in the builder.';
  const photos = $('photos'); photos.textContent = ''; photos.hidden = !SITE.photos.length;
  for (const p of SITE.photos) { const img = new Image(); img.src = p.src; img.alt = p.alt || ''; img.loading = 'lazy'; photos.appendChild(img); }
  $('footer').textContent = name + '. Boards are regulation ACA/ACL size.' + (contact.length ? ' ' + contact.join('. ') + '.' : '');
}

function syncAll() { syncBoard(); syncLists(); syncProps(); syncOrder(); syncHistoryButtons(); render(); }

/* ====================================================================
   BOOT. The page draws at once, then the saved project (if any) is read
   from the device and put in place. Until then the builder takes no click
   and no key (body.loading, and the regions are inert), so an edit can
   never race the restore and lose it; nothing is written back until the
   restore has finished, so a restored project is never overwritten by
   the fresh page. A device that does not answer in six seconds is not
   waited for: the builder opens, says it is still checking, and keeps
   what is typed meanwhile. A project that turns up after that is
   offered, not forced, and Undo reaches whichever design was not kept.
   ==================================================================== */
startupSnapshot = JSON.stringify({ design, order });
history = [copyHistoryState(design)];
syncAll();
showOutcome();
renderSite();
const LATE_PROJECT_PROMPT = 'A design saved earlier on this device was found. Replace what you have started with it?';
function openBuilder() {
  loaded = true;
  document.body.classList.remove('loading');
  for (const el of document.querySelectorAll('.panel, .stage, #mobilebar')) el.inert = false;
}
(async () => {
  let p = null, unreadable = false, restored = false;
  const timeout = setTimeout(() => {
    restoreTimedOut = true; openBuilder(); setSaveState('waiting');
  }, 6000);
  try {
    p = await loadProject({ validate: (project) => {
      // Stored order choices still use applyOrder's legacy sanitization.
      // Validate the artwork before migrate can default or render it.
      validateProject({ design: project.design }, { clips: CLIPS, patterns: PATTERNS, stains: STAINS, allowOffboardPositions: true });
    } });
  } catch (_) { unreadable = true; }
  clearTimeout(timeout);
  // The save just read is not news when another tab announces it, kept
  // or declined; one made after the read is (see showChangedElsewhere).
  if (p) knownSave = Math.max(knownSave, noteTime(p));
  // Edits are possible only once the six-second notice has opened the
  // builder. Include ones still in progress (typing, a colour picker, or
  // dragging) even when their change/commit event has not happened yet.
  const editedDuringLoad = hasStartupEdits();
  startupSnapshot = null;
  let keepEdits = editedDuringLoad;
  if (p && editedDuringLoad) {
    // Whichever design the customer keeps, the other is one Undo away. An
    // edit still in progress (typing, a colour pick) is not in the history
    // yet, so the design is recorded as it stands; a drag is recorded when
    // it ends, whether it completes or is cancelled.
    if (!drag && !sameHistoryState(history[history.length - 1], design)) history.push(copyHistoryState(design));
    if (confirm(LATE_PROJECT_PROMPT)) keepEdits = false;
    else {
      // The saved design takes the untouched default's place at the start
      // of the history. When that default is still the design on screen
      // (an order-only edit), it keeps an entry of its own above it.
      if (history.length === 1 && !drag) history.push(copyHistoryState(design));
      history[0] = copyHistoryState(migrate(p.design)); future = []; syncHistoryButtons();
    }
  }
  if (p && !keepEdits) {
    const previousDesign = design, previousOrder = { ...order, bagColors: [...order.bagColors] };
    try {
      design = migrate(p.design);
      if (p.order) applyOrder(p.order);
      selected = null; active = 'a';
      if (editedDuringLoad) history.push(copyHistoryState(design)); else history = [copyHistoryState(design)];
      future = [];
      syncAll(); showTab('board');
      restored = true;
    } catch (_) {
      // A restoration failure must not leave a partly applied project or
      // permanently disable saves for the customer's next edit.
      design = previousDesign; Object.assign(order, previousOrder);
      selected = null; active = 'a';
      history = [copyHistoryState(design)]; future = [];
      syncAll(); unreadable = true;
    }
  }
  if (!keepEdits) {
    saveBaseline = copyHistoryState({ design, order });
    saveBaselineState = restored ? 'saved' : unreadable ? 'unreadable' : 'new';
  }
  storageReady = true;
  if (keepEdits) save();
  else if (restored) setSaveState('saved');
  else if (unreadable) {
    recoverySnapshot = JSON.stringify({ design, order });
    setSaveState('unreadable');
  } else setSaveState('new');
  showChangedElsewhere();
  openBuilder();
})();
window.addEventListener('resize', render);
/* Web fonts arrive after the first paint; a text set in one is measured
   and drawn in the fallback until then. When faces land, repaint, refit
   the guided text, and redraw the template thumbnails already drawn (the
   rest are drawn with the loaded fonts when they come into view). A
   loading round that brought no face in changes nothing. */
const refontThumbs = (ev) => {
  if (ev && ev.fontfaces && !ev.fontfaces.length) return;
  for (const [c, t] of thumbnails) if (t.text && c.dataset.drawn) t.draw();
  let resized = false;
  for (const board of [design.a, design.b]) for (const el of board.elements) if (el.type === 'text' && el.autoFit && el.fitReference && el.text !== el.fitReference.text) { const before = el.size; fitTemplateText(el); resized ||= before !== el.size; }
  syncProps(); render(); if (resized) commit();
};
if (document.fonts) document.fonts.addEventListener('loadingdone', refontThumbs);
/* The font stylesheet is fetched without holding the first paint (the link
   in index.html), so its @font-face rules can land after the boards are
   drawn - and a face is only fetched once something is drawn in it. When
   the sheet is turned on, draw everything again: the canvas then asks for
   every family on the boards and in the thumbnails, and loadingdone above
   repaints as the files arrive. The load() is for a browser whose canvas
   does not ask by itself. */
const webfonts = $('webfonts');
const askForFonts = () => {
  if (document.fonts && document.fonts.load) {
    const used = new Set();
    for (const k of ['a', 'b']) for (const el of design[k].elements) if (el.type === 'text' && el.font) used.add(el.font);
    for (const f of used) document.fonts.load((FONT_WEIGHT[f] || 400) + ' 16px "' + f + '"').catch(() => {});
  }
  refontThumbs();
};
if (webfonts) webfonts.addEventListener('load', askForFonts);

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
  SAVE_TEXT, NOTICE_STATES,
  get historyLength() { return history.length; },
  setDesign(d) { design = migrate(JSON.parse(JSON.stringify(d))); selected = null; syncAll(); commit(); },
  setOrder(o) { Object.assign(order, o); syncAll(); },
  select, commit, undo, redo, render, paint, showTab, printCanvas, previewDataUrl, orderPayload, preloadImages,
  activeBoard, addClip, applyTemplate, applyBlank, migrate, showOrderStep, renderReview, handlePoints, setMode,
  isPristine, sampleWordsIn, readabilityIssues, exportProject, importProject, projectRecord, colourName,
};

export {
  design, active, selected, commit, save, saveSoon, drag, setChip, setRange,
  select, showTab, syncScrollPadding, applyTemplate, askThenApply,
  withFreshIds, ADD_PICTURE, clipCat, removeElement, confirmedSamples,
  reviewReady, reviewedRevision, showOrderStep
};
