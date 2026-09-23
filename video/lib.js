// Shared paths and helpers for the video build scripts.
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const VIDEO_DIR = __dirname;
const PROJECT_DIR = path.resolve(VIDEO_DIR, '..');
// Intermediate files (audio, frame segments) can be large and numerous; keep
// them out of synced folders by pointing BUILD_DIR somewhere local.
const BUILD_DIR = path.resolve(process.env.BUILD_DIR || path.join(VIDEO_DIR, 'build'));
const OUTPUT_DIR = path.resolve(process.env.OUTPUT_DIR || path.join(VIDEO_DIR, 'output'));

const FPS = 30;
const SAMPLE_RATE = 48000;
// Scenes overlap by this much so one can cross-fade into the next.
const CROSSFADE = 0.6;

const ffmpeg = require('ffmpeg-static');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Decode any audio file to mono float32 PCM at SAMPLE_RATE.
function decodeAudio(file) {
  const buf = execFileSync(ffmpeg, ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(SAMPLE_RATE), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

function writeWav(file, channels, sampleRate = SAMPLE_RATE) {
  // channels: array of Float32Array (same length). Writes 16-bit PCM.
  const n = channels[0].length, ch = channels.length;
  const data = Buffer.alloc(44 + n * ch * 2);
  data.write('RIFF', 0); data.writeUInt32LE(36 + n * ch * 2, 4); data.write('WAVE', 8);
  data.write('fmt ', 12); data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(ch, 22);
  data.writeUInt32LE(sampleRate, 24); data.writeUInt32LE(sampleRate * ch * 2, 28); data.writeUInt16LE(ch * 2, 32);
  data.writeUInt16LE(16, 34); data.write('data', 36); data.writeUInt32LE(n * ch * 2, 40);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, channels[c][i]));
      data.writeInt16LE(Math.round(v * 32767), o); o += 2;
    }
  }
  fs.writeFileSync(file, data);
}

function formatTimestamp(sec, sep = ',') {
  const ms = Math.round(sec * 1000);
  const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}${sep}${String(ms % 1000).padStart(3, '0')}`;
}

module.exports = { VIDEO_DIR, PROJECT_DIR, BUILD_DIR, OUTPUT_DIR, FPS, SAMPLE_RATE, CROSSFADE, ffmpeg, ensureDir, decodeAudio, writeWav, formatTimestamp };
