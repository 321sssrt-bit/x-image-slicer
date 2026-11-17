(() => {
  'use strict';

  const XSlicer = (globalThis.XSlicer = globalThis.XSlicer || {});

  const MIN_SLICE_COUNT = 2;
  const MAX_SLICE_COUNT = 20;
  const DEFAULT_SLICE_COUNT = 8;
  const MAX_INPUT_PIXELS = 500_000_000;
  const MAX_SLICE_LONG_EDGE = 4096;
  const MIN_OPTIMIZED_LONG_EDGE = 1024;
  const MAX_SLICE_BYTES = 4_500_000;
  const SCALE_DECAY_FACTOR = 0.85;
  const JPEG_QUALITY_TIERS = [0.9, 0.85, 0.8];
  const EXACT_PNG_MAX_PIXELS = 25_000_000;

  function parseSliceCountInput(rawValue) {
    const trimmed = String(rawValue ?? '').trim();
    if (trimmed.length === 0) {
      return {
        ok: false,
        reason: 'empty-slice-count',
        message: `切片数量不能为空：请输入 ${MIN_SLICE_COUNT}～${MAX_SLICE_COUNT} 之间的整数。`
      };
    }
    if (!/^-?\d+$/.test(trimmed)) {
      return {
        ok: false,
        reason: 'non-integer-slice-count',
        message: `切片数量无效（“${trimmed}”）：请输入 ${MIN_SLICE_COUNT}～${MAX_SLICE_COUNT} 之间的整数，不支持小数、科学计数法或非数字字符。`
      };
    }
    const parsed = Number(trimmed);
    if (!Number.isSafeInteger(parsed) || parsed < MIN_SLICE_COUNT || parsed > MAX_SLICE_COUNT) {
      return {
        ok: false,
        reason: 'out-of-range-slice-count',
        message: `切片数量超出范围（${trimmed}）：请输入 ${MIN_SLICE_COUNT}～${MAX_SLICE_COUNT} 之间的整数。`
      };
    }
    return { ok: true, value: parsed };
  }

  class ImageValidationError extends Error {
    constructor(code, message) {
      super(message);
      this.name = 'ImageValidationError';
      this.code = code;
    }
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1000 * 1000) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1_000_000).toFixed(2)} MB`;
  }

  function readAscii(bytes, start, length) {
    let out = '';
    const end = Math.min(bytes.length, start + length);
    for (let i = start; i < end; i++) {
      out += String.fromCharCode(bytes[i]);
    }
    return out;
  }

  function readUint16BE(bytes, offset) {
    return (bytes[offset] << 8) | bytes[offset + 1];
  }

  function readUint16LE(bytes, offset) {
    return bytes[offset] | (bytes[offset + 1] << 8);
  }

  function readUint32BE(bytes, offset) {
    return (
      ((bytes[offset] << 24) |
        (bytes[offset + 1] << 16) |
        (bytes[offset + 2] << 8) |
        bytes[offset + 3]) >>>
      0
    );
  }

  function readInt32LE(bytes, offset) {
    return (
      bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)
    );
  }

  // --- CRC32 & Pure PNG Scanline Slicing (exact unpremultiplied RGBA preservation) ---
  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
      c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function makePngChunk(type, payload) {
    const chunk = new Uint8Array(12 + payload.length);
    chunk[0] = (payload.length >>> 24) & 0xff;
    chunk[1] = (payload.length >>> 16) & 0xff;
    chunk[2] = (payload.length >>> 8) & 0xff;
    chunk[3] = payload.length & 0xff;
    for (let i = 0; i < 4; i++) {
      chunk[4 + i] = type.charCodeAt(i);
    }
    chunk.set(payload, 8);
    const crcVal = crc32(chunk.subarray(4, 8 + payload.length));
    const crcPos = 8 + payload.length;
    chunk[crcPos] = (crcVal >>> 24) & 0xff;
    chunk[crcPos + 1] = (crcVal >>> 16) & 0xff;
    chunk[crcPos + 2] = (crcVal >>> 8) & 0xff;
    chunk[crcPos + 3] = crcVal & 0xff;
    return chunk;
  }

  async function zlibInflate(compressedBytes) {
    const ds = new DecompressionStream('deflate');
    const stream = new Blob([compressedBytes]).stream().pipeThrough(ds);
    const buf = await new Response(stream).arrayBuffer();
    return new Uint8Array(buf);
  }

  async function zlibDeflate(rawBytes) {
    const cs = new CompressionStream('deflate');
    const stream = new Blob([rawBytes]).stream().pipeThrough(cs);
    const buf = await new Response(stream).arrayBuffer();
    return new Uint8Array(buf);
  }

  function paethPredictor(a, b, c) {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    if (pb <= pc) return b;
    return c;
  }

  function parseExifOrientation(exifBytes) {
    // exifBytes may start with "Exif\0\0" or directly TIFF header ("II" / "MM")
    let tiffStart = 0;
    if (
      exifBytes.length >= 6 &&
      exifBytes[0] === 0x45 &&
      exifBytes[1] === 0x78 &&
      exifBytes[2] === 0x69 &&
      exifBytes[3] === 0x66 &&
      exifBytes[4] === 0x00 &&
      exifBytes[5] === 0x00
    ) {
      tiffStart = 6;
    }
    if (tiffStart + 8 > exifBytes.length) return 1;
    const le = exifBytes[tiffStart] === 0x49 && exifBytes[tiffStart + 1] === 0x49;
    const be = exifBytes[tiffStart] === 0x4d && exifBytes[tiffStart + 1] === 0x4d;
    if (!le && !be) return 1;
    const u16 = (pos) => (le ? readUint16LE(exifBytes, pos) : readUint16BE(exifBytes, pos));
    const u32 = (pos) =>
      le
        ? (exifBytes[pos] |
            (exifBytes[pos + 1] << 8) |
            (exifBytes[pos + 2] << 16) |
            (exifBytes[pos + 3] << 24)) >>>
          0
        : readUint32BE(exifBytes, pos);
    const ifdOffset = u32(tiffStart + 4);
    const ifdPos = tiffStart + ifdOffset;
    if (ifdPos + 2 > exifBytes.length) return 1;
    const count = u16(ifdPos);
    for (let i = 0; i < count; i++) {
      const entry = ifdPos + 2 + i * 12;
      if (entry + 12 > exifBytes.length) break;
      const tag = u16(entry);
      if (tag === 0x0112) {
        return u16(entry + 8) || 1;
      }
    }
    return 1;
  }

  async function tryDecodeLosslessPngRgba(file) {
    if (
      typeof DecompressionStream === 'undefined' ||
      typeof CompressionStream === 'undefined' ||
      file.size > 40_000_000
    ) {
      return null;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length < 33) return null;

    let offset = 8;
    let width = 0;
    let height = 0;
    let bitDepth = 0;
    let colorType = 0;
    let interlace = 0;
    let palette = null;
    let trns = null;
    let orientation = 1;
    const ancillaryColorChunks = [];
    const idatChunks = [];
    let hasIend = false;

    while (offset + 12 <= bytes.length) {
      const length = readUint32BE(bytes, offset);
      const type = readAscii(bytes, offset + 4, 4);
      const payloadStart = offset + 8;
      const payloadEnd = payloadStart + length;
      if (payloadEnd + 4 > bytes.length) return null;
      const payload = bytes.subarray(payloadStart, payloadEnd);

      if (type === 'IHDR') {
        if (length !== 13) return null;
        width = readUint32BE(payload, 0);
        height = readUint32BE(payload, 4);
        bitDepth = payload[8];
        colorType = payload[9];
        const compression = payload[10];
        const filter = payload[11];
        interlace = payload[12];
        if (compression !== 0 || filter !== 0 || interlace !== 0 || bitDepth !== 8) {
          return null;
        }
        if (![0, 2, 3, 4, 6].includes(colorType)) return null;
      } else if (type === 'PLTE') {
        palette = payload;
      } else if (type === 'tRNS') {
        trns = payload;
      } else if (type === 'eXIf') {
        orientation = parseExifOrientation(payload);
        if (orientation !== 1) return null;
      } else if (type === 'sRGB' || type === 'gAMA' || type === 'cHRM' || type === 'iCCP') {
        ancillaryColorChunks.push(makePngChunk(type, payload));
      } else if (type === 'IDAT') {
        idatChunks.push(payload);
      } else if (type === 'IEND') {
        hasIend = true;
        break;
      }

      offset = payloadEnd + 4;
    }

    if (!hasIend || width <= 0 || height <= 0 || idatChunks.length === 0) return null;

    const bppByType = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
    const bpp = bppByType[colorType];
    const stride = width * bpp;

    let totalIdatLen = 0;
    for (const c of idatChunks) totalIdatLen += c.length;
    const compressed = new Uint8Array(totalIdatLen);
    let pos = 0;
    for (const c of idatChunks) {
      compressed.set(c, pos);
      pos += c.length;
    }

    let raw;
    try {
      raw = await zlibInflate(compressed);
    } catch {
      return null;
    }

    const expectedLen = height * (1 + stride);
    if (raw.length < expectedLen) return null;

    const unfiltered = new Uint8Array(height * stride);
    for (let y = 0; y < height; y++) {
      const rowStart = y * (1 + stride);
      const filterType = raw[rowStart];
      const outStart = y * stride;
      const prevStart = (y - 1) * stride;

      for (let i = 0; i < stride; i++) {
        const xVal = raw[rowStart + 1 + i];
        const a = i >= bpp ? unfiltered[outStart + i - bpp] : 0;
        const b = y > 0 ? unfiltered[prevStart + i] : 0;
        const c = y > 0 && i >= bpp ? unfiltered[prevStart + i - bpp] : 0;
        let val;
        if (filterType === 0) val = xVal;
        else if (filterType === 1) val = xVal + a;
        else if (filterType === 2) val = xVal + b;
        else if (filterType === 3) val = xVal + Math.floor((a + b) / 2);
        else if (filterType === 4) val = xVal + paethPredictor(a, b, c);
        else return null;
        unfiltered[outStart + i] = val & 0xff;
      }
    }

    const rgba = new Uint8Array(width * height * 4);
    if (colorType === 6) {
      rgba.set(unfiltered);
    } else if (colorType === 2) {
      const tr = trns && trns.length >= 6 ? readUint16BE(trns, 0) : -1;
      const tg = trns && trns.length >= 6 ? readUint16BE(trns, 2) : -1;
      const tb = trns && trns.length >= 6 ? readUint16BE(trns, 4) : -1;
      for (let i = 0, p = 0; i < width * height; i++, p += 3) {
        const r = unfiltered[p];
        const g = unfiltered[p + 1];
        const b = unfiltered[p + 2];
        const o = i * 4;
        rgba[o] = r;
        rgba[o + 1] = g;
        rgba[o + 2] = b;
        rgba[o + 3] = r === tr && g === tg && b === tb ? 0 : 255;
      }
    } else if (colorType === 0) {
      const tg = trns && trns.length >= 2 ? readUint16BE(trns, 0) : -1;
      for (let i = 0; i < width * height; i++) {
        const g = unfiltered[i];
        const o = i * 4;
        rgba[o] = g;
        rgba[o + 1] = g;
        rgba[o + 2] = g;
        rgba[o + 3] = g === tg ? 0 : 255;
      }
    } else if (colorType === 4) {
      for (let i = 0, p = 0; i < width * height; i++, p += 2) {
        const g = unfiltered[p];
        const a = unfiltered[p + 1];
        const o = i * 4;
        rgba[o] = g;
        rgba[o + 1] = g;
        rgba[o + 2] = g;
        rgba[o + 3] = a;
      }
    } else if (colorType === 3) {
      if (!palette) return null;
      for (let i = 0; i < width * height; i++) {
        const idx = unfiltered[i];
        const p = idx * 3;
        const o = i * 4;
        rgba[o] = palette[p] ?? 0;
        rgba[o + 1] = palette[p + 1] ?? 0;
        rgba[o + 2] = palette[p + 2] ?? 0;
        rgba[o + 3] = trns && idx < trns.length ? trns[idx] : 255;
      }
    }

    return { width, height, rgba, ancillaryColorChunks };
  }

  async function encodeRgbaRegionToPngBlob(rgba, srcWidth, region, ancillaryColorChunks = []) {
    const rowBytes = region.width * 4;
    const rawScanlines = new Uint8Array(region.height * (1 + rowBytes));
    for (let y = 0; y < region.height; y++) {
      const dstRow = y * (1 + rowBytes);
      rawScanlines[dstRow] = 0; // filter None
      const srcStart = (y * srcWidth + region.x) * 4;
      rawScanlines.set(rgba.subarray(srcStart, srcStart + rowBytes), dstRow + 1);
    }

    const compressed = await zlibDeflate(rawScanlines);

    const ihdr = new Uint8Array(13);
    ihdr[0] = (region.width >>> 24) & 0xff;
    ihdr[1] = (region.width >>> 16) & 0xff;
    ihdr[2] = (region.width >>> 8) & 0xff;
    ihdr[3] = region.width & 0xff;
    ihdr[4] = (region.height >>> 24) & 0xff;
    ihdr[5] = (region.height >>> 16) & 0xff;
    ihdr[6] = (region.height >>> 8) & 0xff;
    ihdr[7] = region.height & 0xff;
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // RGBA
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;

    const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const ihdrChunk = makePngChunk('IHDR', ihdr);
    const idatChunk = makePngChunk('IDAT', compressed);
    const iendChunk = makePngChunk('IEND', new Uint8Array(0));

    return new Blob([sig, ihdrChunk, ...ancillaryColorChunks, idatChunk, iendChunk], {
      type: 'image/png'
    });
  }

  async function computeVisualSignatureFromBlob(blob, sigCtx) {
    const bmp = await createImageBitmap(blob);
    try {
      sigCtx.clearRect(0, 0, 8, 8);
      sigCtx.imageSmoothingEnabled = true;
      sigCtx.drawImage(bmp, 0, 0, 8, 8);
      return Array.from(sigCtx.getImageData(0, 0, 8, 8).data);
    } finally {
      bmp.close();
    }
  }

  // --- Header & Streaming Animation/Dimension Inspection ---
  function looksLikeSvg(bytes, mimeType) {
    if (mimeType === 'image/svg+xml') return true;
    const sample = readAscii(bytes, 0, Math.min(bytes.length, 2048))
      .replace(/^\uFEFF/, '')
      .replace(/^\xEF\xBB\xBF/, '')
      .trimStart()
      .toLowerCase();
    if (sample.startsWith('<svg')) return true;
    if (sample.startsWith('<?xml') && sample.includes('<svg')) return true;
    if (sample.startsWith('<!doctype svg')) return true;
    return false;
  }

  async function scanPngChunksInFile(file) {
    const head = new Uint8Array(await file.slice(0, 33).arrayBuffer());
    if (head.length < 33) {
      throw new ImageValidationError('corrupt-image', 'PNG 文件头不完整或已损坏。');
    }
    if (readAscii(head, 12, 4) !== 'IHDR') {
      throw new ImageValidationError('corrupt-image', 'PNG 缺少 IHDR 头，文件可能已损坏。');
    }
    const width = readUint32BE(head, 16);
    const height = readUint32BE(head, 20);
    const colorType = head[25];

    let animated = false;
    let hasTrns = false;
    let reachedIdatOrIend = false;
    let offset = 8;
    let chunksSeen = 0;
    while (offset + 8 <= file.size && chunksSeen < 4096) {
      const chunkHeader = new Uint8Array(await file.slice(offset, offset + 8).arrayBuffer());
      if (chunkHeader.length < 8) break;
      const length = readUint32BE(chunkHeader, 0);
      const chunkType = readAscii(chunkHeader, 4, 4);
      chunksSeen++;
      if (chunkType === 'acTL') {
        animated = true;
        break;
      }
      if (chunkType === 'tRNS') {
        hasTrns = true;
      }
      if (chunkType === 'IDAT' || chunkType === 'IEND') {
        reachedIdatOrIend = true;
        break;
      }
      const next = offset + 12 + length;
      if (next <= offset || next > file.size) break;
      offset = next;
    }
    const pngHasAlphaChannel =
      colorType === 0 || colorType === 2 ? (hasTrns ? true : reachedIdatOrIend ? false : null) : true;
    return { format: 'png', mime: 'image/png', width, height, animated, pngHasAlphaChannel };
  }

  function parseJpegDimensions(bytes) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset++;
        continue;
      }
      while (offset < bytes.length && bytes[offset] === 0xff) offset++;
      if (offset >= bytes.length) break;
      const marker = bytes[offset];
      offset++;
      if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        continue;
      }
      if (marker === 0xda) {
        // Start of Scan: image dimensions SOF must precede SOS
        break;
      }
      if (offset + 2 > bytes.length) break;
      const segLen = readUint16BE(bytes, offset);
      if (segLen < 2) break;
      const isSof =
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf);
      if (isSof && offset + 7 <= bytes.length) {
        const height = readUint16BE(bytes, offset + 3);
        const width = readUint16BE(bytes, offset + 5);
        return { format: 'jpeg', mime: 'image/jpeg', width, height, animated: false };
      }
      offset += segLen;
    }
    return { format: 'jpeg', mime: 'image/jpeg', width: null, height: null, animated: false };
  }

  function parseWebpHeader(bytes) {
    if (bytes.length < 24) {
      throw new ImageValidationError('corrupt-image', 'WebP 文件头不完整或已损坏。');
    }
    let animated = false;
    let width = null;
    let height = null;
    let offset = 12;
    while (offset + 8 <= bytes.length) {
      const chunkId = readAscii(bytes, offset, 4);
      const chunkSize = readInt32LE(bytes, offset + 4) >>> 0;
      const payload = offset + 8;
      if (chunkId === 'VP8X' && payload + 10 <= bytes.length) {
        const flags = bytes[payload];
        if ((flags & 0x02) !== 0) animated = true;
        width = 1 + (bytes[payload + 4] | (bytes[payload + 5] << 8) | (bytes[payload + 6] << 16));
        height = 1 + (bytes[payload + 7] | (bytes[payload + 8] << 8) | (bytes[payload + 9] << 16));
      } else if (chunkId === 'ANIM') {
        animated = true;
      } else if (chunkId === 'VP8 ' && width === null && payload + 10 <= bytes.length) {
        if (bytes[payload + 3] === 0x9d && bytes[payload + 4] === 0x01 && bytes[payload + 5] === 0x2a) {
          width = readUint16LE(bytes, payload + 6) & 0x3fff;
          height = readUint16LE(bytes, payload + 8) & 0x3fff;
        }
      } else if (chunkId === 'VP8L' && width === null && payload + 5 <= bytes.length) {
        if (bytes[payload] === 0x2f) {
          const b0 = bytes[payload + 1];
          const b1 = bytes[payload + 2];
          const b2 = bytes[payload + 3];
          const b3 = bytes[payload + 4];
          width = 1 + (((b1 & 0x3f) << 8) | b0);
          height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
        }
      }
      const paddedSize = chunkSize + (chunkSize & 1);
      offset = payload + paddedSize;
    }
    return { format: 'webp', mime: 'image/webp', width, height, animated };
  }

  function countGifFrames(bytes) {
    if (bytes.length < 14) return 0;
    const packed = bytes[10];
    let offset = 13;
    if (packed & 0x80) {
      const gctSize = 3 * (1 << ((packed & 0x07) + 1));
      offset += gctSize;
    }
    let frames = 0;
    while (offset < bytes.length) {
      const introducer = bytes[offset++];
      if (introducer === 0x3b) break;
      if (introducer === 0x2c) {
        frames++;
        if (frames > 1) return frames;
        if (offset + 9 > bytes.length) break;
        const localPacked = bytes[offset + 8];
        offset += 9;
        if (localPacked & 0x80) {
          offset += 3 * (1 << ((localPacked & 0x07) + 1));
        }
        offset++;
        while (offset < bytes.length) {
          const subLen = bytes[offset++];
          if (subLen === 0) break;
          offset += subLen;
        }
      } else if (introducer === 0x21) {
        if (offset >= bytes.length) break;
        offset++;
        while (offset < bytes.length) {
          const subLen = bytes[offset++];
          if (subLen === 0) break;
          offset += subLen;
        }
      } else {
        break;
      }
    }
    return frames;
  }

  async function inspectMagicAndHeader(file, headBytes, mimeType) {
    if (looksLikeSvg(headBytes, mimeType)) {
      throw new ImageValidationError(
        'unsupported-vector',
        '不支持 SVG 矢量图，请选择单张静态位图（如 PNG、JPEG、WebP）。'
      );
    }

    if (headBytes.length < 8) {
      throw new ImageValidationError('corrupt-image', '文件过小或已损坏，无法作为静态位图读取。');
    }

    // PNG
    if (
      headBytes[0] === 0x89 &&
      headBytes[1] === 0x50 &&
      headBytes[2] === 0x4e &&
      headBytes[3] === 0x47 &&
      headBytes[4] === 0x0d &&
      headBytes[5] === 0x0a &&
      headBytes[6] === 0x1a &&
      headBytes[7] === 0x0a
    ) {
      return await scanPngChunksInFile(file);
    }

    // JPEG
    if (headBytes[0] === 0xff && headBytes[1] === 0xd8 && headBytes[2] === 0xff) {
      return parseJpegDimensions(headBytes);
    }

    // GIF
    const sig6 = readAscii(headBytes, 0, 6);
    if (sig6 === 'GIF87a' || sig6 === 'GIF89a') {
      if (headBytes.length < 13) {
        throw new ImageValidationError('corrupt-image', 'GIF 文件头不完整或已损坏。');
      }
      const width = readUint16LE(headBytes, 6);
      const height = readUint16LE(headBytes, 8);
      return { format: 'gif', mime: 'image/gif', width, height, animated: null };
    }

    // RIFF: WebP or AVI
    if (readAscii(headBytes, 0, 4) === 'RIFF' && headBytes.length >= 12) {
      const form = readAscii(headBytes, 8, 4);
      if (form === 'WEBP') return parseWebpHeader(headBytes);
      if (form === 'AVI ') {
        throw new ImageValidationError(
          'unsupported-video',
          '不支持视频文件（AVI），请选择单张静态位图。'
        );
      }
    }

    // BMP
    if (headBytes[0] === 0x42 && headBytes[1] === 0x4d && headBytes.length >= 22) {
      const dibHeaderSize = readInt32LE(headBytes, 14) >>> 0;
      let width = null;
      let height = null;
      if (dibHeaderSize === 12) {
        width = readUint16LE(headBytes, 18);
        height = readUint16LE(headBytes, 20);
      } else if (dibHeaderSize >= 16 && headBytes.length >= 26) {
        width = Math.abs(readInt32LE(headBytes, 18));
        height = Math.abs(readInt32LE(headBytes, 22));
      }
      return { format: 'bmp', mime: 'image/bmp', width, height, animated: false };
    }

    // WebM / Matroska
    if (
      headBytes[0] === 0x1a &&
      headBytes[1] === 0x45 &&
      headBytes[2] === 0xdf &&
      headBytes[3] === 0xa3
    ) {
      throw new ImageValidationError(
        'unsupported-video',
        '不支持视频文件（WebM），请选择单张静态位图。'
      );
    }

    // ISO BMFF (ftyp): MP4 / MOV / AVIF / AVIS / HEIC
    if (headBytes.length >= 12 && readAscii(headBytes, 4, 4) === 'ftyp') {
      const boxSize = Math.min(headBytes.length, readUint32BE(headBytes, 0) || 32);
      const brands = readAscii(headBytes, 8, Math.max(4, boxSize - 8));
      if (brands.includes('avis')) {
        throw new ImageValidationError(
          'unsupported-animated',
          '不支持动态图片（AVIF 动画），请选择单张静态位图。'
        );
      }
      if (brands.includes('avif')) {
        return { format: 'avif', mime: 'image/avif', width: null, height: null, animated: false };
      }
      if (
        brands.includes('heic') ||
        brands.includes('heix') ||
        brands.includes('hevc') ||
        brands.includes('hevx') ||
        brands.includes('mif1') ||
        brands.includes('msf1')
      ) {
        throw new ImageValidationError(
          'unsupported-format',
          '不支持 HEIC/HEIF 格式，请先转换为 PNG、JPEG 或 WebP 静态位图。'
        );
      }
      throw new ImageValidationError(
        'unsupported-video',
        '不支持视频或该容器格式，请选择单张静态位图（PNG、JPEG、WebP、BMP、静态 GIF、静态 AVIF）。'
      );
    }

    throw new ImageValidationError(
      'unsupported-format',
      '不支持的文件格式或文件已损坏，请选择单张静态位图（PNG、JPEG、WebP、BMP、静态 GIF、静态 AVIF）。'
    );
  }

  async function inspectWithStreamingImageDecoder(file, mime, signal = null) {
    if (typeof ImageDecoder === 'undefined' || !mime || signal?.aborted) return null;
    try {
      const supported = await ImageDecoder.isTypeSupported(mime);
      if (!supported || signal?.aborted) return null;
      const decoder = new ImageDecoder({ data: file.stream(), type: mime });
      const onAbort = () => {
        try {
          decoder.close();
        } catch {
          // ignore
        }
      };
      if (signal) {
        signal.addEventListener('abort', onAbort, { once: true });
      }
      try {
        await decoder.tracks.ready;
        if (signal?.aborted) return null;
        await decoder.completed;
        if (signal?.aborted) return null;
        const track = decoder.tracks.selectedTrack;
        if (!track) return null;
        return {
          animated: track.frameCount > 1,
          codedWidth: track.codedWidth,
          codedHeight: track.codedHeight
        };
      } finally {
        if (signal) {
          signal.removeEventListener('abort', onAbort);
        }
        try {
          decoder.close();
        } catch {
          // ignore
        }
      }
    } catch {
      return null;
    }
  }

  // 分割线 k (1..N-1) is the boundary between 等分 regions k-1 and k. Returns them sorted, or throws.
  function normalizeMergedDividers(sliceCount, mergedDividers) {
    const dividers = Array.from(new Set(mergedDividers || [])).sort((a, b) => a - b);
    for (const k of dividers) {
      if (!Number.isInteger(k) || k < 1 || k >= sliceCount) {
        throw new ImageValidationError('invalid-merge', `合并的分割线无效（${k}）：${sliceCount} 等分只有第 1～${sliceCount - 1} 条分割线。`);
      }
    }
    if (sliceCount - dividers.length < MIN_SLICE_COUNT) {
      throw new ImageValidationError('invalid-merge', `合并后至少保留 ${MIN_SLICE_COUNT} 张切片。`);
    }
    return dividers;
  }

  // Each region is the union of adjacent 等分 regions between two kept 分割线, so the group still covers the full width
  function computeSliceRegions(width, height, sliceCount, mergedDividers = []) {
    const merged = new Set(mergedDividers);
    const boundaries = [0];
    for (let k = 1; k < sliceCount; k++) {
      if (!merged.has(k)) boundaries.push(Math.floor((k * width) / sliceCount));
    }
    boundaries.push(width);
    const regions = [];
    for (let i = 0; i + 1 < boundaries.length; i++) {
      regions.push({
        index: i,
        x: boundaries[i],
        y: 0,
        width: boundaries[i + 1] - boundaries[i],
        height
      });
    }
    return regions;
  }

  function computeVisualSignatureFromCanvas(sigCtx, sourceCanvas) {
    sigCtx.clearRect(0, 0, 8, 8);
    sigCtx.imageSmoothingEnabled = true;
    sigCtx.drawImage(sourceCanvas, 0, 0, 8, 8);
    return Array.from(sigCtx.getImageData(0, 0, 8, 8).data);
  }

  function computeScaledDimensions(regions, srcHeight, scale, sliceCount) {
    if (scale === 1) {
      return {
        targetHeight: srcHeight,
        targetWidths: regions.map((r) => r.width)
      };
    }
    const targetHeight = Math.round(srcHeight * scale);
    const targetWidths = regions.map((r) => Math.round(r.width * scale));

    if (targetHeight <= 0) {
      throw new ImageValidationError(
        'zero-dimension',
        '按比例缩小后输出高度将变为 0 px，无法生成有效切片，请减少切片数量或更换原图。'
      );
    }
    for (let i = 0; i < targetWidths.length; i++) {
      if (targetWidths[i] <= 0) {
        throw new ImageValidationError(
          'zero-dimension',
          `当前切片数量（${sliceCount}）在缩放后会导致第 ${i + 1} 片宽度变为 0 px（原区域宽度 ${regions[i].width} px），请减少切片数量或更换原图。`
        );
      }
    }
    return { targetHeight, targetWidths };
  }

  function hasRgbaTransparency(rgba) {
    for (let i = 3; i < rgba.length; i += 4) {
      if (rgba[i] < 255) return true;
    }
    return false;
  }

  async function detectBitmapTransparency(bitmap, workCanvas, workCtx, checkCancelled) {
    const w = bitmap.width;
    const h = bitmap.height;
    const tileW = Math.min(w, 2048);
    const tileH = Math.min(h, 512);
    let tilesChecked = 0;

    for (let y = 0; y < h; y += tileH) {
      const ch = Math.min(tileH, h - y);
      for (let x = 0; x < w; x += tileW) {
        if (checkCancelled()) return null;
        const cw = Math.min(tileW, w - x);
        workCanvas.width = cw;
        workCanvas.height = ch;
        workCtx.clearRect(0, 0, cw, ch);
        workCtx.imageSmoothingEnabled = false;
        workCtx.drawImage(bitmap, x, y, cw, ch, 0, 0, cw, ch);
        const data = workCtx.getImageData(0, 0, cw, ch).data;
        for (let i = 3; i < data.length; i += 4) {
          if (data[i] < 255) {
            workCanvas.width = 0;
            workCanvas.height = 0;
            return true;
          }
        }
        tilesChecked++;
        if (tilesChecked % 8 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }
    }
    workCanvas.width = 0;
    workCanvas.height = 0;
    return false;
  }

  let processorQueueTail = Promise.resolve();
  let decodeSettledTail = Promise.resolve();

  function raceWithSignal(promise, signal) {
    if (!signal) return promise;
    if (signal.aborted) return Promise.resolve(null);
    return new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        signal.removeEventListener('abort', onAbort);
      };
      const onAbort = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(null);
      };
      signal.addEventListener('abort', onAbort, { once: true });
      promise.then(
        (value) => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(value);
        },
        (err) => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(err);
        }
      );
    });
  }

  async function waitDecodeSettled(signal = null) {
    while (true) {
      if (signal?.aborted) return false;
      const pending = decodeSettledTail;
      const settled = await raceWithSignal(
        pending.then(
          () => true,
          () => true
        ),
        signal
      );
      if (!settled || signal?.aborted) return false;
      if (decodeSettledTail === pending) return true;
    }
  }

  async function decodeBitmapAbortable(file, signal = null) {
    if (!(await waitDecodeSettled(signal))) return null;
    if (signal?.aborted) return null;

    const decodePromise = createImageBitmap(file, { imageOrientation: 'from-image' });
    if (!signal) {
      const settled = decodePromise.then(
        () => undefined,
        () => undefined
      );
      decodeSettledTail = decodeSettledTail.then(() => settled);
      try {
        return await decodePromise;
      } catch {
        throw new ImageValidationError(
          'corrupt-image',
          '图片文件已损坏或浏览器无法解码，请更换有效的静态位图。'
        );
      }
    }

    let abortedBeforeUse = false;
    let onAbort = null;
    const guardedDecode = decodePromise.then(
      (bmp) => {
        if ((abortedBeforeUse || signal.aborted) && bmp && typeof bmp.close === 'function') {
          try {
            bmp.close();
          } catch {
            // ignore
          }
          return null;
        }
        return bmp;
      },
      (err) => {
        if (abortedBeforeUse || signal.aborted) return null;
        throw err;
      }
    );
    const guardedSettled = guardedDecode.then(
      () => undefined,
      () => undefined
    );
    decodeSettledTail = decodeSettledTail.then(() => guardedSettled);

    try {
      const abortPromise = new Promise((resolve) => {
        onAbort = () => {
          abortedBeforeUse = true;
          resolve(null);
        };
        signal.addEventListener('abort', onAbort, { once: true });
      });
      return await Promise.race([guardedDecode, abortPromise]);
    } catch {
      if (signal.aborted) return null;
      throw new ImageValidationError(
        'corrupt-image',
        '图片文件已损坏或浏览器无法解码，请更换有效的静态位图。'
      );
    } finally {
      if (onAbort) {
        signal.removeEventListener('abort', onAbort);
      }
    }
  }

  function canvasToBlob(canvas, mimeType, quality, signal = null) {
    if (signal?.aborted) {
      return Promise.resolve(null);
    }
    return new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        if (signal && onAbort) {
          signal.removeEventListener('abort', onAbort);
        }
      };
      const onAbort = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(null);
      };
      if (signal) {
        signal.addEventListener('abort', onAbort, { once: true });
      }
      const callback = (result) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (signal?.aborted) {
          resolve(null);
          return;
        }
        if (result && result.size > 0) {
          resolve(result);
        } else {
          reject(new ImageValidationError('encode-failed', `切片编码失败（${mimeType}）。`));
        }
      };
      if (mimeType === 'image/jpeg') {
        canvas.toBlob(callback, mimeType, quality);
      } else {
        canvas.toBlob(callback, mimeType);
      }
    });
  }

  async function tryEncodeAttempt({
    bitmap,
    regions,
    targetWidths,
    targetHeight,
    scale,
    format,
    quality,
    round,
    workCanvas,
    workCtx,
    sigCtx,
    signal,
    checkCancelled,
    reportProgress
  }) {
    const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    const ext = format === 'jpeg' ? 'jpg' : 'png';
    const attemptSlices = [];
    let exceededInfo = null;

    for (let i = 0; i < regions.length; i++) {
      if (checkCancelled()) {
        attemptSlices.length = 0;
        workCanvas.width = 0;
        workCanvas.height = 0;
        return { status: 'cancelled' };
      }

      const region = regions[i];
      const outW = targetWidths[i];
      const outH = targetHeight;

      reportProgress({
        stage: 'encoding',
        round,
        scale,
        format,
        quality: quality ?? null,
        sliceIndex: i,
        totalSlices: regions.length
      });

      workCanvas.width = outW;
      workCanvas.height = outH;
      workCtx.clearRect(0, 0, outW, outH);
      workCtx.imageSmoothingEnabled = scale < 1;
      if (scale < 1) {
        workCtx.imageSmoothingQuality = 'high';
      }
      workCtx.drawImage(
        bitmap,
        region.x,
        region.y,
        region.width,
        region.height,
        0,
        0,
        outW,
        outH
      );

      const blob = await canvasToBlob(workCanvas, mimeType, quality, signal);
      if (!blob || checkCancelled()) {
        attemptSlices.length = 0;
        workCanvas.width = 0;
        workCanvas.height = 0;
        return { status: 'cancelled' };
      }

      if (blob.size > MAX_SLICE_BYTES) {
        exceededInfo = {
          sliceIndex: i,
          bytes: blob.size,
          width: outW,
          height: outH
        };
        attemptSlices.length = 0;
        workCanvas.width = 0;
        workCanvas.height = 0;
        return { status: 'budget-exceeded', exceededInfo };
      }

      const fileName = `slice-${String(region.index + 1).padStart(2, '0')}.${ext}`;
      const sliceFile = new File([blob], fileName, {
        type: mimeType,
        lastModified: Date.now()
      });
      const signature = computeVisualSignatureFromCanvas(sigCtx, workCanvas);

      attemptSlices.push({
        index: region.index,
        fileName,
        file: sliceFile,
        width: outW,
        height: outH,
        bytes: blob.size,
        format,
        mimeType,
        signature
      });
    }

    workCanvas.width = 0;
    workCanvas.height = 0;
    return { status: 'ok', slices: attemptSlices };
  }

  async function sliceImageFile(file, sliceCount = DEFAULT_SLICE_COUNT, options = {}) {
    const { isCancelled = () => false, signal = null } = options;
    const checkCancelled = () => Boolean(signal?.aborted || isCancelled());

    if (checkCancelled()) return null;

    if (!Number.isInteger(sliceCount) || sliceCount < MIN_SLICE_COUNT || sliceCount > MAX_SLICE_COUNT) {
      throw new ImageValidationError(
        'invalid-slice-count',
        `切片数量无效：请输入 ${MIN_SLICE_COUNT}～${MAX_SLICE_COUNT} 之间的整数。`
      );
    }

    if (!file || typeof file.slice !== 'function' || file.size <= 0) {
      throw new ImageValidationError('empty-file', '未读取到有效图片文件或文件为空。');
    }

    const mergedDividers = normalizeMergedDividers(sliceCount, options.mergedDividers);

    const prevTask = processorQueueTail;
    const queuedRun = prevTask
      .catch(() => {})
      .then(async () => {
        if (checkCancelled()) return null;
        const ready = await waitDecodeSettled(signal);
        if (!ready || checkCancelled()) return null;
        return sliceImageFileCore(file, sliceCount, { ...options, mergedDividers });
      });
    processorQueueTail = queuedRun.then(
      () => undefined,
      () => undefined
    );
    queuedRun.catch(() => {});
    return raceWithSignal(queuedRun, signal);
  }

  async function sliceImageFileCore(file, sliceCount = DEFAULT_SLICE_COUNT, options = {}) {
    const { isCancelled = () => false, signal = null, onProgress = null, mergedDividers = [] } = options;
    const checkCancelled = () => Boolean(signal?.aborted || isCancelled());
    const reportProgress = (info) => {
      if (typeof onProgress === 'function' && !checkCancelled()) {
        try {
          onProgress(info);
        } catch {
          // ignore progress listener errors
        }
      }
    };

    const headerChunk = await file.slice(0, Math.min(file.size, 262144)).arrayBuffer();
    if (checkCancelled()) return null;

    const headBytes = new Uint8Array(headerChunk);
    const headerInfo = await inspectMagicAndHeader(file, headBytes, file.type || '');
    if (checkCancelled()) return null;

    if (headerInfo.animated === true) {
      throw new ImageValidationError(
        'unsupported-animated',
        '不支持动态图片（APNG / 动态 WebP），请选择单张静态位图。'
      );
    }

    if (headerInfo.width !== null && headerInfo.height !== null) {
      if (headerInfo.width <= 0 || headerInfo.height <= 0) {
        throw new ImageValidationError('corrupt-image', '图片头声明尺寸无效，无法处理。');
      }
      if (headerInfo.width * headerInfo.height > MAX_INPUT_PIXELS) {
        throw new ImageValidationError(
          'pixel-limit-exceeded',
          `原图总像素（${headerInfo.width}×${headerInfo.height} = ${(
            headerInfo.width * headerInfo.height
          ).toLocaleString()}）超过 ${MAX_INPUT_PIXELS.toLocaleString()} 上限。`
        );
      }
    }

    // Streaming ImageDecoder pre-check (works across >32MB files, AVIF, large-metadata JPEGs, animated GIF/WebP/PNG)
    const streamMeta = await inspectWithStreamingImageDecoder(file, headerInfo.mime, signal);
    if (checkCancelled()) return null;

    if (streamMeta) {
      if (streamMeta.animated) {
        throw new ImageValidationError(
          'unsupported-animated',
          `不支持动态图片（${headerInfo.format.toUpperCase()} 动画），请选择单张静态位图。`
        );
      }
      if (streamMeta.codedWidth > 0 && streamMeta.codedHeight > 0) {
        if (streamMeta.codedWidth * streamMeta.codedHeight > MAX_INPUT_PIXELS) {
          throw new ImageValidationError(
            'pixel-limit-exceeded',
            `原图总像素（${streamMeta.codedWidth}×${streamMeta.codedHeight} = ${(
              streamMeta.codedWidth * streamMeta.codedHeight
            ).toLocaleString()}）超过 ${MAX_INPUT_PIXELS.toLocaleString()} 上限。`
          );
        }
      }
    } else if (headerInfo.format === 'gif') {
      // Fallback GIF block count if ImageDecoder unavailable
      if (file.size <= 32_000_000) {
        const fullBuf = new Uint8Array(await file.arrayBuffer());
        if (checkCancelled()) return null;
        const frames = countGifFrames(fullBuf);
        if (frames > 1) {
          throw new ImageValidationError('unsupported-animated', '不支持动态 GIF，请选择单张静态位图。');
        }
        if (frames === 0) {
          throw new ImageValidationError('corrupt-image', 'GIF 文件未包含有效图像帧或已损坏。');
        }
      }
    }

    reportProgress({ stage: 'decoding' });

    // Validate full decode with createImageBitmap (respecting EXIF orientation)
    let bitmap = await decodeBitmapAbortable(file, signal);
    if (!bitmap || checkCancelled()) {
      if (bitmap) {
        try {
          bitmap.close();
        } catch {
          // ignore
        }
      }
      return null;
    }

    const workCanvas = document.createElement('canvas');
    const sigCanvas = document.createElement('canvas');
    sigCanvas.width = 8;
    sigCanvas.height = 8;

    try {
      if (checkCancelled()) return null;

      const width = bitmap.width;
      const height = bitmap.height;

      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        throw new ImageValidationError('corrupt-image', '图片解码后尺寸无效，无法处理。');
      }

      const sourcePixels = width * height;
      if (sourcePixels > MAX_INPUT_PIXELS) {
        throw new ImageValidationError(
          'pixel-limit-exceeded',
          `原图总像素（${width}×${height} = ${sourcePixels.toLocaleString()}）超过 ${MAX_INPUT_PIXELS.toLocaleString()} 上限。`
        );
      }

      if (width < sliceCount) {
        throw new ImageValidationError(
          'width-too-small',
          `原图有效宽度为 ${width} 像素，小于 ${sliceCount} 像素，无法等分为 ${sliceCount} 张。`
        );
      }

      const regions = computeSliceRegions(width, height, sliceCount, mergedDividers);
      for (const region of regions) {
        if (region.width <= 0 || region.height <= 0) {
          throw new ImageValidationError('zero-dimension', '计算切片时出现零尺寸区域。');
        }
      }

      const sigCtx = sigCanvas.getContext('2d', { willReadFrequently: true });
      if (!sigCtx) {
        throw new ImageValidationError('canvas-unavailable', '浏览器无法创建图像处理画布。');
      }

      const maxSliceWidth = Math.max(...regions.map((r) => r.width));
      const lMax = Math.max(maxSliceWidth, height);
      const initialScale = lMax > MAX_SLICE_LONG_EDGE ? MAX_SLICE_LONG_EDGE / lMax : 1;
      const minScale = lMax > MIN_OPTIMIZED_LONG_EDGE ? MIN_OPTIMIZED_LONG_EDGE / lMax : 1;

      let knownTransparency =
        headerInfo.format === 'jpeg'
          ? false
          : headerInfo.format === 'png' && headerInfo.pngHasAlphaChannel === false
            ? false
            : null;

      // Exact unpremultiplied RGBA scanline slicing fast path ONLY for unscaled standard 8-bit PNGs
      if (
        initialScale === 1 &&
        headerInfo.format === 'png' &&
        sourcePixels <= EXACT_PNG_MAX_PIXELS
      ) {
        let exactPng = await tryDecodeLosslessPngRgba(file);
        if (checkCancelled()) return null;
        if (exactPng && (exactPng.width !== width || exactPng.height !== height)) {
          exactPng = null;
        }
        if (exactPng) {
          bitmap.close();
          bitmap = null;

          const exactSlices = [];
          let exactExceeded = false;
          for (let i = 0; i < regions.length; i++) {
            if (checkCancelled()) return null;
            const region = regions[i];
            reportProgress({
              stage: 'encoding',
              round: 1,
              scale: 1,
              format: 'png',
              quality: null,
              sliceIndex: i,
              totalSlices: regions.length
            });
            const blob = await encodeRgbaRegionToPngBlob(
              exactPng.rgba,
              exactPng.width,
              region,
              exactPng.ancillaryColorChunks
            );
            if (checkCancelled()) return null;
            if (blob.size > MAX_SLICE_BYTES) {
              exactExceeded = true;
              exactSlices.length = 0;
              break;
            }
            const fileName = `slice-${String(region.index + 1).padStart(2, '0')}.png`;
            const sliceFile = new File([blob], fileName, {
              type: 'image/png',
              lastModified: Date.now()
            });
            const signature = await computeVisualSignatureFromBlob(blob, sigCtx);
            if (checkCancelled()) return null;
            exactSlices.push({
              index: region.index,
              fileName,
              file: sliceFile,
              width: region.width,
              height: region.height,
              bytes: blob.size,
              format: 'png',
              mimeType: 'image/png',
              signature
            });
          }

          if (!exactExceeded) {
            return {
              sourceWidth: width,
              sourceHeight: height,
              sourcePixels,
              sliceCount,
              mergedDividers,
              format: 'png',
              mimeType: 'image/png',
              jpegQuality: null,
              lossy: false,
              scaled: false,
              scale: 1,
              hasTransparency: knownTransparency,
              slices: exactSlices
            };
          }

          if (knownTransparency === null) {
            knownTransparency = hasRgbaTransparency(exactPng.rgba);
          }
          exactPng = null;
          if (checkCancelled()) return null;
          bitmap = await decodeBitmapAbortable(file, signal);
          if (!bitmap || checkCancelled()) {
            if (bitmap) {
              try {
                bitmap.close();
              } catch {
                // ignore
              }
            }
            return null;
          }
        }
      }

      const workCtx = workCanvas.getContext('2d', { willReadFrequently: false });
      if (!workCtx) {
        throw new ImageValidationError('canvas-unavailable', '浏览器无法创建图像处理画布。');
      }

      let currentScale = initialScale;
      let round = 0;
      let lastExceededInfo = null;

      while (true) {
        if (checkCancelled()) return null;
        round++;

        const { targetHeight, targetWidths } = computeScaledDimensions(
          regions,
          height,
          currentScale,
          sliceCount
        );

        // Ensure long-edge invariant (<= 4096)
        const roundLongEdge = Math.max(targetHeight, ...targetWidths);
        if (roundLongEdge > MAX_SLICE_LONG_EDGE) {
          throw new ImageValidationError(
            'budget-exceeded',
            `优化后切片长边（${roundLongEdge} px）仍超过 4096 px 上限。`
          );
        }

        // 1. Always try PNG first at this scale
        const pngAttempt = await tryEncodeAttempt({
          bitmap,
          regions,
          targetWidths,
          targetHeight,
          scale: currentScale,
          format: 'png',
          quality: null,
          round,
          workCanvas,
          workCtx,
          sigCtx,
          signal,
          checkCancelled,
          reportProgress
        });

        if (pngAttempt.status === 'cancelled' || checkCancelled()) return null;
        if (pngAttempt.status === 'ok') {
          return {
            sourceWidth: width,
            sourceHeight: height,
            sourcePixels,
            sliceCount,
            mergedDividers,
            format: 'png',
            mimeType: 'image/png',
            jpegQuality: null,
            lossy: false,
            scaled: currentScale < 1,
            scale: currentScale,
            hasTransparency: knownTransparency,
            slices: pngAttempt.slices
          };
        }
        lastExceededInfo = pngAttempt.exceededInfo;

        // 2. PNG exceeded 4.5MB -> check transparency once (only when needed)
        if (knownTransparency === null) {
          reportProgress({ stage: 'analyzing' });
          knownTransparency = await detectBitmapTransparency(
            bitmap,
            workCanvas,
            workCtx,
            checkCancelled
          );
          if (knownTransparency === null || checkCancelled()) return null;
        }

        // 3. If strictly opaque, try JPEG 0.90 -> 0.85 -> 0.80 at this same scale
        if (!knownTransparency) {
          for (const quality of JPEG_QUALITY_TIERS) {
            if (checkCancelled()) return null;
            const jpegAttempt = await tryEncodeAttempt({
              bitmap,
              regions,
              targetWidths,
              targetHeight,
              scale: currentScale,
              format: 'jpeg',
              quality,
              round,
              workCanvas,
              workCtx,
              sigCtx,
              signal,
              checkCancelled,
              reportProgress
            });
            if (jpegAttempt.status === 'cancelled' || checkCancelled()) return null;
            if (jpegAttempt.status === 'ok') {
              return {
                sourceWidth: width,
                sourceHeight: height,
                sourcePixels,
                sliceCount,
                mergedDividers,
                format: 'jpeg',
                mimeType: 'image/jpeg',
                jpegQuality: quality,
                lossy: true,
                scaled: currentScale < 1,
                scale: currentScale,
                hasTransparency: false,
                slices: jpegAttempt.slices
              };
            }
            lastExceededInfo = jpegAttempt.exceededInfo;
          }
        }

        // 4. Still exceeds 4.5MB: check 1024px floor before scaling down by 0.85
        if (currentScale <= minScale + 1e-12) {
          const detail = lastExceededInfo
            ? `（第 ${lastExceededInfo.sliceIndex + 1} 片尺寸 ${lastExceededInfo.width}×${lastExceededInfo.height} px，体积仍为 ${formatBytes(lastExceededInfo.bytes)} / ${lastExceededInfo.bytes.toLocaleString()} 字节）`
            : '';
          const reasonHint = knownTransparency
            ? '图像含透明像素，已按规格保留 PNG 透明背景且到达清晰度下限'
            : '已尝试至允许的最低 JPEG 编码参数（0.80）与清晰度下限';
          const floorHint =
            lMax <= MIN_OPTIMIZED_LONG_EDGE
              ? '原切片长边已不超过 1024 px（不会继续缩小）'
              : '已到达最长切片长边 1024 px 下限';
          throw new ImageValidationError(
            'budget-exceeded',
            `无法在允许的体积与画质下限内满足每片 ≤ 4,500,000 字节预算${detail}：${reasonHint}，${floorHint}。已停止处理，请增加切片数量或更换原图。`
          );
        }

        let nextScale = currentScale * SCALE_DECAY_FACTOR;
        if (nextScale < minScale) {
          nextScale = minScale;
        }
        currentScale = nextScale;
      }
    } finally {
      if (bitmap) {
        try {
          bitmap.close();
        } catch {
          // ignore
        }
      }
      workCanvas.width = 0;
      workCanvas.height = 0;
      sigCanvas.width = 0;
      sigCanvas.height = 0;
    }
  }

  XSlicer.imageProcessor = {
    MIN_SLICE_COUNT,
    MAX_SLICE_COUNT,
    DEFAULT_SLICE_COUNT,
    parseSliceCountInput,
    formatBytes,
    sliceImageFile
  };
})();
