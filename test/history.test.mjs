import test from 'node:test';
import assert from 'node:assert/strict';
import { copyHistoryState, sameHistoryState } from '../lib/history.mjs';

const state = () => ({
  version: 2, same: false,
  a: { base: { kind: 'paint', color: '#123456' }, pattern: { kind: 'none' }, elements: [
    { type: 'text', id: 'words', text: 'OUR FAMILY', fitReference: { text: 'YOUR TEAM', font: 'Arial', size: 4, spacing: 0 } },
    { type: 'image', id: 'photo', src: 'data:image/png;base64,preview==', orig: 'data:image/png;base64,original==', px: [1600, 800], x: 12, y: 30 },
  ] },
  b: { base: { kind: 'wood', stain: 'walnut' }, pattern: { kind: 'none' }, elements: [] },
});

test('history copies every mutable layer while keeping image bytes and nested metadata exact', () => {
  const live = state(); live.a.elements[1].note = { originalName: 'logo.png', tags: ['family', null] };
  const copy = copyHistoryState(live);
  assert.deepEqual(copy, JSON.parse(JSON.stringify(live)));
  assert.notEqual(copy, live);
  assert.notEqual(copy.a, live.a);
  assert.notEqual(copy.a.base, live.a.base);
  assert.notEqual(copy.a.pattern, live.a.pattern);
  assert.notEqual(copy.a.elements, live.a.elements);
  assert.notEqual(copy.a.elements[0].fitReference, live.a.elements[0].fitReference);
  assert.notEqual(copy.a.elements[1].px, live.a.elements[1].px);
  assert.notEqual(copy.a.elements[1].note.tags, live.a.elements[1].note.tags);
  assert.equal(copy.a.elements[1].src, live.a.elements[1].src);
  assert.equal(copy.a.elements[1].orig, live.a.elements[1].orig);
});

test('later live edits and edits to a restored copy cannot mutate retained history', () => {
  const live = state(), expected = JSON.parse(JSON.stringify(live)), saved = copyHistoryState(live);
  live.a.elements[0].fitReference.text = 'CHANGED'; live.a.elements[1].px[0] = 900;
  live.a.elements[1].src = 'new image'; live.a.base.color = '#ffffff';
  live.b.elements.push({ type: 'clip', name: 'heart' });
  assert.deepEqual(saved, expected);
  const restored = copyHistoryState(saved);
  restored.a.elements[0].fitReference.size = 2; restored.a.elements[1].px[1] = 450;
  restored.a.elements.pop(); restored.b.base.stain = 'natural';
  assert.deepEqual(saved, expected);
});

test('history equality detects nested edits, both boards and exact image-source changes', () => {
  const original = state();
  assert.equal(sameHistoryState(original, copyHistoryState(original)), true);
  for (const change of [
    value => { value.same = true; },
    value => { value.a.elements[0].fitReference.text += '!'; },
    value => { value.a.elements[1].px[0]--; },
    value => { value.a.elements[1].src += 'A'; },
    value => { value.a.elements[1].orig += 'A'; },
    value => { value.b.base.stain = 'natural'; },
    value => { value.a.elements.reverse(); },
  ]) {
    const changed = copyHistoryState(original); change(changed);
    assert.equal(sameHistoryState(original, changed), false);
  }
});

test('optional undefined fields and empty array slots keep the previous JSON snapshot semantics', () => {
  const live = { omitted: undefined, nested: { optional: undefined, keep: null }, slots: [undefined, , null, 'x'] };
  const expected = JSON.parse(JSON.stringify(live));
  assert.deepEqual(copyHistoryState(live), expected);
  assert.equal(sameHistoryState(live, expected), true);
  assert.equal(sameHistoryState(expected, live), true);
  assert.equal(sameHistoryState({ value: undefined }, {}), true);
  assert.equal(sameHistoryState({ value: null }, {}), false);
  assert.equal(sameHistoryState([undefined], []), false);
});

test('number normalization matches JSON history without changing valid values', () => {
  const live = { values: [0, -0, 1.25, NaN, Infinity, -Infinity] }, expected = JSON.parse(JSON.stringify(live));
  assert.deepEqual(copyHistoryState(live), expected);
  assert.equal(sameHistoryState(live, expected), true);
});

test('equality keeps object order and arrays distinct as the previous JSON comparison did', () => {
  assert.equal(sameHistoryState({ first: 1, second: 2 }, { second: 2, first: 1 }), false);
  assert.equal(sameHistoryState([], {}), false);
  assert.equal(sameHistoryState([1, 2], [2, 1]), false);
  assert.equal(sameHistoryState(null, {}), false);
  assert.equal(sameHistoryState(false, 0), false);
  assert.equal(sameHistoryState({ optional: undefined, first: 1 }, { first: 1 }), true);
});

test('JSON metadata with special own-property names is copied without altering prototypes', () => {
  const live = JSON.parse('{"__proto__":{"safe":true},"constructor":{"name":"metadata"}}');
  const copy = copyHistoryState(live);
  assert.deepEqual(copy, live);
  assert.equal(Object.getPrototypeOf(copy), Object.prototype);
  assert.equal(Object.hasOwn(copy, '__proto__'), true);
  assert.notEqual(copy.__proto__, live.__proto__);
  assert.equal(sameHistoryState(copy, live), true);
});
