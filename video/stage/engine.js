// Frame engine: every visual is a pure function of time t (seconds), so any
// frame can be rendered on its own, in any order. That is what lets the
// renderer split the video across parallel workers.
'use strict';

const W = 1536, H = 864;

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, p) => a + (b - a) * p;

const Ease = {
  linear: p => p,
  inOut: p => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
  inOutSine: p => -(Math.cos(Math.PI * p) - 1) / 2,
  out: p => 1 - Math.pow(1 - p, 3),
  outQuint: p => 1 - Math.pow(1 - p, 5),
  in: p => p * p * p,
  outBack: p => { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); }
};

// 0..1 progress of t through [a, b]
const prog = (t, a, b, ease = Ease.linear) => ease(clamp((t - a) / (b - a)));

// Opacity for something visible during [a, b], fading in and out at the edges.
function fade(t, a, b, fi = 0.35, fo = 0.35) {
  if (t < a || t > b) return 0;
  return Math.min(fi > 0 ? clamp((t - a) / fi) : 1, fo > 0 ? clamp((b - t) / fo) : 1);
}

function mix(a, b, p) {
  if (typeof a === 'number') return lerp(a, b, p);
  if (Array.isArray(a)) return a.map((v, i) => mix(v, b[i], p));
  if (a && typeof a === 'object') {
    const o = {};
    for (const k of Object.keys(b)) o[k] = k in a ? mix(a[k], b[k], p) : b[k];
    return o;
  }
  return p < 1 ? a : b;
}

// A value that jumps at given times.
class Steps {
  constructor(v0) { this.k = [[-Infinity, v0]]; }
  set(t, v) { this.k.push([t, v]); this.k.sort((a, b) => a[0] - b[0]); return this; }
  at(t) { let v = this.k[0][1]; for (const [kt, kv] of this.k) { if (kt <= t) v = kv; else break; } return v; }
}

// A value that transitions smoothly, starting at given times.
class Anim {
  constructor(v0) { this.v0 = v0; this.k = []; }
  to(t, v, dur = 0.6, ease = Ease.inOut) { this.k.push({ t, v, dur, ease }); this.k.sort((a, b) => a.t - b.t); return this; }
  at(t) {
    let cur = this.v0;
    for (const k of this.k) {
      if (t < k.t) break;
      cur = mix(cur, k.v, k.dur > 0 ? k.ease(clamp((t - k.t) / k.dur)) : 1);
    }
    return cur;
  }
}

// Timeline access -----------------------------------------------------------

const Stage = {
  tl: null,
  defs: {},
  scenes: [],
  sfx: [],
  line(id) {
    const l = this.tl.lines[id];
    if (!l) throw new Error(`unknown line ${id}`);
    return l;
  },
  mk(id, name) {
    const v = this.line(id).markers[name];
    if (v == null) throw new Error(`unknown marker ${id}.${name}`);
    return v;
  },
  scene(id) { return this.tl.scenes.find(s => s.id === id); }
};

// Sound effects are declared while scenes are set up (not while rendering), so
// the audio mix can read the full list once.
function sfx(t, type, gain = 1) { Stage.sfx.push({ t: +t.toFixed(3), type, gain }); }

function defineScene(id, setup) { Stage.defs[id] = setup; }

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

// Position of `node` relative to `ref`, measured while both are untransformed.
function rectIn(node, ref) {
  const a = node.getBoundingClientRect(), b = ref.getBoundingClientRect();
  return { x: a.left - b.left, y: a.top - b.top, w: a.width, h: a.height };
}
const center = r => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const pad = (r, p, py = p) => ({ x: r.x - p, y: r.y - py, w: r.w + 2 * p, h: r.h + 2 * py });
const union = (...rs) => {
  const x = Math.min(...rs.map(r => r.x)), y = Math.min(...rs.map(r => r.y));
  return { x, y, w: Math.max(...rs.map(r => r.x + r.w)) - x, h: Math.max(...rs.map(r => r.y + r.h)) - y };
};

async function initStage() {
  Stage.tl = await fetch('/__build/timeline.json').then(r => r.json());
  await document.fonts.ready;
  const root = document.getElementById('stage');

  for (const [i, s] of Stage.tl.scenes.entries()) {
    const setup = Stage.defs[s.id];
    if (!setup) throw new Error(`no scene definition for ${s.id}`);
    const sceneRoot = el('div', 'scene');
    sceneRoot.dataset.scene = s.id;
    root.appendChild(sceneRoot);
    // Scenes measure their own layout during setup, so they must be displayed.
    const update = await setup(sceneRoot, s);
    Stage.scenes.push({ ...s, index: i, root: sceneRoot, update });
    sceneRoot.style.display = 'none';
  }

  window.renderFrame = t => {
    for (const s of Stage.scenes) {
      const visible = t >= s.start && t < s.end + (s.index === Stage.scenes.length - 1 ? 1 : 0);
      s.root.style.display = visible ? '' : 'none';
      if (!visible) continue;
      s.root.style.opacity = s.index === 0 ? 1 : prog(t, s.start, s.start + Stage.tl.crossfade, Ease.inOutSine);
      s.update(t);
    }
  };
  window.__total = Stage.tl.total;
  window.__sfx = Stage.sfx.sort((a, b) => a.t - b.t);
  window.__chapters = Stage.tl.scenes.filter(s => s.chapter).map(s => ({ t: s.start, title: s.chapter }));
  window.renderFrame(0);
  window.__ready = true;
}
