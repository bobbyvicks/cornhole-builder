import test from 'node:test';
import assert from 'node:assert/strict';
import { pngWithResolution } from '../lib/png-resolution.mjs';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGM4IaD3HwAEsAIGhDB3/gAAAABJRU5ErkJggg==', 'base64');
// Independently calculated PNG pHYs chunks, including the CRC over type+data.
const PHYS_100 = Buffer.from('000000097048597300000f6100000f6101a83fa769', 'hex');
const PHYS_300 = Buffer.from('000000097048597300002e2300002e230178a53f76', 'hex');
const insert = chunk => Buffer.concat([PNG.subarray(0, 33), chunk, PNG.subarray(33)]);
const encoded = async (bytes, ppi = 100) => Buffer.from(await (await pngWithResolution(new Blob([bytes], { type: 'image/png' }), ppi)).arrayBuffer());

test('print resolution adds the exact 100ppi PNG chunk and CRC without changing image chunks', async () => {
  const blob = await pngWithResolution(new Blob([PNG], { type: 'image/png' }), 100);
  assert.equal(blob.type, 'image/png');
  assert.deepEqual(Buffer.from(await blob.arrayBuffer()), insert(PHYS_100));
  assert.equal(PHYS_100.readUInt32BE(8), 3937);
  assert.equal(PHYS_100.readUInt32BE(12), 3937);
  assert.equal(PHYS_100[16], 1);
});

test('an existing resolution is replaced rather than duplicated and repeated preparation is stable', async () => {
  const first = await encoded(insert(PHYS_300));
  assert.deepEqual(first, insert(PHYS_100));
  assert.deepEqual(await encoded(first), first);
});

test('resolution conversion supports another valid density without changing pixel dimensions', async () => {
  assert.deepEqual(await encoded(PNG, 300), insert(PHYS_300));
});

test('invalid or unrepresentable print resolutions fail rather than writing misleading dimensions', async () => {
  for (const ppi of [0, -1, NaN, Infinity, 1e20, 0.00001]) {
    await assert.rejects(() => encoded(PNG, ppi), /resolution/i);
  }
});

test('invalid signatures and truncated PNG chunks fail without returning a print file', async () => {
  const badSignature = Buffer.from(PNG); badSignature[0] = 0;
  for (const bytes of [Buffer.alloc(0), badSignature, PNG.subarray(0, -1), PNG.subarray(0, -12)]) {
    await assert.rejects(() => encoded(bytes), /PNG/i);
  }
});

test('malformed PNG chunk order and resolution data fail safely', async () => {
  const missingPixels = Buffer.concat([PNG.subarray(0, 33), PNG.subarray(-12)]);
  const shortResolution = Buffer.from(PHYS_300); shortResolution.writeUInt32BE(8, 0);
  const duplicateHeader = insert(PNG.subarray(8, 33));
  for (const bytes of [missingPixels, insert(shortResolution), duplicateHeader]) {
    await assert.rejects(() => encoded(bytes), /PNG/i);
  }
});
