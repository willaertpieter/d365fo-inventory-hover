// Drives content.js's real mouseenter / keydown handlers against a fake DOM to
// prove that ALT over the tooltip no longer triggers a lookup, that ALT over an
// item number field does, and that no other field ever does.
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
function el(tag, { className = '', text = '', value, attrs = {}, children = [] } = {}) {
  const node = {
    tagName: tag.toUpperCase(), className, _text: text, value, attrs, children: [], parentElement: null,
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
    // Only the 'input' selector content.js uses
    querySelector(selector) {
      for (const c of this.children) {
        if (c.tagName === selector.toUpperCase()) return c;
        const found = c.querySelector(selector);
        if (found) return found;
      }
      return null;
    },
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

  // D365 renders a field as a control holding a caption and an input
  const field = (controlName, value, caption = 'Caption') => {
    const node = el('div', {
      attrs: { 'data-dyn-controlname': controlName },
      children: [
        el('label', { text: caption }),
        el('div', { children: [el('input', { value })] })
      ]
    });
    body.appendChild(node);
    return tagAsElement(node);
  };
  const input = (f) => f.children[1].children[0];
  const label = (f) => f.children[0];

  const hover = async (node) => {
    lookups = [];
    fire('mouseenter', { target: node, altKey: true, pageX: 100, pageY: 100 });
    await settle();
    return lookups;
  };

  console.log('\n=== item number fields trigger, whatever the value looks like ===');
  const itemCases = [
    ['ItemId', 'FG0010421-01'],
    ['SalesLine_ItemId', 'PACK'],
    ['InventTable_ItemId1', 'pallet 80'],
    ['InventTable_ItemIdGrid', 'FG0020017'], // released products list
    ['ProductNumber', 'RM0020011'],
    ['EcoResProduct_ProductNumber', 'EQ050MX0010'],
    ['InventTable_Product_DisplayProductNumber', 'RM0030044'] // released product details
  ];
  for (const [name, value] of itemCases) {
    check(`${name} = ${value} queries`, await hover(input(field(name, value))), [value]);
  }
  check('a variant display product number queries its product master',
    await hover(input(field('InventTable_Product_DisplayProductNumber', 'FG001 : : Red : L : '))), ['FG001']);
  check('released product variants grid queries the product master',
    await hover(input(field('EcoResDistinctProductVariant_DisplayProductNumberMainGrid', 'KIT-0001 : CFG-01 : : : :'))), ['KIT-0001']);

  const labelled = field('SalesLine_ItemId', 'FG0010421-01', 'Item number');
  check('hovering the caption queries the field value, not "Item number"', await hover(label(labelled)), ['FG0010421-01']);
  check('hovering the control itself queries the field value', await hover(labelled), ['FG0010421-01']);
  check('an empty item field triggers nothing', await hover(input(field('SalesLine_ItemId', ''))), []);
  check('a value over 50 characters triggers nothing', await hover(input(field('ItemId', 'X'.repeat(51)))), []);

  console.log('\n=== every other field is skipped, even with an item-like value ===');
  const otherCases = [
    ['InventDim_inventBatchId', '25S1-07458'],
    ['SalesLine_SalesId', 'SO-000123'],
    ['InventDim_InventLocationId', 'WH-01'],
    ['ItemGroupId', 'FG01'],
    ['InventTable_ItemName', 'Pallet 80'],
    ['ItemBuyerGroupId', 'BUY01'],
    ['SalesLine_ExternalItemId', 'CUST-4711'],
    ['ItemGroupIdGrid', 'FG01'],
    ['DistinctProductVariant_SearchNameMainGrid', 'PALLET80'],
    ['ItemIdGroup', 'G01']
  ];
  for (const [name, value] of otherCases) {
    check(`${name} = ${value} triggers nothing`, await hover(input(field(name, value))), []);
  }

  const bare = el('span', { text: 'FG0010421-01' });
  body.appendChild(bare);
  tagAsElement(bare);
  check('text outside any D365 control triggers nothing', await hover(bare), []);

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
  process.exit(failures === 0 ? 0 : 1);
})();
