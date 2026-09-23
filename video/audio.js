// Builds the soundtrack: narration at its timeline positions, synthesized UI
// sound effects at the cues the stage reported, and an original ambient music
// bed that ducks under the voice. Everything is generated here - no samples or
// third-party music - so there is nothing to license.
//
// Output: BUILD_DIR/mix.wav (with music) and BUILD_DIR/mix-nomusic.wav.
const fs = require('fs');
const path = require('path');
const { BUILD_DIR, SAMPLE_RATE: SR, decodeAudio, writeWav } = require('./lib');

const timeline = JSON.parse(fs.readFileSync(path.join(BUILD_DIR, 'timeline.json'), 'utf8'));
const meta = JSON.parse(fs.readFileSync(path.join(BUILD_DIR, 'stage-meta.json'), 'utf8'));
const TOTAL = timeline.total + 0.5;
const N = Math.ceil(TOTAL * SR);
const dB = x => Math.pow(10, x / 20);
const TAU = Math.PI * 2;

// Deterministic noise, so re-renders sound identical.
let seed = 12345;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;

// --- filters ----------------------------------------------------------------
function biquad(type, f, q = 0.707) {
  const w = TAU * f / SR, cw = Math.cos(w), sw = Math.sin(w), a = sw / (2 * q);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'lp') { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; }
  else if (type === 'hp') { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; }
  else { b0 = a; b1 = 0; b2 = -a; } // band-pass
  a0 = 1 + a; a1 = -2 * cw; a2 = 1 - a;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  const f0 = {
    b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0,
    run(x) { const y = f0.b0 * x + f0.b1 * x1 + f0.b2 * x2 - f0.a1 * y1 - f0.a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; }
  };
  return f0;
}

// --- sound effects ----------------------------------------------------------
function makeSfx(type) {
  const len = { click: 0.06, key: 0.09, keyup: 0.06, type: 0.04, enter: 0.1, pop: 0.12, tick: 0.08, whoosh: 0.9, swell: 1.6, chime: 1.2 }[type] || 0.1;
  const n = Math.ceil(len * SR);
  const out = new Float32Array(n);
  const bp = (f, q) => biquad('bp', f, q);
  if (type === 'click' || type === 'type' || type === 'key' || type === 'keyup' || type === 'enter') {
    const hi = { click: 3200, type: 4200, key: 1900, keyup: 2400, enter: 1600 }[type];
    const body = { click: 0, type: 0, key: 170, keyup: 0, enter: 140 }[type];
    const f = bp(hi, 1.4);
    const clicks = type === 'click' ? [0, 0.028] : [0];
    for (const c of clicks) {
      const o = Math.floor(c * SR);
      for (let i = 0; i < n - o; i++) {
        const t = i / SR;
        const env = Math.exp(-t / (type === 'type' ? 0.004 : 0.006));
        out[o + i] += f.run(rnd() * env) * (c ? 0.6 : 1);
        if (body) out[o + i] += Math.sin(TAU * body * t) * Math.exp(-t / 0.02) * 0.35;
      }
    }
  } else if (type === 'pop' || type === 'tick') {
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const f0 = type === 'pop' ? 900 + 500 * Math.min(1, t / 0.04) : 2100;
      const env = Math.min(1, t / 0.004) * Math.exp(-t / (type === 'pop' ? 0.035 : 0.018));
      out[i] = Math.sin(TAU * f0 * t) * env * 0.5 + Math.sin(TAU * f0 * 2 * t) * env * 0.1;
    }
  } else if (type === 'whoosh' || type === 'swell') {
    const f = bp(500, 0.9), lp = biquad('lp', 5000);
    for (let i = 0; i < n; i++) {
      const p = i / n;
      if (i % 64 === 0) {
        const fc = type === 'whoosh' ? 300 * Math.pow(12, Math.sin(Math.PI * p)) : 200 * Math.pow(25, p);
        const g = bp(fc, 0.8);
        f.b0 = g.b0; f.b1 = g.b1; f.b2 = g.b2; f.a1 = g.a1; f.a2 = g.a2;
      }
      const env = type === 'whoosh' ? Math.pow(Math.sin(Math.PI * p), 2) : Math.pow(p, 2.2) * (p > 0.92 ? (1 - p) / 0.08 : 1);
      out[i] = lp.run(f.run(rnd())) * env * 1.6;
    }
  } else if (type === 'chime') {
    for (const [f, t0] of [[1318.5, 0], [1975.5, 0.09]]) {
      const o = Math.floor(t0 * SR);
      for (let i = 0; i < n - o; i++) {
        const t = i / SR, env = Math.min(1, t / 0.003) * Math.exp(-t / 0.35);
        out[o + i] += (Math.sin(TAU * f * t) + 0.25 * Math.sin(TAU * f * 2.01 * t)) * env * 0.35;
      }
    }
  }
  return out;
}

const SFX_GAIN = { click: -17, type: -26, key: -18, keyup: -24, enter: -20, pop: -23, tick: -27, whoosh: -24, swell: -25, chime: -24 };

function sfxTrack() {
  const out = new Float32Array(N);
  const cache = {};
  for (const cue of meta.sfx) {
    const buf = cache[cue.type] || (cache[cue.type] = makeSfx(cue.type));
    let peak = 0;
    for (const v of buf) peak = Math.max(peak, Math.abs(v));
    const g = dB(SFX_GAIN[cue.type] ?? -24) * cue.gain / (peak || 1);
    const o = Math.floor(cue.t * SR);
    for (let i = 0; i < buf.length && o + i < N; i++) if (o + i >= 0) out[o + i] += buf[i] * g;
  }
  return out;
}

// --- narration --------------------------------------------------------------
function voiceTrack() {
  const out = new Float32Array(N);
  const hp = biquad('hp', 70);
  for (const line of Object.values(timeline.lines)) {
    const pcm = decodeAudio(path.join(BUILD_DIR, line.audio));
    const o = Math.floor(line.start * SR);
    for (let i = 0; i < pcm.length && o + i < N; i++) out[o + i] += pcm[i];
  }
  for (let i = 0; i < N; i++) out[i] = hp.run(out[i]);
  return out;
}

// --- music bed ----------------------------------------------------------------
const midi = m => 440 * Math.pow(2, (m - 69) / 12);
const BEAT = 60 / 92, BAR = BEAT * 4;
// Two bars per chord: Dmaj9 - Bm9 - Gmaj9 - Asus.
const CHORDS = [
  { root: 38, pad: [50, 57, 61, 64, 66], arp: [62, 66, 69, 73, 76, 73, 69, 66] },
  { root: 35, pad: [47, 54, 57, 61, 62], arp: [59, 62, 66, 69, 73, 69, 66, 62] },
  { root: 31, pad: [43, 50, 54, 57, 59], arp: [55, 59, 62, 66, 69, 66, 62, 59] },
  { root: 33, pad: [45, 52, 57, 59, 62], arp: [57, 61, 64, 69, 71, 69, 64, 62] }
];
const chordAt = t => CHORDS[Math.floor(t / (BAR * 2)) % CHORDS.length];

function sawTable(f) {
  const size = 2048, tab = new Float32Array(size + 1);
  const harmonics = Math.max(1, Math.min(48, Math.floor(7000 / f)));
  for (let i = 0; i <= size; i++) {
    let v = 0;
    for (let h = 1; h <= harmonics; h++) v += Math.sin(TAU * h * i / size) / h;
    tab[i] = v * 0.55;
  }
  return tab;
}

function music() {
  const L = new Float32Array(N), R = new Float32Array(N);
  const scenes = Object.fromEntries(timeline.scenes.map(s => [s.id, s]));
  const at = id => scenes[id] ? scenes[id].start : 0;
  // Section intensity: 0 = pad only, 1 = + bass & plucks, 2 = + light hats.
  const tReveal = timeline.lines.r2 ? timeline.lines.r2.markers.name : at('reveal') + 3;
  const intensity = t => {
    if (t < at('problem')) return 0;
    if (t < tReveal) return 0.35;
    if (t >= at('privacy') && t < at('outro')) return 1;
    return 2;
  };
  const smooth = (() => { const cache = new Float32Array(Math.ceil(TOTAL * 100) + 1); let v = 0; for (let i = 0; i < cache.length; i++) { v += (intensity(i / 100) - v) * 0.02; cache[i] = v; } return t => cache[Math.min(cache.length - 1, Math.floor(t * 100))]; })();

  // Pad: detuned band-limited saws, per chord, cross-faded, low-passed.
  const tables = {};
  const table = m => tables[m] || (tables[m] = sawTable(midi(m)));
  const padL = new Float32Array(N), padR = new Float32Array(N);
  const chordLen = BAR * 2;
  const nChords = Math.ceil(TOTAL / chordLen) + 1;
  for (let c = 0; c < nChords; c++) {
    const ch = CHORDS[c % CHORDS.length];
    const t0 = c * chordLen - 0.6, t1 = (c + 1) * chordLen + 1.4;
    const i0 = Math.max(0, Math.floor(t0 * SR)), i1 = Math.min(N, Math.floor(t1 * SR));
    for (const [k, m] of ch.pad.entries()) {
      const tab = table(m), f = midi(m);
      for (const [side, cents] of [[0, -7], [1, 6], [0, 3], [1, -4]]) {
        const inc = f * Math.pow(2, cents / 1200) / SR * 2048;
        let ph = (((k * 311 + cents * 17) % 2048) + 2048) % 2048;
        const dst = side ? padR : padL;
        for (let i = i0; i < i1; i++) {
          const t = i / SR;
          const env = Math.min(1, (t - t0) / 1.2) * Math.min(1, (t1 - t) / 1.4);
          const j = ph | 0, fr = ph - j;
          dst[i] += (tab[j] + (tab[j + 1] - tab[j]) * fr) * env * 0.05;
          ph += inc; if (ph >= 2048) ph -= 2048;
        }
      }
    }
  }
  for (const buf of [padL, padR]) {
    const f1 = biquad('lp', 1400, 0.6), f2 = biquad('lp', 1400, 0.6), hp = biquad('hp', 90);
    for (let i = 0; i < N; i++) {
      if (i % 256 === 0) {
        const t = i / SR, cut = 700 + 900 * Math.min(1, smooth(t) / 1.2) + 150 * Math.sin(t * 0.21);
        for (const f of [f1, f2]) { const g = biquad('lp', cut, 0.6); Object.assign(f, { b0: g.b0, b1: g.b1, b2: g.b2, a1: g.a1, a2: g.a2 }); }
      }
      buf[i] = hp.run(f2.run(f1.run(buf[i])));
    }
  }

  // Plucks (8th-note arpeggio) and sub bass.
  const plL = new Float32Array(N), plR = new Float32Array(N), bass = new Float32Array(N);
  const eighth = BEAT / 2;
  for (let k = 0; k * eighth < TOTAL; k++) {
    const t0 = k * eighth, lvl = clamp01(smooth(t0) - 0.2);
    if (lvl <= 0.01) continue;
    const ch = chordAt(t0), m = ch.arp[k % 8], f = midi(m + 12);
    const vel = (k % 2 === 0 ? 1 : 0.7) * lvl;
    const pan = k % 2 ? 0.35 : -0.35;
    const i0 = Math.floor(t0 * SR), n = Math.floor(0.9 * SR);
    for (let i = 0; i < n && i0 + i < N; i++) {
      const t = i / SR;
      const v = (Math.sin(TAU * f * t) * Math.exp(-t / 0.32) + 0.35 * Math.sin(TAU * 2 * f * t) * Math.exp(-t / 0.12) + 0.12 * Math.sin(TAU * 3 * f * t) * Math.exp(-t / 0.06))
        * Math.min(1, t / 0.003) * vel * 0.055;
      plL[i0 + i] += v * (1 - pan) * 0.7; plR[i0 + i] += v * (1 + pan) * 0.7;
    }
  }
  for (let b = 0; b * BEAT < TOTAL; b++) {
    if (b % 4 !== 0 && b % 4 !== 2) continue;
    const t0 = b * BEAT, lvl = clamp01(smooth(t0) - 0.3);
    if (lvl <= 0.01) continue;
    const f = midi(chordAt(t0).root);
    const i0 = Math.floor(t0 * SR), n = Math.floor(BEAT * 1.9 * SR);
    for (let i = 0; i < n && i0 + i < N; i++) {
      const t = i / SR;
      bass[i0 + i] += (Math.sin(TAU * f * t) + 0.15 * Math.sin(TAU * 2 * f * t)) * Math.min(1, t / 0.02) * Math.exp(-t / 0.9) * lvl * 0.16;
    }
  }
  // Ping-pong delay on the plucks.
  const d = Math.floor(BEAT * 0.75 * SR);
  for (let i = d; i < N; i++) { plL[i] += plR[i - d] * 0.32; plR[i] += plL[i - d] * 0.32; }

  // Soft off-beat hats in the busiest sections.
  const hats = new Float32Array(N);
  const hh = biquad('hp', 7000);
  for (let b = 0; b * BEAT < TOTAL; b++) {
    const t0 = b * BEAT + BEAT / 2, lvl = clamp01(smooth(t0) - 1.2);
    if (lvl <= 0.01) continue;
    const i0 = Math.floor(t0 * SR), n = Math.floor(0.05 * SR);
    for (let i = 0; i < n && i0 + i < N; i++) hats[i0 + i] += rnd() * Math.exp(-i / SR / 0.012) * lvl * 0.05;
  }
  for (let i = 0; i < N; i++) hats[i] = hh.run(hats[i]);

  for (let i = 0; i < N; i++) {
    L[i] = padL[i] + plL[i] + bass[i] + hats[i] * 0.8;
    R[i] = padR[i] + plR[i] + bass[i] + hats[i];
  }
  reverb(L, R);
  // Fade in at the start, out at the end.
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const g = Math.min(1, t / 2.5) * Math.min(1, Math.max(0, (TOTAL - 0.3 - t) / 4));
    L[i] *= g; R[i] *= g;
  }
  return [L, R];
}
function clamp01(x) { return Math.max(0, Math.min(1, x)); }

// Small Schroeder reverb, different delays per side for width.
function reverb(L, R) {
  const make = offs => {
    const combs = [1557, 1617, 1491, 1422].map(n => ({ buf: new Float32Array(n + offs), i: 0, fb: 0.78, lp: 0 }));
    const aps = [225, 556].map(n => ({ buf: new Float32Array(n + offs), i: 0 }));
    return x => {
      let s = 0;
      for (const c of combs) {
        const y = c.buf[c.i];
        c.lp = y * 0.7 + c.lp * 0.3;
        c.buf[c.i] = x + c.lp * c.fb;
        c.i = (c.i + 1) % c.buf.length;
        s += y;
      }
      s *= 0.25;
      for (const a of aps) {
        const b = a.buf[a.i];
        const y = -s + b;
        a.buf[a.i] = s + b * 0.5;
        a.i = (a.i + 1) % a.buf.length;
        s = y;
      }
      return s;
    };
  };
  const rl = make(0), rr = make(23);
  for (let i = 0; i < L.length; i++) {
    const m = (L[i] + R[i]) * 0.5;
    L[i] = L[i] * 0.78 + rl(m) * 0.45;
    R[i] = R[i] * 0.78 + rr(m) * 0.45;
  }
}

// Voice-driven ducking envelope (1 = no voice, lower while speaking).
function duckEnvelope(voice, depthDb = -9) {
  const env = new Float32Array(N);
  const win = Math.floor(0.01 * SR);
  let level = 0;
  const atk = Math.exp(-1 / (0.04 * SR / win)), rel = Math.exp(-1 / (0.45 * SR / win));
  for (let i = 0; i < N; i += win) {
    let s = 0;
    for (let j = i; j < Math.min(N, i + win); j++) s += voice[j] * voice[j];
    const rms = Math.sqrt(s / win);
    const target = Math.min(1, rms / 0.03);
    level = target > level ? target + (level - target) * atk : target + (level - target) * rel;
    const g = Math.pow(10, (depthDb * level) / 20);
    for (let j = i; j < Math.min(N, i + win); j++) env[j] = g;
  }
  return env;
}

function main() {
  const voice = voiceTrack();
  const fx = sfxTrack();
  const [mL, mR] = music();
  const duck = duckEnvelope(voice);
  const musicGain = dB(+(process.env.MUSIC_DB || -15));

  // Music peak-normalized first, so MUSIC_DB is relative to full scale.
  let mp = 0;
  for (let i = 0; i < N; i++) mp = Math.max(mp, Math.abs(mL[i]), Math.abs(mR[i]));
  const mNorm = 1 / (mp || 1);

  const L = new Float32Array(N), R = new Float32Array(N);
  const L2 = new Float32Array(N), R2 = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const base = voice[i] + fx[i];
    L2[i] = base; R2[i] = base;
    L[i] = base + mL[i] * mNorm * musicGain * duck[i];
    R[i] = base + mR[i] * mNorm * musicGain * duck[i];
  }
  writeWav(path.join(BUILD_DIR, 'mix.wav'), [L, R]);
  writeWav(path.join(BUILD_DIR, 'mix-nomusic.wav'), [L2, R2]);
  if (process.env.DEBUG_MUSIC) writeWav(path.join(BUILD_DIR, 'music-only.wav'), [L.map((v, i) => v - L2[i]), R.map((v, i) => v - R2[i])]);
  console.log(`audio: ${TOTAL.toFixed(1)}s, ${meta.sfx.length} sound cues`);
}

main();
