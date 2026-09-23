// Synthesizes every narration line and lays out the timeline.
//
// Output: BUILD_DIR/timeline.json - scene and line start times, per-word timings
// and resolved {marker} times. The stage page, the audio mix and the caption
// file are all driven from it, so picture, voice and captions stay in sync.
//
// Audio is cached per line by a hash of voice + text: editing one line only
// re-synthesizes that line.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
const { BUILD_DIR, CROSSFADE, SAMPLE_RATE, ensureDir, decodeAudio } = require('./lib');
const script = require('./script');

const MARKER = /\{([a-z0-9_]+)\}/gi;
const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// Marker positions as offsets into the normalized (alphanumerics only) text,
// which lines up with the TTS word boundaries however either side tokenizes.
function parseMarkers(say) {
  const markers = {};
  let plain = '', normLen = 0, last = 0, m;
  MARKER.lastIndex = 0;
  while ((m = MARKER.exec(say))) {
    const chunk = say.slice(last, m.index);
    plain += chunk; normLen += norm(chunk).length;
    markers[m[1]] = normLen;
    last = m.index + m[0].length;
  }
  plain += say.slice(last);
  return { plain: plain.replace(/\s+/g, ' ').trim(), markers };
}

async function synthesize(text, voice, outDir) {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3, { wordBoundaryEnabled: true });
  // The text is embedded in an SSML document, so it must be XML-escaped.
  const ssmlSafe = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  try {
    return await tts.toFile(outDir, ssmlSafe);
  } finally {
    tts.close();
  }
}

async function main() {
  const audioDir = ensureDir(path.join(BUILD_DIR, 'audio'));
  const lines = {};
  const scenes = [];
  let t = 0;

  for (const [si, scene] of script.scenes.entries()) {
    const sceneStart = si === 0 ? 0 : t - CROSSFADE;
    let cursor = sceneStart + (si === 0 ? 0 : CROSSFADE) + (scene.lead || 0);
    const sceneLines = [];

    for (const line of scene.lines) {
      const { plain, markers } = parseMarkers(line.say);
      const hash = crypto.createHash('sha1').update(script.voice + '|' + plain).digest('hex').slice(0, 12);
      const dir = path.join(audioDir, `${line.id}-${hash}`);
      const mp3 = path.join(dir, 'audio.mp3');
      if (!fs.existsSync(mp3)) {
        ensureDir(dir);
        let lastErr;
        for (let attempt = 0; attempt < 4; attempt++) {
          try { await synthesize(plain, script.voice, dir); lastErr = null; break; }
          catch (e) { lastErr = e; await new Promise(r => setTimeout(r, 1500 * (attempt + 1))); }
        }
        if (lastErr) throw lastErr;
        console.log(`synthesized ${line.id}`);
      }
      const meta = JSON.parse(fs.readFileSync(path.join(dir, 'metadata.json'), 'utf8'));
      const words = meta.Metadata.filter(x => x.Type === 'WordBoundary').map(x => ({
        t: x.Data.Offset / 1e7, d: x.Data.Duration / 1e7, text: x.Data.text.Text
      }));
      const pcm = decodeAudio(mp3);
      const dur = pcm.length / SAMPLE_RATE;

      // Resolve markers against the word boundaries' normalized text offsets.
      let off = 0;
      const wordOffsets = words.map(w => { const o = off; off += norm(w.text).length; return o; });
      const markerTimes = {};
      for (const [name, pos] of Object.entries(markers)) {
        let idx = wordOffsets.findIndex(o => o >= pos);
        if (idx < 0) idx = words.length - 1;
        markerTimes[name] = +(cursor + (line.pre || 0) + words[idx].t).toFixed(3);
      }

      const start = cursor + (line.pre || 0);
      const entry = {
        id: line.id, scene: scene.id, start: +start.toFixed(3), dur: +dur.toFixed(3), end: +(start + dur).toFixed(3),
        audio: path.relative(BUILD_DIR, mp3).replace(/\\/g, '/'),
        caption: line.cap || plain,
        words: words.map(w => ({ t: +(start + w.t).toFixed(3), d: +w.d.toFixed(3), text: w.text })),
        markers: markerTimes
      };
      lines[line.id] = entry;
      sceneLines.push(line.id);
      cursor = start + dur + (line.gap ?? script.gap);
    }

    const end = cursor - (scene.lines.length ? (scene.lines[scene.lines.length - 1].gap ?? script.gap) : 0) + (scene.tail || 0);
    scenes.push({ id: scene.id, chapter: scene.chapter || null, start: +sceneStart.toFixed(3), end: +end.toFixed(3), lines: sceneLines });
    t = end;
  }

  const timeline = { total: +t.toFixed(3), crossfade: CROSSFADE, scenes, lines };
  fs.writeFileSync(path.join(BUILD_DIR, 'timeline.json'), JSON.stringify(timeline, null, 1));
  console.log(`timeline: ${scenes.length} scenes, ${Object.keys(lines).length} lines, ${t.toFixed(1)}s`);
  for (const s of scenes) console.log(`  ${s.id.padEnd(8)} ${s.start.toFixed(1).padStart(6)} → ${s.end.toFixed(1).padStart(6)}  (${(s.end - s.start).toFixed(1)}s)`);
}

main().catch(e => { console.error(e); process.exit(1); });
