// Scene choreography. Each scene builds its DOM once, schedules everything
// against narration markers (M(line, marker)) and returns update(t).
'use strict';

const L = id => Stage.line(id);
const M = (id, m) => Stage.mk(id, m);

// ---------------------------------------------------------------------------
// Shared helpers

function rig(root, browserOpts) {
  const cam = new Cam(root);
  const browser = new Browser(cam.el, browserOpts);
  const spot = new Spot(cam.el);
  const cursor = new Cursor(cam.el, 1180, 720);
  const keys = new Keys(root);
  const R = node => rectIn(node, cam.el);
  return { cam, browser, spot, cursor, keys, R };
}

// Move the cursor so it arrives at (x, y) at `arrive` (or as soon after as the
// previous move allows). Returns the actual arrival time.
function moveTo(cursor, arrive, x, y, dur = 0.75) {
  const last = cursor.moves.length ? Math.max(...cursor.moves.map(m => m.t + m.dur)) : -Infinity;
  const start = Math.max(arrive - dur, last);
  return cursor.move(start, x, y, dur);
}

// Hover an item link: cursor travels there, turns into a hand, the loading
// tooltip appears after content.js's 150ms debounce, then the result.
function hoverItem(ctx, page, tips, row, col, arrive, data, { load = 0.55, hide = Infinity, dur = 0.75 } = {}) {
  const { cursor, R } = ctx;
  const link = page.link(row, col);
  const r = R(link);
  const hx = r.x + r.w * 0.58, hy = r.y + r.h * 0.62;
  const at = moveTo(cursor, arrive, hx, hy, dur);
  cursor.shape(at - 0.12, 'hand');
  page.hoverRow.set(at - 0.12, row);
  page.hoverLink.set(at - 0.12, [row, col]);
  const pr = R(page.el);
  const tLoad = at + 0.15, tReady = tLoad + load;
  const ep = tips.add(hx - pr.x, hy - pr.y, tLoad, tReady, hide, data);
  return { ep, arrive: at, ready: tReady, x: hx, y: hy };
}

function leaveItem(ctx, page, t, x, y, dur = 0.7) {
  ctx.cursor.shape(t + 0.1, 'arrow');
  page.hoverLink.set(t + 0.1, null);
  page.hoverRow.set(t + 0.1, -1);
  return moveTo(ctx.cursor, t + dur, x, y, dur);
}

// Rect of one tooltip column (header + cells).
function colRect(ctx, tip, key) {
  return union(...[...tip.querySelectorAll(`[data-col="${key}"]`)].map(n => ctx.R(n)));
}

// Words of a line revealed as they are spoken.
function wordReveal(container, lineId, text, cls = 'w') {
  const line = L(lineId);
  const words = text.split(' ');
  const times = words.length === line.words.length
    ? line.words.map(w => w.t)
    : words.map((_, i) => line.start + (i / words.length) * line.dur * 0.9);
  container.innerHTML = '';
  const spans = words.map((w, i) => {
    const s = el('span', cls);
    s.textContent = w;
    container.appendChild(s);
    if (i < words.length - 1) container.appendChild(document.createTextNode(' '));
    return s;
  });
  return t => spans.forEach((s, i) => {
    const p = prog(t, times[i] - 0.08, times[i] + 0.25, Ease.out);
    s.style.opacity = p;
    s.style.transform = `translateY(${(1 - p) * 14}px)`;
  });
}

function gfxRoot(root) {
  const g = el('div', 'gfx');
  root.appendChild(g);
  return g;
}

function popIn(node, t0, t, { dy = 18, dur = 0.5, scale = 0.96 } = {}) {
  const p = prog(t, t0, t0 + dur, Ease.outQuint);
  node.style.opacity = p;
  node.style.transform = `translateY(${(1 - p) * dy}px) scale(${scale + (1 - scale) * p})`;
  node.style.visibility = p > 0 ? 'visible' : 'hidden';
}

const SVG = {
  server: '<path d="M4 5h16v5H4zM4 14h16v5H4z"/><path d="M8 7.5h.01M8 16.5h.01"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>',
  eyeoff: '<path d="M3 3l18 18"/><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6 0 9.5 7 9.5 7a17 17 0 0 1-3.2 4.1M6.6 6.6A17 17 0 0 0 2.5 12S6 19 12 19a9.6 9.6 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  keycap: '<rect x="3.5" y="5.5" width="17" height="13" rx="3"/><path d="M8 14.5l2-6 2 6M8.7 12.5h2.6M14.5 8.5v6h2.5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  list: '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><path d="M4 6.5l1 1 2-2M4 12l1 1 2-2M4 17.5l1 1 2-2"/>',
  gauge: '<path d="M4.5 17a8.5 8.5 0 1 1 15 0"/><path d="M12 13l4-4"/><circle cx="12" cy="13" r="1.2"/>',
  gift: '<rect x="4" y="9" width="16" height="11" rx="1.5"/><path d="M12 9v11M4 13h16M12 9s-1-5-4-5-3 3 0 4 4 1 4 1zM12 9s1-5 4-5 3 3 0 4-4 1-4 1z"/>',
  bolt: '<path d="M13 3L5 13.5h6L10 21l8-10.5h-6z"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  box: '<path d="M4 7.5l8-4 8 4v9l-8 4-8-4z"/><path d="M4 7.5l8 4 8-4M12 11.5v9"/>',
  doc: '<path d="M7 3.5h7l4 4v13H7z"/><path d="M14 3.5v4h4M9.5 12h6M9.5 15.5h6"/>',
  filter: '<path d="M4 5h16l-6 7.5V19l-4 1.5v-8z"/>',
  numbers: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 15v-3M12 15V9M16 15v-5"/>',
  back: '<path d="M10 6l-6 6 6 6M4 12h16"/>',
  cursor: '<path d="M6 3.5v14.5l3.8-3.6 2.6 6 2.5-1.1-2.5-5.9h5.1z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>'
};
const svg = (name, size = 24) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${SVG[name]}</svg>`;

// ---------------------------------------------------------------------------
// 1. Hook

defineScene('hook', async (root, S) => {
  const bg = el('div', 'hook-bg');
  root.appendChild(bg);
  const b = new Browser(bg, { title: 'Sales order details -- Finance and Operations', url: URLS.sales });
  const page = d365Page(SALES_PAGE);
  b.addPage('sales', page.el);
  b.show(-1, 'sales', { load: false });
  const shade = el('div', 'hook-shade');
  root.appendChild(shade);

  const wrap = el('div', 'hook-text');
  const q = el('div', 'hook-q');
  const sub = el('div', 'hook-sub');
  wrap.append(q, sub);
  root.appendChild(wrap);
  const revealQ = wordReveal(q, 'h1', 'How much stock do we actually have?');
  sub.innerHTML = 'In Dynamics 365 Finance and Operations, answering that simple question usually means <em>leaving the page you’re working on.</em>';
  const h2 = L('h2'), leaving = M('h2', 'leaving');
  sfx(0.15, 'swell', 0.8);

  return t => {
    b.update(t);
    const p = prog(t, S.start, S.end + 0.6);
    bg.style.transform = `scale(${1.1 - 0.06 * p})`;
    bg.style.filter = `blur(${lerp(9, 4, p)}px) brightness(${lerp(0.5, 0.62, p)})`;
    shade.style.opacity = 1 - 0.3 * prog(t, 0, 1.2);
    root.style.background = '#000';
    bg.style.opacity = prog(t, 0, 1.2, Ease.out);
    revealQ(t);
    const up = prog(t, h2.start - 0.3, h2.start + 0.5, Ease.inOut);
    q.style.transform = `translateY(${-40 * up}px) scale(${1 - 0.12 * up})`;
    popIn(sub, h2.start - 0.05, t, { dy: 16 });
    sub.querySelector('em').classList.toggle('on', t >= leaving);
  };
});

// ---------------------------------------------------------------------------
// 2. The problem: the usual way to check stock

defineScene('problem', async (root, S) => {
  const g = gfxRoot(root);
  g.innerHTML = `
    <div class="prob-kicker">The usual way to check stock</div>
    <div class="prob-row"></div>
    <div class="prob-meters">
      <div class="meter">${svg('cursor', 20)}<b class="m-clicks">0</b> clicks</div>
      <div class="meter">${svg('clock', 20)}<b class="m-secs">0</b> seconds</div>
    </div>
    <div class="prob-chips"></div>
    <div class="prob-big">Dozens of times a day.</div>`;
  const steps = [
    ['s1', 'doc', 'Open the item'],
    ['s2', 'box', 'On-hand inventory'],
    ['s3', 'filter', 'Filter by warehouse'],
    ['s4', 'numbers', 'Check the numbers'],
    ['s5', 'back', 'Find your way back']
  ];
  const row = g.querySelector('.prob-row');
  const cards = steps.map(([m, icon, label], i) => {
    const c = el('div', 'prob-card', `
      <div class="pc-win"><div class="pc-bar"><i></i><span></span></div><div class="pc-body"><div class="pc-icon">${svg(icon, 34)}</div><div class="pc-lines"><i></i><i></i><i></i></div></div></div>
      <div class="pc-label"><span class="pc-num">${i + 1}</span>${label}</div>`);
    row.appendChild(c);
    const t = M('p1', m);
    sfx(t, 'click', 0.8); sfx(t + 0.22, 'click', 0.6);
    return { c, t };
  });
  const chips = g.querySelector('.prob-chips');
  const chipDefs = [['ol', 'Every order line'], ['fl', 'Every formula line'], ['ld', 'Every load']].map(([m, text]) => {
    const c = el('div', 'prob-chip', text);
    chips.appendChild(c);
    return { c, t: M('p2', m) };
  });
  const big = g.querySelector('.prob-big');
  const tDozens = M('p2', 'dozens');
  const clicksEl = g.querySelector('.m-clicks'), secsEl = g.querySelector('.m-secs');
  const tStart = M('p1', 's1');

  return t => {
    let clicks = 0;
    cards.forEach(({ c, t: ct }, i) => {
      popIn(c, ct - 0.1, t, { dy: 30 });
      if (t >= ct) clicks += 2;
      c.classList.toggle('active', t >= ct && (i === cards.length - 1 || t < cards[i + 1].t));
    });
    clicksEl.textContent = clicks;
    const secs = t < tStart ? 0 : Math.min(48, Math.round((t - tStart) * 7));
    secsEl.textContent = secs;
    popIn(g.querySelector('.prob-kicker'), S.start + 0.4, t);
    popIn(g.querySelector('.prob-meters'), tStart - 0.2, t);
    const shrink = prog(t, chipDefs[0].t - 0.4, chipDefs[0].t + 0.4, Ease.inOut);
    row.style.transform = `translateY(${-40 * shrink}px) scale(${1 - 0.18 * shrink})`;
    row.style.opacity = 1 - 0.45 * prog(t, tDozens - 0.2, tDozens + 0.4);
    chipDefs.forEach(({ c, t: ct }) => popIn(c, ct - 0.08, t, { dy: 20 }));
    popIn(big, tDozens - 0.05, t, { dy: 24, scale: 0.9 });
  };
});

// ---------------------------------------------------------------------------
// 3. Reveal

defineScene('reveal', async (root, S) => {
  const g = gfxRoot(root);
  g.innerHTML = `
    <div class="rv-faster"></div>
    <div class="rv-brand">
      <div class="rv-logo"><div class="rv-glow"></div><img src="../../icons/icon-300.png"></div>
      <div class="rv-name">D365FO Inventory Hover</div>
      <div class="rv-pills">
        <span class="pill" data-m="free">${svg('gift', 18)}Free</span>
        <span class="pill" data-m="privacy">${svg('shield', 18)}Privacy-safe</span>
        <span class="pill" data-m="edge">${svg('bolt', 18)}For Microsoft Edge</span>
      </div>
    </div>
    <div class="rv-how">
      <span class="keycap big">Alt</span><span class="rv-plus">+</span>
      <span class="rv-item">FG-10421<span class="rv-cursor">${HAND_SVG}</span></span>
      <div class="rv-tip"></div>
    </div>`;
  const faster = g.querySelector('.rv-faster');
  const revealFaster = wordReveal(faster, 'r1', 'There’s a faster way.');
  const brand = g.querySelector('.rv-brand');
  const tName = M('r2', 'name');
  const pills = [...g.querySelectorAll('.pill')].map(p => ({ p, t: M('r2', p.dataset.m) }));
  const how = g.querySelector('.rv-how');
  const tip = buildTooltip(TIPS.espresso);
  g.querySelector('.rv-tip').appendChild(tip);
  const tAlt = M('r3', 'alt'), tHover = M('r3', 'hover'), tAnswer = M('r3', 'answer');
  const key = g.querySelector('.keycap'), item = g.querySelector('.rv-item'), cur = g.querySelector('.rv-cursor');
  sfx(tName - 0.25, 'whoosh', 0.7);
  sfx(tAlt, 'key'); sfx(tAnswer, 'pop', 0.7);

  return t => {
    revealFaster(t);
    faster.style.opacity = 1 - prog(t, tName - 0.5, tName - 0.1);
    const bp = prog(t, tName - 0.2, tName + 0.7, Ease.outQuint);
    brand.style.opacity = bp;
    const lift = prog(t, L('r3').start - 0.3, L('r3').start + 0.5, Ease.inOut);
    brand.style.transform = `translateY(${(1 - bp) * 30 - 150 * lift}px) scale(${(0.94 + 0.06 * bp) * (1 - 0.22 * lift)})`;
    g.querySelector('.rv-glow').style.opacity = 0.35 + 0.25 * Math.sin(t * 2.2);
    pills.forEach(({ p, t: pt }) => popIn(p, pt - 0.1, t, { dy: 12, scale: 0.85 }));
    popIn(how, L('r3').start - 0.1, t, { dy: 30 });
    key.classList.toggle('down', t >= tAlt);
    const hp = prog(t, tHover - 0.3, tHover + 0.4, Ease.inOut);
    cur.style.transform = `translate(${lerp(90, 0, hp)}px, ${lerp(60, 0, hp)}px)`;
    item.classList.toggle('hot', t >= tHover + 0.3);
    popIn(tip, tAnswer - 0.05, t, { dy: 10, scale: 0.94 });
  };
});

// ---------------------------------------------------------------------------
// 4. Sales order lines

defineScene('sales', async (root, S) => {
  const ctx = rig(root, { title: 'Sales order details -- Finance and Operations', url: URLS.sales });
  const { cam, browser, spot, cursor, keys, R } = ctx;
  const page = d365Page(SALES_PAGE);
  browser.addPage('sales', page.el);
  browser.show(-1, 'sales', { load: false });
  const tips = new Tooltips(page.el);
  const tag = new ChapterTag(root, '01', 'See stock instantly', S.start + 0.9);

  const d1 = L('d1'), d7 = L('d7');
  moveTo(cursor, d1.start + 1.6, 640, 560, 1.4);
  const tAlt = M('d2', 'alt');
  const h = hoverItem(ctx, page, tips, 0, 'item', M('d2', 'hover') + 0.7, TIPS.espresso, { hide: M('d7', 'gone') });
  keys.hold(tAlt, M('d7', 'move'));
  const tip = h.ep.full;
  const tr = R(tip);

  // Zoom in on the tooltip while it's explained.
  cam.focus(L('d3').start + 0.1, union(tr, R(page.link(0, 'item'))), 1.62, 1.5, 0, 6);
  spot.show(L('d4').start, pad(R(tip.querySelector('.tooltip-header')), 7, 5), 'Item number and product name');
  spot.show(L('d5').start, pad(R(tip.querySelector('.tooltip-product-section')), 7, 4), 'Product details you choose');
  spot.show(M('d6', 'phys') - 0.25, pad(colRect(ctx, tip, 'physical'), 4, 4), 'Physical');
  spot.show(M('d6', 'avail') - 0.15, pad(colRect(ctx, tip, 'available'), 4, 4), 'Available');
  spot.show(M('d6', 'res') - 0.15, pad(colRect(ctx, tip, 'reserved'), 4, 4), 'Reserved');
  spot.show(M('d6', 'ord') - 0.15, pad(colRect(ctx, tip, 'ordered'), 4, 4), 'Ordered');
  spot.show(M('d6', 'onord') - 0.15, pad(colRect(ctx, tip, 'onOrder'), 4, 4), 'On order');
  spot.show(M('d6', 'color') - 0.1, pad(R(tip.querySelector('.tooltip-table')), 6, 4), 'Per warehouse, color-coded');
  spot.hide(d7.start - 0.2);
  cam.reset(d7.start - 0.1, 1.2);
  leaveItem(ctx, page, M('d7', 'move'), 900, 640, 0.8);

  return t => {
    browser.update(t); page.update(t); tips.update(t);
    cam.update(t); spot.update(t); cursor.update(t); keys.update(t); tag.update(t);
  };
});

// ---------------------------------------------------------------------------
// 5. Production order formula lines

defineScene('formula', async (root, S) => {
  const ctx = rig(root, { title: 'Formula lines -- Finance and Operations', url: URLS.formula });
  const { cam, browser, spot, cursor, keys, R } = ctx;
  cursor.x0 = 980; cursor.y0 = 700;
  const page = d365Page(FORMULA_PAGE);
  browser.addPage('formula', page.el);
  browser.show(-1, 'formula', { load: false });
  const tips = new Tooltips(page.el);
  const tag = new ChapterTag(root, '02', 'Production & BOM lines', S.start + 0.9);

  const e1 = L('e1'), e3 = L('e3');
  moveTo(cursor, e1.start + 1.4, 520, 560, 1.3);
  const tCheck = M('e2', 'check');
  keys.hold(tCheck - 0.2, S.end - 0.9);
  const h1 = hoverItem(ctx, page, tips, 3, 'item', tCheck + 0.65, TIPS.valveBag, { hide: M('e3', 'nostock') + 0.55 });
  const tip1 = h1.ep.full;
  cam.focus(h1.ready + 0.2, union(R(tip1), R(page.link(3, 'item'))), 1.5, 1.4, 0, 20);
  spot.show(M('e2', 'onorder') - 0.2, pad(colRect(ctx, tip1, 'onOrder'), 5, 4), 'On order');
  spot.hide(L('e2').end + 0.1);

  const tNo = M('e3', 'nostock');
  const h2 = hoverItem(ctx, page, tips, 4, 'item', tNo + 0.5, TIPS.label, { hide: S.end - 0.6, dur: 0.5 });
  const tip2 = h2.ep.full;
  cam.focus(h2.ready + 0.1, union(R(tip2), R(page.link(4, 'item'))), 1.5, 1.0, 0, 20);
  spot.show(M('e3', 'note') - 0.1, pad(R(tip2.querySelector('.tooltip-inventory-note')), 6, 5), 'No stock? Product details still show');
  spot.hide(e3.end + 0.3);
  cam.reset(e3.end + 0.2, 1.0);

  return t => {
    browser.update(t); page.update(t); tips.update(t);
    cam.update(t); spot.update(t); cursor.update(t); keys.update(t); tag.update(t);
  };
});

// ---------------------------------------------------------------------------
// 6. Load details, legal entity and cross-company

defineScene('load', async (root, S) => {
  const ctx = rig(root, { title: 'Load details -- Finance and Operations', url: URLS.load });
  const { cam, browser, spot, cursor, keys, R } = ctx;
  cursor.x0 = 1000; cursor.y0 = 720;
  const page = d365Page(LOAD_PAGE);
  browser.addPage('load', page.el);
  browser.show(-1, 'load', { load: false });
  const tips = new Tooltips(page.el);
  const tag = new ChapterTag(root, '03', 'Warehouse & legal entities', S.start + 0.9);

  // Toolbar popup
  const popup = await buildPopup(POPUP_DEMO);
  const pop = el('div', 'edge-popup');
  pop.appendChild(popup.host);
  browser.layer.appendChild(pop);
  const extR = browser.rect('.edge-ext');
  pop.style.left = (extR.x + extR.w + 14 - 402) + 'px';
  const chk = popup.$('#chk-cross-company');

  const f1 = L('f1'), f2 = L('f2'), f3 = L('f3'), f4 = L('f4');
  moveTo(cursor, f1.start + 0.9, 640, 520, 1.1);
  const tCheck = M('f1', 'check');
  keys.hold(tCheck - 0.15, f2.start - 0.1);
  const h1 = hoverItem(ctx, page, tips, 0, 'item', tCheck + 0.6, TIPS.machine, { hide: f2.start + 0.5 });
  cam.focus(h1.ready + 0.15, union(R(h1.ep.full), R(page.link(0, 'item'))), 1.4, 1.1, 0, 10);
  leaveItem(ctx, page, f2.start - 0.1, 700, 640, 0.7);

  // The legal entity comes from ?cmp= in the page address.
  const urlCmp = browser.measureUrlPart(URLS.load, 'cmp=USMF');
  const navCmp = R(page.el.querySelector('.d-cmp'));
  cam.to(M('f2', 'url') - 0.5, 560, 220, 1.7, 1.0);
  spot.show(M('f2', 'url') - 0.05, pad(urlCmp, 6, 4), 'Company from the page address', 0.5, 'bottom');
  spot.show(M('f2', 'switch') + 0.35, pad(navCmp, 7, 3), 'Always the company you are in', 0.9, 'bottom');
  cam.to(M('f2', 'switch') + 0.1, 1100, 220, 1.7, 1.0);
  spot.hide(f2.end + 0.2);
  cam.reset(f2.end + 0.1, 0.9);

  // Open the popup and switch on cross-company mode.
  const tOpen = M('f3', 'open'), tToggle = M('f3', 'toggle'), tShows = M('f3', 'shows');
  moveTo(cursor, tOpen, extR.x + extR.w / 2, extR.y + extR.h / 2 + 2, 1.0);
  cursor.click(tOpen);
  const popVisible = new Steps(false).set(tOpen + 0.12, true).set(tToggle + 0.55, false);
  const chkR = R(chk);
  moveTo(cursor, tToggle - 0.02, chkR.x + chkR.w / 2, chkR.y + chkR.h / 2, 0.8);
  cursor.click(tToggle);
  cam.to(tOpen + 0.1, 1180, 330, 1.35, 0.9);
  cam.reset(tToggle + 0.35, 0.9);
  keys.hold(tToggle + 1.0, f4.end + 0.4);
  const h2 = hoverItem(ctx, page, tips, 0, 'item', tShows - 0.35, TIPS.machineCross, { hide: S.end - 0.4, dur: 1.0, load: 0.5 });
  const tip2 = h2.ep.full;
  cam.focus(h2.ready + 0.2, union(R(tip2), R(page.link(0, 'item'))), 1.55, 1.1, 0, 14);
  spot.show(h2.ready + 0.9, pad(R(tip2.querySelector('.tooltip-scope-badge')), 5, 4), 'Cross-company mode');
  spot.show(M('f3', 'company') - 0.1, pad(colRect(ctx, tip2, 'company'), 4, 4), 'Company column');
  spot.show(M('f4', 'version') - 0.15, pad(colRect(ctx, tip2, 'version'), 4, 4), 'Version, because this item uses it');
  spot.hide(f4.end + 0.4);
  cam.reset(f4.end + 0.2, 0.9);

  return t => {
    browser.update(t); page.update(t); tips.update(t);
    const pv = popVisible.at(t);
    pop.style.display = pv ? '' : 'none';
    chk.checked = t >= tToggle + 0.05;
    cam.update(t); spot.update(t); cursor.update(t); keys.update(t); tag.update(t);
  };
});

// ---------------------------------------------------------------------------
// 7. Setup on first use

defineScene('setup', async (root, S) => {
  const g1 = L('g1'), g2 = L('g2'), g3 = L('g3'), g4 = L('g4'), g5 = L('g5'), g6 = L('g6');

  // Title card
  const card = gfxRoot(root);
  card.classList.add('setup-card');
  card.innerHTML = `
    <div class="sc-kicker">${svg('clock', 22)} Under a minute</div>
    <div class="sc-title">Set up in three steps</div>
    <div class="sc-steps">
      <div class="sc-step"><span>1</span>Install from Edge Add-ons</div>
      <div class="sc-step"><span>2</span>Pin to your toolbar</div>
      <div class="sc-step"><span>3</span>Open Finance and Operations</div>
    </div>`;
  const cardEnd = g2.start - 0.25;

  const stageWrap = el('div', 'setup-browser');
  root.appendChild(stageWrap);
  const ctx = rig(stageWrap, { title: 'D365FO Inventory Hover - Microsoft Edge Add-ons', favicon: 'store', url: URLS.store, pinned: false });
  const { cam, browser, spot, cursor, keys, R } = ctx;
  cursor.x0 = 900; cursor.y0 = 640;
  const store = storePage();
  browser.addPage('store', store);
  browser.show(-1, 'store', { load: false });
  const page = d365Page(SALES_PAGE);
  browser.addPage('d365', page.el);
  const tips = new Tooltips(page.el);

  // Step tracker
  const tracker = el('div', 'step-tracker', ['Install', 'Pin', 'Open D365'].map((s, i) => `<span class="st"><b>${i + 1}</b>${s}</span>`).join(''));
  stageWrap.appendChild(tracker);
  const trackerSteps = [g2.start - 0.2, g3.start - 0.2, g4.start - 0.2];

  // -- Step 1: install
  const getBtn = store.querySelector('.st-get');
  const getR = R(getBtn);
  const tGet = M('g2', 'store') + 0.15;
  moveTo(cursor, tGet - 0.05, getR.x + getR.w / 2, getR.y + getR.h / 2, 1.3);
  cursor.click(tGet);
  const dlg = el('div', 'edge-dialog install', `
    <div class="ed-title"><img src="${EXT_ICON}">Add "${EXT_NAME}" to Microsoft Edge?</div>
    <div class="ed-body">The extension can:<ul><li>Read and change your data on a number of websites</li></ul></div>
    <div class="ed-actions"><button class="primary">Add extension</button><button>Cancel</button></div>`);
  browser.layer.appendChild(dlg);
  const addR = R(dlg.querySelector('.primary'));
  const tAdd = M('g2', 'link') + 0.2;
  const dlgVis = new Steps(false).set(tGet + 0.25, true).set(tAdd + 0.15, false);
  moveTo(cursor, tAdd - 0.05, addR.x + addR.w / 2, addR.y + addR.h / 2, 0.9);
  cursor.click(tAdd);
  const added = el('div', 'edge-bubble', `<div class="eb-title"><img src="${EXT_ICON}">${EXT_NAME} has been added to Microsoft Edge</div><div class="eb-body">Find it in Extensions ${ic('puzzle')} to manage it or show it in the toolbar.</div>`);
  browser.layer.appendChild(added);
  const puzR = browser.rect('.edge-puzzle');
  added.style.left = (puzR.x + puzR.w - 380) + 'px';
  const addedVis = new Steps(false).set(tAdd + 0.45, true).set(g3.start + 0.2, false);
  sfx(tAdd + 0.45, 'chime', 0.6);
  const linkPill = el('div', 'link-pill', `${svg('link', 20)} Link in the description`);
  stageWrap.appendChild(linkPill);
  const tLink = M('g2', 'link');

  // -- Step 2: pin
  const tPin = M('g3', 'pin');
  moveTo(cursor, tPin, puzR.x + puzR.w / 2, puzR.y + puzR.h / 2 + 2, 1.0);
  cursor.click(tPin);
  const menu = el('div', 'edge-extmenu', `
    <div class="em-head"><span>Extensions</span>${ic('more')}</div>
    <div class="em-sub">Turned on</div>
    <div class="em-row"><img src="${EXT_ICON}"><span class="em-name">${EXT_NAME}</span><span class="em-eye">${ic('eye')}</span>${ic('more', 'em-more')}</div>
    <div class="em-foot"><span>${ic('puzzle')} Manage extensions</span><span>${ic('add')} Open Microsoft Edge Add-ons</span></div>`);
  browser.layer.appendChild(menu);
  menu.style.left = (puzR.x + puzR.w - 340) + 'px';
  const eyeR = R(menu.querySelector('.em-eye'));
  const tEye = M('g3', 'oneclick') - 0.45;
  moveTo(cursor, tEye - 0.02, eyeR.x + eyeR.w / 2, eyeR.y + eyeR.h / 2, 0.8);
  cursor.click(tEye);
  const menuVis = new Steps(false).set(tPin + 0.12, true).set(tEye + 0.5, false);
  browser.pinned.set(tEye + 0.1, true);
  browser.pulseExt(tEye + 0.25);
  const eyeOn = tEye + 0.1;
  const extR = browser.rect('.edge-ext');
  spot.show(tEye + 0.6, pad(extR, 4, 4), 'Always one click away', 0.4, 'bottom');
  spot.hide(g3.end + 0.3);
  cam.to(tPin - 0.4, 1250, 200, 1.6, 1.0);
  cam.reset(g3.end + 0.2, 1.0);

  // -- Step 3: open D365 - nothing to configure
  const tOpen = M('g4', 'open');
  const tEnter = browser.typeUrl(tOpen - 0.2, ENV, 26);
  browser.url.set(tEnter, URLS.sales);
  browser.title.set(tEnter + 0.2, 'Sales order details -- Finance and Operations');
  browser.favicon.set(tEnter + 0.2, 'd365');
  browser.show(tEnter + 0.15, 'd365');
  moveTo(cursor, tOpen - 0.3, 760, 110, 0.8);
  moveTo(cursor, M('g4', 'nothing') + 0.6, 1020, 600, 1.0);
  const envCard = el('div', 'env-card', `
    <div class="ec-title">${svg('check', 22)} Recognized automatically</div>
    <div class="ec-row" data-m="prod"><b>Production</b><code>*.operations.dynamics.com</code></div>
    <div class="ec-row" data-m="sandbox"><b>Sandbox / UAT</b><code>*.sandbox.operations.dynamics.com</code></div>
    <div class="ec-row" data-m="dev"><b>Cloud-hosted dev &amp; demo</b><code>*.cloudax · *.axcloud · OneBox</code></div>
    <div class="ec-row" data-m="region"><b>Every region</b><code>eu · fr · no · ch · sa · uae · gov</code></div>`);
  stageWrap.appendChild(envCard);
  const envRows = [...envCard.querySelectorAll('.ec-row')].map(r => ({ r, t: M('g4', r.dataset.m) }));
  const tEnvs = M('g4', 'envs');
  const hostR = browser.measureUrlPart(URLS.sales, ENV);
  spot.show(M('g4', 'tab') - 0.1, pad(hostR, 6, 4), 'The environment in this tab', 0.5, 'bottom');
  spot.hide(g4.end + 0.25);
  const nothingPill = el('div', 'nothing-pill', `${svg('check', 20)} Nothing to configure`);
  stageWrap.appendChild(nothingPill);
  const tNothing = M('g4', 'nothing');

  // -- First hover discovers the field list
  const tFirst = M('g5', 'first');
  keys.hold(tFirst - 0.1, g5.end + 0.3);
  const h = hoverItem(ctx, page, tips, 1, 'item', tFirst + 0.5, TIPS.decaf, { hide: g5.end + 0.5, load: 0.7 });
  const disc = el('div', 'disc-card', `
    <div class="dc-title">Reading product fields from<br><b>${ENV}</b></div>
    <div class="dc-list">${DISCOVERED_FIELDS.map(([n, ext]) => `<div class="dc-f${ext ? ' ext' : ''}"><code>${n}</code>${ext ? '<span>Extension field</span>' : ''}</div>`).join('')}</div>
    <div class="dc-count"><b class="dc-n">0</b> fields discovered</div>
    <div class="dc-default">${svg('check', 18)} 20 standard fields selected to start</div>`);
  stageWrap.appendChild(disc);
  const dcFields = [...disc.querySelectorAll('.dc-f')];
  const tReads = M('g5', 'reads'), tCustom = M('g5', 'custom'), tTwenty = M('g5', 'twenty');
  leaveItem(ctx, page, g5.end + 0.3, 1000, 640, 0.6);

  // -- Custom address: enable on this site
  const tCustomAddr = M('g6', 'custom');
  browser.url.set(g6.start - 0.1, URLS.proxy);
  browser.show(g6.start - 0.1, 'd365');
  const proxyHost = browser.measureUrlPart(URLS.proxy, ENV_PROXY);
  cam.to(tCustomAddr - 0.3, 560, 200, 1.55, 0.9);
  spot.show(tCustomAddr - 0.05, pad(proxyHost, 6, 4), 'A custom address, e.g. through a proxy', 0.5, 'bottom');
  spot.hide(M('g6', 'open') - 0.15);
  cam.reset(M('g6', 'open') - 0.4, 0.8);
  const popup = await buildPopup({ ...POPUP_DEMO, site: { status: `Not recognized as a D365 F&O environment: ${ENV_PROXY}`, button: true } });
  const pop = el('div', 'edge-popup');
  pop.appendChild(popup.host);
  browser.layer.appendChild(pop);
  pop.style.left = (extR.x + extR.w + 14 - 402) + 'px';
  const tOpenPop = M('g6', 'open') + 0.1;
  moveTo(cursor, tOpenPop, extR.x + extR.w / 2, extR.y + extR.h / 2 + 2, 0.9);
  cursor.click(tOpenPop);
  const enableR = R(popup.$('#btn-add-site'));
  const tEnable = M('g6', 'enable') + 0.1;
  moveTo(cursor, tEnable, enableR.x + enableR.w / 2, enableR.y + enableR.h / 2, 0.7);
  cursor.click(tEnable);
  cam.to(tOpenPop + 0.1, 1150, 300, 1.3, 0.8);
  const perm = el('div', 'edge-dialog perm', `
    <div class="ed-title"><img src="${EXT_ICON}">"${EXT_NAME}" requests additional permissions</div>
    <div class="ed-body">It needs to:<ul><li>Read and change your data on ${ENV_PROXY}</li></ul></div>
    <div class="ed-actions"><button class="primary">Allow</button><button>Deny</button></div>`);
  browser.layer.appendChild(perm);
  const allowR = R(perm.querySelector('.primary'));
  const tPrompt = M('g6', 'prompt');
  const tAllow = M('g6', 'ready') - 0.2;
  const permVis = new Steps(false).set(tPrompt - 0.1, true).set(tAllow + 0.15, false);
  cam.to(tPrompt - 0.3, 900, 280, 1.2, 0.8);
  moveTo(cursor, tAllow - 0.02, allowR.x + allowR.w / 2, allowR.y + allowR.h / 2, 0.8);
  cursor.click(tAllow);
  const popVis = new Steps(false).set(tOpenPop + 0.12, true).set(S.end - 0.3, false);
  const siteSection = popup.$('#manual-site-section');
  const enabled = tAllow + 0.25;
  cam.to(enabled + 0.1, 1150, 300, 1.35, 0.8);

  return t => {
    // title card -> browser
    card.style.display = t < cardEnd + 0.5 ? '' : 'none';
    card.style.opacity = 1 - prog(t, cardEnd, cardEnd + 0.5);
    popIn(card.querySelector('.sc-title'), S.start + 0.5, t);
    card.querySelectorAll('.sc-step').forEach((s, i) => popIn(s, g1.start + 0.3 + i * 0.35, t, { dy: 20 }));
    stageWrap.style.display = t >= cardEnd - 0.1 ? '' : 'none';

    browser.update(t); page.update(t); tips.update(t);
    tracker.style.opacity = fade(t, trackerSteps[0], g4.end + 0.4, 0.4, 0.4);
    tracker.querySelectorAll('.st').forEach((s, i) => {
      s.classList.toggle('on', t >= trackerSteps[i] && (i === 2 || t < trackerSteps[i + 1]));
      s.classList.toggle('done', i < 2 && t >= trackerSteps[i + 1]);
    });
    dlg.style.display = dlgVis.at(t) ? '' : 'none';
    getBtn.textContent = t >= tAdd + 0.3 ? 'Remove' : 'Get';
    added.style.display = addedVis.at(t) ? '' : 'none';
    menu.style.display = menuVis.at(t) ? '' : 'none';
    menu.querySelector('.em-eye').classList.toggle('on', t >= eyeOn);
    const lp = fade(t, tLink, tLink + 2.6, 0.3, 0.4);
    linkPill.style.display = lp > 0 ? '' : 'none';
    linkPill.style.opacity = lp;
    const np = fade(t, tNothing, tEnvs - 0.1, 0.3, 0.3);
    nothingPill.style.display = np > 0 ? '' : 'none';
    nothingPill.style.opacity = np;
    const ep = fade(t, tEnvs - 0.1, M('g4', 'tab') - 0.2, 0.4, 0.4);
    envCard.style.display = ep > 0 ? '' : 'none';
    envCard.style.opacity = ep;
    envCard.style.transform = `translateX(${(1 - prog(t, tEnvs - 0.1, tEnvs + 0.5, Ease.outQuint)) * 40}px)`;
    envRows.forEach(({ r, t: rt }) => popIn(r, rt - 0.1, t, { dy: 10 }));
    const dp = fade(t, tReads - 0.1, g5.end + 0.2, 0.4, 0.4);
    disc.style.display = dp > 0 ? '' : 'none';
    disc.style.opacity = dp;
    dcFields.forEach((f, i) => {
      const ft = tReads + i * ((tCustom - tReads + 0.4) / dcFields.length);
      popIn(f, ft, t, { dy: 6, dur: 0.25 });
      f.classList.toggle('hl', f.classList.contains('ext') && t >= tCustom);
    });
    disc.querySelector('.dc-n').textContent = Math.round(284 * prog(t, tReads, tCustom + 0.3));
    popIn(disc.querySelector('.dc-default'), tTwenty - 0.1, t, { dy: 10 });

    pop.style.display = popVis.at(t) ? '' : 'none';
    perm.style.display = permVis.at(t) ? '' : 'none';
    const isOn = t >= enabled;
    popup.$('#manual-site-status').textContent = isOn ? `Active on ${ENV_PROXY}` : `Not recognized as a D365 F&O environment: ${ENV_PROXY}`;
    popup.$('#btn-add-site').style.display = isOn ? 'none' : 'block';
    const st = popup.$('#status');
    st.className = isOn ? 'status success' : 'status';
    st.textContent = isOn ? `Enabled on ${ENV_PROXY}` : '';
    const list = popup.$('#manual-site-list');
    if (isOn && !list.children.length) list.innerHTML = `<div class="manual-site-row"><span>${ENV_PROXY}</span><button type="button" class="manual-site-remove">Remove</button></div>`;
    if (!isOn && list.children.length) list.innerHTML = '';
    siteSection.classList.toggle('flash', isOn && t < enabled + 1.2);

    cam.update(t); spot.update(t); cursor.update(t); keys.update(t);
  };
});

function storePage() {
  const s = el('div', 'store');
  s.innerHTML = `
    <div class="st-head"><span class="st-logo">${ic('puzzle')}</span><b>Edge Add-ons</b>
      <div class="st-search">${ic('search')}<span>D365FO Inventory Hover</span></div></div>
    <div class="st-wrap">
      <div class="st-side"><div class="st-side-h">Extensions</div>${['Accessibility', 'Blogging', 'Communication', 'Developer tools', 'Entertainment', 'News & weather', 'Photos', 'Productivity', 'Search tools', 'Shopping', 'Social', 'Sports'].map(c => `<div>${c}</div>`).join('')}</div>
      <div class="st-main">
        <div class="st-results">Results for “D365FO Inventory Hover”</div>
        <div class="st-card">
          <img class="st-icon" src="../../icons/icon-128.png">
          <div class="st-info">
            <div class="st-name">${EXT_NAME}</div>
            <div class="st-cat">Productivity · Free</div>
            <div class="st-desc">Hover over item numbers to see warehouse inventory levels and selected released-product fields.</div>
          </div>
          <button class="st-get">Get</button>
        </div>
        <div class="st-shots">
          <img src="../../store-assets/shot-1-hover.png"><img src="../../store-assets/shot-2-dimensions.png"><img src="../../store-assets/shot-3-settings.png">
        </div>
      </div>
    </div>`;
  return s;
}

// ---------------------------------------------------------------------------
// 8. The toolbar popup, up close

defineScene('popup', async (root, S) => {
  const bg = el('div', 'popup-bg');
  root.appendChild(bg);
  const bb = new Browser(bg, { title: 'Sales order details -- Finance and Operations', url: URLS.sales });
  const bp = d365Page(SALES_PAGE);
  bb.addPage('p', bp.el);
  bb.show(-1, 'p', { load: false });
  bb.update(0);
  const cam = new Cam(root);
  const R = n => rectIn(n, cam.el);
  const card = el('div', 'popup-card');
  const popup = await buildPopup(POPUP_DEMO);
  card.appendChild(popup.host);
  cam.el.appendChild(card);
  const spot = new Spot(cam.el);
  const cursor = new Cursor(cam.el, 1100, 760);
  const tag = new ChapterTag(root, '05', 'The toolbar popup', S.start + 0.9);

  const k1 = L('k1'), k2 = L('k2'), k3 = L('k3'), k4 = L('k4');
  const $ = s => popup.$(s);
  // Let the log box grow instead of scrolling, so an expanded entry stays in view.
  $('#audit-logs').style.maxHeight = 'none';
  const cardR = R(card);
  const refreshR = R($('#btn-clear-cache'));
  const refreshHelp = R($('#btn-clear-cache').parentElement.nextElementSibling);
  // Measure what sits below the status line with the status showing, as it
  // stays visible once set.
  const st = $('#status');
  st.className = 'status success'; st.textContent = 'Cached lookups discarded - next hover re-queries D365';
  const crossR = R($('#chk-cross-company').closest('.setting'));
  const chkR = R($('#chk-cross-company'));
  const statsR = R($('#query-stats'));
  const logsR = R($('#audit-logs').closest('.setting'));
  const entry = $('#audit-logs').children[1];
  const entryR = R(entry);
  const detail = entry.querySelector('.log-detail');
  detail.style.display = 'block';
  entry.querySelector('.log-caret').textContent = '▾';
  const detailR = R(detail);
  const copyBtn = detail.querySelector('.log-copy-btn');
  const copyR = R(copyBtn);
  detail.style.display = 'none';
  entry.querySelector('.log-caret').textContent = '▸';
  st.className = 'status'; st.textContent = '';

  cam.to(S.start, cardR.x + cardR.w / 2, 300, 1.25, 0);
  const tRefresh = M('k2', 'refresh');
  cam.to(tRefresh - 0.3, cardR.x + cardR.w / 2, 170, 1.55, 0.9);
  spot.show(tRefresh - 0.1, pad(union(refreshR, refreshHelp), 8, 6), 'Refresh inventory data');
  const tClickRefresh = tRefresh + 1.2;
  moveTo(cursor, tClickRefresh, refreshR.x + refreshR.w * 0.6, refreshR.y + refreshR.h / 2, 1.1);
  cursor.click(tClickRefresh);
  const tCross = M('k3', 'cross'), tAll = M('k3', 'all');
  cam.to(tCross - 0.4, cardR.x + cardR.w / 2, crossR.y + crossR.h / 2 + 20, 1.6, 0.9);
  spot.show(tCross - 0.1, pad(crossR, 8, 6), 'Cross-company inventory');
  moveTo(cursor, tAll - 0.02, chkR.x + chkR.w / 2, chkR.y + chkR.h / 2, 0.8);
  cursor.click(tAll);
  const tStats = M('k4', 'stats'), tLog = M('k4', 'log'), tClick = M('k4', 'click'), tCopy = M('k4', 'copy');
  cam.to(tStats - 0.4, cardR.x + cardR.w / 2, statsR.y + 60, 1.5, 0.9);
  spot.show(tStats - 0.1, pad(statsR, 8, 6), 'Query statistics');
  cam.to(tLog - 0.3, cardR.x + cardR.w / 2, logsR.y + logsR.h / 2, 1.4, 0.9);
  spot.show(tLog - 0.1, pad(logsR, 8, 6), 'Local audit trail');
  moveTo(cursor, tClick - 0.02, entryR.x + 60, entryR.y + entryR.h / 2, 0.9);
  cursor.click(tClick);
  cam.to(tClick + 0.2, cardR.x + cardR.w / 2, detailR.y + detailR.h / 2 - 30, 1.45, 1.0);
  spot.show(tClick + 0.35, pad(detailR, 6, 6), 'Exact OData request and response');
  moveTo(cursor, tCopy - 0.02, copyR.x + copyR.w / 2, copyR.y + copyR.h / 2, 0.9);
  cursor.click(tCopy);
  spot.show(tCopy + 0.1, pad(copyR, 6, 5), 'One-click copy');
  spot.hide(k4.end + 0.2);

  return t => {
    bb.update(t);
    bg.style.filter = 'blur(6px) brightness(0.55)';
    popIn(card, k1.start - 0.5, t, { dy: 30, scale: 0.94 });
    const refreshed = t >= tClickRefresh + 0.1;
    st.className = refreshed ? 'status success' : 'status';
    st.textContent = refreshed ? 'Cached lookups discarded - next hover re-queries D365' : '';
    $('#chk-cross-company').checked = t >= tAll + 0.05;
    const open = t >= tClick + 0.08;
    detail.style.display = open ? 'block' : 'none';
    entry.querySelector('.log-caret').textContent = open ? '▾' : '▸';
    copyBtn.textContent = t >= tCopy + 0.08 && t < tCopy + 2.0 ? 'Copied!' : 'Copy request + response';
    cam.update(t); spot.update(t); cursor.update(t); tag.update(t);
  };
});

// ---------------------------------------------------------------------------
// 9. Options page

defineScene('options', async (root, S) => {
  const ctx = rig(root, { title: 'Sales order details -- Finance and Operations', url: URLS.sales });
  const { cam, browser, spot, cursor, R } = ctx;
  cursor.x0 = 1100; cursor.y0 = 560;
  const page = d365Page(SALES_PAGE);
  browser.addPage('d365', page.el);
  browser.show(-1, 'd365', { load: false });
  const tag = new ChapterTag(root, '06', 'Configure the tooltip', S.start + 0.9);

  const popup = await buildPopup(POPUP_DEMO);
  const pop = el('div', 'edge-popup');
  pop.appendChild(popup.host);
  browser.layer.appendChild(pop);
  const extR = browser.rect('.edge-ext');
  pop.style.left = (extR.x + extR.w + 14 - 402) + 'px';

  // The options page, scrolled inside the browser viewport.
  const scroller = el('div', 'opt-scroll');
  const opt = await loadExtensionPage('options.html');
  scroller.appendChild(opt.host);
  const optPage = el('div', 'opt-page');
  optPage.appendChild(scroller);
  browser.addPage('options', optPage);
  fillOptions(opt);

  const o1 = L('o1'), o2 = L('o2'), o3 = L('o3'), o4 = L('o4'), o5 = L('o5');
  const cfgR = R(popup.$('#btn-open-settings'));
  const tConfigure = M('o1', 'configure') + 0.25;
  moveTo(cursor, tConfigure - 0.02, cfgR.x + cfgR.w / 2, cfgR.y + cfgR.h / 2, 1.0);
  cursor.click(tConfigure);
  const popVis = new Steps(true).set(tConfigure + 0.2, false);
  browser.show(tConfigure + 0.3, 'options');
  browser.url.set(tConfigure + 0.3, URLS.options);
  browser.title.set(tConfigure + 0.3, 'D365FO Inventory Hover - Settings');
  browser.favicon.set(tConfigure + 0.3, 'ext');
  cam.to(S.start, 1180, 330, 1.3, 0);
  cam.reset(tConfigure + 0.2, 0.9);

  const scroll = new Anim(0);
  const $ = s => opt.$(s);
  // Quantity columns: hide "Ordered", then move "Available" up.
  const qtyCard = $('#quantity-columns-list').closest('.card');
  const qtyRows = () => [...$('#quantity-columns-list').children];
  const tHide = M('o2', 'hide') + 0.35, tReorder = M('o2', 'reorder') + 0.45;
  const qR = i => R(qtyRows()[i]);
  const orderedChk = R(qtyRows()[3].querySelector('input'));
  const availUp = R(qtyRows()[1].querySelectorAll('.field-btn')[0]);
  spot.show(M('o2', 'show') - 0.2, pad(R(qtyCard), 4, 4), 'Inventory quantities');
  moveTo(cursor, tHide - 0.02, orderedChk.x + orderedChk.w / 2, orderedChk.y + orderedChk.h / 2, 0.9);
  cursor.click(tHide);
  moveTo(cursor, tReorder - 0.02, availUp.x + availUp.w / 2, availUp.y + availUp.h / 2, 0.7);
  cursor.click(tReorder);
  spot.hide(o2.end + 0.3);
  cam.to(M('o2', 'show') - 0.3, 560, 330, 1.45, 0.9);
  cam.reset(o2.end + 0.2, 0.8);

  // Product details: search, add, reorder, relabel.
  const productCard = $('#available-list').closest('.card');
  const scrollTo1 = R(productCard).y - 100;
  scroll.to(o3.start - 0.5, scrollTo1, 0.9);
  const shift = { x: 0, y: -scrollTo1 };
  const S1 = r => ({ x: r.x, y: r.y + shift.y, w: r.w, h: r.h });
  const searchR = S1(R($('#field-search')));
  const tSearch = M('o3', 'search');
  moveTo(cursor, tSearch + 0.1, searchR.x + 80, searchR.y + searchR.h / 2, 0.9);
  cursor.click(tSearch + 0.15);
  const typed = 'roast';
  const tType0 = tSearch + 0.45, tType1 = tType0 + typed.length / 9;
  for (let i = 0; i < typed.length; i++) sfx(tType0 + i / 9, 'type', 0.55);
  const tAdd = M('o3', 'add') + 0.1;
  const availList = $('#available-list');
  // Where the "+" of the filtered result will be: first row of the list.
  const listR = S1(R(availList));
  const plusPos = { x: listR.x + listR.w - 22, y: listR.y + 22 };
  moveTo(cursor, tAdd - 0.02, plusPos.x, plusPos.y, 0.8);
  cursor.click(tAdd);
  spot.show(tSearch - 0.1, pad(union(searchR, listR), 6, 6), 'Every field in your environment');
  const selList = $('#selected-list');
  const selR = S1(R(selList));
  spot.show(tAdd + 0.3, pad(selR, 6, 6), 'Shown in tooltip');
  const tUp = M('o4', 'reorder') + 0.15, tRename = M('o4', 'rename') + 0.1;
  // After adding, the list scrolls to the new (last) row.
  const rowH = 45;
  const upPos = { x: selR.x + selR.w - 86, y: selR.y + selR.h - rowH / 2 - 4 };
  moveTo(cursor, tUp - 0.02, upPos.x, upPos.y, 0.8);
  cursor.click(tUp);
  const renamePos = { x: selR.x + 110, y: selR.y + selR.h - rowH * 3.5 - 4 };
  moveTo(cursor, tRename - 0.02, renamePos.x, renamePos.y, 0.8);
  cursor.click(tRename);
  const newLabel = 'Origin region';
  const tRT0 = tRename + 0.35, tRT1 = tRT0 + newLabel.length / 11;
  for (let i = 0; i < newLabel.length; i += 2) sfx(tRT0 + i / 11, 'type', 0.5);
  spot.hide(o4.end + 0.2);
  cam.to(o3.start - 0.2, 768, 430, 1.18, 0.9);
  cam.reset(o4.end + 0.1, 0.8);

  // Display options and sharing.
  const scrollTo2 = R($('#chk-hide-empty')).y - 330;
  scroll.to(o5.start - 0.4, scrollTo2, 0.9);
  const S2 = r => ({ x: r.x, y: r.y - scrollTo2, w: r.w, h: r.h });
  const hideR = S2(R($('#chk-hide-empty').closest('.toggle-row')));
  const layoutR = S2(R($('#layout-select').closest('.row')));
  const summary = $('details summary');
  const sumR = S2(R(summary));
  spot.show(M('o5', 'hide') - 0.1, pad(hideR, 8, 6), 'Hide empty fields');
  spot.show(M('o5', 'layout') - 0.1, pad(layoutR, 8, 6), 'One or two columns');
  const tShare = M('o5', 'share') + 0.1;
  moveTo(cursor, tShare - 0.02, sumR.x + 60, sumR.y + sumR.h / 2, 0.9);
  cursor.click(tShare);
  const details = $('details');
  details.open = true;
  $('#config-json').value = JSON.stringify({
    version: 1, entity: 'ReleasedProductsV2',
    productFields: [{ name: 'InventoryUnitSymbol' }, { name: 'ItemModelGroupId' }, { name: 'TrackingDimensionGroupName' }, { name: 'TenthProductFilterCode', label: 'Origin region' }, { name: 'CTSRoastLevel' }],
    hideEmptyProductFields: true, productDetailsLayout: '2col'
  }, null, 2);
  const shareR = S2(R(details));
  details.open = false;
  spot.show(tShare + 0.35, pad(shareR, 6, 6), 'Share with your team');
  spot.hide(o5.end + 0.3);
  cam.to(M('o5', 'hide') - 0.3, 600, 420, 1.3, 0.8);
  cam.to(tShare + 0.2, 700, 520, 1.25, 0.8);
  cam.reset(o5.end + 0.2, 0.9);

  let qState = null, fState = null;
  return t => {
    browser.update(t); page.update(t);
    pop.style.display = popVis.at(t) ? '' : 'none';
    scroller.style.transform = `translateY(${-scroll.at(t)}px)`;
    // quantity columns
    const qs = t >= tReorder + 0.05 ? 2 : t >= tHide + 0.05 ? 1 : 0;
    if (qs !== qState) { renderQty(opt, qs); qState = qs; }
    // field search / add / reorder / rename
    const n = Math.round(clamp((t - tType0) / (tType1 - tType0)) * typed.length);
    const search = t >= tType0 ? typed.slice(0, n) : '';
    const added = t >= tAdd + 0.05, moved = t >= tUp + 0.05;
    const label10 = t < tRT0 ? 'Filter code 10' : t < tRT1 ? newLabel.slice(0, Math.round(prog(t, tRT0, tRT1) * newLabel.length)) : newLabel;
    const fs = `${search}|${added}|${moved}|${label10}|${t >= tRename + 0.05}`;
    if (fs !== fState) { renderFields(opt, { search, added, moved, label10, editing: t >= tRename + 0.05 && t < tRT1 + 0.6 }); fState = fs; }
    $('#field-search').classList.toggle('focus', t >= tSearch + 0.15 && t < tAdd);
    details.open = t >= tShare + 0.05;
    cam.update(t); spot.update(t); cursor.update(t); tag.update(t);
  };
});

function fillOptions(opt) {
  const $ = s => opt.$(s);
  $('#env-select').innerHTML = `<option>https://${ENV} (open, 284 fields)</option>`;
  const st = $('#env-status');
  st.textContent = '284 fields, discovered 23/09/2026, 08:58:12 - labels from D365 metadata';
  st.className = 'status-line success';
  $('#chk-hide-empty').checked = true;
  renderQty(opt, 0);
  renderFields(opt, { search: '', added: false, moved: false, label10: 'Filter code 10' });
}

function renderQty(opt, state) {
  const cols = [['Physical', true], ['Available', true], ['Reserved', true], ['Ordered', state < 1], ['On Order', true]];
  if (state >= 2) [cols[0], cols[1]] = [cols[1], cols[0]];
  opt.$('#quantity-columns-list').innerHTML = cols.map(([label, on], i) => `<div class="qty-col-row"><input type="checkbox"${on ? ' checked' : ''}><span class="qty-col-label">${label}</span><button type="button" class="field-btn"${i === 0 ? ' disabled' : ''}>↑</button><button type="button" class="field-btn"${i === cols.length - 1 ? ' disabled' : ''}>↓</button></div>`).join('');
}

function renderFields(opt, { search, added, moved, label10, editing }) {
  const needle = search.toLowerCase();
  opt.$('#field-search').value = search;
  const all = OPTION_FIELDS.available;
  const matches = all.filter(([l, n]) => !needle || l.toLowerCase().includes(needle) || n.toLowerCase().includes(needle));
  opt.$('#available-count').textContent = needle ? `${matches.length} of 284` : '284';
  opt.$('#available-list').innerHTML = matches.map(([l, n, type, chosen]) => {
    const on = chosen || (added && n === 'CTSRoastLevel');
    return `<div class="field-row"><div class="field-main"><span class="field-label">${l}</span><span class="field-name">${n}</span></div><span class="field-type">${type}</span><button type="button" class="field-btn"${on ? ' disabled' : ''}>${on ? '✓' : '+'}</button></div>`;
  }).join('');
  let sel = OPTION_FIELDS.selected.map(f => [...f]);
  sel.find(f => f[1] === 'TenthProductFilterCode')[0] = label10;
  if (added) sel.push(['Roast level', 'CTSRoastLevel']);
  if (moved) { const i = sel.length - 1; [sel[i - 1], sel[i]] = [sel[i], sel[i - 1]]; }
  opt.$('#selected-count').textContent = `${sel.length} / 40`;
  const list = opt.$('#selected-list');
  list.innerHTML = sel.map(([l, n], i) => `<div class="field-row"><div class="field-main"><input type="text" class="field-rename${editing && n === 'TenthProductFilterCode' ? ' editing' : ''}" value="${l}"><span class="field-name">${n}</span></div><button type="button" class="field-btn"${i === 0 ? ' disabled' : ''}>↑</button><button type="button" class="field-btn"${i === sel.length - 1 ? ' disabled' : ''}>↓</button><button type="button" class="field-btn remove">✕</button></div>`).join('');
  list.scrollTop = added ? list.scrollHeight : 0;
}

// ---------------------------------------------------------------------------
// 10. Privacy and performance

defineScene('privacy', async (root, S) => {
  const g = gfxRoot(root);
  const items = [
    ['q2', 'own', 'server', 'Talks only to your own D365', 'Straight from your browser to your environment'],
    ['q2', 'signin', 'key', 'Uses the sign-in you already have', 'No passwords, tokens or extra logins'],
    ['q2', 'never', 'lock', 'Collects nothing', 'Nothing is stored or sent anywhere else'],
    ['q2', 'notrack', 'eyeoff', 'No tracking, no analytics', 'No external servers, no remote code'],
    ['q3', 'roles', 'shield', 'Respects your security roles', 'Shows only what D365 already lets you see']
  ];
  const perf = [
    ['q4', 'alt', 'keycap', 'Queries only while you hold Alt', 'No accidental lookups'],
    ['q4', 'cache', 'clock', 'Five-minute cache', 'Hovering the same item again is instant'],
    ['q4', 'select', 'list', 'Only the fields you selected', 'Small, targeted OData requests'],
    ['q4', 'limit', 'gauge', 'At most 30 lookups a minute', 'And it backs off if D365 asks it to']
  ];
  const row = ([lid, m, icon, title, sub]) => `<div class="pv-item" data-l="${lid}" data-m="${m}"><span class="pv-ic">${svg(icon, 26)}</span><div><b>${title}</b><span>${sub}</span></div></div>`;
  g.innerHTML = `
    <div class="pv-col left"><div class="pv-head">${svg('shield', 34)}<span>Privacy-safe by design</span></div>${items.map(row).join('')}</div>
    <div class="pv-col right"><div class="pv-head">${svg('bolt', 34)}<span>Light on your environment</span></div>${perf.map(row).join('')}</div>`;
  const rows = [...g.querySelectorAll('.pv-item')].map(r => ({ r, t: M(r.dataset.l, r.dataset.m) }));
  const heads = g.querySelectorAll('.pv-head');
  const tSafe = M('q1', 'safe'), tLight = M('q4', 'light');
  const tag = new ChapterTag(root, '07', 'Privacy & performance', S.start + 0.9);
  rows.forEach(({ t }) => sfx(t, 'tick', 0.5));
  return t => {
    popIn(heads[0], tSafe - 0.3, t, { dy: 20 });
    popIn(heads[1], tLight - 0.1, t, { dy: 20 });
    rows.forEach(({ r, t: rt }) => popIn(r, rt - 0.12, t, { dy: 18 }));
    g.querySelector('.pv-col.right').style.opacity = 0.35 + 0.65 * prog(t, tLight - 0.2, tLight + 0.3);
    tag.update(t);
  };
});

// ---------------------------------------------------------------------------
// 11. Outro

defineScene('outro', async (root, S) => {
  const g = gfxRoot(root);
  g.innerHTML = `
    <div class="out-wrap">
      <div class="rv-logo out-logo"><div class="rv-glow"></div><img src="../../icons/icon-300.png"></div>
      <div class="out-name">D365FO Inventory Hover</div>
      <div class="out-tag">Live stock and product details, right where you work.</div>
      <div class="rv-pills out-pills">
        <span class="pill" data-m="free">${svg('gift', 18)}Free, always</span>
        <span class="pill" data-m="privacy">${svg('shield', 18)}Privacy-safe</span>
        <span class="pill" data-m="built">${svg('bolt', 18)}Built for D365 F&amp;O</span>
      </div>
      <div class="out-cta"><span class="cta-btn">Get it free on Microsoft Edge Add-ons</span><span class="cta-sub">${svg('link', 18)} Link in the description</span></div>
    </div>`;
  const pills = [...g.querySelectorAll('.pill')].map(p => ({ p, t: M('z2', p.dataset.m) }));
  const z1 = L('z1');
  const tInstall = M('z3', 'install');
  sfx(z1.start - 0.4, 'whoosh', 0.6);
  sfx(S.end - 3.5, 'swell', 0.5);
  return t => {
    popIn(g.querySelector('.out-logo'), z1.start - 0.5, t, { dy: 20, scale: 0.85, dur: 0.8 });
    popIn(g.querySelector('.out-name'), z1.start - 0.1, t, { dy: 20 });
    popIn(g.querySelector('.out-tag'), z1.start + 0.8, t, { dy: 14 });
    g.querySelector('.rv-glow').style.opacity = 0.35 + 0.25 * Math.sin(t * 2.2);
    pills.forEach(({ p, t: pt }) => popIn(p, pt - 0.1, t, { dy: 12, scale: 0.85 }));
    popIn(g.querySelector('.out-cta'), tInstall - 0.1, t, { dy: 18 });
    g.style.opacity = 1 - prog(t, S.end - 1.2, S.end + 0.2);
  };
});
