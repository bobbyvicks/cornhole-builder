const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

function resolutionChunk(pixelsPerMetre) {
  const chunk = new Uint8Array(21), view = new DataView(chunk.buffer);
  view.setUint32(0, 9);
  chunk.set([112, 72, 89, 115], 4); // pHYs
  view.setUint32(8, pixelsPerMetre); view.setUint32(12, pixelsPerMetre);
  chunk[16] = 1; // The PNG unit specifier for metres.
  let crc = 0xffffffff;
  for (const byte of chunk.subarray(4, 17)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  view.setUint32(17, (crc ^ 0xffffffff) >>> 0);
  return chunk;
}

// pHYs describes physical pixel size without re-encoding any image data.
// https://www.w3.org/TR/png-3/#11pHYs requires it before the first IDAT.
export async function pngWithResolution(blob, ppi) {
  const pixelsPerMetre = Math.round(ppi / 0.0254);
  if (!Number.isFinite(ppi) || ppi <= 0 || pixelsPerMetre < 1 || pixelsPerMetre > 0xffffffff) {
    throw new Error('The print resolution is invalid.');
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const invalid = () => { throw new Error('The browser generated an invalid PNG print file. Please try again.'); };
  if (bytes.length < 8 || PNG_SIGNATURE.some((byte, index) => bytes[index] !== byte)) invalid();
  const view = new DataView(bytes.buffer), parts = [bytes.subarray(0, 8)];
  let offset = 8, sawPixels = false, sawEnd = false;
  while (offset < bytes.length) {
    if (bytes.length - offset < 12) invalid();
    const length = view.getUint32(offset), end = offset + length + 12;
    if (end > bytes.length) invalid();
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (offset === 8 ? type !== 'IHDR' || length !== 13 : type === 'IHDR') invalid();
    if (type === 'pHYs') {
      if (length !== 9 || sawPixels || bytes[offset + 16] > 1) invalid();
    } else {
      parts.push(bytes.subarray(offset, end));
      if (type === 'IHDR') parts.push(resolutionChunk(pixelsPerMetre));
      if (type === 'IDAT') sawPixels = true;
      if (type === 'IEND') {
        if (length !== 0 || !sawPixels || end !== bytes.length) invalid();
        sawEnd = true;
      }
    }
    offset = end;
  }
  if (!sawEnd) invalid();
  return new Blob(parts, { type: 'image/png' });
}
