// Exercises content-product-fields.js against the sanitised RELEASEDPRODUCTSV2
// fixture: field discovery, label derivation, OData escaping, value formatting,
// selection reconciliation and panel rendering.
//
// Run with:  node tests/product-fields.test.js
//
// Fakes just enough of chrome.* and the DOM to run the logic in Node - there is
// no build step and no test runner in this project on purpose.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PROJECT = path.join(__dirname, '..');
const raw = fs.readFileSync(path.join(PROJECT, 'RELEASEDPRODUCTSV2.txt'), 'utf8');
const sample = JSON.parse(raw.slice(raw.indexOf('{')));
const RECORDS = sample.value;

// --- fake DOM ---------------------------------------------------------------
function makeEl(tag) {
  return {
    tagName: tag, className: '', textContent: '', title: '',
    dataset: {}, children: [],
    appendChild(c) { this.children.push(c); return c; }
  };
}
const document = { createElement: makeEl };

// --- fake chrome.storage ----------------------------------------------------
const localStore = {};
const syncStore = {};
function getter(store) {
  return (keys, cb) => {
    const out = {};
    (Array.isArray(keys) ? keys : [keys]).forEach(k => { if (k in store) out[k] = store[k]; });
    if (cb) { cb(out); return; }
    return Promise.resolve(out);
  };
}
function setter(store) {
  return (obj, cb) => { Object.assign(store, obj); if (cb) { cb(); return; } return Promise.resolve(); };
}
const chrome = {
  storage: {
    local: { get: getter(localStore), set: setter(localStore) },
    sync: { get: getter(syncStore), set: setter(syncStore) }
  },
  runtime: { sendMessage() {} }
};

// --- fetch stub: serves the sample for the probe, 404 for the metadata API ---
let metadataAvailable = false;
async function fetchStub(url) {
  if (url.includes('/metadata/PublicEntities')) {
    if (!metadataAvailable) return { ok: false, status: 401, text: async () => 'Unauthorized' };
    return {
      ok: true, status: 200,
      json: async () => ({
        Properties: [
          { Name: 'ItemNumber', DataType: 'String', Label: 'Item number', IsKey: true },
          { Name: 'CTSCustGroup', DataType: 'String', Label: 'Primary customer group' },
          { Name: 'NetProductWeight', DataType: 'Real', Label: 'Net weight' },
          { Name: 'SellStartDate', DataType: 'Date', Label: 'Sales start date' }
        ]
      })
    };
  }
  if (url.includes('/data/ReleasedProductsV2')) {
    return { ok: true, status: 200, json: async () => ({ value: [RECORDS[2]] }) };
  }
  throw new Error('unexpected url ' + url);
}

const ctx = vm.createContext({
  document, chrome, fetch: fetchStub, console,
  URL, Date, Set, Map, JSON, Number, String, Array, Object, Promise,
  encodeURIComponent, setTimeout, clearTimeout, window: { top: null, location: {} }
});
vm.runInContext(fs.readFileSync(path.join(PROJECT, 'content-product-fields.js'), 'utf8'), ctx, { filename: 'content-product-fields.js' });

const run = (code) => vm.runInContext(code, ctx);
let failures = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) console.log(`      expected ${JSON.stringify(expected)}\n      actual   ${JSON.stringify(actual)}`);
}

(async () => {
  console.log('=== label derivation ===');
  check('CTSCustGroup', run("derivePropertyLabel('CTSCustGroup')"), 'CTS Cust Group');
  check('CTSItemPrimaryCustId', run("derivePropertyLabel('CTSItemPrimaryCustId')"), 'CTS Item Primary Cust Id');
  check('BOMUnitSymbol', run("derivePropertyLabel('BOMUnitSymbol')"), 'BOM Unit Symbol');
  check('ItemNumber', run("derivePropertyLabel('ItemNumber')"), 'Item Number');
  check('SADGroup', run("derivePropertyLabel('SADGroup')"), 'SAD Group');

  console.log('\n=== OData literal escaping ===');
  check('plain', run("odataLiteral('FG0010421')"), 'FG0010421');
  check('slash', run("odataLiteral('ITEM/SKU:001')"), 'ITEM%2FSKU%3A001');
  // encodeURIComponent leaves ' alone (it is legal in a query string); what matters
  // is that the OData literal has it DOUBLED so the  stays well-formed.
  check('apostrophe doubled for OData', run("odataLiteral(\"O'BRIEN-01\")"), "O''BRIEN-01");

  console.log('\n=== value formatting ===');
  check('null date sentinel', run("formatProductValue('1900-01-01T12:00:00Z')"), '\u2013');
  check('empty string', run("formatProductValue('')"), '\u2013');
  check('zero', run("formatProductValue(0)"), '0');
  check('text', run("formatProductValue('FEFO')"), 'FEFO');
  check('yes/no passthrough', run("formatProductValue('No')"), 'No');
  const realDate = run("formatProductValue('2024-10-01T12:00:00Z')");
  console.log(`INFO  real date renders as: ${realDate}`);
  check('real date is not blanked', realDate !== '\u2013', true);

  console.log('\n=== catalog discovery (probe only, metadata 401) ===');
  const catalog = await run("refreshFieldCatalog('https://env.example.com')");
  // 285 keys in the sample record, minus the @odata.etag annotation
  check('field count matches sample minus annotations', catalog.fields.length, 284);
  check('source is probe', catalog.source, 'probe');
  check('no @odata annotations leaked', catalog.fields.filter(f => f.name.startsWith('@')).length, 0);
  const alt = catalog.fields.find(f => f.name === 'CTSCustGroup');
  check('extension field discovered', !!alt, true);
  check('extension field label derived', alt.label, 'CTS Cust Group');
  check('catalog persisted', !!localStore.fieldCatalogs['https://env.example.com'], true);
  const weight = catalog.fields.find(f => f.name === 'NetProductWeight');
  check('numeric type inferred', weight.type, 'Number');
  const sellStart = catalog.fields.find(f => f.name === 'SellStartDate');
  check('date type inferred', sellStart.type, 'Date');

  console.log('\n=== catalog discovery (metadata API available) ===');
  metadataAvailable = true;
  const enriched = await run("refreshFieldCatalog('https://env2.example.com')");
  check('source records enrichment', enriched.source, 'probe+metadata');
  check('D365 label wins', enriched.fields.find(f => f.name === 'CTSCustGroup').label, 'Primary customer group');
  check('unenriched field keeps derived label', enriched.fields.find(f => f.name === 'ItemModelGroupId').label, 'Item Model Group Id');

  console.log('\n=== selection reconciliation ===');
  const selection = [{ name: 'ItemModelGroupId' }, { name: 'CTSCustGroup' }, { name: 'ZZZNotHere' }];
  const resolved = run(`resolveSelectableFields(${JSON.stringify(selection)}, ${JSON.stringify(catalog)})`);
  check('unknown field dropped', resolved.fields.map(f => f.name), ['ItemModelGroupId', 'CTSCustGroup']);
  check('dropped reported', resolved.dropped, ['ZZZNotHere']);
  const noCatalog = run(`resolveSelectableFields(${JSON.stringify(selection)}, null)`);
  check('no catalog passes selection through', noCatalog.fields.length, 3);
  check('no catalog flagged unfiltered', noCatalog.filtered, false);

  console.log('\n=== panel rendering ===');
  const record = RECORDS[2]; // EQ050MX0010, has CTSItemPrimaryCustId = C010042
  const productResult = { record, company: 'usmf', crossCompany: false, droppedFields: [] };
  const sel = [
    { name: 'ItemModelGroupId' },
    { name: 'CTSItemPrimaryCustId', label: 'Primary customer' },
    { name: 'SellStartDate' },
    { name: 'ServiceAccountingCode' } // empty string in this record
  ];
  const panel = run(`buildProductDetailsPanel(${JSON.stringify(productResult)}, ${JSON.stringify(catalog)}, ${JSON.stringify(sel)}, { hideEmpty: true, layout: '2col' })`);
  const grid = panel.children[0];
  const pairs = [];
  for (let i = 0; i < grid.children.length; i += 2) pairs.push([grid.children[i].textContent, grid.children[i + 1].textContent]);
  console.log('      rendered pairs:', JSON.stringify(pairs));
  check('empty-string field hidden', pairs.some(p => p[0].includes('Service Accounting')), false);
  check('only non-empty pairs rendered', pairs.length, 2);
  check('custom label used', pairs.find(p => p[1] === 'CUST-001')[0], 'Primary customer');
  check('null SellStartDate hidden', pairs.some(p => p[0].includes('Sell')), false);
  check('grid layout attribute', grid.dataset.layout, '2col');

  const shown = run(`buildProductDetailsPanel(${JSON.stringify(productResult)}, ${JSON.stringify(catalog)}, ${JSON.stringify(sel)}, { hideEmpty: false, layout: '1col' })`);
  check('hideEmpty off shows all 4', shown.children[0].children.length / 2, 4);

  const errPanel = run(`buildProductDetailsPanel({ error: true, message: 'OData error 400' }, null, [], { hideEmpty: true, layout: '2col' })`);
  check('error renders a note', errPanel.children[0].textContent, 'Product details unavailable - OData error 400');

  const dropPanel = run(`buildProductDetailsPanel(${JSON.stringify({ ...productResult, droppedFields: ['CTSCustGroup', 'Foo'] })}, ${JSON.stringify(catalog)}, ${JSON.stringify([{ name: 'ItemModelGroupId' }])}, { hideEmpty: true, layout: '2col' })`);
  check('dropped-field note shown', dropPanel.children[dropPanel.children.length - 1].textContent, '2 selected fields not available in this environment');

  console.log('\n=== settings defaults ===');
  const defaults = await run('getProductFieldsSetting()');
  check('a first-time user gets the curated set', defaults.length, 20);
  check('defaults start with inventory unit', defaults[0], { name: 'InventoryUnitSymbol', label: 'Inventory unit' });
  check('CostGroupId ships without a pinned label', defaults.find(f => f.name === 'CostGroupId'), { name: 'CostGroupId' });
  check('every default field exists in this environment',
    run(`resolveSelectableFields(${JSON.stringify(defaults)}, ${JSON.stringify(catalog)})`).dropped, []);

  // Absent and empty must not be conflated: emptying the list in the options
  // page would otherwise silently refill with the defaults on the next hover.
  syncStore.productFields = [];
  check('an explicitly emptied list stays empty', (await run('getProductFieldsSetting()')).length, 0);
  delete syncStore.productFields;
  check('and absent still means defaults', (await run('getProductFieldsSetting()')).length, 20);

  // popup.js and options.js can't load content-product-fields.js, so they carry
  // their own copies of the defaults. Catch either copy drifting.
  const popupSrc = fs.readFileSync(path.join(PROJECT, 'popup.js'), 'utf8');
  const popupCount = Number((/const DEFAULT_PRODUCT_FIELD_COUNT = (\d+);/.exec(popupSrc) || [])[1]);
  check('popup default count matches the curated set', popupCount, defaults.length);
  const optionsSrc = fs.readFileSync(path.join(PROJECT, 'options.js'), 'utf8');
  const optionsBlock = /const DEFAULT_PRODUCT_FIELDS = (\[[\s\S]*?\n\]);/.exec(optionsSrc)[1];
  check('options page defaults match the curated set', vm.runInNewContext(optionsBlock), defaults);

  check('hideEmpty defaults on', (await run('getProductDisplayOptions()')).hideEmpty, true);
  check('layout defaults 2col', (await run('getProductDisplayOptions()')).layout, '2col');
  syncStore.productFields = Array.from({ length: 60 }, (_, i) => ({ name: `F${i}` }));
  check('selection capped at 40', (await run('getProductFieldsSetting()')).length, 40);

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
  process.exit(failures === 0 ? 0 : 1);
})();
