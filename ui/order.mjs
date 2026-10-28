/* The Order tab: the quote and its notes, the steps' Continue buttons,
   the order sent to the server and the answer shown afterwards. Part of
   app.mjs, which keeps the order's state (what was reviewed, placed or is
   being paid for). */

import { PRICING, quote, money } from '../lib/price.mjs';
import {
  design, save, setChip, confirmedSamples, reviewReady, reviewedRevision,
  showOrderStep
} from '../app.mjs';
import { PAYLOAD_BYTES, $, freshBoard, order, sampleWordsIn } from './model.mjs';
import { previewDataUrl } from './draw.mjs';
import { hasPendingImageUploads, shrunkPreview } from './pictures.mjs';

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
const sampleSignature = () => JSON.stringify(sampleWordsIn().sort());
const samplesConfirmed = () => !sampleWordsIn().length || confirmedSamples === sampleSignature();
const orderRevision = () => JSON.stringify({ design, order });
// The optional gift note is entered on the details step, after board review.
const orderReviewRevision = () => JSON.stringify({ design, order: { ...order, giftNote: '' } });
function syncReviewContinue() {
  $('tocheckout').disabled = !reviewReady || hasPendingImageUploads() || !samplesConfirmed();
}
function reviewIfChanged() {
  if ($('orderstep1').hidden && reviewedRevision !== orderReviewRevision()) {
    showOrderStep(2, { focus: true });
    $('reviewchanged').hidden = false;
    return true;
  }
  return false;
}

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
/* What the price covers. The bags are chosen on the Options step, above
   this note there; the review says where to find them instead. */
function priceNote(q, { review = false } = {}) {
  const boards = PRICING.products[order.product].boards * order.quantity;
  return 'Includes ' + boards + ' regulation board' + (boards === 1 ? '' : 's') + ' with folding legs, your design printed and sealed under the ' + PRICING.finishes[order.finish].label.toLowerCase() + ', and freight to ' + PRICING.shipping.region + ' (not Alaska, Hawaii or overseas). '
    + (order.bags === 'regulation' ? 'Bags are included. ' : 'Bags are not included: add them ' + (review ? 'under Options. ' : 'above. '))
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

/* The answer sits under Continue to payment, which is often at the foot of
   the screen, so each message is brought into view as it is written, and
   Save editable copy with it when it is offered. */
function status(kind, text, { offerSave = false, scroll = true } = {}) {
  const s = $('orderstatus'), save = $('saveunsubmitted');
  s.dataset.kind = kind; s.textContent = text; save.hidden = !offerSave;
  if (!scroll) return;
  s.scrollIntoView({ block: 'nearest' });
  if (offerSave) save.scrollIntoView({ block: 'nearest' });
}
/* A button that is working keeps keyboard focus: the disabled property
   would drop it to the page. aria-disabled dims it and tells a screen
   reader, and the caller's flag turns a second press away. */
function busyButton(btn, on) {
  if (on) { btn.setAttribute('aria-disabled', 'true'); btn.setAttribute('aria-busy', 'true'); }
  else { btn.removeAttribute('aria-disabled'); btn.removeAttribute('aria-busy'); }
}
function orderDetails() {
  const f = $('orderform');
  const v = (id) => f.elements[id].value.trim();
  return {
    customer: { name: v('name'), email: v('email'), phone: v('phone') },
    shipping: { line1: v('line1'), line2: v('line2'), city: v('city'), state: v('state'), postal: v('postal'), country: v('country') },
    notes: v('notes'),
  };
}
/* Build a copy of only the artwork being ordered. The saved project keeps
   its unused board, blank text and full-size pictures for later editing. */
function orderPayload({ source = design, options = order } = {}) {
  const previews = [previewDataUrl('a', 10, source)];
  if (options.product === 'set' && !source.same) previews.push(previewDataUrl('b', 10, source));
  const opts = { product: options.product, quantity: options.quantity, finish: options.finish, bags: options.bags, rush: options.rush,
    carryCase: options.carryCase, occasion: options.occasion, giftNote: options.giftNote.trim() };
  if (options.bags === 'regulation') opts.bagColors = [...options.bagColors];
  if (options.needBy) opts.needBy = options.needBy;
  const designOut = JSON.parse(JSON.stringify(source));
  if (designOut.same || options.product === 'single') designOut.b = freshBoard();
  for (const k of ['a', 'b']) designOut[k].elements = designOut[k].elements.filter((e) => e.type !== 'text' || e.text.trim());
  const pictures = [];
  for (const k of ['a', 'b']) for (const e of designOut[k].elements) if (e.type === 'image') pictures.push(e);
  const payload = {
    options: opts,
    design: designOut,
    previews,
    ...orderDetails(),
  };
  if (pictures.length) {
    // A small lossless picture has no separate master: src is already its
    // full image. Files are pending only when a real master is left out.
    opts.assets = 'included';
    if (pictures.some((e) => e.orig) && JSON.stringify(payload).length > PAYLOAD_BYTES) {
      for (const e of pictures) delete e.orig;
      opts.assets = 'pending';
    }
  }
  return payload;
}
/* When previews alone exceed the request budget, reduce the largest first.
   This operates only on the outgoing copy and reports the file handoff. */
async function prepareRequestPayload({ source, options }) {
  const payload = orderPayload({ source, options });
  const pictures = ['a', 'b'].flatMap(k => payload.design[k].elements.filter(e => e.type === 'image'));
  const reductions = new Map(), maxReductions = Math.min(64, pictures.length * 8);
  for (let tries = 0; tries < maxReductions && JSON.stringify(payload).length > PAYLOAD_BYTES; tries++) {
    // A full pair can contain eight large previews. Give each one room
    // to shrink without spending the entire budget on the first pass.
    const available = pictures.filter(picture => (reductions.get(picture) || 0) < 8);
    if (!available.length) break;
    const biggest = available.reduce((a, b) => a.src.length >= b.src.length ? a : b);
    const smaller = await shrunkPreview(biggest.src, 0.7);
    // Interpolation can temporarily increase PNG bytes while reducing
    // pixels. An unchanged encoding makes no progress; retries stay bounded.
    if (smaller === biggest.src) break;
    biggest.src = smaller;
    reductions.set(biggest, (reductions.get(biggest) || 0) + 1);
    payload.options.assets = 'pending';
  }
  if (JSON.stringify(payload).length > PAYLOAD_BYTES) throw new Error('The design is too large to send. Save an editable copy and reduce the pictures before trying again.');
  return payload;
}

/* A return URL identifies the order to check, not its payment status.
   Use the saved status for both successful and cancelled checkout links. */
function showOutcome() {
  const p = new URLSearchParams(location.search);
  const o = p.get('order'), code = (p.get('code') || '').toUpperCase();
  if (!['success', 'cancelled'].includes(o)) return;
  const box = $('done'); box.hidden = false;
  const retry = $('retryorder'), summary = $('returnedordersummary');
  const show = (state, title, message) => {
    box.dataset.state = state; $('donetitle').textContent = title;
    $('donestatus').textContent = message; summary.hidden = true;
  };
  // Scroll only on arrival. A late lookup must not move someone who is editing.
  box.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  if (!/^CH-[A-Z0-9]{6}$/.test(code)) {
    show('invalid', 'Order status unavailable.', 'This link is missing a valid order code. Open the complete checkout return link to check your order.');
    return;
  }
  $('orderreference').hidden = false; $('returnedordercode').textContent = code;
  retry.hidden = false;
  /* Leaving the payment page lands on the cancelled link, and only a completed
     payment moves an order on, so checking again never changes that answer.
     Say how to pay instead, without guessing about any charge. */
  const states = {
    pending: o === 'cancelled'
      ? ['Payment not completed.', 'Payment for this order has not been confirmed. Your design is still here: to pay, open the Order tab, review it and continue to payment again. That places a new order with a new code.']
      : ['Payment not confirmed yet.', 'Your order is recorded, but payment has not been confirmed. Check the status again before starting another payment.'],
    paid: ['Payment confirmed.', 'Your order is marked as paid.'],
    in_production: ['Your boards are in production.', 'Order status: in production.'],
    shipped: ['Your order has shipped.', 'Order status: shipped.'],
    cancelled: ['Order cancelled.', 'The stored order is marked as cancelled. Keep this order code for reference.'],
  };
  const check = async () => {
    if (retry.getAttribute('aria-disabled') === 'true') return;
    // Retain keyboard focus while preventing another request. A native
    // disabled button drops focus, and restoring it later could steal an edit.
    retry.setAttribute('aria-disabled', 'true'); retry.setAttribute('aria-busy', 'true');
    show('checking', 'Checking your order.', 'Checking the saved order status.');
    const controller = new AbortController();
    const notFound = Symbol('order-not-found');
    let timeout;
    try {
      const lookup = (async () => {
        const r = await fetch('api/order?code=' + encodeURIComponent(code), { signal: controller.signal, cache: 'no-store' });
        if (r.status === 404) return notFound;
        if (!r.ok) throw new Error('Order lookup unavailable');
        return await r.json();
      })();
      // Bound the whole read, including a response body that never finishes.
      const j = await Promise.race([lookup, new Promise((_, reject) => {
        timeout = setTimeout(() => { reject(new Error('Order lookup timed out')); controller.abort(); }, 8000);
      })]);
      if (j === notFound) {
        show('not-found', 'Order code not found.', 'This order code was not found. Check the code and try again before starting another payment.');
        return;
      }
      if (!j || j.code !== code || typeof j.status !== 'string' || !Object.hasOwn(states, j.status) ||
          typeof j.product !== 'string' || !Object.hasOwn(PRICING.products, j.product) ||
          !Number.isSafeInteger(j.quantity) || j.quantity < 1 || !Number.isSafeInteger(j.amount_cents) || j.amount_cents < 0 ||
          typeof j.currency !== 'string' || j.currency.toLowerCase() !== PRICING.currency) throw new Error('Unrecognized order response');
      show(j.status, ...states[j.status]);
      summary.textContent = j.quantity + ' x ' + PRICING.products[j.product].label + ', ' + money(j.amount_cents) + ' USD before tax.';
      summary.hidden = false;
    } catch (_) {
      show('unavailable', 'Order status unavailable.', 'We could not confirm this order\'s status right now. Check again before starting another payment.');
    } finally {
      clearTimeout(timeout); retry.removeAttribute('aria-disabled'); retry.removeAttribute('aria-busy');
    }
  };
  retry.addEventListener('click', check);
  check();
}

export {
  fillChips, sampleSignature, samplesConfirmed, orderRevision,
  orderReviewRevision, syncReviewContinue, reviewIfChanged, fillQuote,
  priceNote, syncOrder, status, busyButton, orderDetails, orderPayload,
  prepareRequestPayload, showOutcome
};
