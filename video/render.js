// Renders the stage page to video frames with headless Microsoft Edge.
//
//   node render.js stills 12.5 48 60     -> BUILD_DIR/stills/*.png (review single frames)
//   node render.js video                 -> BUILD_DIR/video.mp4 (silent), plus sfx.json
//
// Frames are rendered in parallel: each worker renders a contiguous range into
// its own segment, and the segments are concatenated without re-encoding.
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn, execFileSync } = require('child_process');
const { chromium } = require('playwright-core');
const { PROJECT_DIR, BUILD_DIR, FPS, ffmpeg, ensureDir } = require('./lib');

// The stage is 1536x864 CSS px. 2560/1536 renders it at 2560x1440: YouTube
// gives 1440p uploads a higher-bitrate encode, which keeps small UI text sharp
// even for viewers watching at 1080p. SCALE=1.25 gives plain 1920x1080.
const SCALE = +(process.env.SCALE || 2560 / 1536);
const WORKERS = +(process.env.WORKERS || 4);

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml' };

function serve() {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const file = url.startsWith('/__build/')
      ? path.join(BUILD_DIR, url.slice('/__build/'.length))
      : path.join(PROJECT_DIR, url);
    const root = url.startsWith('/__build/') ? BUILD_DIR : PROJECT_DIR;
    if (!path.resolve(file).startsWith(path.resolve(root)) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end(); return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function openStage(browser, port) {
  const page = await browser.newPage({ viewport: { width: 1536, height: 864 }, deviceScaleFactor: SCALE });
  page.on('console', m => { if (m.type() === 'error') console.error('[page]', m.text()); });
  page.on('pageerror', e => console.error('[page error]', e.message));
  await page.goto(`http://127.0.0.1:${port}/video/stage/index.html`);
  await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 60000 });
  const err = await page.evaluate(() => window.__error);
  if (err) throw new Error('stage failed to initialise:\n' + err);
  // Wait for every image (icons, store screenshots) before the first frame.
  await page.evaluate(() => Promise.all([...document.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; }))));
  return page;
}

async function captureFrame(page, cdp, t) {
  await page.evaluate(tt => window.renderFrame(tt), t);
  // A raw CDP capture ignores the emulated device scale unless the clip asks
  // for it; with clip.scale the page is rasterized at full resolution.
  const { data } = await cdp.send('Page.captureScreenshot', {
    format: 'png', optimizeForSpeed: true, clip: { x: 0, y: 0, width: 1536, height: 864, scale: SCALE }
  });
  return Buffer.from(data, 'base64');
}

async function stills(times) {
  const server = await serve();
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await openStage(browser, server.address().port);
    const cdp = await page.context().newCDPSession(page);
    const out = ensureDir(path.join(BUILD_DIR, 'stills'));
    for (const t of times) {
      const file = path.join(out, `t_${t.toFixed(2).padStart(7, '0')}.png`);
      fs.writeFileSync(file, await captureFrame(page, cdp, t));
      console.log(file);
    }
  } finally {
    await browser.close();
    server.close();
  }
}

async function renderRange(port, f0, f1, outFile, onFrame) {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const enc = spawn(ffmpeg, ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', '-r', String(FPS), outFile], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((resolve, reject) => enc.on('close', c => (c === 0 ? resolve() : reject(new Error('ffmpeg exited ' + c)))));
  try {
    const page = await openStage(browser, port);
    const cdp = await page.context().newCDPSession(page);
    for (let f = f0; f < f1; f++) {
      const png = await captureFrame(page, cdp, f / FPS);
      if (!enc.stdin.write(png)) await new Promise(r => enc.stdin.once('drain', r));
      onFrame();
    }
  } finally {
    enc.stdin.end();
    await browser.close();
  }
  await done;
}

// Duration, chapters and the sound-effect cue list, read from the stage itself.
async function writeMeta(port) {
  const probe = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await openStage(probe, port);
    const meta = await page.evaluate(() => ({ total: window.__total, sfx: window.__sfx, chapters: window.__chapters }));
    fs.writeFileSync(path.join(BUILD_DIR, 'stage-meta.json'), JSON.stringify(meta, null, 1));
    return meta;
  } finally {
    await probe.close();
  }
}

async function metaOnly() {
  const server = await serve();
  try {
    const meta = await writeMeta(server.address().port);
    console.log(`meta: ${meta.total}s, ${meta.sfx.length} sound cues, ${meta.chapters.length} chapters`);
  } finally {
    server.close();
  }
}

async function video() {
  const server = await serve();
  const port = server.address().port;
  const meta = await writeMeta(port);

  const frames = Math.ceil(meta.total * FPS);
  const segDir = ensureDir(path.join(BUILD_DIR, 'segments'));
  const per = Math.ceil(frames / WORKERS);
  let doneFrames = 0;
  const started = Date.now();
  const tick = () => {
    doneFrames++;
    if (doneFrames % 150 === 0 || doneFrames === frames) {
      const el = (Date.now() - started) / 1000;
      console.log(`frames ${doneFrames}/${frames}  ${(doneFrames / el).toFixed(1)} fps  eta ${((frames - doneFrames) / (doneFrames / el) / 60).toFixed(1)} min`);
    }
  };
  const jobs = [];
  for (let w = 0; w < WORKERS; w++) {
    const f0 = w * per, f1 = Math.min(frames, f0 + per);
    if (f0 >= f1) break;
    jobs.push({ file: path.join(segDir, `seg${w}.mp4`), f0, f1 });
  }
  await Promise.all(jobs.map(j => renderRange(port, j.f0, j.f1, j.file, tick)));
  server.close();

  const list = path.join(segDir, 'list.txt');
  fs.writeFileSync(list, jobs.map(j => `file '${j.file.replace(/\\/g, '/')}'`).join('\n'));
  const out = path.join(BUILD_DIR, 'video.mp4');
  execFileSync(ffmpeg, ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', out]);
  console.log(`video: ${out} (${frames} frames, ${((Date.now() - started) / 60000).toFixed(1)} min)`);
}

const [mode, ...args] = process.argv.slice(2);
(mode === 'stills' ? stills(args.map(Number)) : mode === 'video' ? video() : mode === 'meta' ? metaOnly()
  : Promise.reject(new Error('usage: render.js stills <t...> | meta | video')))
  .catch(e => { console.error(e); process.exit(1); });
