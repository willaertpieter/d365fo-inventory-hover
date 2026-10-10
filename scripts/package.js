// Builds the store upload from a git ref, reproducibly.
//
//   node scripts/package.js            # package HEAD
//   node scripts/package.js v1.1.1     # package a release tag
//
// Writes dist/d365fo-inventory-hover-<version>.zip and dist/SHA256SUMS.txt.
//
// The zip is deterministic: files come from git (not the working folder),
// in sorted order, uncompressed, with a fixed timestamp. Packaging the same tag
// on any machine gives the same bytes and the same checksum, so anyone can
// confirm that a published release is exactly the tagged source.
const fs = require('fs');
const path = require('path');
const { ROOT, git, readAt, releaseFiles, sha256 } = require('./release-files');

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Minimal ZIP writer: "stored" entries, fixed DOS date 1980-01-01 00:00.
function zip(entries) {
  const DOS_TIME = 0, DOS_DATE = (0 << 9) | (1 << 5) | 1;
  const local = [], central = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(0, 8);
    lh.writeUInt16LE(DOS_TIME, 10); lh.writeUInt16LE(DOS_DATE, 12); lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nameBuf.length, 26); lh.writeUInt16LE(0, 28);
    local.push(lh, nameBuf, data);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(0, 10);
    ch.writeUInt16LE(DOS_TIME, 12); ch.writeUInt16LE(DOS_DATE, 14); ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt32LE(offset, 42);
    central.push(ch, nameBuf);
    offset += lh.length + nameBuf.length + data.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, cd, end]);
}

function main() {
  const ref = process.argv[2] || 'HEAD';
  const commit = git(['rev-parse', '--verify', `${ref}^{commit}`]).toString().trim();
  const { manifest, files } = releaseFiles(ref);

  const missing = files.filter(f => { try { readAt(ref, f); return false; } catch (e) { return true; } });
  if (missing.length) throw new Error(`referenced but not committed at ${ref}: ${missing.join(', ')}`);

  // The package is built from git, so uncommitted edits are NOT in it. Say so.
  const dirty = git(['status', '--porcelain', '--', ...files]).toString().trim();
  if (ref === 'HEAD' && dirty) {
    console.warn(`warning: uncommitted changes are not included in the package:\n${dirty}\n`);
  }

  const entries = files.map(name => ({ name, data: readAt(ref, name) }));
  const zipName = `d365fo-inventory-hover-${manifest.version}.zip`;
  const zipBuf = zip(entries);

  const dist = path.join(ROOT, 'dist');
  fs.mkdirSync(dist, { recursive: true });
  fs.writeFileSync(path.join(dist, zipName), zipBuf);
  const sums = [
    `# ${manifest.name} ${manifest.version}`,
    `# built from commit ${commit} (${ref}) with scripts/package.js`,
    ...entries.map(e => `${sha256(e.data)}  ${e.name}`),
    `${sha256(zipBuf)}  ${zipName}`
  ].join('\n') + '\n';
  fs.writeFileSync(path.join(dist, 'SHA256SUMS.txt'), sums);

  console.log(sums);
  console.log(`wrote dist/${zipName} (${files.length} files, ${zipBuf.length} bytes) and dist/SHA256SUMS.txt`);
}

try { main(); } catch (e) { console.error(e.message); process.exit(1); }
