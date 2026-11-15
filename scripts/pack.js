'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ROOT_DIR = path.resolve(__dirname, '..');
const EXT_DIR = path.join(ROOT_DIR, 'extension');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const PKG_PATH = path.join(ROOT_DIR, 'package.json');
const MANIFEST_PATH = path.join(EXT_DIR, 'manifest.json');

const IGNORED_NAMES = new Set(['.DS_Store', 'Thumbs.db', 'Desktop.ini']);

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

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function toDosDateTime(date) {
  const year = Math.max(1980, date.getUTCFullYear());
  const dosDate = ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate();
  const dosTime =
    (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | Math.floor(date.getUTCSeconds() / 2);
  return { dosDate, dosTime };
}

function collectFiles(dir, baseDir = dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORED_NAMES.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(fullPath, baseDir, out);
    } else if (entry.isFile()) {
      const relPosix = path.relative(baseDir, fullPath).split(path.sep).join('/');
      out.push({ fullPath, relPosix });
    }
  }
  return out;
}

function validateManifestAssets(manifest) {
  const requiredRelPaths = [];
  if (manifest.icons) {
    for (const iconPath of Object.values(manifest.icons)) {
      requiredRelPaths.push(iconPath);
    }
  }
  if (Array.isArray(manifest.content_scripts)) {
    for (const cs of manifest.content_scripts) {
      for (const jsPath of cs.js || []) requiredRelPaths.push(jsPath);
      for (const cssPath of cs.css || []) requiredRelPaths.push(cssPath);
    }
  }
  for (const rel of requiredRelPaths) {
    const abs = path.join(EXT_DIR, rel);
    if (!fs.existsSync(abs)) {
      throw new Error(`Missing extension asset referenced in manifest.json: ${rel}`);
    }
  }
}

function createZipBuffer(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const fixedTimestamp = new Date(Date.UTC(2026, 0, 1, 0, 0, 0));
  const { dosDate, dosTime } = toDosDateTime(fixedTimestamp);

  for (const file of files) {
    const nameBytes = Buffer.from(file.relPosix, 'utf8');
    const rawData = fs.readFileSync(file.fullPath);
    const deflated = zlib.deflateRawSync(rawData, { level: 9 });
    const useStore = deflated.length >= rawData.length;
    const payload = useStore ? rawData : deflated;
    const method = useStore ? 0 : 8;
    const crc = crc32(rawData);

    const localHeader = Buffer.alloc(30 + nameBytes.length);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4); // version needed: 2.0
    localHeader.writeUInt16LE(0x0800, 6); // UTF-8 filename flag
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(payload.length, 18);
    localHeader.writeUInt32LE(rawData.length, 22);
    localHeader.writeUInt16LE(nameBytes.length, 26);
    localHeader.writeUInt16LE(0, 28);
    nameBytes.copy(localHeader, 30);

    localParts.push(localHeader, payload);

    const centralHeader = Buffer.alloc(46 + nameBytes.length);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(0x0800, 8); // UTF-8 filename flag
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(payload.length, 20);
    centralHeader.writeUInt32LE(rawData.length, 24);
    centralHeader.writeUInt16LE(nameBytes.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    nameBytes.copy(centralHeader, 46);

    centralParts.push(centralHeader);
    offset += localHeader.length + payload.length;
  }

  const centralDirSize = centralParts.reduce((sum, b) => sum + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDirSize, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, eocd]);
}

function main() {
  const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));

  if (pkg.version !== manifest.version) {
    throw new Error(
      `Version mismatch: package.json (${pkg.version}) !== extension/manifest.json (${manifest.version})`
    );
  }

  validateManifestAssets(manifest);

  const files = collectFiles(EXT_DIR).sort((a, b) => a.relPosix.localeCompare(b.relPosix));
  const zipBuffer = createZipBuffer(files);

  fs.mkdirSync(DIST_DIR, { recursive: true });
  const outName = `${pkg.name}-v${manifest.version}.zip`;
  const outPath = path.join(DIST_DIR, outName);
  fs.writeFileSync(outPath, zipBuffer);

  const sizeKb = (zipBuffer.length / 1024).toFixed(1);
  console.log(`Packed ${files.length} files -> dist/${outName} (${sizeKb} KB)`);
}

main();
