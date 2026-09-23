// Turns the real RELEASEDPRODUCTSV2 capture into a shareable fixture.
//
// Keeps everything the tests depend on - all 285 property names (including the
// CTS* extension fields), each value's SHAPE (string vs number, empty vs filled,
// date-shaped vs not, enum literal vs free text), and D365's 1900-01-01 null-date
// sentinel - while replacing every real value with a synthetic one.
//
// Bias: anything not provably a standard D365 enum literal gets replaced. A
// misclassified enum only makes the fixture slightly less realistic; a
// misclassified business value would be a leak.
const fs = require('fs');

const IN = process.argv[2];
const OUT = process.argv[3];

// Standard D365 enum literals. Safe to keep - they carry no business data, and
// the tests rely on Yes/No surviving for type inference.
const ENUM_ALLOWLIST = new Set([
  'Yes', 'No', 'None', 'All', 'Item', 'Product', 'Batch', 'Day', 'Manual', 'Never',
  'Finish', 'Purch', 'Staging', 'Relevant', 'NotSet', 'NotMandatory', 'NotSpecified',
  'WarningOnly', 'NoCheck', 'OnlyNew', 'Essential', 'National', 'Formula',
  'Production', 'PurchPrice', 'PurchProdReceipt', 'AllowPartialReservation'
]);

const DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/;
const NULL_DATE = '1900-01-01T12:00:00Z'; // D365's "no date" - the tests assert on it
const NEUTRAL_DATES = ['2024-01-15T12:00:00Z', '2024-06-03T12:00:00Z', '2025-02-10T12:00:00Z'];

const RECORDS_TO_KEEP = 3;

const raw = fs.readFileSync(IN, 'utf8');
const doc = JSON.parse(raw.slice(raw.indexOf('{')));
const records = doc.value.slice(0, RECORDS_TO_KEEP);

// Which fields each distinct value appears in, so a replacement can be chosen by
// category and - crucially - applied consistently. ItemNumber and ProductNumber
// hold the same value in a record, as do SearchName and ProductSearchName;
// replacing per-field would break those relationships.
const fieldsByValue = new Map();
records.forEach(rec => Object.entries(rec).forEach(([k, v]) => {
  if (typeof v !== 'string' || v === '' || DATE_RE.test(v) || ENUM_ALLOWLIST.has(v)) return;
  if (!fieldsByValue.has(v)) fieldsByValue.set(v, new Set());
  fieldsByValue.get(v).add(k);
}));

const stringMap = new Map();
let itemSeq = 0, nameSeq = 0, custSeq = 0, genericSeq = 0;

for (const [value, fields] of fieldsByValue) {
  const names = [...fields].join(' ');
  let replacement;
  if (/dataAreaId/.test(names)) {
    replacement = 'usmf'; // Microsoft's own demo company
  } else if (/ItemNumber|ProductNumber/.test(names)) {
    replacement = `ITEM-${String(++itemSeq).padStart(4, '0')}`;
  } else if (/SearchName/.test(names)) {
    replacement = `Sample product ${++nameSeq}`;
  } else if (/Cust/.test(names)) {
    replacement = `CUST-${String(++custSeq).padStart(3, '0')}`;
  } else if (/LedgerDimension/.test(names)) {
    replacement = '000-000-000';
  } else {
    replacement = `VAL-${String(++genericSeq).padStart(2, '0')}`;
  }
  stringMap.set(value, replacement);
}

// Dates and numbers get stable synthetic values too - delivery dates and weights
// are business data even though they aren't identifiers.
const dateMap = new Map();
const numberMap = new Map();
let dateSeq = 0, intSeq = 0, floatSeq = 0;

function sanitiseValue(value) {
  if (typeof value === 'number') {
    if (value === 0) return 0; // zero vs non-zero is shape, and the tests check it
    if (!numberMap.has(value)) {
      numberMap.set(value, Number.isInteger(value) ? ++intSeq : Number((++floatSeq + 0.5).toFixed(2)));
    }
    return numberMap.get(value);
  }
  if (typeof value !== 'string') return value;
  if (value === '') return '';
  if (DATE_RE.test(value)) {
    if (value === NULL_DATE) return NULL_DATE;
    if (!dateMap.has(value)) dateMap.set(value, NEUTRAL_DATES[dateSeq++ % NEUTRAL_DATES.length]);
    return dateMap.get(value);
  }
  if (ENUM_ALLOWLIST.has(value)) return value;
  return stringMap.get(value) !== undefined ? stringMap.get(value) : 'VAL-XX';
}

const HOST = 'contoso.sandbox.operations.dynamics.com';

const sanitised = records.map(rec => {
  const out = {};
  for (const [key, value] of Object.entries(rec)) {
    if (key === '@odata.etag') {
      // Real etags encode internal RecIds and row versions
      out[key] = 'W/"JzAsMCcn"';
    } else {
      out[key] = sanitiseValue(value);
    }
  }
  return out;
});

const body = {
  '@odata.context': `https://${HOST}/data/$metadata#ReleasedProductsV2`,
  value: sanitised
};

const header = [
  `https://${HOST}/data/ReleasedProductsV2?cross-company=true&$top=${RECORDS_TO_KEEP}`,
  '',
  '# SANITISED SAMPLE - every value in this file is synthetic.',
  '# Property names and value shapes are preserved (285 properties including the',
  '# CTS* extension fields, empty strings, zeros, and D365\'s 1900-01-01 null-date',
  '# sentinel) so it exercises the same code paths as a real response.',
  '# The extension does NOT read this file - field discovery queries the live',
  '# environment. It exists only as a fixture for tests/.',
  ''
].join('\n');

fs.writeFileSync(OUT, header + '\n' + JSON.stringify(body, null, 2) + '\n');

console.log(`records:  ${records.length}`);
console.log(`props:    ${Object.keys(sanitised[0]).length}`);
console.log(`strings replaced: ${stringMap.size}, dates: ${dateMap.size}, numbers: ${numberMap.size}`);
console.log(`\nsample of the value mapping:`);
[...stringMap.entries()].slice(0, 8).forEach(([from, to]) => console.log(`  ${JSON.stringify(from).padEnd(30)} -> ${JSON.stringify(to)}`));
