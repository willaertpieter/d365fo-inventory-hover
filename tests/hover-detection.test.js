// Drives content.js's real mouseenter / keydown handlers against a fake DOM to
// prove that ALT over the tooltip no longer triggers a lookup, while ALT over a
// genuine item number still does.
//
// Run with:  node tests/hover-detection.test.js
//
// Set PROJECT_DIR to a checkout of an earlier commit to watch it reproduce the
// tooltip-self-query bug (8 checks fail on 901777f and earlier).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PROJECT = process.env.PROJECT_DIR || path.join(__dirname, '..');

// --- minimal DOM with parentElement / closest / getAttribute -----------------
function el(tag, { className = '', text = '', attrs = {}, children = [] } = {}) {
  const node = {
    tagName: tag, className, _text: text, attrs, children: [], parentElement: null,
    get textContent() {
      return this.children.length ? this.children.map(c => c.textContent).join('') : this._text;
    },
    getAttribute(name) { return this.attrs[name] !== undefined ? this.attrs[name] : null; },
    closest(selector) {
      const cls = selector.replace(/^\./, '');
      let n = this;
      while (n) {
        if (n.className && String(n.className).split(/\s+/).includes(cls)) return n;
        n = n.parentElement;
      }
      return null;
    },
    appendChild(c) { c.parentElement = this; this.children.push(c); return c; },
    remove() {},
    querySelectorAll() { return []; },
    getBoundingClientRect() { return { width: 300, height: 200 }; },
    addEventListener() {}, removeEventListener() {},
    style: {}, dataset: {}
  };
  children.forEach(c => node.appendChild(c));
  return node;
}

const listeners = {};
const body = el('body');
const document = {
  body,
  createElement: (t) => el(t),
  addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
  querySelectorAll: () => [],
  elementFromPoint: () => null
};
const window = {
  location: { href: 'https://env.example.com/?cmp=USMF', origin: 'https://env.example.com' },
  scrollX: 0, scrollY: 0, addEventListener() {}, innerWidth: 1920, innerHeight: 1080
};
window.top = window;

const chrome = {
  storage: {
    sync: { get: (k, cb) => cb ? cb({}) : Promise.resolve({}) },
    local: { get: (k, cb) => cb ? cb({}) : Promise.resolve({}), set: () => Promise.resolve() }
  },
  runtime: { sendMessage() {}, onMessage: { addListener() {} } }
};

const ctx = vm.createContext({
  document, window, chrome, console,
  fetch: async () => { throw new Error('no network in test'); },
  URL, Date, Set, Map, JSON, Number, String, Array, Object, Promise,
  Element: function Element() {},
  encodeURIComponent, setTimeout, clearTimeout, parseInt, isNaN
});
vm.runInContext(fs.readFileSync(path.join(PROJECT, 'content-product-fields.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(PROJECT, 'content.js'), 'utf8'), ctx);

// extractItemNumber guards on `element instanceof Element`, so fake nodes have to
// inherit from the context's Element.
const ElementCtor = vm.runInContext('Element', ctx);
function tagAsElement(node) {
  Object.setPrototypeOf(node, ElementCtor.prototype);
  node.children.forEach(tagAsElement);
  return node;
}

// Record lookups instead of performing them
let lookups = [];
ctx.__record = (n) => lookups.push(n);
vm.runInContext('triggerLookup = function (itemNumber) { __record(itemNumber); };', ctx);

const fire = (type, event) => (listeners[type] || []).forEach(fn => fn(event));

let failures = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) console.log(`      expected ${JSON.stringify(expected)}\n      actual   ${JSON.stringify(actual)}`);
}

// --- the tooltip, as createTooltip actually builds it ------------------------
const timestampCell = el('div', { className: 'tooltip-timestamp', text: '09:41:22' });
const qtyCell = el('td', { className: 'physical', text: '20.8' });
const whCell = el('td', { className: 'warehouse', text: 'WH-01' });
const productValue = el('span', { className: 'product-field-value', text: 'C010042' });
const headerCell = el('div', { className: 'tooltip-header', text: 'EQ050MX0010 - Some product' });
const tooltip = el('div', {
  className: 'd365-inventory-tooltip',
  children: [
    headerCell,
    productValue,
    el('table', { children: [el('tr', { children: [whCell, qtyCell] })] }),
    timestampCell
  ]
});
body.appendChild(tooltip);
tagAsElement(tooltip);

// A genuine item number in the D365 grid
const gridCell = el('span', { text: 'ES041WM0010', attrs: { 'data-dyn-controlname': 'ItemId' } });
body.appendChild(gridCell);
tagAsElement(gridCell);

// The hover path debounces by HOVER_DEBOUNCE (150ms) - asserting synchronously
// after firing mouseenter would pass no matter what the code does.
const settle = () => new Promise(r => setTimeout(r, 250));

(async () => {
  console.log('=== ALT+hover over the tooltip (the reported bug) ===');
  const hoverCases = [
    ['timestamp', timestampCell],
    ['quantity', qtyCell],
    ['warehouse code', whCell],
    ['product field value', productValue],
    ['tooltip header', headerCell]
  ];
  for (const [what, node] of hoverCases) {
    lookups = [];
    fire('mouseenter', { target: node, altKey: true, pageX: 500, pageY: 300 });
    await settle();
    check(`mouseenter on ${what} triggers nothing`, lookups, []);
  }

  console.log('\n=== ALT pressed while cursor rests on the tooltip ===');
  for (const [what, node] of [['timestamp', timestampCell], ['quantity', qtyCell]]) {
    lookups = [];
    document.elementFromPoint = () => node;
    fire('keydown', { key: 'Alt', repeat: false }); // this path is synchronous
    check(`keydown Alt over ${what} triggers nothing`, lookups, []);
  }

  console.log('\n=== genuine item numbers still work ===');
  lookups = [];
  document.elementFromPoint = () => gridCell;
  fire('keydown', { key: 'Alt', repeat: false });
  check('keydown Alt over a grid item still queries', lookups, ['ES041WM0010']);

  lookups = [];
  fire('mouseenter', { target: gridCell, altKey: true, pageX: 100, pageY: 100 });
  await settle();
  check('mouseenter on a grid item still queries', lookups, ['ES041WM0010']);

  console.log('\n=== time-shaped strings rejected anywhere on the page ===');
  const isItem = (str) => vm.runInContext(`isItemNumber(${JSON.stringify(str)})`, ctx);
  check('09:41:22 rejected', isItem('09:41:22'), false);
  check('9:41 rejected', isItem('9:41'), false);
  check('ITEM/SKU:001 still accepted', isItem('ITEM/SKU:001'), true);
  check('EQ050MX0010 still accepted', isItem('EQ050MX0010'), true);
  check('FG0010421-01 still accepted', isItem('FG0010421-01'), true);
  check('numeric item number still accepted', isItem('100234'), true);

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
  process.exit(failures === 0 ? 0 : 1);
})();
