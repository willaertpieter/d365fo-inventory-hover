// Reusable, time-driven building blocks: camera, cursor, spotlight, key
// overlay, the Edge browser frame and the D365 F&O page recreation.
'use strict';

const ICON = {
  back: '&#xE72B;', fwd: '&#xE72A;', refresh: '&#xE72C;', lock: '&#xE72E;', star: '&#xE734;', favs: '&#xE728;',
  puzzle: '&#xEA86;', more: '&#xE712;', settings: '&#xE713;', close: '&#xE8BB;', min: '&#xE921;', max: '&#xE922;',
  pin: '&#xE718;', eye: '&#xE7B3;', home: '&#xE80F;', recent: '&#xE823;', modules: '&#xE71D;', workspace: '&#xE8A1;',
  search: '&#xE721;', filter: '&#xE71C;', down: '&#xE70D;', up: '&#xE70E;', right: '&#xE76C;', popout: '&#xE8A7;',
  attach: '&#xE723;', help: '&#xE897;', emoji: '&#xE76E;', bell: '&#xEA8F;', add: '&#xE710;', edit: '&#xE70F;',
  del: '&#xE74D;', save: '&#xE74E;', menu: '&#xE700;', report: '&#xE9F9;', check: '&#xE73E;', info: '&#xE946;',
  tabs: '&#xE8A9;', copy: '&#xE8C8;', list: '&#xE8FD;'
};
const ic = (name, cls = '') => `<i class="ic ${cls}">${ICON[name]}</i>`;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---------------------------------------------------------------------------
// Camera: pans/zooms everything placed inside it.

class Cam {
  constructor(parent) {
    this.el = el('div', 'cam');
    parent.appendChild(this.el);
    this.v = new Anim({ x: W / 2, y: H / 2, s: 1 });
  }
  to(t, x, y, s, dur = 1.1, ease = Ease.inOut) { this.v.to(t, { x, y, s }, dur, ease); return t + dur; }
  focus(t, r, s, dur = 1.1, dx = 0, dy = 0) { const c = center(r); return this.to(t, c.x + dx, c.y + dy, s, dur); }
  reset(t, dur = 1.0) { return this.to(t, W / 2, H / 2, 1, dur); }
  update(t) {
    let { x, y, s } = this.v.at(t);
    x = clamp(x, W / 2 / s, W - W / 2 / s);
    y = clamp(y, H / 2 / s, H - H / 2 / s);
    this.el.style.transform = `translate(${W / 2 - x * s}px, ${H / 2 - y * s}px) scale(${s})`;
  }
}

// ---------------------------------------------------------------------------
// Mouse cursor, with Windows-style arrow and hand shapes.

const ARROW_SVG = `<svg class="cur-arrow" width="22" height="30" viewBox="0 0 22 30"><path d="M1.5 1.5 L1.5 23 L6.6 18.2 L10.4 27.2 L14.2 25.6 L10.5 16.9 L17.4 16.9 Z" fill="#fff" stroke="#000" stroke-width="1.3" stroke-linejoin="round"/></svg>`;
const HAND_SVG = `<svg class="cur-hand" width="26" height="28" viewBox="0 0 26 28"><path d="M8.2 2.6c0-.95.77-1.7 1.7-1.7s1.7.75 1.7 1.7v8.2h.3V9.4c0-.95.77-1.7 1.7-1.7s1.7.75 1.7 1.7v1.4h.3v-.4c0-.95.77-1.7 1.7-1.7s1.7.75 1.7 1.7v1.2h.2c.93 0 1.7.76 1.7 1.7v4.1c0 3.9-3.1 7-7 7h-2.5c-2.3 0-4.4-1.2-5.6-3.2l-3.6-6c-.5-.85-.25-1.95.6-2.45.8-.48 1.83-.3 2.4.42l2.07 2.6V2.6z" fill="#fff" stroke="#000" stroke-width="1.2" stroke-linejoin="round"/><path d="M11.6 11v5.2M15 11.2v5M18.4 12v4.2" stroke="#000" stroke-width="1" stroke-linecap="round"/></svg>`;

class Cursor {
  constructor(parent, x, y) {
    this.el = el('div', 'cursor', ARROW_SVG + HAND_SVG);
    this.ripple = el('div', 'cursor-ripple');
    parent.appendChild(this.ripple);
    parent.appendChild(this.el);
    this.x0 = x; this.y0 = y;
    this.moves = [];
    this.clicks = [];
    this.shapes = new Steps('arrow');
    this.visible = new Steps(true);
    this.last = { t: -Infinity, x, y };
  }
  // Moves are chained: each starts where the previous one ended.
  move(t, x, y, dur = 0.8) {
    this.moves.push({ t, x, y, dur });
    this.moves.sort((a, b) => a.t - b.t);
    return t + dur;
  }
  click(t, sound = true) { this.clicks.push(t); if (sound) sfx(t, 'click'); return t; }
  shape(t, s) { this.shapes.set(t, s); }
  hide(t) { this.visible.set(t, false); }
  show(t) { this.visible.set(t, true); }
  pos(t) {
    let x = this.x0, y = this.y0;
    for (const m of this.moves) {
      if (t < m.t) break;
      const p = Ease.inOut(clamp((t - m.t) / m.dur));
      if (p >= 1) { x = m.x; y = m.y; continue; }
      const dx = m.x - x, dy = m.y - y, dist = Math.hypot(dx, dy) || 1;
      const arc = Math.sin(Math.PI * p) * Math.min(36, dist * 0.1);
      return { x: x + dx * p - (dy / dist) * arc, y: y + dy * p + (dx / dist) * arc };
    }
    return { x, y };
  }
  update(t) {
    const { x, y } = this.pos(t);
    const shape = this.shapes.at(t);
    this.el.style.display = this.visible.at(t) ? '' : 'none';
    this.el.classList.toggle('hand', shape === 'hand');
    const since = this.clicks.filter(c => c <= t).map(c => t - c).sort((a, b) => a - b)[0];
    const press = since != null && since < 0.14 ? 0.86 : 1;
    this.el.style.transform = `translate(${x}px, ${y}px) scale(${press})`;
    if (since != null && since < 0.5) {
      const p = since / 0.5;
      this.ripple.style.display = '';
      this.ripple.style.opacity = (1 - p) * 0.55;
      this.ripple.style.transform = `translate(${x}px, ${y}px) scale(${0.2 + p * 1.1})`;
    } else {
      this.ripple.style.display = 'none';
    }
  }
}

// ---------------------------------------------------------------------------
// Spotlight: dims everything but one rectangle, with an optional label.

class Spot {
  constructor(parent) {
    this.el = el('div', 'spot');
    this.lab = el('div', 'spot-label');
    this.el.appendChild(this.lab);
    parent.appendChild(this.el);
    this.r = new Anim({ x: 0, y: 0, w: 10, h: 10 });
    this.o = new Anim(0);
    this.label = new Steps('');
    this.labelSide = new Steps('top');
    this.on = false;
  }
  show(t, rect, label = '', dur = 0.55, side = 'top') {
    if (!this.on) { this.r.to(t, rect, 0); this.o.to(t, 1, 0.35); this.on = true; }
    else this.r.to(t, rect, dur);
    this.label.set(t, label);
    this.labelSide.set(t, side);
    return t + dur;
  }
  hide(t) { this.o.to(t, 0, 0.35); this.on = false; return t + 0.35; }
  update(t) {
    const o = this.o.at(t);
    this.el.style.display = o > 0.001 ? '' : 'none';
    if (o <= 0.001) return;
    const r = this.r.at(t);
    Object.assign(this.el.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px', opacity: o });
    const text = this.label.at(t);
    this.lab.style.display = text ? '' : 'none';
    this.lab.textContent = text;
    this.lab.className = 'spot-label ' + this.labelSide.at(t);
  }
}

// ---------------------------------------------------------------------------
// "Hold Alt" key overlay (screen space, not zoomed with the camera).

class Keys {
  constructor(parent, caption = 'hover an item number') {
    this.el = el('div', 'keys', `<span class="keycap">Alt</span><span class="keys-plus">+</span><span class="keys-cap">${caption}</span>`);
    this.el.style.display = 'none';
    parent.appendChild(this.el);
    this.iv = [];
  }
  hold(t0, t1) { this.iv.push([t0, t1]); sfx(t0, 'key'); sfx(t1, 'keyup', 0.7); }
  update(t) {
    let o = 0, pressed = false, s = 1;
    for (const [a, b] of this.iv) {
      if (t >= a - 0.05 && t <= b + 0.35) {
        o = Math.max(o, fade(t, a - 0.05, b + 0.35, 0.18, 0.35));
        pressed = t >= a && t <= b;
        s = 0.92 + 0.08 * Ease.outBack(clamp((t - a + 0.05) / 0.3));
      }
    }
    this.el.style.display = o > 0 ? '' : 'none';
    this.el.style.opacity = o;
    this.el.style.transform = `scale(${s})`;
    this.el.classList.toggle('pressed', pressed);
  }
}

// ---------------------------------------------------------------------------
// Chapter tag: slides in bottom-left at the start of a section.

class ChapterTag {
  constructor(parent, num, text, t0, dur = 4.2) {
    this.el = el('div', 'chapter-tag', `<span class="chapter-num">${num}</span><span>${esc(text)}</span>`);
    parent.appendChild(this.el);
    this.t0 = t0; this.dur = dur;
  }
  update(t) {
    const o = fade(t, this.t0, this.t0 + this.dur, 0.45, 0.45);
    this.el.style.display = o > 0 ? '' : 'none';
    const p = prog(t, this.t0, this.t0 + 0.6, Ease.outQuint);
    this.el.style.opacity = o;
    this.el.style.transform = `translateX(${(1 - p) * -40}px)`;
  }
}

// ---------------------------------------------------------------------------
// Microsoft Edge browser frame (light theme).

const EXT_ICON = '../../icons/icon-48.png';
const EXT_NAME = 'D365FO Inventory Hover';

// Address bar text the way Edge shows it: scheme hidden, host dark, rest grey.
// `mark` wraps one substring so it can be measured.
function renderUrl(u, mark) {
  if (!u) return '<span class="u-rest">Search or enter web address</span>';
  const m = /^(https?:\/\/)?([^/]+)(.*)$/.exec(u) || [];
  const part = (s, cls) => {
    const i = mark ? s.indexOf(mark) : -1;
    if (i < 0) return `<span class="${cls}">${esc(s)}</span>`;
    return `<span class="${cls}">${esc(s.slice(0, i))}<span class="u-mark">${esc(mark)}</span>${esc(s.slice(i + mark.length))}</span>`;
  };
  return part(m[2] || '', 'u-host') + part(m[3] || '', 'u-rest');
}

class Browser {
  constructor(parent, { title = 'Finance and Operations', favicon = 'd365', url = '', pinned = true } = {}) {
    this.el = el('div', 'edge');
    this.el.innerHTML = `
      <div class="edge-tabs">
        <div class="edge-tabactions">${ic('tabs')}</div>
        <div class="edge-tab"><span class="edge-fav"></span><span class="edge-title"></span>${ic('close', 'edge-tabx')}</div>
        <div class="edge-newtab">${ic('add')}</div>
        <div class="edge-winctl">${ic('min')}${ic('max')}${ic('close')}</div>
      </div>
      <div class="edge-bar">
        <span class="edge-btn">${ic('back')}</span><span class="edge-btn">${ic('refresh')}</span>
        <div class="edge-omni"><span class="edge-lock">${ic('lock')}</span><span class="edge-url"></span><span class="edge-star">${ic('star')}</span></div>
        <div class="edge-tools">
          <span class="edge-btn edge-ext"><img src="${EXT_ICON}"></span>
          <span class="edge-btn edge-puzzle">${ic('puzzle')}</span>
          <span class="edge-btn">${ic('favs')}</span>
          <span class="edge-avatar">JD</span>
          <span class="edge-btn">${ic('more')}</span>
        </div>
      </div>
      <div class="edge-progress"></div>
      <div class="edge-page"></div>
      <div class="edge-layer"></div>`;
    parent.appendChild(this.el);
    this.page = this.el.querySelector('.edge-page');
    this.layer = this.el.querySelector('.edge-layer');
    this.$ = s => this.el.querySelector(s);
    this.title = new Steps(title);
    this.favicon = new Steps(favicon);
    this.url = new Steps(url);
    this.pinned = new Steps(pinned);
    this.omniFocus = new Steps(false);
    this.typing = [];
    this.pages = {};
    this.current = new Steps(null);
    this.switches = [];
    this.extPulse = [];
  }
  addPage(name, node) {
    node.classList.add('edge-pagecontent');
    this.page.appendChild(node);
    this.pages[name] = node;
    return node;
  }
  show(t, name, { load = true } = {}) {
    this.current.set(t, name);
    this.switches.push({ t, load });
  }
  // Type into the address bar, then "press Enter" (returns the Enter time).
  typeUrl(t0, text, cps = 22) {
    const t1 = t0 + text.length / cps;
    this.typing.push({ t0, t1, text });
    this.omniFocus.set(t0 - 0.35, true).set(t1 + 0.35, false);
    for (let i = 0; i < text.length; i += 2) sfx(t0 + i / cps, 'type', 0.5);
    sfx(t1 + 0.3, 'enter', 0.8);
    return t1 + 0.35;
  }
  pulseExt(t) { this.extPulse.push(t); }
  // Stage rect of `part` within `url` as the address bar would show it.
  measureUrlPart(url, part) {
    const urlEl = this.$('.edge-url');
    const prev = urlEl.innerHTML;
    urlEl.innerHTML = renderUrl(url, part);
    const r = rectIn(urlEl.querySelector('.u-mark'), this.el);
    urlEl.innerHTML = prev;
    return r;
  }
  // Screen positions of chrome parts (browser frame is at stage 0,0).
  rect(sel) { return rectIn(this.$(sel), this.el); }
  update(t) {
    this.$('.edge-title').textContent = this.title.at(t);
    const fav = this.favicon.at(t);
    this.$('.edge-fav').className = 'edge-fav fav-' + fav;
    const typing = this.typing.find(k => t >= k.t0 - 0.35 && t < k.t1 + 0.35);
    const urlEl = this.$('.edge-url');
    const focus = this.omniFocus.at(t);
    this.$('.edge-omni').classList.toggle('focus', focus);
    if (typing) {
      const n = Math.round(clamp((t - typing.t0) / (typing.t1 - typing.t0)) * typing.text.length);
      urlEl.innerHTML = `<span class="u-typed">${esc(typing.text.slice(0, n))}</span><span class="u-caret"></span>`;
    } else {
      urlEl.innerHTML = renderUrl(this.url.at(t));
    }
    const pinned = this.pinned.at(t);
    const ext = this.$('.edge-ext');
    ext.style.display = pinned ? '' : 'none';
    const pulse = this.extPulse.filter(p => t >= p && t < p + 1.4).map(p => t - p)[0];
    ext.classList.toggle('pulse', pulse != null);
    if (pulse != null) ext.style.setProperty('--pulse', (pulse / 1.4).toFixed(3));

    // Page switching with a short cross-fade and a loading bar.
    const cur = this.current.at(t);
    const sw = this.switches.filter(s => s.t <= t).pop();
    const prevName = sw ? this.current.at(sw.t - 0.001) : null;
    const pf = sw ? prog(t, sw.t, sw.t + 0.35) : 1;
    for (const [name, node] of Object.entries(this.pages)) {
      let o = 0;
      if (name === cur) o = prevName && prevName !== cur ? pf : 1;
      else if (name === prevName && pf < 1) o = 1;
      node.style.display = o > 0 ? '' : 'none';
      node.style.opacity = name === cur ? o : 1;
      node.style.zIndex = name === cur ? 2 : 1;
    }
    const bar = this.$('.edge-progress');
    if (sw && sw.load && t < sw.t + 0.9 && t >= sw.t - 0.5) {
      bar.style.display = '';
      bar.style.width = (prog(t, sw.t - 0.5, sw.t + 0.6, Ease.out) * 100) + '%';
      bar.style.opacity = 1 - prog(t, sw.t + 0.6, sw.t + 0.9);
    } else bar.style.display = 'none';
  }
}

// ---------------------------------------------------------------------------
// D365 Finance & Operations page recreation (standard blue theme).

function d365Page(cfg) {
  const root = el('div', 'd365');
  const crumbs = cfg.crumbs.map(c => `<span>${esc(c)}</span>`).join(ic('right', 'd-crumb-sep'));
  const ap = cfg.actionPane;
  const apLeft = (ap.left || []).map(i => i === '|' ? '<span class="ap-sep"></span>'
    : `<span class="ap-i${i.disabled ? ' disabled' : ''}">${i.icon ? ic(i.icon, 'ap-ic') : ''}${esc(i.label)}</span>`).join('');
  const apTabs = (ap.tabs || []).map(tb => `<span class="ap-tab${tb.active ? ' active' : ''}">${esc(tb.label || tb)}${tb.chevron ? ic('down', 'ap-chev') : ''}</span>`).join('');
  const ribbon = ap.groups ? `<div class="ap-ribbon">${ap.groups.map(g => `
      <div class="ap-group"><div class="ap-gtitle">${esc(g.title)}</div><div class="ap-gcols">${g.cols.map(col => `<div class="ap-gcol">${col.map(it => `<span class="${it.startsWith('~') ? 'disabled' : ''}">${esc(it.replace(/^~/, ''))}</span>`).join('')}</div>`).join('')}</div></div>`).join('<span class="ap-gsep"></span>')}
      ${ic('up', 'ap-collapse')}</div>` : '';

  const blocks = cfg.blocks.map(b => {
    if (b.type === 'fasttab') {
      return `<div class="d-card d-ft"><span>${esc(b.title)}</span><span class="d-ft-right">${esc(b.right || '')}<span class="d-ft-btn">${ic('down')}</span></span></div>`;
    }
    if (b.type === 'grid') return gridBlock(b);
    return '';
  }).join('');

  const header = cfg.formulaHeader
    ? `<div class="d-caption plain">${esc(cfg.formulaHeader)}</div>
       <div class="d-viewtitle">${esc(cfg.view || 'Standard view')}${ic('down', 'd-vt-chev')}</div>
       <div class="d-filter">${ic('search', 'd-filter-ic')}<span>Filter</span></div>`
    : `<div class="d-caption"><span class="d-cap-link">${esc(cfg.caption)}</span><span class="d-cap-sep">|</span><span>${esc(cfg.view || 'Standard view')}</span>${ic('down', 'd-cap-chev')}</div>
       <div class="d-title"><span>${esc(cfg.title)}</span><span class="d-title-right">${esc(cfg.titleRight || '')}</span></div>
       <div class="d-tabs">${(cfg.tabs || []).map((tb, i) => `<span class="d-tab${i === 0 ? ' active' : ''}">${esc(tb)}</span>`).join('')}</div>`;

  const factbox = cfg.factbox ? `<div class="d-factbox"><div class="d-fb-title">${esc(cfg.factbox.title)}</div>${cfg.factbox.items.map(i => `<div class="d-fb-row"><span>${esc(i)}</span><span class="d-ft-btn">${ic('down')}</span></div>`).join('')}</div>` : '';

  root.innerHTML = `
    <div class="d-nav">
      <div class="d-waffle">${'<i></i>'.repeat(9)}</div>
      <div class="d-app">Finance and Operations</div>
      <div class="d-crumbs">${crumbs}</div>
      <div class="d-nav-right">
        <span class="d-cmp">${esc(cfg.company)}</span>
        <span class="d-nic d-copilot"></span>${ic('search', 'd-nic')}${ic('bell', 'd-nic')}${ic('emoji', 'd-nic')}
        <span class="d-nsep"></span>${ic('settings', 'd-nic')}${ic('help', 'd-nic')}<span class="d-avatar">JD</span>
      </div>
    </div>
    <div class="d-rail">${ic('menu')}${ic('home')}${ic('star')}${ic('recent')}${ic('workspace')}${ic('modules')}</div>
    <div class="d-rrail">${ic('filter')}</div>
    <div class="d-main${cfg.factbox ? ' has-factbox' : ''}">
      <div class="d-ap">
        <div class="ap-row">
          ${ic('back', 'ap-ic ap-back')}${ic('menu', 'ap-ic ap-menu')}<span class="ap-sep"></span>${apLeft}${apTabs}${ic('search', 'ap-ic ap-find')}
          <span class="ap-right">${ap.report !== false ? ic('report', 'ap-ic') : ''}<span class="ap-ic ap-diamond"></span><span class="ap-ic ap-office"></span><span class="ap-attach">${ic('attach', 'ap-ic')}<b>0</b></span>${ic('refresh', 'ap-ic')}${ic('popout', 'ap-ic')}</span>
        </div>
        ${ribbon}
      </div>
      <div class="d-content">
        <div class="d-body">${header}${blocks}</div>
        ${factbox}
      </div>
    </div>`;

  const page = {
    el: root,
    row: i => root.querySelectorAll('.d-grow')[i],
    cell: (i, key) => root.querySelectorAll('.d-grow')[i].querySelector(`[data-col="${key}"]`),
    link: (i, key) => root.querySelectorAll('.d-grow')[i].querySelector(`[data-col="${key}"] a`) || root.querySelectorAll('.d-grow')[i].querySelector(`[data-col="${key}"]`),
    hoverRow: new Steps(-1),
    hoverLink: new Steps(null),
    update(t) {
      const hr = page.hoverRow.at(t);
      root.querySelectorAll('.d-grow').forEach((r, i) => r.classList.toggle('hover', i === hr));
      const hl = page.hoverLink.at(t);
      root.querySelectorAll('.d-grow a').forEach(a => a.classList.remove('hot'));
      if (hl) { const a = page.link(hl[0], hl[1]); if (a) a.classList.add('hot'); }
    }
  };
  return page;
}

function gridBlock(b) {
  const cols = b.columns;
  const tpl = `28px ${cols.map(c => c.w + 'px').join(' ')} 1fr`;
  const head = `<div class="d-gh" style="grid-template-columns:${tpl}"><span class="d-radio"></span>${cols.map(c => `<span class="${c.align === 'r' ? 'r' : ''}">${esc(c.label)}</span>`).join('')}<span class="d-gmore">&#x22EE;</span></div>`;
  const rows = b.rows.map((r, i) => `<div class="d-grow${i === b.selected ? ' sel' : ''}${b.checked === i ? ' checked' : ''}" style="grid-template-columns:${tpl}"><span class="d-radio"></span>${cols.map(c => {
    const v = r[c.key] ?? '';
    const cls = [c.align === 'r' ? 'r' : '', c.muted ? 'muted' : ''].join(' ');
    const inner = c.link && v ? `<a>${esc(v)}</a>${c.pencil && i === b.selected ? '<i class="ic d-pencil">&#xE70F;</i>' : ''}` : esc(v);
    return `<span class="${cls}" data-col="${c.key}">${inner}</span>`;
  }).join('')}<span></span></div>`).join('');
  const toolbar = b.toolbar ? `<div class="d-tb">${b.toolbar.map(it => `<span class="${it.disabled ? 'disabled' : ''}">${it.icon ? ic(it.icon, 'tb-ic') : ''}${esc(it.label)}${it.chevron ? ic('down', 'tb-chev') : ''}</span>`).join('')}</div>` : '';
  const title = b.title ? `<div class="d-sec-h">${esc(b.title)}</div>` : '';
  return `<div class="d-card d-section">${title}${toolbar}<div class="d-grid">${head}<div class="d-gbody" style="height:${b.height || 300}px">${rows}<div class="d-hscroll"><i style="width:${b.scroll || 55}%"></i></div></div></div></div>`;
}

// ---------------------------------------------------------------------------
// Tooltip markup - mirrors createTooltip() in content.js and
// buildProductDetailsPanel() in content-product-fields.js, styled by the
// extension's real styles.css.

const QTY = { physical: ['Physical', 'physical'], available: ['Available', 'available'], reserved: ['Reserved', 'reserved'], ordered: ['Ordered', 'ordered'], onOrder: ['On Order', 'on-order'] };
const DIMS = { config: 'Config', color: 'Color', size: 'Size', style: 'Style', version: 'Version' };

function buildTooltip(d) {
  const tip = el('div', 'd365-inventory-tooltip');
  tip.appendChild(el('div', 'tooltip-header')).textContent = d.header;
  if (d.cross) tip.appendChild(el('div', 'tooltip-scope-badge')).textContent = 'All companies (cross-company)';
  if (d.product) {
    const section = el('div', 'tooltip-product-section');
    if (d.cross && d.product.company) section.appendChild(el('div', 'tooltip-product-company')).textContent = `Product details - ${d.product.company}`;
    const grid = el('div', 'tooltip-product-details');
    grid.dataset.layout = d.product.layout || '2col';
    for (const [label, value] of d.product.fields) {
      grid.appendChild(el('span', 'product-field-label')).textContent = label;
      grid.appendChild(el('span', 'product-field-value')).textContent = value;
    }
    section.appendChild(grid);
    tip.appendChild(section);
  }
  if (!d.rows || !d.rows.length) {
    tip.appendChild(el('div', 'tooltip-inventory-note')).textContent = d.note || 'No inventory records found';
    tip.appendChild(el('div', 'tooltip-timestamp')).textContent = d.timestamp;
    return tip;
  }
  const table = el('table', 'tooltip-table');
  const multiCompany = new Set(d.rows.map(r => r.company)).size > 1;
  const cols = [];
  if (multiCompany) cols.push({ key: 'company', label: 'Company', cls: 'company' });
  cols.push({ key: 'warehouse', label: 'Warehouse', cls: 'warehouse' });
  for (const [k, label] of Object.entries(DIMS)) if (d.rows.some(r => r[k])) cols.push({ key: k, label, cls: 'dimension' });
  for (const k of d.quantities || Object.keys(QTY)) cols.push({ key: k, label: QTY[k][0], cls: QTY[k][1] });
  const hr = el('tr');
  cols.forEach(c => { const th = el('th'); th.textContent = c.label; th.dataset.col = c.key; hr.appendChild(th); });
  table.appendChild(hr);
  for (const r of d.rows) {
    const tr = el('tr');
    cols.forEach(c => {
      const td = el('td', c.cls);
      td.dataset.col = c.key;
      let v = r[c.key];
      if (c.cls === 'dimension') v = v || '-';
      td.textContent = v;
      tr.appendChild(td);
    });
    table.appendChild(tr);
  }
  tip.appendChild(table);
  tip.appendChild(el('div', 'tooltip-timestamp')).textContent = d.timestamp;
  return tip;
}

function buildLoadingTooltip() {
  return el('div', 'd365-inventory-tooltip d365-inventory-tooltip-loading',
    '<div class="tooltip-loading"><span class="tooltip-spinner"></span>Retrieving inventory...</div>');
}

// Tooltip episodes on one page: loading spinner, then the result, then gone.
class Tooltips {
  constructor(parent) { this.parent = parent; this.eps = []; }
  // (x, y) is the cursor hotspot in page coordinates; like content.js, the
  // tooltip is placed 10px right of and below it.
  add(x, y, tLoad, tReady, tHide, data) {
    const loading = buildLoadingTooltip();
    const full = buildTooltip(data);
    for (const n of [loading, full]) {
      n.style.visibility = 'hidden';
      this.parent.appendChild(n);
      // Same placement rule as positionTooltip() in content.js: shift left/up
      // when the tooltip would run off the window.
      const { width, height } = n.getBoundingClientRect();
      const vw = this.parent.clientWidth, vh = this.parent.clientHeight;
      let left = x + 10, top = y + 10;
      if (left + width > vw) left = vw - width - 10;
      if (top + height > vh) top = vh - height - 10;
      n.style.left = left + 'px';
      n.style.top = top + 'px';
    }
    const ep = { x, y, tLoad, tReady, tHide, loading, full };
    this.eps.push(ep);
    sfx(tReady, 'pop', 0.55);
    return ep;
  }
  update(t) {
    for (const ep of this.eps) {
      const on = t >= ep.tLoad && t < ep.tHide;
      const ready = t >= ep.tReady;
      ep.loading.style.visibility = on && !ready ? 'visible' : 'hidden';
      ep.full.style.visibility = on && ready ? 'visible' : 'hidden';
      if (on && !ready) {
        const sp = ep.loading.querySelector('.tooltip-spinner');
        sp.style.animation = 'none';
        sp.style.transform = `rotate(${((t - ep.tLoad) / 0.7) * 360}deg)`;
      }
      // A 90ms fade keeps the swap from strobing at 30 fps.
      ep.full.style.opacity = on ? clamp((t - ep.tReady) / 0.09) : 0;
    }
  }
}

// ---------------------------------------------------------------------------
// The extension's own popup.html / options.html, loaded as-is (markup and CSS)
// into shadow roots so their styles don't leak. Their scripts are not run -
// they need chrome.* - so demo data is filled in the way popup.js/options.js
// would render it.

const productPageCache = {};
async function loadExtensionPage(file) {
  if (!productPageCache[file]) {
    const text = await fetch('/' + file).then(r => r.text());
    const doc = new DOMParser().parseFromString(text, 'text/html');
    const css = [...doc.querySelectorAll('style')].map(s => s.textContent).join('\n')
      .replace(/(^|[\s,}])body(\s*[{,])/g, '$1.xbody$2')
      .replace(/(^|[\s,}])html(\s*[{,])/g, '$1:host$2');
    doc.querySelectorAll('script').forEach(s => s.remove());
    productPageCache[file] = { css, body: doc.body.innerHTML };
  }
  const host = el('div', 'xhost');
  const shadow = host.attachShadow({ mode: 'open' });
  const { css, body } = productPageCache[file];
  // Stand-ins for :focus while typing is simulated, and a highlight for rows
  // that just changed. Everything else is the product's own CSS.
  const extra = `.focus, .field-rename.editing { outline: 2px solid #0078d4; outline-offset: -1px; background: #fff; border-color: transparent; }
    .flash { background: #eaf4fd; border-radius: 4px; box-shadow: 0 0 0 6px #eaf4fd; }`;
  shadow.innerHTML = `<style>${css}\n${extra}</style><div class="xbody">${body}</div>`;
  return { host, root: shadow, $: s => shadow.querySelector(s), $$: s => [...shadow.querySelectorAll(s)] };
}

function renderLogs(container, logs) {
  container.innerHTML = '';
  for (const log of logs) {
    const entry = el('div', 'audit-log-entry');
    const text = el('div', 'log-item-text');
    text.appendChild(el('span', 'log-caret')).textContent = '▸';
    text.appendChild(el('span', log.ok ? 'log-success' : 'log-error')).textContent = log.ok ? '✓' : '✗';
    text.appendChild(document.createTextNode(` ${log.item} `));
    const ts = el('span'); ts.style.cssText = 'color: #999; margin-left: 8px;'; ts.textContent = log.time; text.appendChild(ts);
    const dt = el('span'); dt.style.cssText = 'color: #666; font-size: 10px; margin-left: 8px;'; dt.textContent = `(${log.details})`; text.appendChild(dt);
    entry.appendChild(text);
    if (log.url) {
      const box = el('div', 'log-detail');
      box.appendChild(el('div', 'log-detail-label')).textContent = 'Request';
      box.appendChild(el('div', 'log-detail-url')).textContent = log.url;
      box.appendChild(el('div', 'log-detail-label')).textContent = 'Response';
      box.appendChild(el('pre', 'log-detail-raw')).textContent = log.raw;
      box.appendChild(el('button', 'log-copy-btn')).textContent = 'Copy request + response';
      box.style.display = 'none';
      entry.appendChild(box);
    }
    container.appendChild(entry);
  }
}

async function buildPopup(demo) {
  const p = await loadExtensionPage('popup.html');
  p.host.classList.add('popup-host');
  p.$('#tooltip-summary').textContent = demo.summary;
  p.$('#query-today').textContent = demo.today;
  p.$('#query-total').textContent = demo.total;
  renderLogs(p.$('#audit-logs'), demo.logs);
  if (demo.site) {
    p.$('#manual-site-section').style.display = 'block';
    p.$('#manual-site-status').textContent = demo.site.status;
    p.$('#btn-add-site').style.display = demo.site.button ? 'block' : 'none';
  }
  return p;
}
