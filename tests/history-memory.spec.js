import { test, expect } from '@playwright/test';
import { open, reset, settled, reloaded, picture } from './helpers.js';

async function photoFingerprint(page) {
  return page.evaluate(async () => {
    const image = cornhole.design.a.elements.find(el => el.type === 'image');
    const digest = async text => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))).map(byte => byte.toString(16).padStart(2, '0')).join('');
    return { src: await digest(image.src), orig: await digest(image.orig), px: image.px };
  });
}

test('repeated photo edits share picture data while retaining sixty undo states', async ({ page }) => {
  const errors = await open(page); await reset(page);
  await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1500;
    const context = canvas.getContext('2d'), pixels = context.createImageData(1500, 1500);
    let seed = 42;
    for (let i = 0; i < pixels.data.length; i += 4) {
      for (let channel = 0; channel < 3; channel++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        pixels.data[i + channel] = seed >>> 24;
      }
      pixels.data[i + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 1));
    const files = new DataTransfer(); files.items.add(new File([blob], 'family-photo.jpg', { type: 'image/jpeg' }));
    const input = document.getElementById('addimage'); input.files = files.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForFunction(() => cornhole.design.a.elements.some(el => el.type === 'image'));
  await settled(page);
  const fingerprint = await photoFingerprint(page);
  const cdp = await page.context().newCDPSession(page);
  const heap = async () => {
    await cdp.send('HeapProfiler.collectGarbage');
    return (await cdp.send('Runtime.getHeapUsage')).usedSize;
  };
  const before = await heap();
  await page.locator('#canvasA').focus();
  for (let n = 0; n < 60; n++) await page.keyboard.press(n % 2 ? 'ArrowLeft' : 'ArrowRight');
  await settled(page);
  const after = await heap(), growth = after - before;
  console.log('Photo history post-GC heap (bytes):', JSON.stringify({ before, after, growth }));
  // Allow ample browser variance while rejecting hundreds of MB of retained
  // copies of the same photograph. Canvas backing storage is not measured here.
  expect(growth, 'small position edits must not retain a new copy of every picture').toBeLessThan(32 * 1024 * 1024);
  expect(await photoFingerprint(page)).toEqual(fingerprint);
  const counts = await page.evaluate(() => {
    let undo = 0, redo = 0;
    while (!document.getElementById('undo').disabled && undo < 100) { cornhole.undo(); undo++; }
    while (!document.getElementById('redo').disabled && redo < 100) { cornhole.redo(); redo++; }
    return { undo, redo };
  });
  expect(counts).toEqual({ undo: 59, redo: 59 });
  expect(await photoFingerprint(page)).toEqual(fingerprint);
  await settled(page); await reloaded(page);
  expect(await photoFingerprint(page)).toEqual(fingerprint);
  expect(errors).toEqual([]);
});

test('restored history stays independent and unchanged commits keep redo available', async ({ page }) => {
  await open(page); await reset(page);
  const file = await picture(page, 64, 32, 'image/jpeg', 'g.fillStyle="#ff0000";g.fillRect(0,0,w,h);');
  await page.setInputFiles('#addimage', file);
  await page.waitForFunction(() => cornhole.design.a.elements.some(el => el.type === 'image'));
  await settled(page);
  const fingerprint = await photoFingerprint(page);
  await page.evaluate(() => {
    const text = cornhole.design.a.elements.find(el => el.type === 'text');
    text.fitReference = { text: 'HELLO', size: 4, spacing: 0, font: 'Anton' };
    cornhole.commit();
    cornhole.design.a.elements.find(el => el.type === 'image').x = 15;
    text.fitReference.size = 3;
    cornhole.commit();
    cornhole.undo();
    cornhole.commit();
  });
  await expect(page.locator('#redo')).toBeEnabled();
  expect(await page.evaluate(() => ({ x: cornhole.design.a.elements.find(el => el.type === 'image').x, size: cornhole.design.a.elements.find(el => el.type === 'text').fitReference.size }))).toEqual({ x: 12, size: 4 });
  // Mutate restored nested objects without committing, then traverse history.
  // These changes must never reach the immutable undo/redo entries.
  await page.evaluate(() => {
    cornhole.design.a.elements.find(el => el.type === 'image').px[0] = 999;
    cornhole.design.a.elements.find(el => el.type === 'text').fitReference.size = 9;
    cornhole.redo(); cornhole.undo();
  });
  expect(await photoFingerprint(page)).toEqual(fingerprint);
  expect(await page.evaluate(() => cornhole.design.a.elements.find(el => el.type === 'text').fitReference.size)).toBe(4);
  await page.evaluate(() => {
    cornhole.design.a.elements.find(el => el.type === 'image').x = 18;
    cornhole.commit();
  });
  await expect(page.locator('#redo')).toBeDisabled();
  await page.evaluate(() => { cornhole.undo(); cornhole.redo(); });
  expect(await photoFingerprint(page)).toEqual(fingerprint);
  expect(await page.evaluate(() => cornhole.design.a.elements.find(el => el.type === 'image').x)).toBe(18);
});
