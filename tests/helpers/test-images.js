'use strict';

const zlib = require('node:zlib');
const { PNG } = require('pngjs');

function createPatternPng(width, height) {
  const png = new PNG({ width, height, colorType: 6 });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      // Distinct per-column & per-row deterministic opaque colors + edge highlights
      let r = (x * 7 + y * 3) & 0xff;
      let g = (x * 13 + y * 11) & 0xff;
      let b = (x * 29 + y * 5) & 0xff;
      if (x === 0) {
        r = 255; g = 0; b = 0; // Left edge marker
      } else if (x === width - 1) {
        r = 0; g = 255; b = 0; // Right edge marker
      } else if (y === 0) {
        r = 0; g = 0; b = 255; // Top edge marker
      } else if (y === height - 1) {
        r = 255; g = 255; b = 0; // Bottom edge marker
      }
      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = 255;
    }
  }
  const buffer = PNG.sync.write(png);
  return {
    buffer,
    width,
    height,
    rgba: Uint8Array.from(png.data)
  };
}

function createSolidPng(width, height, rgba = [240, 240, 240, 255]) {
  const png = new PNG({ width, height, colorType: 6 });
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    png.data[idx] = rgba[0];
    png.data[idx + 1] = rgba[1];
    png.data[idx + 2] = rgba[2];
    png.data[idx + 3] = rgba[3];
  }
  return PNG.sync.write(png);
}

function reassembleAndVerifyPngSlices(sliceBuffers, expectedRgba, expectedWidth, expectedHeight) {
  const decodedSlices = sliceBuffers.map((buf) => PNG.sync.read(buf));
  const widths = decodedSlices.map((s) => s.width);
  const totalWidth = widths.reduce((sum, w) => sum + w, 0);

  if (totalWidth !== expectedWidth) {
    throw new Error(`Reassembled width ${totalWidth} !== expected ${expectedWidth}`);
  }

  const minW = Math.min(...widths);
  const maxW = Math.max(...widths);
  if (maxW - minW > 1) {
    throw new Error(`Slice width difference too large: min=${minW}, max=${maxW}, widths=${widths.join(',')}`);
  }

  for (let i = 0; i < decodedSlices.length; i++) {
    if (decodedSlices[i].height !== expectedHeight) {
      throw new Error(`Slice ${i + 1} height ${decodedSlices[i].height} !== expected ${expectedHeight}`);
    }
  }

  const reassembled = new Uint8Array(expectedWidth * expectedHeight * 4);
  let xOffset = 0;
  for (const slice of decodedSlices) {
    for (let y = 0; y < expectedHeight; y++) {
      const srcStart = y * slice.width * 4;
      const srcEnd = srcStart + slice.width * 4;
      const dstStart = (y * expectedWidth + xOffset) * 4;
      reassembled.set(slice.data.subarray(srcStart, srcEnd), dstStart);
    }
    xOffset += slice.width;
  }

  for (let i = 0; i < expectedRgba.length; i += 4) {
    if (
      reassembled[i] !== expectedRgba[i] ||
      reassembled[i + 1] !== expectedRgba[i + 1] ||
      reassembled[i + 2] !== expectedRgba[i + 2] ||
      reassembled[i + 3] !== expectedRgba[i + 3]
    ) {
      const px = (i / 4) % expectedWidth;
      const py = Math.floor(i / 4 / expectedWidth);
      throw new Error(
        `Pixel mismatch at (${px}, ${py}): got [${reassembled[i]},${reassembled[i + 1]},${reassembled[i + 2]},${reassembled[i + 3]}], expected [${expectedRgba[i]},${expectedRgba[i + 1]},${expectedRgba[i + 2]},${expectedRgba[i + 3]}]`
      );
    }
  }

  return { totalWidth, height: expectedHeight };
}

function injectExifOrientation(jpegBuffer, orientation = 6) {
  if (jpegBuffer[0] !== 0xff || jpegBuffer[1] !== 0xd8) {
    throw new Error('Not a JPEG buffer');
  }
  const exifApp1 = Buffer.from([
    0xff, 0xe1,
    0x00, 0x22, // Length = 34 bytes
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, // TIFF LE header -> IFD0 at 8
    0x01, 0x00, // 1 IFD entry
    0x12, 0x01, // Tag 0x0112 (Orientation)
    0x03, 0x00, // Type SHORT
    0x01, 0x00, 0x00, 0x00, // Count 1
    orientation & 0xff, 0x00, 0x00, 0x00, // Value
    0x00, 0x00, 0x00, 0x00 // Next IFD = 0
  ]);
  return Buffer.concat([jpegBuffer.subarray(0, 2), exifApp1, jpegBuffer.subarray(2)]);
}

function createAnimatedGifBuffer() {
  // Minimal valid 2x2 2-frame animated GIF89a
  return Buffer.from([
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, // GIF89a
    0x02, 0x00, 0x02, 0x00, // 2x2
    0x80, 0x00, 0x00, // GCT flag, 2 colors
    0xff, 0x00, 0x00, // color 0: red
    0x00, 0x00, 0xff, // color 1: blue
    // Frame 1 GCE
    0x21, 0xf9, 0x04, 0x04, 0x0a, 0x00, 0x00, 0x00,
    // Frame 1 Image Descriptor
    0x2c, 0x00, 0x00, 0x00, 0x00, 0x02, 0x00, 0x02, 0x00, 0x00,
    0x02, 0x02, 0x44, 0x01, 0x00,
    // Frame 2 GCE
    0x21, 0xf9, 0x04, 0x04, 0x0a, 0x00, 0x00, 0x00,
    // Frame 2 Image Descriptor
    0x2c, 0x00, 0x00, 0x00, 0x00, 0x02, 0x00, 0x02, 0x00, 0x00,
    0x02, 0x02, 0x4c, 0x01, 0x00,
    0x3b // Trailer
  ]);
}

function createSvgBuffer() {
  return Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="200"><rect width="800" height="200" fill="#1d9bf0"/></svg>',
    'utf8'
  );
}

function createCorruptPngBuffer() {
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00, 0xde, 0xad, 0xbe, 0xef]);
}

function createDeclaredHugePngBuffer(width, height) {
  // Valid PNG signature + IHDR declaring huge dimensions + minimal IEND
  const buf = Buffer.alloc(33 + 12);
  // Signature
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  // IHDR length = 13
  buf.writeUInt32BE(13, 8);
  buf.write('IHDR', 12, 'ascii');
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  buf[24] = 8; // bit depth
  buf[25] = 6; // RGBA
  buf[26] = 0;
  buf[27] = 0;
  buf[28] = 0;
  buf.writeUInt32BE(0, 29); // dummy CRC (header check inspects IHDR width/height)
  buf.writeUInt32BE(0, 33);
  buf.write('IEND', 37, 'ascii');
  buf.writeUInt32BE(0xae426082, 41);
  return buf;
}

function createSemiTransparentPng(width, height) {
  const png = new PNG({ width, height, colorType: 6 });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      if (x === 0 && y === 0) {
        png.data[idx] = 100;
        png.data[idx + 1] = 50;
        png.data[idx + 2] = 200;
        png.data[idx + 3] = 1;
      } else {
        png.data[idx] = (x * 17 + 20) & 0xff;
        png.data[idx + 1] = (y * 37 + 40) & 0xff;
        png.data[idx + 2] = ((x + y) * 19 + 60) & 0xff;
        png.data[idx + 3] = ((x + y) % 250) + 1;
      }
    }
  }
  return {
    buffer: PNG.sync.write(png),
    width,
    height,
    rgba: Uint8Array.from(png.data)
  };
}

function createZeroDimPngBuffer() {
  const buf = Buffer.alloc(33 + 12);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write('IHDR', 12, 'ascii');
  buf.writeUInt32BE(0, 16);
  buf.writeUInt32BE(100, 20);
  buf[24] = 8;
  buf[25] = 6;
  buf.writeUInt32BE(0, 29);
  buf.writeUInt32BE(0, 33);
  buf.write('IEND', 37, 'ascii');
  buf.writeUInt32BE(0xae426082, 41);
  return buf;
}

const CRC_TABLE_NODE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function makePngChunkNode(type, payload) {
  const out = Buffer.alloc(12 + payload.length);
  out.writeUInt32BE(payload.length, 0);
  out.write(type, 4, 'ascii');
  payload.copy(out, 8);
  let c = 0xffffffff;
  for (let i = 4; i < 8 + payload.length; i++) {
    c = CRC_TABLE_NODE[(c ^ out[i]) & 0xff] ^ (c >>> 8);
  }
  out.writeUInt32BE((c ^ 0xffffffff) >>> 0, 8 + payload.length);
  return out;
}

function createLongMetadataApngBuffer(paddingBytes = 320 * 1024) {
  // Base valid 16x8 PNG, insert a large tEXt chunk before acTL + fcTL + IDAT + fdAT
  const base = PNG.sync.read(createSolidPng(16, 8));
  const rawBase = PNG.sync.write(base);
  // Extract IHDR (bytes 8..33) and IDAT+IEND (from byte 33)
  const sig = rawBase.subarray(0, 8);
  const ihdr = rawBase.subarray(8, 33);
  const rest = rawBase.subarray(33);

  const textPayload = Buffer.alloc(paddingBytes, 0x41);
  Buffer.from('Comment\0', 'ascii').copy(textPayload, 0);
  const bigText = makePngChunkNode('tEXt', textPayload);

  const actlPayload = Buffer.alloc(8);
  actlPayload.writeUInt32BE(2, 0); // num_frames = 2
  actlPayload.writeUInt32BE(0, 4); // num_plays = 0
  const actl = makePngChunkNode('acTL', actlPayload);

  return Buffer.concat([sig, ihdr, bigText, actl, rest]);
}

function extractPngChunks(buffer) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(sig)) {
    throw new Error('Not a valid PNG buffer');
  }
  const chunks = [];
  let offset = 8;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const payload = buffer.subarray(offset + 8, offset + 8 + length);
    chunks.push({ type, data: Buffer.from(payload) });
    offset += 12 + length;
    if (type === 'IEND') break;
  }
  return chunks;
}

function createSemiTransparentGammaPng(width, height) {
  const { buffer, rgba } = createSemiTransparentPng(width, height);
  const sig = buffer.subarray(0, 8);
  const ihdr = buffer.subarray(8, 33);
  const rest = buffer.subarray(33);

  const srgbPayload = Buffer.from([0]); // Perceptual
  const gamaPayload = Buffer.alloc(4);
  gamaPayload.writeUInt32BE(45455, 0); // 0.45455
  const chrmValues = [31270, 32900, 64000, 33000, 30000, 60000, 15000, 6000];
  const chrmPayload = Buffer.alloc(32);
  chrmValues.forEach((v, idx) => chrmPayload.writeUInt32BE(v, idx * 4));

  const srgb = makePngChunkNode('sRGB', srgbPayload);
  const gama = makePngChunkNode('gAMA', gamaPayload);
  const chrm = makePngChunkNode('cHRM', chrmPayload);

  return {
    buffer: Buffer.concat([sig, ihdr, srgb, gama, chrm, rest]),
    width,
    height,
    rgba,
    expectedChunks: {
      sRGB: srgbPayload,
      gAMA: gamaPayload,
      cHRM: chrmPayload
    }
  };
}

function createStaticGifWithCommentBuffer(commentSize = 300 * 1024) {
  const header = Buffer.from([
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, // GIF89a
    0x08, 0x00, 0x08, 0x00, // 8x8
    0x80, 0x00, 0x00, // GCT 2 colors
    0xff, 0x00, 0x00, // red
    0x00, 0x00, 0xff  // blue
  ]);
  // Comment extension (0x21 0xFE) split into 255-byte sub-blocks
  const commentParts = [Buffer.from([0x21, 0xfe])];
  let rem = commentSize;
  while (rem > 0) {
    const len = Math.min(255, rem);
    const sub = Buffer.alloc(1 + len, 0x43);
    sub[0] = len;
    commentParts.push(sub);
    rem -= len;
  }
  commentParts.push(Buffer.from([0x00])); // block terminator

  // Single 8x8 frame using LZW min code size 2 (64 pixels of index 0)
  const frame = Buffer.from([
    0x2c, 0x00, 0x00, 0x00, 0x00, 0x08, 0x00, 0x08, 0x00, 0x00,
    0x02, // LZW min code size
    0x0b, // 11 bytes of LZW data
    0x84, 0x8f, 0xa9, 0xcb, 0xed, 0x0f, 0xa3, 0x9c, 0xb4, 0xda, 0x0b,
    0x00, // terminator
    0x3b  // trailer
  ]);
  return Buffer.concat([header, ...commentParts, frame]);
}

function createColorBandsPng(sliceWidth, height, count = 8, redChannel = 0) {
  const width = sliceWidth * count;
  const png = new PNG({ width, height, colorType: 6 });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const band = Math.min(count - 1, Math.floor(x / sliceWidth));
      const idx = (y * width + x) * 4;
      const green = count <= 9 ? band * 30 : Math.round((band * 247) / Math.max(1, count - 1));
      const blue = count <= 9 ? 0 : 247 - green;
      png.data[idx] = redChannel;
      png.data[idx + 1] = green;
      png.data[idx + 2] = blue;
      png.data[idx + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

function createMarginPosterPng(width = 1600, height = 600, marginCols = 1) {
  const sliceW = Math.floor(width / 20);
  const marginWidth = sliceW * marginCols;
  const png = new PNG({ width, height, colorType: 6 });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      if (x < marginWidth || x >= width - marginWidth) {
        png.data[idx] = 255;
        png.data[idx + 1] = 255;
        png.data[idx + 2] = 255;
        png.data[idx + 3] = 255;
      } else {
        const t = (x - marginWidth) / Math.max(1, width - 2 * marginWidth - 1);
        const v = y / Math.max(1, height - 1);
        png.data[idx] = Math.round(30 + 210 * t);
        png.data[idx + 1] = Math.round(220 - 180 * t);
        png.data[idx + 2] = Math.round(40 + 180 * v);
        png.data[idx + 3] = 255;
      }
    }
  }
  return PNG.sync.write(png);
}

function createSmoothLandscapeGradientPng(width = 1600, height = 900) {
  const png = new PNG({ width, height, colorType: 6 });
  for (let y = 0; y < height; y++) {
    const v = y / Math.max(1, height - 1);
    for (let x = 0; x < width; x++) {
      const t = x / Math.max(1, width - 1);
      const idx = (y * width + x) * 4;
      if (v < 0.55) {
        // Smooth sky gradient
        png.data[idx] = Math.round(80 + 70 * t);
        png.data[idx + 1] = Math.round(145 + 60 * v);
        png.data[idx + 2] = Math.round(235 - 40 * t);
      } else {
        // Smooth desert sand gradient
        png.data[idx] = Math.round(215 + 30 * t);
        png.data[idx + 1] = Math.round(175 - 35 * (v - 0.55) - 20 * t);
        png.data[idx + 2] = Math.round(110 + 25 * t);
      }
      png.data[idx + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

function createCroppedCollisionThreeSlicePng() {
  const width = 300;
  const height = 300;
  const png = new PNG({ width, height, colorType: 6 });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      let r = 0;
      let g = 255;
      let b = 0;
      if (x < 100) {
        if (y >= 100 && y < 200) {
          r = 255; g = 255; b = 255;
        } else {
          r = 255; g = 0; b = 0;
        }
      } else if (x < 200) {
        if (y >= 100 && y < 200) {
          r = 255; g = 255; b = 255;
        } else {
          r = 0; g = 0; b = 255;
        }
      }
      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

function encodePngFromRawScanlines(width, height, colorType, rawScanlines, deflateLevel = 1) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrPayload = Buffer.alloc(13);
  ihdrPayload.writeUInt32BE(width, 0);
  ihdrPayload.writeUInt32BE(height, 4);
  ihdrPayload[8] = 8; // bitDepth
  ihdrPayload[9] = colorType; // 2 = RGB, 6 = RGBA
  ihdrPayload[10] = 0;
  ihdrPayload[11] = 0;
  ihdrPayload[12] = 0;

  const ihdr = makePngChunkNode('IHDR', ihdrPayload);
  const compressed = zlib.deflateSync(rawScanlines, { level: deflateLevel });
  const idat = makePngChunkNode('IDAT', compressed);
  const iend = makePngChunkNode('IEND', Buffer.alloc(0));
  return Buffer.concat([sig, ihdr, idat, iend]);
}

function createFastFineLineRgbPng(width, height) {
  const stride = 1 + width * 3;
  const edgeW = Math.min(24, Math.max(2, Math.floor(width / 100)));
  const edgeH = Math.min(16, Math.max(2, Math.floor(height / 100)));

  const buildRow = (kind) => {
    const row = Buffer.alloc(stride);
    row[0] = 0;
    for (let x = 0; x < width; x++) {
      const p = 1 + x * 3;
      if (x < edgeW) {
        row[p] = 255; row[p + 1] = 0; row[p + 2] = 0; // Left edge marker: red
        continue;
      }
      if (x >= width - edgeW) {
        row[p] = 0; row[p + 1] = 255; row[p + 2] = 0; // Right edge marker: green
        continue;
      }
      if (kind === 'top') {
        row[p] = 0; row[p + 1] = 40; row[p + 2] = 255; // Top edge marker: blue
      } else if (kind === 'bottom') {
        row[p] = 255; row[p + 1] = 230; row[p + 2] = 0; // Bottom edge marker: yellow
      } else if (kind === 'bar') {
        const t = x / Math.max(1, width - 1);
        const ink = (x % 48 < 28 && x % 4 < 2) || x % 120 < 2;
        row[p] = ink ? 15 : Math.round(35 + 200 * t);
        row[p + 1] = ink ? 20 : Math.round(210 - 150 * t);
        row[p + 2] = ink ? 25 : 235;
      } else {
        const t = x / Math.max(1, width - 1);
        const fine = x % 64 < 2;
        row[p] = fine ? 20 : Math.round(245 - 60 * t);
        row[p + 1] = fine ? 20 : Math.round(235 + 15 * (1 - t));
        row[p + 2] = fine ? 20 : Math.round(210 + 40 * t);
      }
    }
    return row;
  };

  const topRow = buildRow('top');
  const bottomRow = buildRow('bottom');
  const barRow = buildRow('bar');
  const bgRow = buildRow('bg');

  const raw = Buffer.allocUnsafe(height * stride);
  for (let y = 0; y < height; y++) {
    let src = bgRow;
    if (y < edgeH) src = topRow;
    else if (y >= height - edgeH) src = bottomRow;
    else if (y % 40 < 12) src = barRow;
    src.copy(raw, y * stride);
  }
  return encodePngFromRawScanlines(width, height, 2, raw, 1);
}

function createFastTexturedRgbPng(width, height, blockSize = 1) {
  const stride = 1 + width * 3;
  const raw = Buffer.allocUnsafe(height * stride);
  let seed = 0x9e3779b9;
  for (let y = 0; y < height; y++) {
    const rowOff = y * stride;
    raw[rowOff] = 0;
    if (blockSize > 1 && y % blockSize !== 0) {
      raw.copy(raw, rowOff, (y - (y % blockSize)) * stride, (y - (y % blockSize)) * stride + stride);
      continue;
    }
    for (let x = 0; x < width; x += blockSize) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const r = seed & 0xff;
      const g = (seed >>> 8) & 0xff;
      const b = (seed >>> 16) & 0xff;
      const maxBx = Math.min(blockSize, width - x);
      for (let bx = 0; bx < maxBx; bx++) {
        const p = rowOff + 1 + (x + bx) * 3;
        raw[p] = r;
        raw[p + 1] = g;
        raw[p + 2] = b;
      }
    }
  }
  return encodePngFromRawScanlines(width, height, 2, raw, 1);
}

function createSemiTransparentNoisyPng(width, height, noisyRowsRatio = 0.55) {
  const stride = 1 + width * 4;
  const raw = Buffer.allocUnsafe(height * stride);
  const noisyLimitY = Math.floor(height * noisyRowsRatio);
  let seed = 0x517cc1b7;

  for (let y = 0; y < height; y++) {
    const rowOff = y * stride;
    raw[rowOff] = 0;
    if (y < noisyLimitY) {
      for (let x = 0; x < width; x++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const p = rowOff + 1 + x * 4;
        raw[p] = seed & 0xff;
        raw[p + 1] = (seed >>> 8) & 0xff;
        raw[p + 2] = (seed >>> 16) & 0xff;
        raw[p + 3] = 90 + ((seed >>> 24) % 140); // Semi-transparent [90..229]
      }
    } else {
      const bandAlpha = 120 + ((y * 3) % 120);
      for (let x = 0; x < width; x++) {
        const p = rowOff + 1 + x * 4;
        raw[p] = (x * 255) / Math.max(1, width - 1);
        raw[p + 1] = 160;
        raw[p + 2] = 220;
        raw[p + 3] = bandAlpha;
      }
    }
  }
  return encodePngFromRawScanlines(width, height, 6, raw, 1);
}

function createOs2BmpBuffer(width, height) {
  const rowBytes = Math.ceil((width * 24) / 32) * 4;
  const pixelBytes = rowBytes * height;
  const fileSize = 14 + 12 + pixelBytes;
  const buf = Buffer.alloc(fileSize);
  // BITMAPFILEHEADER (14 bytes)
  buf.write('BM', 0, 'ascii');
  buf.writeUInt32LE(fileSize, 2);
  buf.writeUInt32LE(26, 10); // pixel data offset
  // BITMAPCOREHEADER (12 bytes)
  buf.writeUInt32LE(12, 14);
  buf.writeUInt16LE(width, 18);
  buf.writeUInt16LE(height, 20);
  buf.writeUInt16LE(1, 22); // planes
  buf.writeUInt16LE(24, 24); // bpp
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = 26 + y * rowBytes + x * 3;
      buf[p] = 200; // B
      buf[p + 1] = 100; // G
      buf[p + 2] = 50; // R
    }
  }
  return buf;
}

function createRgbPngWithManyChunksBeforeTrns(width, height, chunkCount = 4100) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrPayload = Buffer.alloc(13);
  ihdrPayload.writeUInt32BE(width, 0);
  ihdrPayload.writeUInt32BE(height, 4);
  ihdrPayload[8] = 8;
  ihdrPayload[9] = 2; // RGB
  const ihdr = makePngChunkNode('IHDR', ihdrPayload);

  const chunks = [sig, ihdr];
  const textChunk = makePngChunkNode('tEXt', Buffer.from('k\0v', 'ascii'));
  for (let i = 0; i < chunkCount; i++) {
    chunks.push(textChunk);
  }
  // tRNS for RGB: transparent color = (0, 1, 2)
  const trnsPayload = Buffer.from([0, 0, 0, 1, 0, 2]);
  chunks.push(makePngChunkNode('tRNS', trnsPayload));

  const stride = 1 + width * 3;
  const topRow = Buffer.alloc(stride);
  topRow[0] = 0;
  for (let x = 0; x < width; x++) {
    const p = 1 + x * 3;
    topRow[p] = 0;
    topRow[p + 1] = 1;
    topRow[p + 2] = 2;
  }
  const bottomRow = Buffer.alloc(stride);
  bottomRow[0] = 0;
  for (let x = 0; x < width; x++) {
    const p = 1 + x * 3;
    bottomRow[p] = 240;
    bottomRow[p + 1] = 120;
    bottomRow[p + 2] = 60;
  }
  const raw = Buffer.allocUnsafe(height * stride);
  const splitY = Math.floor(height / 2);
  for (let y = 0; y < height; y++) {
    (y < splitY ? topRow : bottomRow).copy(raw, y * stride);
  }
  chunks.push(makePngChunkNode('IDAT', zlib.deflateSync(raw, { level: 1 })));
  chunks.push(makePngChunkNode('IEND', Buffer.alloc(0)));
  return Buffer.concat(chunks);
}

function parseLocalSamplePath(mdFilePath) {
  if (process.env.XSLICER_LOCAL_SAMPLE_PATH) {
    return process.env.XSLICER_LOCAL_SAMPLE_PATH.trim();
  }
  const content = require('node:fs').readFileSync(mdFilePath, 'utf8');
  const match = content.match(/\[[^\]]+\]\(<([^>]+)>\)/);
  if (!match || !match[1]) {
    throw new Error(`Could not locate local sample path in ${mdFilePath}`);
  }
  return match[1].trim();
}

module.exports = {
  createPatternPng,
  createSemiTransparentPng,
  createSemiTransparentGammaPng,
  extractPngChunks,
  createSolidPng,
  createColorBandsPng,
  createMarginPosterPng,
  createSmoothLandscapeGradientPng,
  createCroppedCollisionThreeSlicePng,
  reassembleAndVerifyPngSlices,
  injectExifOrientation,
  createAnimatedGifBuffer,
  createStaticGifWithCommentBuffer,
  createSvgBuffer,
  createCorruptPngBuffer,
  createDeclaredHugePngBuffer,
  createZeroDimPngBuffer,
  createLongMetadataApngBuffer,
  createFastFineLineRgbPng,
  createFastTexturedRgbPng,
  createSemiTransparentNoisyPng,
  createOs2BmpBuffer,
  createRgbPngWithManyChunksBeforeTrns,
  parseLocalSamplePath
};
