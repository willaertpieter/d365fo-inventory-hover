// The exact set of files that makes up the extension, read from git.
//
// Shared by package.js (builds the store zip) and verify.js (checks an
// installed copy). The list is derived from manifest.json and the HTML pages it
// references, so it can't drift from what the browser actually loads.
const { execFileSync } = require('child_process');
const crypto = require('crypto');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function git(args, opts = {}) {
  return execFileSync('git', args, { cwd: ROOT, maxBuffer: 1 << 28, ...opts });
}

// Committed content at `ref`, byte-for-byte (independent of local line-ending
// settings or uncommitted edits).
function readAt(ref, file) {
  return git(['show', `${ref}:${file}`]);
}

function releaseFiles(ref) {
  const manifest = JSON.parse(readAt(ref, 'manifest.json').toString('utf8'));
  const files = new Set(['manifest.json']);
  const add = f => { if (f) files.add(f.replace(/^\.?\//, '')); };

  add(manifest.background && manifest.background.service_worker);
  for (const cs of manifest.content_scripts || []) [...(cs.js || []), ...(cs.css || [])].forEach(add);
  add(manifest.options_page);
  add(manifest.action && manifest.action.default_popup);
  Object.values(manifest.icons || {}).forEach(add);
  Object.values((manifest.action && manifest.action.default_icon) || {}).forEach(add);

  // Scripts, stylesheets and images the extension's own pages load.
  for (const page of [...files].filter(f => f.endsWith('.html'))) {
    const html = readAt(ref, page).toString('utf8');
    for (const m of html.matchAll(/<(?:script|img)[^>]*\ssrc="([^"]+)"|<link[^>]*\shref="([^"]+)"/g)) {
      const ref2 = m[1] || m[2];
      if (!/^[a-z]+:/i.test(ref2)) add(path.posix.join(path.posix.dirname(page), ref2));
    }
  }
  // The license ships in the package from the first version after 1.2.0, when
  // it stopped being MIT. Releases up to 1.2.0 shipped without it, so their
  // installed copies must still verify against their tags.
  if (compareVersions(manifest.version, '1.2.0') > 0) files.add('LICENSE');

  return { manifest, files: [...files].sort() };
}

// Compares dotted manifest versions ("1.10.0" > "1.9.2").
function compareVersions(a, b) {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');

module.exports = { ROOT, git, readAt, releaseFiles, sha256 };
