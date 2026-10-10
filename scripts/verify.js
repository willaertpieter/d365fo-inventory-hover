// Checks that an installed copy of the extension is exactly the published source.
//
//   node scripts/verify.js <installed-folder> [git-ref]
//
// Microsoft Edge keeps installed extensions under
//   %LOCALAPPDATA%\Microsoft\Edge\User Data\<Profile>\Extensions\<extension-id>\<version>_0
// (Chrome: %LOCALAPPDATA%\Google\Chrome\User Data\<Profile>\Extensions\...).
// The extension id is shown on edge://extensions with Developer mode on.
//
// Every file must match the source byte-for-byte, except manifest.json, where
// the store adds its own fields (such as update_url); those are reported but
// allowed, and every field that came from the source must be unchanged. The
// _metadata folder is the store's signature data and is ignored.
const fs = require('fs');
const path = require('path');
const { readAt, releaseFiles, sha256 } = require('./release-files');

const STORE_ADDED_MANIFEST_KEYS = new Set(['update_url', 'key', 'differential_fingerprint']);

function listFiles(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => {
    const full = path.join(dir, d.name);
    return d.isDirectory() ? listFiles(full, base) : [path.relative(base, full).split(path.sep).join('/')];
  });
}

function main() {
  const [folder, ref = 'HEAD'] = process.argv.slice(2);
  if (!folder || !fs.existsSync(path.join(folder, 'manifest.json'))) {
    console.error('usage: node scripts/verify.js <installed-extension-folder> [git-ref]');
    process.exit(2);
  }
  const { files } = releaseFiles(ref);
  let problems = 0;

  for (const file of files) {
    const expected = readAt(ref, file);
    const installedPath = path.join(folder, file);
    if (!fs.existsSync(installedPath)) { console.log(`MISSING   ${file}`); problems++; continue; }
    const installed = fs.readFileSync(installedPath);

    if (file === 'manifest.json') {
      const want = JSON.parse(expected.toString('utf8'));
      const got = JSON.parse(installed.toString('utf8'));
      const added = Object.keys(got).filter(k => !(k in want));
      const unexpected = added.filter(k => !STORE_ADDED_MANIFEST_KEYS.has(k));
      for (const k of added) delete got[k];
      if (unexpected.length || JSON.stringify(got) !== JSON.stringify(want)) {
        console.log(`DIFFERENT manifest.json${unexpected.length ? ` (unexpected keys: ${unexpected.join(', ')})` : ''}`);
        problems++;
      } else {
        console.log(`OK        manifest.json${added.length ? ` (store-added: ${added.join(', ')})` : ''}`);
      }
      continue;
    }

    if (sha256(installed) === sha256(expected)) console.log(`OK        ${file}`);
    else { console.log(`DIFFERENT ${file}`); problems++; }
  }

  const extra = listFiles(folder).filter(f => !files.includes(f) && !f.startsWith('_metadata/'));
  for (const f of extra) { console.log(`EXTRA     ${f}`); problems++; }

  console.log(problems
    ? `\n${problems} difference(s): this installation does NOT match ${ref}.`
    : `\nThe installed extension matches ${ref} exactly.`);
  process.exit(problems ? 1 : 0);
}

main();
