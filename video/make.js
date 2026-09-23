// Builds the finished YouTube package into OUTPUT_DIR:
//   D365FO-Inventory-Hover.mp4           video with narration, sound effects and music
//   D365FO-Inventory-Hover-no-music.mp4  same, narration and sound effects only
//   captions.srt                         English captions to upload to YouTube
//   thumbnail.png                        1280x720 custom thumbnail
//   youtube-description.txt              title, description and chapter list
//
// Usage: node make.js [steps...]   steps: tts video audio mux extras (default: all)
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const { BUILD_DIR, OUTPUT_DIR, VIDEO_DIR, ffmpeg, ensureDir, formatTimestamp } = require('./lib');

const STORE_LINK = process.env.STORE_LINK || '<add your Microsoft Edge Add-ons link here>';
const NAME = 'D365FO-Inventory-Hover';
const steps = process.argv.slice(2);
const want = s => steps.length === 0 || steps.includes(s);

function run(script, args = []) {
  const r = spawnSync(process.execPath, [path.join(VIDEO_DIR, script), ...args], { stdio: 'inherit', env: process.env });
  if (r.status !== 0) throw new Error(`${script} failed`);
}

// Two-pass EBU R128 normalisation to YouTube's -14 LUFS, then mux.
function mux(videoFile, wavFile, outFile, chaptersFile) {
  const probe = spawnSync(ffmpeg, ['-hide_banner', '-i', wavFile, '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = JSON.parse(probe.stderr.slice(probe.stderr.lastIndexOf('{')));
  const af = `loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
  execFileSync(ffmpeg, ['-y', '-v', 'error', '-i', videoFile, '-i', wavFile, '-i', chaptersFile,
    '-map', '0:v', '-map', '1:a', '-map_metadata', '2', '-map_chapters', '2',
    '-c:v', 'copy', '-af', af, '-c:a', 'aac', '-b:a', '256k', '-ar', '48000',
    '-metadata', 'title=D365FO Inventory Hover', '-movflags', '+faststart', '-shortest', outFile]);
  console.log(`wrote ${outFile}`);
}

function chapters(timeline) {
  const list = timeline.scenes.filter(s => s.chapter).map((s, i) => ({ t: i === 0 ? 0 : Math.floor(s.start + timeline.crossfade), title: s.chapter }));
  const ts = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  const meta = [';FFMETADATA1', 'title=D365FO Inventory Hover'];
  list.forEach((c, i) => {
    const end = i + 1 < list.length ? list[i + 1].t : Math.ceil(timeline.total);
    meta.push('[CHAPTER]', 'TIMEBASE=1/1000', `START=${c.t * 1000}`, `END=${end * 1000}`, `title=${c.title}`);
  });
  return { list, text: list.map(c => `${ts(c.t)} ${c.title}`).join('\n'), ffmeta: meta.join('\n') + '\n' };
}

// Captions: one or more cues per narration line, max two lines of ~42 chars.
function captions(timeline) {
  const cues = [];
  for (const line of Object.values(timeline.lines)) {
    const words = line.caption.split(/\s+/);
    const spoken = line.words.map(w => w.text.toLowerCase().replace(/[^a-z0-9]/g, ''));
    const exact = words.length === spoken.length && words.every((w, i) => w.toLowerCase().replace(/[^a-z0-9]/g, '') === spoken[i]);
    const timeOf = i => exact ? line.words[i].t : line.start + (words.slice(0, i).join(' ').length / line.caption.length) * line.dur;
    let chunk = [], startIdx = 0;
    const flush = endIdx => {
      if (!chunk.length) return;
      const text = chunk.join(' ');
      const start = timeOf(startIdx);
      const end = endIdx < words.length ? timeOf(endIdx) : line.end;
      // wrap into two balanced lines
      let wrapped = text;
      if (text.length > 42) {
        let best = 0, bestDiff = Infinity;
        for (let i = 1; i < chunk.length; i++) {
          const a = chunk.slice(0, i).join(' ').length, diff = Math.abs(a - (text.length - a));
          if (diff < bestDiff) { bestDiff = diff; best = i; }
        }
        wrapped = chunk.slice(0, best).join(' ') + '\n' + chunk.slice(best).join(' ');
      }
      cues.push({ start, end: Math.max(end, start + 0.8), text: wrapped });
    };
    // Split into cues of at most 84 characters, as evenly as possible, preferring
    // breaks after sentence ends and commas (dynamic programming over break points).
    const len = (a, b) => words.slice(a, b).join(' ').length;
    const nCues = Math.max(1, Math.ceil(line.caption.length / 84));
    const target = line.caption.length / nCues;
    const cost = new Array(words.length + 1).fill(Infinity), prev = new Array(words.length + 1).fill(0);
    cost[0] = 0;
    for (let b = 1; b <= words.length; b++) {
      for (let a = 0; a < b; a++) {
        const l = len(a, b);
        if (l > 84 || cost[a] === Infinity) continue;
        const end = words[b - 1];
        const bonus = b === words.length ? 0 : /[.?!]$/.test(end) ? -400 : /[,:;]$/.test(end) ? -150 : 0;
        const c = cost[a] + Math.pow(l - target, 2) + bonus + 200;
        if (c < cost[b]) { cost[b] = c; prev[b] = a; }
      }
    }
    const breaks = [];
    for (let b = words.length; b > 0; b = prev[b]) breaks.unshift([prev[b], b]);
    for (const [a, b] of breaks) { chunk = words.slice(a, b); startIdx = a; flush(b); }
  }
  cues.sort((a, b) => a.start - b.start);
  for (let i = 0; i < cues.length - 1; i++) cues[i].end = Math.min(cues[i].end + 0.25, cues[i + 1].start - 0.02);
  return cues.map((c, i) => `${i + 1}\n${formatTimestamp(c.start)} --> ${formatTimestamp(c.end)}\n${c.text}\n`).join('\n');
}

function description(chapterText) {
  return `TITLE
D365 F&O Inventory Hover: see stock by hovering any item number (free Edge extension)

DESCRIPTION
Stop leaving the page to check stock in Dynamics 365 Finance & Operations. Hold Alt, hover over any item number, and D365FO Inventory Hover shows live on-hand inventory per warehouse (physical, available, reserved, ordered and on order) plus the product details you choose. Right where you are working: sales order lines, formula and BOM lines, loads, and every other page that shows item numbers.

✅ Free, and it always will be
🔒 Privacy-safe: it talks only to your own D365 environment, using the sign-in you already have. No tracking, no analytics, no external servers.
⚙️ No setup: recognizes Microsoft-hosted F&O environments (production, sandbox, cloud-hosted dev) in every region Microsoft publishes; any other address can be enabled with one click

👉 Get it on Microsoft Edge Add-ons: ${STORE_LINK}

CHAPTERS
${chapterText}

IN THIS VIDEO
• Stock per warehouse, color-coded, on any page with item numbers
• Product details from ReleasedProductsV2, including your own extension fields
• Items without stock still show their product details
• Lookups follow the legal entity in your page address; optional cross-company mode
• Configuration, color, size, style and version columns that only appear when the item uses them
• The toolbar popup: refresh, cross-company switch, query statistics and a local audit log
• Tooltip settings: pick, reorder and relabel fields, one or two columns, share your setup with your team
• Light on your environment: queries only while you hold Alt, 5-minute cache, max 30 lookups a minute

All data in this video is fictional (a Contoso demo environment with made-up customers and products).

TAGS
Dynamics 365, D365FO, D365 F&O, Finance and Operations, Supply Chain Management, inventory, on-hand inventory, Microsoft Edge extension, browser extension, productivity
`;
}

async function thumbnail() {
  const { chromium } = require('playwright-core');
  const http = require('http');
  const { PROJECT_DIR } = require('./lib');
  const server = http.createServer((req, res) => {
    const file = path.join(PROJECT_DIR, decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(PROJECT_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png' }[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    await page.goto(`http://127.0.0.1:${server.address().port}/video/stage/thumbnail.html`);
    await page.waitForFunction(() => window.__ready);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'thumbnail.png') });
  } finally {
    await browser.close();
    server.close();
  }
}

async function main() {
  ensureDir(BUILD_DIR);
  ensureDir(OUTPUT_DIR);
  if (want('tts')) run('tts.js');
  if (want('video')) run('render.js', ['video']);
  else if (want('audio')) run('render.js', ['meta']);
  if (want('audio')) run('audio.js');

  const timeline = JSON.parse(fs.readFileSync(path.join(BUILD_DIR, 'timeline.json'), 'utf8'));
  const ch = chapters(timeline);
  const chFile = path.join(BUILD_DIR, 'chapters.txt');
  fs.writeFileSync(chFile, ch.ffmeta);

  if (want('mux')) {
    const video = path.join(BUILD_DIR, 'video.mp4');
    mux(video, path.join(BUILD_DIR, 'mix.wav'), path.join(OUTPUT_DIR, `${NAME}.mp4`), chFile);
    mux(video, path.join(BUILD_DIR, 'mix-nomusic.wav'), path.join(OUTPUT_DIR, `${NAME}-no-music.mp4`), chFile);
  }
  if (want('extras')) {
    fs.writeFileSync(path.join(OUTPUT_DIR, 'captions.srt'), captions(timeline));
    fs.writeFileSync(path.join(OUTPUT_DIR, 'youtube-description.txt'), description(ch.text));
    await thumbnail();
    console.log(`wrote captions.srt, youtube-description.txt, thumbnail.png to ${OUTPUT_DIR}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
