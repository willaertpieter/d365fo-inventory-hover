// Exercises createTooltip()'s column selection: which product dimensions
// (Config, Color, Size, Style, Version) earn a column, and what empty cells
// render as.
//
// Run with:  node tests/tooltip-columns.test.js
//
// Fakes just enough of chrome.* and the DOM to run the real source in Node.
// Set PROJECT_DIR to an older checkout to confirm a test still catches what it guards.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PROJECT = process.env.PROJECT_DIR || path.join(__dirname, '..');

function el(tag) {
  return {
    tagName: tag, className: '', textContent: '', title: '',
    dataset: {}, style: {}, children: [],
    appendChild(c) { this.children.push(c); return c; },
    addEventListener() {}, removeEventListener() {}, remove() {},
    querySelectorAll() { return []; },
    getBoundingClientRect() { return { width: 300, height: 200 }; },
    closest() { return null; }
  };
}

const document = {
  body: el('body'),
  createElement: el,
  addEventListener() {},
  querySelectorAll: () => [],
  elementFromPoint: () => null
};
const window = {
  location: { href: 'https://env.example.com/?cmp=gbsi', origin: 'https://env.example.com' },
  scrollX: 0, scrollY: 0, addEventListener() {}, innerWidth: 1920, innerHeight: 1080
};
window.top = window;

// Mutable so a test can set productFields. Empty by default, which means
// quantity columns fall back to all five and product fields to the shipped
// defaults (only relevant where a test opts in by writing to syncStore).
const syncStore = {};
const localStore = {};
function reader(store) {
  return (keys, cb) => {
    const out = {};
    (Array.isArray(keys) ? keys : [keys]).forEach(k => { if (k in store) out[k] = store[k]; });
    return cb ? cb(out) : Promise.resolve(out);
  };
}
const chrome = {
  storage: {
    sync: { get: reader(syncStore) },
    local: { get: reader(localStore), set: () => Promise.resolve() }
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

const createTooltip = vm.runInContext('createTooltip', ctx);

let failures = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) console.log(`      expected ${JSON.stringify(expected)}\n      actual   ${JSON.stringify(actual)}`);
}

// Rows as queryInventory() builds them: every dimension key present, '' when unset.
function row(overrides) {
  return Object.assign({
    company: 'gbsi', warehouse: 'MAIN',
    config: '', color: '', size: '', style: '', version: '',
    physical: 15, available: 15, reserved: 0, ordered: 0, onOrder: 0
  }, overrides);
}

function inventory(rows, extra) {
  return Object.assign({ itemNumber: '00000043', productName: 'Powder coating', rows, crossCompany: false, timestamp: '14:24:49' }, extra);
}

async function tableOf(inv, productResult) {
  const tooltip = await createTooltip(inv, productResult || null);
  const table = tooltip.children.find(c => c.className === 'tooltip-table');
  const [headerRow, ...bodyRows] = table.children;
  return {
    headers: headerRow.children.map(th => th.textContent),
    rows: bodyRows.map(tr => tr.children.map(td => td.textContent))
  };
}

// Flattened view of a whole tooltip, for the no-inventory cases below.
async function tooltipOf(inv, productResult) {
  const tooltip = await createTooltip(inv, productResult || null);
  const byClass = (c) => tooltip.children.filter(x => x.className === c);
  const section = byClass('tooltip-product-section')[0];
  const grid = section && section.children.find(x => x.className === 'tooltip-product-details');
  const pairs = [];
  if (grid) {
    for (let i = 0; i < grid.children.length; i += 2) {
      pairs.push([grid.children[i].textContent, grid.children[i + 1].textContent]);
    }
  }
  return {
    header: byClass('tooltip-header')[0] && byClass('tooltip-header')[0].textContent,
    hasTable: tooltip.children.some(x => x.className === 'tooltip-table'),
    note: byClass('tooltip-inventory-note')[0] && byClass('tooltip-inventory-note')[0].textContent,
    timestamp: byClass('tooltip-timestamp')[0] && byClass('tooltip-timestamp')[0].textContent,
    productPairs: pairs
  };
}

// A product result shaped like fetchProductRecord() returns.
function productOf(record) {
  return { record, company: 'gbsi', crossCompany: false, droppedFields: [] };
}

(async () => {
  console.log("=== the reported case: an item with only a colour ===");
  // Exactly the sample response: ProductColorId 'Black', every other dimension ''
  let t = await tableOf(inventory([row({ color: 'Black' })]));
  check('Color column appears', t.headers, ['Warehouse', 'Color', 'Physical', 'Available', 'Reserved', 'Ordered', 'On Order']);
  check('Color value rendered', t.rows[0][1], 'Black');
  check('unused dimensions get no column', t.headers.filter(h => ['Config', 'Size', 'Style', 'Version'].includes(h)), []);

  console.log('\n=== each dimension independently earns a column ===');
  for (const [key, label, value] of [['config', 'Config', 'CFG-1'], ['color', 'Color', 'Black'],
       ['size', 'Size', 'XL'], ['style', 'Style', 'Slim'], ['version', 'Version', 'V2']]) {
    t = await tableOf(inventory([row({ [key]: value })]));
    check(`${label} alone shows just that column`, t.headers[1], label);
    check(`${label} value rendered`, t.rows[0][1], value);
  }

  console.log('\n=== several dimensions at once, in D365 order ===');
  t = await tableOf(inventory([row({ config: 'CFG-1', color: 'Black', size: 'XL', style: 'Slim', version: 'V2' })]));
  check('all five, ordered', t.headers.slice(0, 6), ['Warehouse', 'Config', 'Color', 'Size', 'Style', 'Version']);

  console.log('\n=== one item, several dimension combinations ===');
  t = await tableOf(inventory([
    row({ color: 'Black', size: 'XL' }),
    row({ color: 'White', size: 'L' }),
    row({ color: 'Black', size: '' }) // stock held without a size
  ]));
  check('columns shown once for all rows', t.headers.slice(0, 3), ['Warehouse', 'Color', 'Size']);
  check('row values kept per row', t.rows.map(r => [r[1], r[2]]), [['Black', 'XL'], ['White', 'L'], ['Black', '-']]);

  console.log('\n=== no dimensions at all ===');
  t = await tableOf(inventory([row({})]));
  check('no dimension columns', t.headers, ['Warehouse', 'Physical', 'Available', 'Reserved', 'Ordered', 'On Order']);

  console.log('\n=== OData field names, against a real WarehousesOnHandV2 response ===');
  // Verbatim from an environment: item 00000043, colour only. Guards the
  // ProductColorId / ProductSizeId / ProductStyleId / ProductVersionId spellings,
  // which the row-level tests above would not catch if one were mistyped.
  const apiRecord = {
    dataAreaId: 'gbsi', ItemNumber: '00000043', ProductColorId: 'Black',
    ProductConfigurationId: '', ProductSizeId: '', ProductStyleId: '', ProductVersionId: '',
    InventorySiteId: 'AL03', InventoryWarehouseId: 'MAIN',
    AvailableOnHandQuantity: 15, ReservedOnHandQuantity: 0, AvailableOrderedQuantity: 0,
    ProductName: 'Powder coating', ReservedOrderedQuantity: 0, OnHandQuantity: 15,
    AreWarehouseManagementProcessesUsed: 'Yes', OrderedQuantity: 0, OnOrderQuantity: 0,
    TotalAvailableQuantity: 15
  };
  ctx.fetch = async () => ({
    ok: true, status: 200,
    headers: { get: () => null },
    json: async () => ({ value: [apiRecord] })
  });
  const live = await vm.runInContext('queryInventory', ctx)(
    '00000043', 'https://env.example.com', { crossCompany: false, legalEntity: 'gbsi' }
  );
  check('row built from the response', live.rows[0], {
    company: 'gbsi', warehouse: 'MAIN',
    available: 15, reserved: 0, physical: 15, ordered: 0, onOrder: 0,
    config: '', color: 'Black', size: '', style: '', version: ''
  });
  const liveTable = await tableOf(live);
  check('tooltip shows Color for it', liveTable.headers, ['Warehouse', 'Color', 'Physical', 'Available', 'Reserved', 'Ordered', 'On Order']);
  check('with the right values', liveTable.rows[0], ['MAIN', 'Black', 15, 15, 0, 0, 0]);

  console.log('\n=== no inventory, but the item has product details ===');
  // The item exists as a released product and simply holds no stock. Before
  // 1.1.0 this discarded the product details and showed a bare message.
  const notFound = {
    itemNumber: '00000043', notFound: true,
    message: 'No inventory records found in company GBSI',
    crossCompany: false, timestamp: '14:24:49'
  };
  const product = productOf({ dataAreaId: 'gbsi', ItemNumber: '00000043', ItemModelGroupId: 'FIFO', CostGroupId: 'DIRECT' });
  syncStore.productFields = [{ name: 'ItemModelGroupId', label: 'Item model group' }, { name: 'CostGroupId', label: 'Cost group' }];

  let tt = await tooltipOf(notFound, product);
  check('header still identifies the item', tt.header, '00000043');
  check('product details are shown', tt.productPairs, [['Item model group', 'FIFO'], ['Cost group', 'DIRECT']]);
  check('no quantity table', tt.hasTable, false);
  check('the reason is stated', tt.note, 'No inventory records found in company GBSI');
  check('timestamp still present', tt.timestamp, '14:24:49');

  console.log('\n=== an inventory error with product details ===');
  tt = await tooltipOf({ itemNumber: '00000043', error: true, message: 'OData error 503', crossCompany: false, timestamp: '14:25:01' }, product);
  check('product details survive an inventory error', tt.productPairs.length, 2);
  check('error text shown in place of the table', tt.note, 'OData error 503');

  console.log('\n=== no inventory and no product details ===');
  syncStore.productFields = [];
  tt = await tooltipOf(notFound, null);
  check('no product section', tt.productPairs, []);
  check('still explains itself', tt.note, 'No inventory records found in company GBSI');
  delete syncStore.productFields;

  console.log('\n=== company column still keyed to cross-company data ===');
  t = await tableOf(inventory([row({ company: 'gbsi' }), row({ company: 'usmf' })], { crossCompany: true }));
  check('Company column appears for several companies', t.headers[0], 'Company');
  check('company upper-cased', [t.rows[0][0], t.rows[1][0]], ['GBSI', 'USMF']);
  t = await tableOf(inventory([row({ company: 'gbsi' })]));
  check('no Company column for a single company', t.headers[0], 'Warehouse');

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
  process.exit(failures === 0 ? 0 : 1);
})();
