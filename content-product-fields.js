// Product field support for the inventory tooltip.
//
// Loaded as a content script BEFORE content.js (see manifest.json) so the
// constants declared here are already initialised when content.js evaluates -
// content scripts of one extension share a single isolated-world global scope,
// but top-level const/let are still subject to the temporal dead zone.
//
// Scope of this file: everything about the *product* half of the tooltip that
// doesn't need content.js's mutable query state (rate-limit window, caches,
// tooltip lifecycle). That means: discovering which fields a given environment
// exposes, persisting that catalog, reading the user's field selection, and
// turning a product record into DOM. The actual fetch-with-rate-limiting and
// the tooltip orchestration stay in content.js.

// The D365 F&O data entity the product details are read from. Kept as a single
// constant (rather than inlined) because the catalog/query machinery below is
// entity-agnostic - pointing it at another entity later is a one-line change.
const PRODUCT_ENTITY = 'ReleasedProductsV2';

// How long a discovered field catalog stays fresh before it's re-fetched. Field
// lists only change when someone deploys a model extension, so this is long.
const FIELD_CATALOG_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

// Upper bound on selected fields. Two reasons, both real: chrome.storage.sync
// caps a single item at 8KB (a name + custom label averages ~70 bytes, so 40
// leaves comfortable headroom), and a tooltip with more than ~40 rows stops
// being a tooltip.
const MAX_PRODUCT_FIELDS = 40;

// What a brand-new user sees before configuring anything: standard D365 fields
// only, chosen to be useful on any implementation. Every one of these exists on
// a stock ReleasedProductsV2, and an environment missing one just skips it (see
// resolveSelectableFields), so this is safe to ship as a default everywhere.
//
// Labels are pinned rather than left to the environment because the derived
// fallbacks read poorly ("Inventory Unit Symbol", "Sales Sales Tax Item Group
// Code"). CostGroupId deliberately has none, so it picks up whatever the
// environment calls it.
//
// Mirrored in options.js for the Restore defaults button - keep both in sync.
const DEFAULT_PRODUCT_FIELDS = [
  { name: 'InventoryUnitSymbol', label: 'Inventory unit' },
  { name: 'ItemModelGroupId', label: 'Item model group' },
  { name: 'TrackingDimensionGroupName', label: 'Tracking dimension group' },
  { name: 'InventoryReservationHierarchyName', label: 'Reservation hierarchy' },
  { name: 'ProductCoverageGroupId', label: 'Coverage group' },
  { name: 'ProductionType', label: 'Production type' },
  { name: 'CostGroupId' },
  { name: 'FirstProductFilterCode', label: 'Filter code 1' },
  { name: 'SecondProductFilterCode', label: 'Filter code 2' },
  { name: 'ThirdProductFilterCode', label: 'Filter code 3' },
  { name: 'FourthProductFilterCode', label: 'Filter code 4' },
  { name: 'FifthProductFilterCode', label: 'Filter code 5' },
  { name: 'SixthProductFilterCode', label: 'Filter code 6' },
  { name: 'SeventhProductFilterCode', label: 'Filter code 7' },
  { name: 'EighthProductFilterCode', label: 'Filter code 8' },
  { name: 'NinthProductFilterCode', label: 'Filter code 9' },
  { name: 'TenthProductFilterCode', label: 'Filter code 10' },
  { name: 'PrimaryVendorAccountNumber', label: 'Primary vendor' },
  { name: 'SalesSalesTaxItemGroupCode', label: 'Tax group' },
  { name: 'UnitConversionSequenceGroupId', label: 'Unit sequence group' }
];

// Shown in place of an empty value. Kept as a constant because the "hide empty
// fields" option works by comparing against it.
const EMPTY_VALUE = '–'; // en dash

// D365 represents "no date" as a sentinel rather than null. 1900-01-01 is
// utcMin/dateNull and shows as blank in the D365 UI, so it shows as blank here
// too. The 2154-12-31 max-date sentinel is deliberately NOT blanked - in fields
// like SellEndDate it carries the real meaning "no end", and hiding it would
// lose information.
const D365_NULL_DATES = new Set([
  '1900-01-01T12:00:00Z',
  '1900-01-01T00:00:00Z'
]);

const ODATA_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/;

// OData annotations (@odata.etag, @odata.context, ...) come back alongside real
// properties but aren't selectable - they must never reach a $select clause.
function isODataAnnotation(key) {
  return typeof key === 'string' && key.startsWith('@');
}

// Escape a value for use inside a single-quoted OData string literal, then
// percent-encode it for the query string. The doubling of ' is what stops an
// item number like "O'BRIEN-01" from producing a malformed $filter (D365 item
// numbers can legitimately contain quotes, slashes and colons).
function odataLiteral(value) {
  return encodeURIComponent(String(value).replace(/'/g, "''"));
}

// Turn a property name into something readable when the Metadata API didn't
// give us a translated label. Handles the acronym-prefixed names that ISV and
// in-house extensions use: CTSCustGroup -> "CTS Cust Group", and standard
// names like BOMUnitSymbol -> "BOM Unit Symbol".
function derivePropertyLabel(name) {
  return String(name)
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .trim();
}

// Best-effort type for a property, used only to show a badge in the options
// page picker. Display formatting is driven by the value itself (see
// formatProductValue), so a wrong guess here is cosmetic.
function inferFieldType(value) {
  if (typeof value === 'number') return 'Number';
  if (typeof value === 'boolean') return 'Yes/No';
  if (typeof value === 'string') {
    if (ODATA_DATE_PATTERN.test(value)) return 'Date';
    if (value === 'Yes' || value === 'No') return 'Yes/No';
    return 'Text';
  }
  return 'Text';
}

// Map a Metadata API DataType onto the same small vocabulary as inferFieldType.
function normalizeMetadataType(dataType) {
  switch (String(dataType || '').toLowerCase()) {
    case 'int32':
    case 'int64':
    case 'real':
    case 'decimal':
      return 'Number';
    case 'date':
    case 'datetime':
    case 'utcdatetime':
      return 'Date';
    case 'enum':
      return 'Enum';
    case 'guid':
      return 'Text';
    default:
      return 'Text';
  }
}

// Render one raw OData value for display. Everything here returns a plain
// string that the caller sets via textContent - product data is untrusted input
// and must never be interpolated as HTML.
function formatProductValue(value) {
  if (value === null || value === undefined) return EMPTY_VALUE;

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value.toLocaleString() : EMPTY_VALUE;
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return EMPTY_VALUE;
    if (ODATA_DATE_PATTERN.test(trimmed)) {
      if (D365_NULL_DATES.has(trimmed)) return EMPTY_VALUE;
      const parsed = new Date(trimmed);
      return Number.isNaN(parsed.getTime()) ? trimmed : parsed.toLocaleDateString();
    }
    return trimmed;
  }

  return String(value);
}

// ---------------------------------------------------------------------------
// Field catalog: which properties this particular environment exposes
// ---------------------------------------------------------------------------
//
// Catalogs are per-environment and live in chrome.storage.local, NOT sync - a
// 285-property entity serialises to roughly 20KB, well past sync's 8KB
// per-item cap. The user's *selection* is what syncs (see
// getProductFieldsSetting), so configuration follows them across machines
// while the per-environment field list is rediscovered locally.

async function loadFieldCatalogs() {
  const { fieldCatalogs = {} } = await chrome.storage.local.get(['fieldCatalogs']);
  return fieldCatalogs;
}

async function loadFieldCatalog(origin) {
  const catalogs = await loadFieldCatalogs();
  return catalogs[origin] || null;
}

async function saveFieldCatalog(origin, catalog) {
  const catalogs = await loadFieldCatalogs();
  catalogs[origin] = catalog;
  await chrome.storage.local.set({ fieldCatalogs: catalogs });
}

function isFieldCatalogStale(catalog) {
  return !catalog || !Array.isArray(catalog.fields) || catalog.fields.length === 0 ||
    (Date.now() - (catalog.fetchedAt || 0)) > FIELD_CATALOG_TTL;
}

// Source 1 (primary): ask for a single real record and read its property names.
//
// This is deliberately the primary source rather than $metadata or the Metadata
// API, because it is the only one guaranteed to work wherever the inventory
// lookup already works - same endpoint family, same cookie, same permissions.
// It also reports exactly what THIS user can see in THIS environment, so model
// extensions (CTSCustGroup and friends) are picked up with no special casing
// and fields the user has no access to never show up as selectable.
//
// The record's values are used for type inference and then dropped on the
// floor - nothing from the probe body is stored or logged.
async function probeEntityFields(origin) {
  const url = `${origin}/data/${PRODUCT_ENTITY}?cross-company=true&$top=1`;
  const response = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    headers: { 'Accept': 'application/json' }
  });

  if (!response.ok) {
    throw new Error(`Probe failed: OData error ${response.status}`);
  }

  const json = await response.json();
  const record = (json.value || [])[0];
  if (!record) {
    throw new Error(`No ${PRODUCT_ENTITY} records exist in this environment yet`);
  }

  return Object.keys(record)
    .filter(key => !isODataAnnotation(key))
    .map(name => ({
      name,
      label: derivePropertyLabel(name),
      type: inferFieldType(record[name])
    }));
}

// Source 2 (enrichment, optional): the D365 Metadata API, which returns the
// real D365 labels in the user's own language - so CTSCustGroup shows up as
// whatever the extension's label file calls it rather than a raw identifier.
//
// Deliberately best-effort: this endpoint isn't reachable with a plain cookie
// session on every tenant/version, and the whole feature has to keep working
// where it isn't. A failure here just means derived labels.
async function fetchEntityMetadata(origin) {
  const url = `${origin}/metadata/PublicEntities(Name='${PRODUCT_ENTITY}')`;
  const response = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    headers: { 'Accept': 'application/json' }
  });

  if (!response.ok) {
    throw new Error(`Metadata API returned ${response.status}`);
  }

  const json = await response.json();
  const properties = json.Properties || (json.value && json.value[0] && json.value[0].Properties);
  if (!Array.isArray(properties)) {
    throw new Error('Metadata API response had no Properties array');
  }

  const byName = new Map();
  properties.forEach(prop => {
    if (!prop || !prop.Name) return;
    byName.set(prop.Name, {
      label: (prop.Label || '').trim() || null,
      type: normalizeMetadataType(prop.DataType),
      isKey: !!prop.IsKey,
      isMandatory: !!prop.IsMandatory
    });
  });
  return byName;
}

// Discover the field catalog for `origin` and persist it. Probe first (must
// succeed), then enrich with Metadata API labels if that endpoint answers.
async function refreshFieldCatalog(origin) {
  const fields = await probeEntityFields(origin);

  let source = 'probe';
  try {
    const metadata = await fetchEntityMetadata(origin);
    let enriched = 0;
    fields.forEach(field => {
      const meta = metadata.get(field.name);
      if (!meta) return;
      if (meta.label) {
        field.label = meta.label;
        enriched++;
      }
      field.type = meta.type;
      if (meta.isKey) field.isKey = true;
    });
    if (enriched > 0) {
      source = 'probe+metadata';
    }
  } catch (e) {
    console.log(`[D365 Inventory] Metadata API unavailable (${e.message}) - using derived labels`);
  }

  fields.sort((a, b) => a.label.localeCompare(b.label));

  const catalog = {
    entity: PRODUCT_ENTITY,
    fetchedAt: Date.now(),
    source,
    fields
  };

  await saveFieldCatalog(origin, catalog);
  chrome.runtime.sendMessage({
    action: 'logQuery',
    kind: 'catalog',
    itemNumber: PRODUCT_ENTITY,
    success: true,
    fieldCount: fields.length,
    url: `${origin}/data/${PRODUCT_ENTITY} (field discovery, ${source})`,
    raw: null // never log the probe body - it is a real product record
  });

  console.log(`[D365 Inventory] Discovered ${fields.length} ${PRODUCT_ENTITY} fields on ${origin} (${source})`);
  return catalog;
}

// ---------------------------------------------------------------------------
// User settings
// ---------------------------------------------------------------------------

// The ordered list of fields to show, as [{ name, label? }]. `label` is only
// present when the field carries a pinned label (from DEFAULT_PRODUCT_FIELDS or
// a rename in the options page). Stored in sync storage and shared by every
// environment - see resolveSelectableFields() for how a selection is reconciled
// against an environment that lacks some of them.
//
// Absent and empty mean different things, and conflating them would be a bug:
//   undefined -> never configured, so start from DEFAULT_PRODUCT_FIELDS
//   []        -> the user removed every field on purpose, so show no panel
// Without that distinction, emptying the list in the options page would silently
// refill itself with the defaults on the next hover.
async function getProductFieldsSetting() {
  const { productFields } = await chrome.storage.sync.get(['productFields']);
  if (!Array.isArray(productFields)) {
    return DEFAULT_PRODUCT_FIELDS.map(f => ({ ...f }));
  }
  return productFields
    .filter(f => f && typeof f.name === 'string' && f.name)
    .slice(0, MAX_PRODUCT_FIELDS);
}

async function getProductDisplayOptions() {
  const { hideEmptyProductFields, productDetailsLayout } =
    await chrome.storage.sync.get(['hideEmptyProductFields', 'productDetailsLayout']);
  return {
    // Default on: a typical released product has ~150 of its 285 fields empty
    // or zero, so showing them unfiltered buries the ones that matter.
    hideEmpty: hideEmptyProductFields !== false,
    layout: productDetailsLayout === '1col' ? '1col' : '2col'
  };
}

// Reconcile the (global) selection against one environment's (local) catalog.
//
// This is what makes a single configuration safe to carry across environments.
// A $select naming a property the environment doesn't have fails the WHOLE
// request with HTTP 400 - so selecting an extension field on the environment
// that has it would otherwise break the panel everywhere else. Unknown fields
// are dropped instead, and the rest still renders.
//
// With no catalog yet we can't filter, so we send the selection as-is; the
// caller recovers from a 400 by discovering the catalog and retrying once.
function resolveSelectableFields(selected, catalog) {
  if (!catalog || !Array.isArray(catalog.fields) || catalog.fields.length === 0) {
    return { fields: selected, filtered: false, dropped: [] };
  }
  const available = new Set(catalog.fields.map(f => f.name));
  const fields = selected.filter(f => available.has(f.name));
  const dropped = selected.filter(f => !available.has(f.name)).map(f => f.name);
  return { fields, filtered: true, dropped };
}

// Label to show for a selected field: the user's rename wins, then the
// catalog's (D365 or derived) label, then a label derived from the name.
function productFieldLabel(field, catalog) {
  if (field.label) return field.label;
  if (catalog && Array.isArray(catalog.fields)) {
    const entry = catalog.fields.find(f => f.name === field.name);
    if (entry && entry.label) return entry.label;
  }
  return derivePropertyLabel(field.name);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

// Build the "Product details" block shown above the inventory table.
// Built with DOM APIs only - every value here comes from the D365 response.
// Returns null when there is nothing worth showing.
function buildProductDetailsPanel(productResult, catalog, selectedFields, displayOptions) {
  if (!productResult) return null;

  const section = document.createElement('div');
  section.className = 'tooltip-product-section';

  if (productResult.error) {
    const note = document.createElement('div');
    note.className = 'tooltip-product-note';
    note.textContent = `Product details unavailable - ${productResult.message}`;
    section.appendChild(note);
    return section;
  }

  const record = productResult.record;
  if (!record) return null;

  const grid = document.createElement('div');
  grid.className = 'tooltip-product-details';
  grid.dataset.layout = displayOptions.layout;

  let rendered = 0;
  selectedFields.forEach(field => {
    if (!(field.name in record)) return;

    const formatted = formatProductValue(record[field.name]);
    if (displayOptions.hideEmpty && formatted === EMPTY_VALUE) return;

    const label = document.createElement('span');
    label.className = 'product-field-label';
    label.textContent = productFieldLabel(field, catalog);
    // The raw property name is genuinely useful when comparing environments or
    // filing a bug, but it shouldn't compete with the label for space.
    label.title = field.name;
    grid.appendChild(label);

    const value = document.createElement('span');
    value.className = 'product-field-value';
    value.textContent = formatted;
    value.title = formatted;
    grid.appendChild(value);

    rendered++;
  });

  if (rendered === 0) {
    if (!displayOptions.hideEmpty) return null;
    const note = document.createElement('div');
    note.className = 'tooltip-product-note';
    note.textContent = 'All selected product fields are empty for this item';
    section.appendChild(note);
    return section;
  }

  // Only worth naming the company when it might not be the one the user is
  // looking at - i.e. when the lookup ran cross-company.
  if (productResult.crossCompany && productResult.company) {
    const badge = document.createElement('div');
    badge.className = 'tooltip-product-company';
    badge.textContent = `Product details - ${productResult.company.toUpperCase()}`;
    section.appendChild(badge);
  }

  section.appendChild(grid);

  if (productResult.droppedFields && productResult.droppedFields.length > 0) {
    const note = document.createElement('div');
    note.className = 'tooltip-product-note';
    const count = productResult.droppedFields.length;
    note.textContent = `${count} selected field${count === 1 ? '' : 's'} not available in this environment`;
    note.title = productResult.droppedFields.join(', ');
    section.appendChild(note);
  }

  return section;
}
