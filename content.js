// D365 F&O renders form controls with a data-dyn-controlname attribute naming the
// control - the same hook Microsoft's own UI test automation relies on. A lookup
// only ever runs on a control whose name identifies it as the item number field.
//
// The value alone can't decide it: an order number, batch number or warehouse code
// looks exactly like an item number, and an item number like "PACK" looks like a
// unit or status code. So the field decides, and the value is taken as-is.
//
// Control names follow <DataSource>_<Field>, with a digit appended when a form has
// the same field twice, and "Grid" or "MainGrid" on some grid columns: "ItemId",
// "SalesLine_ItemId", "InventTable_ItemId1", "InventTable_ItemIdGrid" (released
// products list), "EcoResDistinctProductVariant_DisplayProductNumberMainGrid"
// (released product variants). The part after the last '_', without a trailing
// number, "Grid" or "MainGrid", must equal one of these names exactly
// (case-insensitive). A substring match would
// also accept ItemGroupId, ItemName, ItemBuyerGroupId or ExternalItemId (the
// customer's own item number). Add a name here if a form in your environment uses
// another one: right-click the field > Form information shows its control name.
//
// DisplayProductNumber is the "Product number" on released product details
// (InventTable_Product_DisplayProductNumber). See DISPLAY_PRODUCT_NUMBER_FIELD.
const ITEM_FIELD_NAMES = ['itemid', 'productnumber', 'displayproductnumber'];

// A product variant's display product number appends its dimensions to the product
// number: "P0001 : : Red : L : ". Only the part before the first " : " is an item
// number, so a variant shows the stock of its product master, one row per variant.
const DISPLAY_PRODUCT_NUMBER_FIELD = 'displayproductnumber';

// D365's ItemId is 20 characters by default and can be extended. Anything much
// longer is a whole block of text rather than a field value.
const ITEM_NUMBER_MAX_LENGTH = 50;

// The tooltip is appended to document.body, so it lives in the same document the
// hover and keydown listeners watch. Without this guard the tooltip feeds its own
// contents back into extractItemNumber: ALT+hovering it (or holding ALT while the
// cursor rests on it) treats whatever is under the cursor as an item number and
// fires a bogus OData lookup that replaces the tooltip being read.
//
// The tooltip carries no data-dyn-controlname, so extractItemNumber() already
// rejects it; this check says so explicitly and doesn't depend on that staying true.
function isInsideTooltip(element) {
  return !!(element && element.closest && element.closest('.d365-inventory-tooltip'));
}

// Walk up from `element` to the nearest element with a data-dyn-controlname.
function findControl(element) {
  let node = element;
  for (let i = 0; i < 10 && node; i++) {
    if (node.getAttribute) {
      const name = node.getAttribute('data-dyn-controlname');
      if (name) {
        return { element: node, name };
      }
    }
    node = node.parentElement;
  }
  return null;
}

// The item field a control name identifies ("itemid", ...), or null when it isn't
// one. See ITEM_FIELD_NAMES.
function itemFieldOf(controlName) {
  const field = controlName.split('_').pop()
    .replace(/\d+$/, '')
    .replace(/(main)?grid$/i, '')
    .toLowerCase();
  return ITEM_FIELD_NAMES.includes(field) ? field : null;
}

// Whether to show cross-company inventory (all legal entities at once) instead of
// scoping to the legal entity the user is actually viewing. Configurable in the
// popup; defaults to off. See getLegalEntityFromUrl() for why "off" still needs
// an explicit company filter rather than just leaving it up to the OData session.
function getCrossCompanySetting() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['crossCompanyEnabled'], (result) => {
      resolve(!!result.crossCompanyEnabled);
    });
  });
}

// The product dimensions WarehousesOnHandV2 reports, in the order D365 itself
// lists them. Each becomes a tooltip column only when at least one row actually
// carries a value - an item with no colour shouldn't spend a column showing
// nothing. Unlike the quantity columns below these are structural, not a user
// preference: their visibility follows the data.
//
// An item can hold stock under several dimension combinations at once, so these
// vary row to row (the same warehouse can appear once per colour, for instance).
const DIMENSION_FIELD_DEFS = [
  { key: 'config', odata: 'ProductConfigurationId', label: 'Config' },
  { key: 'color', odata: 'ProductColorId', label: 'Color' },
  { key: 'size', odata: 'ProductSizeId', label: 'Size' },
  { key: 'style', odata: 'ProductStyleId', label: 'Style' },
  { key: 'version', odata: 'ProductVersionId', label: 'Version' }
];

// The quantity columns the tooltip can show, keyed to the row fields built in
// queryInventory() below. Mirrored in options.js (which renders the show/hide +
// reorder UI) - keep both lists in sync if a field is ever added or renamed.
const QUANTITY_FIELD_DEFS = [
  { key: 'physical', label: 'Physical' },
  { key: 'available', label: 'Available' },
  { key: 'reserved', label: 'Reserved' },
  { key: 'ordered', label: 'Ordered' },
  { key: 'onOrder', label: 'On Order' }
];
const DEFAULT_QUANTITY_COLUMNS = QUANTITY_FIELD_DEFS.map(f => ({ key: f.key, visible: true }));

// Which quantity columns to show in the tooltip, and in what order. Configurable
// in the popup; defaults to all of them, Physical first (see QUANTITY_FIELD_DEFS).
function getQuantityColumnsSetting() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['quantityColumns'], (result) => {
      const stored = result.quantityColumns;
      resolve(Array.isArray(stored) && stored.length > 0 ? stored : DEFAULT_QUANTITY_COLUMNS);
    });
  });
}

// D365 F&O encodes the legal entity (company) currently being viewed as ?cmp=XYZ
// in the page URL. This is NOT necessarily the same company the OData session
// defaults to (that's the user's "startup company" from their user options) - if
// someone switches company via the D365 UI without changing their default, a plain
// unscoped OData call keeps hitting their default company regardless of what's on
// screen, which is what made the inventory popup look wrong after switching.
function getLegalEntityFromUrl() {
  try {
    return new URL(window.location.href).searchParams.get('cmp') || null;
  } catch (e) {
    return null;
  }
}

// Which legal entity (or entities) a lookup should target. Resolved once per
// lookup and shared by the inventory and product queries so the two halves of
// the tooltip can never disagree about which company they're describing.
async function resolveScope() {
  const crossCompany = await getCrossCompanySetting();
  return {
    crossCompany,
    // Only relevant (and only resolved) when NOT showing cross-company data -
    // this is what scopes the query to the legal entity actually on screen.
    legalEntity: crossCompany ? null : getLegalEntityFromUrl()
  };
}

// Short string identifying the company scope, for cache keys.
function scopeCacheKey(scope) {
  return scope.crossCompany ? 'xcompany' : (scope.legalEntity || 'default');
}

let currentTooltip = null;
let currentItemElement = null;
let currentItemNumber = null; // Track current item to prevent duplicates
let hideTimer = null;
let hoverDebounceTimer = null; // Collapses bursty mouseenter events from nested elements
let pendingHoverElement = null; // Element currently being debounced
const HOVER_DEBOUNCE = 150; // ms - only fire a query once the cursor settles on an item
let lastMouseX = 0;
let lastMouseY = 0; // Last known cursor position, so pressing ALT while already hovering works

// Cache inventory data in memory with TTL (per-tab; cleared via 'clearCacheContent' message)
const inventoryCache = new Map();
// Product details are cached separately from inventory: the key has to include
// a signature of the selected fields, so changing the selection in the options
// page invalidates the product cache without throwing away inventory data.
const productCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Client-side rate limiting: protects the shared D365 environment from being
// hammered (e.g. Alt+dragging across a dense grid fires a query per distinct
// item). Counts only actual network calls - cache hits are free and exempt.
const RATE_LIMIT_MAX_QUERIES = 30; // network calls allowed per rolling window
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
let recentQueryTimestamps = [];
let backoffUntil = 0; // set when D365 itself returns 429, to pause further calls

// Query InventSum via OData. Runs in the content script (page's own origin/cookie jar)
// so the D365 auth session cookie (SameSite=Lax) is actually sent - a background
// service-worker fetch is cross-site from the extension's perspective and gets a 401.
async function queryInventory(itemNumber, environmentUrl, scope) {
  const { crossCompany, legalEntity } = scope;

  const cacheKey = `${itemNumber}-${environmentUrl}-${scopeCacheKey(scope)}`;

  if (inventoryCache.has(cacheKey)) {
    const { data, timestamp } = inventoryCache.get(cacheKey);
    if (Date.now() - timestamp < CACHE_TTL) {
      return data;
    }
    inventoryCache.delete(cacheKey);
  }

  const now = Date.now();

  if (now < backoffUntil) {
    const waitSec = Math.ceil((backoffUntil - now) / 1000);
    return { itemNumber, rateLimited: true, message: `D365 is rate-limiting requests - retrying in ${waitSec}s` };
  }

  recentQueryTimestamps = recentQueryTimestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  if (recentQueryTimestamps.length >= RATE_LIMIT_MAX_QUERIES) {
    return { itemNumber, rateLimited: true, message: 'Too many inventory lookups - please slow down' };
  }
  recentQueryTimestamps.push(now);

  let url;

  try {
    let filter = `ItemNumber eq '${odataLiteral(itemNumber)}'`;
    let query;

    if (crossCompany) {
      // cross-company=true searches across every legal entity in the environment.
      query = `/data/WarehousesOnHandV2?cross-company=true&$filter=${filter}`;
    } else if (legalEntity) {
      // Explicitly targeting one company via OData also requires cross-company=true
      // (otherwise the request is pinned to the session's own default company,
      // regardless of this filter) - this is the documented way to override which
      // legal entity a D365 F&O OData request targets.
      filter += ` and dataAreaId eq '${odataLiteral(legalEntity)}'`;
      query = `/data/WarehousesOnHandV2?cross-company=true&$filter=${filter}`;
    } else {
      // Couldn't resolve a legal entity from the URL - fall back to the OData
      // session's own default company (the pre-existing, sometimes-wrong behavior).
      query = `/data/WarehousesOnHandV2?$filter=${filter}`;
    }

    url = `${environmentUrl}${query}`;

    console.log(`[D365 Inventory] Querying: ${url}`);

    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Accept': 'application/json',
        'OData-MaxPageSize': '500'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[D365 Inventory] OData error ${response.status}:`, errorText);

      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After'), 10);
        backoffUntil = Date.now() + (Number.isFinite(retryAfter) ? retryAfter : 30) * 1000;
      }

      const errorMsg = `OData error ${response.status}`;
      chrome.runtime.sendMessage({ action: 'logQuery', kind: 'inventory', itemNumber, success: false, warehouseCount: 0, errorMsg, url, raw: errorText });
      return { itemNumber, error: true, message: errorMsg, crossCompany, timestamp: new Date().toLocaleTimeString() };
    }

    const json = await response.json();
    const records = json.value || [];

    console.log(`[D365 Inventory] Got ${records.length} records for ${itemNumber}`, records);

    if (records.length === 0) {
      const scope = crossCompany ? '' : (legalEntity ? ` in company ${legalEntity.toUpperCase()}` : '');
      const notFoundMsg = `No inventory records found${scope}`;
      chrome.runtime.sendMessage({ action: 'logQuery', kind: 'inventory', itemNumber, success: false, warehouseCount: 0, errorMsg: notFoundMsg, url, raw: records });
      return { itemNumber, notFound: true, message: notFoundMsg, crossCompany, timestamp: new Date().toLocaleTimeString() };
    }

    // Flatten into rows rather than nesting by warehouse/config - with cross-company
    // data, the same warehouse code can legitimately appear in more than one company,
    // and a nested object keyed by warehouse+config would silently collide/overwrite.
    const rows = records.map(rec => {
      const row = {
        company: rec.dataAreaId || '',
        warehouse: rec.InventoryWarehouseId || 'Unknown',
        available: rec.AvailableOnHandQuantity || 0,
        reserved: rec.ReservedOnHandQuantity || 0,
        physical: rec.OnHandQuantity || 0,
        ordered: rec.OrderedQuantity || 0,
        onOrder: rec.OnOrderQuantity || 0
      };
      // Unset dimensions come back as '' from OData; kept as '' rather than a
      // placeholder so "is this dimension used at all?" is a plain truthiness
      // test in createTooltip().
      DIMENSION_FIELD_DEFS.forEach(dim => {
        row[dim.key] = rec[dim.odata] || '';
      });
      return row;
    });

    let productName = null;
    for (const rec of records) {
      if (rec.ProductName) {
        productName = rec.ProductName;
        break;
      }
    }

    const result = {
      itemNumber,
      productName,
      rows,
      crossCompany,
      timestamp: new Date().toLocaleTimeString()
    };

    inventoryCache.set(cacheKey, { data: result, timestamp: Date.now() });
    console.log(`[D365 Inventory] Result:`, result);

    const warehouseCount = new Set(rows.map(r => r.warehouse)).size;
    chrome.runtime.sendMessage({ action: 'logQuery', kind: 'inventory', itemNumber, success: true, warehouseCount, errorMsg: null, url, raw: records });

    return result;

  } catch (error) {
    console.error('[D365 Inventory] Query failed:', error);
    chrome.runtime.sendMessage({ action: 'logQuery', kind: 'inventory', itemNumber, success: false, warehouseCount: 0, errorMsg: error.message, url, raw: null });
    return { itemNumber, error: true, message: error.message, crossCompany, timestamp: new Date().toLocaleTimeString() };
  }
}

// Query ReleasedProductsV2 for the product fields the user selected in the
// options page. Runs in parallel with queryInventory() and is strictly additive:
// any failure here leaves the inventory table untouched.
//
// Returns null when the feature isn't in use (no fields selected), so the call
// costs nothing at all for users who never configure it.
async function queryProductFields(itemNumber, environmentUrl, scope) {
  const selected = await getProductFieldsSetting();
  if (selected.length === 0) {
    return null;
  }

  const fieldSignature = selected.map(f => f.name).join(',');
  const cacheKey = `${itemNumber}-${environmentUrl}-${scopeCacheKey(scope)}-${fieldSignature}`;

  if (productCache.has(cacheKey)) {
    const { data, timestamp } = productCache.get(cacheKey);
    if (Date.now() - timestamp < CACHE_TTL) {
      return data;
    }
    productCache.delete(cacheKey);
  }

  // The product call rides along with an inventory lookup that has already
  // taken a slot from the rolling window, so it checks the budget but doesn't
  // consume one - a hover stays "one lookup" no matter how many requests it
  // takes. It still honours a 429 backoff, which is the limit that matters.
  const now = Date.now();
  if (now < backoffUntil) {
    return { error: true, message: 'D365 is rate-limiting requests' };
  }
  if (recentQueryTimestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS).length > RATE_LIMIT_MAX_QUERIES) {
    return { error: true, message: 'Too many lookups - please slow down' };
  }

  let catalog = await loadFieldCatalog(environmentUrl);
  let result = await fetchProductRecord(itemNumber, environmentUrl, scope, selected, catalog);

  // A $select naming a property this environment doesn't have fails the whole
  // request with 400. That's the expected outcome the first time a selection
  // built on one environment is used on another, so recover once: discover the
  // real catalog, drop what isn't there, and retry.
  if (result && result.error && result.status === 400) {
    try {
      catalog = await refreshFieldCatalog(environmentUrl);
      result = await fetchProductRecord(itemNumber, environmentUrl, scope, selected, catalog);
    } catch (e) {
      console.log('[D365 Inventory] Could not refresh field catalog after 400:', e.message);
    }
  }

  // Cache successes AND the "no released product here" null result - without
  // the latter, an item that has inventory but no product record would re-query
  // on every single hover.
  if (!result || !result.error) {
    productCache.set(cacheKey, { data: result, timestamp: Date.now() });
  }

  return result;
}

// One attempt at the product record, with `selected` reconciled against
// `catalog`. Split out from queryProductFields so the 400-recovery path can
// re-run it with a freshly discovered catalog.
async function fetchProductRecord(itemNumber, environmentUrl, scope, selected, catalog) {
  const { crossCompany, legalEntity } = scope;
  const { fields, dropped } = resolveSelectableFields(selected, catalog);

  if (fields.length === 0) {
    return {
      error: true,
      message: `none of the selected fields exist on ${PRODUCT_ENTITY} here`
    };
  }

  // dataAreaId and ItemNumber are always requested (regardless of selection) so
  // the response can be matched back to the right company.
  const selectNames = Array.from(new Set(['dataAreaId', 'ItemNumber', ...fields.map(f => f.name)]));

  let filter = `ItemNumber eq '${odataLiteral(itemNumber)}'`;
  if (!crossCompany && legalEntity) {
    filter += ` and dataAreaId eq '${odataLiteral(legalEntity)}'`;
  }

  // cross-company=true is required even when filtering to a single company -
  // without it the request is pinned to the OData session's default company
  // and the dataAreaId filter is silently ignored. Same reasoning as the
  // inventory query above.
  // $top bounds the response: without a company filter an item can exist in
  // every legal entity in the environment.
  const url = `${environmentUrl}/data/${PRODUCT_ENTITY}` +
    `?cross-company=true&$top=10` +
    `&$select=${encodeURIComponent(selectNames.join(','))}` +
    `&$filter=${filter}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[D365 Inventory] Product OData error ${response.status}:`, errorText);

      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After'), 10);
        backoffUntil = Date.now() + (Number.isFinite(retryAfter) ? retryAfter : 30) * 1000;
      }

      chrome.runtime.sendMessage({
        action: 'logQuery', kind: 'product', itemNumber, success: false,
        errorMsg: `OData error ${response.status}`, url, raw: errorText
      });
      return { error: true, status: response.status, message: `OData error ${response.status}` };
    }

    const json = await response.json();
    const records = json.value || [];

    if (records.length === 0) {
      chrome.runtime.sendMessage({
        action: 'logQuery', kind: 'product', itemNumber, success: false,
        errorMsg: `No ${PRODUCT_ENTITY} record found`, url, raw: null
      });
      return null; // Item has inventory but no released product here - just omit the panel
    }

    // Product master data is per-company, so with several records back prefer
    // the company the user is actually looking at; otherwise take the first and
    // label it (see the company badge in buildProductDetailsPanel).
    const pageCompany = getLegalEntityFromUrl();
    const record =
      (pageCompany && records.find(r => (r.dataAreaId || '').toLowerCase() === pageCompany.toLowerCase())) ||
      records[0];

    chrome.runtime.sendMessage({
      action: 'logQuery', kind: 'product', itemNumber, success: true,
      fieldCount: fields.length, url, raw: records
    });

    // Deliberately does NOT carry the catalog: this object goes into
    // productCache once per item, and a 284-field catalog copied into every
    // cache entry would be pure waste. createTooltip reads it from storage.
    return {
      record,
      company: record.dataAreaId || '',
      crossCompany,
      droppedFields: dropped
    };

  } catch (error) {
    console.error('[D365 Inventory] Product query failed:', error);
    chrome.runtime.sendMessage({
      action: 'logQuery', kind: 'product', itemNumber, success: false,
      errorMsg: error.message, url, raw: null
    });
    return { error: true, message: error.message };
  }
}

// Make sure this environment's field catalog exists, so the options page has
// something to offer the moment the user opens it.
//
// Fire-and-forget and deliberately not awaited by the hover path - discovery
// costs one or two requests per environment per week and must never delay a
// tooltip. Guarded to the top frame because the content script runs in every
// frame (all_frames: true), and every frame of a D365 form would otherwise
// kick off the same discovery at once.
let catalogRefreshAttempted = false;
function ensureFieldCatalogInBackground(environmentUrl) {
  if (catalogRefreshAttempted || window.top !== window) return;
  catalogRefreshAttempted = true;

  loadFieldCatalog(environmentUrl).then(catalog => {
    if (!isFieldCatalogStale(catalog)) return;
    return refreshFieldCatalog(environmentUrl);
  }).catch(e => {
    console.log('[D365 Inventory] Field discovery skipped:', e.message);
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Clear local caches when requested from the popup
  if (request.action === 'clearCacheContent') {
    inventoryCache.clear();
    productCache.clear();
    return;
  }

  // The options page can't fetch D365 itself - an extension-origin request
  // doesn't carry the SameSite=Lax auth cookie and gets a 401 - so it asks a
  // content script in a live D365 tab to do the discovery and reply.
  if (request.action === 'refreshFieldCatalog') {
    catalogRefreshAttempted = true;
    refreshFieldCatalog(window.location.origin)
      .then(catalog => sendResponse({
        ok: true,
        origin: window.location.origin,
        fieldCount: catalog.fields.length,
        source: catalog.source
      }))
      .catch(error => sendResponse({
        ok: false,
        origin: window.location.origin,
        error: error.message
      }));
    return true; // Keep the channel open for the async response
  }
});

// The item number under the cursor, or null unless the cursor is on an item number
// field (see ITEM_FIELD_NAMES). Anything outside a D365 control - form captions,
// messages, the tooltip - is never looked up.
function extractItemNumber(element) {
  if (!element || !(element instanceof Element)) return null;

  const control = findControl(element);
  if (!control) {
    return null;
  }
  const field = itemFieldOf(control.name);
  if (!field) {
    logSkippedField(control.name);
    return null;
  }

  // A D365 field control holds its value in an <input>, next to a <label> with the
  // caption ("Item number"). Reading the input means the caption is never taken for
  // an item number, and hovering the caption shows the field's item.
  let value;
  const input = element.tagName === 'INPUT'
    ? element
    : (control.element.querySelector && control.element.querySelector('input'));
  if (input) {
    value = input.value;
  } else if (!isInsideLabel(element, control.element) && !(element.children && element.children.length > 0)) {
    // A control rendered as plain text: use the hovered text itself, unless it's a
    // caption, or a container whose text would run several values together.
    value = element.textContent;
  } else {
    return null;
  }

  if (field === DISPLAY_PRODUCT_NUMBER_FIELD && typeof value === 'string') {
    value = value.split(' : ')[0];
  }
  return cleanItemNumber(value);
}

function isInsideLabel(element, stopAt) {
  for (let node = element; node && node !== stopAt; node = node.parentElement) {
    if (node.tagName === 'LABEL') {
      return true;
    }
  }
  return false;
}

// The field decides whether this is an item number, so any single-line value of a
// plausible length is accepted: "PACK", "pallet 80", "09:41" if that's the item.
function cleanItemNumber(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > ITEM_NUMBER_MAX_LENGTH || /[\r\n\t]/.test(text)) {
    return null;
  }
  return text;
}

// Alt+hover over a field that isn't an item number logs the field's control name
// once, so a form that names its item field differently can be spotted in the
// console without inspecting the page's elements.
let lastSkippedControlName = null;
function logSkippedField(controlName) {
  if (controlName !== lastSkippedControlName) {
    lastSkippedControlName = controlName;
    console.log(`[D365 Inventory] Not an item number field, skipped: ${controlName}`);
  }
}

// Small spinner tooltip shown while the OData call is in flight, so a slow
// response doesn't look like the extension is simply not working
function createLoadingTooltip() {
  const tooltip = document.createElement('div');
  tooltip.className = 'd365-inventory-tooltip d365-inventory-tooltip-loading';
  tooltip.innerHTML = `
    <div class="tooltip-loading">
      <span class="tooltip-spinner"></span>
      Retrieving inventory...
    </div>
  `;
  return tooltip;
}

// Short informational/error tooltip (e.g. "No inventory records found")
function createMessageTooltip(message, variant = 'info') {
  const tooltip = document.createElement('div');
  tooltip.className = 'd365-inventory-tooltip d365-inventory-tooltip-message';
  const text = document.createElement('div');
  text.className = `tooltip-message tooltip-message-${variant}`;
  text.textContent = message;
  tooltip.appendChild(text);
  return tooltip;
}

// Create tooltip element. Built with DOM APIs (not innerHTML) because
// productName/warehouse/config/company come from the D365 OData response -
// untrusted data that must never be interpreted as HTML.
async function createTooltip(inventory, productResult) {
  const tooltip = document.createElement('div');
  tooltip.className = 'd365-inventory-tooltip';

  const header = document.createElement('div');
  header.className = 'tooltip-header';
  // ReleasedProductsV2 has no ProductName property (only SearchName /
  // ProductSearchName), so the display name still comes from the inventory
  // response - the product panel below is purely additive.
  header.textContent = inventory.productName
    ? `${inventory.itemNumber} - ${inventory.productName}`
    : inventory.itemNumber;
  tooltip.appendChild(header);

  if (inventory.crossCompany) {
    const badge = document.createElement('div');
    badge.className = 'tooltip-scope-badge';
    badge.textContent = 'All companies (cross-company)';
    tooltip.appendChild(badge);
  }

  if (productResult) {
    const selected = await getProductFieldsSetting();
    const displayOptions = await getProductDisplayOptions();
    const catalog = await loadFieldCatalog(window.location.origin);
    const panel = buildProductDetailsPanel(productResult, catalog, selected, displayOptions);
    if (panel) {
      tooltip.appendChild(panel);
    }
  }

  // An item can exist as a released product and hold no stock at all, which is
  // itself worth seeing. When there are no inventory rows but product details
  // came back, the panel above still renders and the table is replaced by a
  // note explaining why it's missing.
  if (!inventory.rows || inventory.rows.length === 0) {
    const note = document.createElement('div');
    note.className = 'tooltip-inventory-note';
    note.textContent = inventory.message || 'No inventory records found';
    tooltip.appendChild(note);

    const stamp = document.createElement('div');
    stamp.className = 'tooltip-timestamp';
    stamp.textContent = inventory.timestamp || '';
    tooltip.appendChild(stamp);
    return tooltip;
  }

  const table = document.createElement('table');
  table.className = 'tooltip-table';

  // Only show a column when it'd actually add information - no point dedicating
  // one to the same value (or a dash) on every row. A dimension earns its column
  // as soon as ANY row carries a value for it: with several rows back, one
  // colour being blank is itself meaningful, so the column stays for all of them.
  const hasMultipleCompanies = new Set(inventory.rows.map(r => r.company)).size > 1;
  const dimensionColumns = DIMENSION_FIELD_DEFS.map(dim => ({
    key: dim.key,
    label: dim.label,
    cls: 'dimension',
    show: inventory.rows.some(r => r[dim.key])
  }));

  // Company/Warehouse/dimensions are structural (their visibility depends on the
  // data itself, not user preference) and always come first. The quantity columns
  // after them are user-configurable - which ones show, and in what order.
  const structuralColumns = [
    { key: 'company', label: 'Company', cls: 'company', show: hasMultipleCompanies },
    { key: 'warehouse', label: 'Warehouse', cls: 'warehouse', show: true }
  ].concat(dimensionColumns);

  const quantityLabels = new Map(QUANTITY_FIELD_DEFS.map(f => [f.key, f.label]));
  const quantityColumnCls = { onOrder: 'on-order' }; // camelCase keys vs. kebab-case CSS classes
  const quantityColumnsSetting = await getQuantityColumnsSetting();
  const quantityColumns = quantityColumnsSetting
    .filter(c => c.visible && quantityLabels.has(c.key))
    .map(c => ({ key: c.key, label: quantityLabels.get(c.key), cls: quantityColumnCls[c.key] || c.key, show: true }));

  const columns = structuralColumns.concat(quantityColumns).filter(col => col.show);

  const headerRow = document.createElement('tr');
  columns.forEach(col => {
    const th = document.createElement('th');
    th.textContent = col.label;
    headerRow.appendChild(th);
  });
  table.appendChild(headerRow);

  inventory.rows.forEach(row => {
    const tr = document.createElement('tr');
    columns.forEach(col => {
      const td = document.createElement('td');
      td.className = col.cls;
      let value = row[col.key];
      if (col.cls === 'dimension') {
        // The column is showing because SOME row uses this dimension; rows that
        // don't get a dash rather than a blank cell.
        value = value || '-';
      } else if (col.key === 'company') {
        value = (value || '').toUpperCase();
      }
      td.textContent = value;
      tr.appendChild(td);
    });
    table.appendChild(tr);
  });

  tooltip.appendChild(table);

  const timestamp = document.createElement('div');
  timestamp.className = 'tooltip-timestamp';
  timestamp.textContent = inventory.timestamp;
  tooltip.appendChild(timestamp);

  return tooltip;
}

// Position tooltip near cursor
function positionTooltip(tooltip, pageX, pageY) {
  let left = pageX + 10;
  let top = pageY + 10;

  // Remove if already in DOM
  if (tooltip.parentNode) {
    tooltip.remove();
  }
  
  document.body.appendChild(tooltip);
  
  const tooltipRect = tooltip.getBoundingClientRect();
  if (left + tooltipRect.width > window.innerWidth) {
    left = window.innerWidth - tooltipRect.width - 10;
  }
  if (top + tooltipRect.height > window.innerHeight) {
    top = window.innerHeight - tooltipRect.height - 10;
  }

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

// Hide tooltip immediately
function hideTooltip() {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  if (currentTooltip) {
    currentTooltip.remove();
    currentTooltip = null;
  }
  currentItemElement = null;
  currentItemNumber = null;
  
  // Clean up any orphaned tooltips
  document.querySelectorAll('.d365-inventory-tooltip').forEach(el => {
    try { el.remove(); } catch (e) {}
  });
}

// Schedule tooltip hide (with delay to allow moving to it)
function scheduleHide() {
  if (hideTimer) {
    clearTimeout(hideTimer);
  }
  hideTimer = setTimeout(() => {
    hideTooltip();
  }, 1000); // 1 second delay to allow moving to tooltip
}

// Cancel pending hide
function cancelHide() {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
}

// Keep tooltip visible when hovering over it
function attachTooltipListeners() {
  if (!currentTooltip) return;
  
  // Remove old listeners to prevent duplicates
  currentTooltip.removeEventListener('mouseenter', cancelHide);
  currentTooltip.removeEventListener('mouseleave', scheduleHide);
  
  // Add fresh listeners
  currentTooltip.addEventListener('mouseenter', cancelHide, { once: false });
  currentTooltip.addEventListener('mouseleave', scheduleHide, { once: false });
}

// Actually perform (or reuse from cache) the inventory lookup and show the tooltip.
// Runs after the hover has settled on `itemNumber` for HOVER_DEBOUNCE ms.
function triggerLookup(itemNumber, targetElement, pageX, pageY) {
  cancelHide();
  hideTooltip();
  currentItemElement = targetElement;
  currentItemNumber = itemNumber;

  console.log('[D365 Inventory] Querying inventory for:', itemNumber);

  // Show a spinner right away - the OData call can take a couple of seconds,
  // and a cache hit will just replace this almost instantly.
  const loadingTooltip = createLoadingTooltip();
  positionTooltip(loadingTooltip, pageX, pageY);
  currentTooltip = loadingTooltip;
  attachTooltipListeners();

  const environmentUrl = window.location.origin;
  ensureFieldCatalogInBackground(environmentUrl);

  // Inventory and product details are fetched in parallel, so adding product
  // fields costs no extra latency. allSettled (rather than all) guarantees a
  // failing product call can never take the inventory table down with it.
  resolveScope().then(scope => Promise.allSettled([
    queryInventory(itemNumber, environmentUrl, scope),
    queryProductFields(itemNumber, environmentUrl, scope)
  ])).then(async ([inventorySettled, productSettled]) => {
    const inventory = inventorySettled.status === 'fulfilled' ? inventorySettled.value : null;
    let productResult = productSettled.status === 'fulfilled' ? productSettled.value : null;
    if (productSettled.status === 'rejected') {
      console.error('[D365 Inventory] Product lookup rejected:', productSettled.reason);
      productResult = { error: true, message: 'lookup failed' };
    }

    // The user may have moved to a different item while this (or a cached
    // result) resolved - don't clobber whatever is showing now.
    if (currentItemNumber !== itemNumber) {
      return;
    }
    if (currentTooltip) {
      currentTooltip.remove();
    }

    const hasInventoryRows = !!(inventory && inventory.rows && inventory.rows.length > 0);
    // An item with no stock still has master data worth showing. As long as the
    // product lookup came back with a record, render the full tooltip and let
    // createTooltip() put a note where the quantity table would be, rather than
    // throwing the product details away for a bare "No inventory records found".
    const hasProductDetails = !!(productResult && !productResult.error && productResult.record);

    if (hasInventoryRows || (hasProductDetails && inventory)) {
      console.log('[D365 Inventory] Showing tooltip for:', itemNumber);
      const tooltip = await createTooltip(inventory, productResult);
      // The user may have moved on again while the tooltip column settings loaded
      if (currentItemNumber !== itemNumber) {
        return;
      }
      positionTooltip(tooltip, pageX, pageY);
      currentTooltip = tooltip;
      attachTooltipListeners();
    } else if (inventory && (inventory.notFound || inventory.error || inventory.rateLimited)) {
      console.log('[D365 Inventory] No inventory data for:', itemNumber, inventory.message);
      const variant = inventory.error ? 'error' : (inventory.rateLimited ? 'warning' : 'info');
      const tooltip = createMessageTooltip(inventory.message, variant);
      positionTooltip(tooltip, pageX, pageY);
      currentTooltip = tooltip;
      attachTooltipListeners();
    } else {
      hideTooltip();
    }
  });
}

// Main hover handler
function handleMouseEnter(event) {
  if (!event || !event.target) {
    return;
  }

  // Keep cursor position fresh even if the dedicated mousemove listener hasn't
  // fired yet (e.g. the very first hover after the page loads)
  lastMouseX = event.pageX;
  lastMouseY = event.pageY;

  // Never treat our own tooltip's contents as an item number. This listener is on
  // document in the CAPTURE phase, so it fires for elements inside the tooltip too.
  if (isInsideTooltip(event.target)) {
    return;
  }

  // REQUIRE ALT key to be held at the moment of hovering. Checking event.altKey
  // directly (rather than tracking keydown/keyup/focus state) means this can't get
  // stuck if focus moves away from the document (e.g. into an iframe or dialog).
  if (!event.altKey) {
    return;
  }

  const itemNumber = extractItemNumber(event.target);

  if (!itemNumber) {
    return;
  }

  // If already showing tooltip for this item, just keep it open
  if (currentItemNumber === itemNumber && currentTooltip) {
    cancelHide();
    return;
  }

  // Already debouncing this exact element - nothing to do
  if (pendingHoverElement === event.target) {
    return;
  }

  if (hoverDebounceTimer) {
    clearTimeout(hoverDebounceTimer);
  }

  // Debounce: wait for the cursor to settle before querying. This collapses the
  // burst of mouseenter events nested elements fire during a single hover, and
  // skips items the cursor only passes over - keeping OData calls to a minimum.
  pendingHoverElement = event.target;
  const targetElement = event.target;
  const pageX = event.pageX;
  const pageY = event.pageY;

  hoverDebounceTimer = setTimeout(() => {
    hoverDebounceTimer = null;
    pendingHoverElement = null;
    triggerLookup(itemNumber, targetElement, pageX, pageY);
  }, HOVER_DEBOUNCE);
}

// Mouse leave handler
function handleMouseLeave(event) {
  // Cancel a pending (not-yet-fired) lookup if the cursor leaves before it settles
  if (pendingHoverElement === event.target) {
    clearTimeout(hoverDebounceTimer);
    hoverDebounceTimer = null;
    pendingHoverElement = null;
  }

  // Only schedule hide if we have an active tooltip
  if (currentTooltip && event.target === currentItemElement) {
    scheduleHide();
  }
}

// Simple document-level event delegation
document.addEventListener('mouseenter', (event) => {
  handleMouseEnter(event);
}, true);

document.addEventListener('mouseleave', (event) => {
  handleMouseLeave(event);
}, true);

// Track cursor position continuously so an ALT press can be resolved against
// whatever the cursor is already resting on (not just on the next mouseenter)
document.addEventListener('mousemove', (event) => {
  lastMouseX = event.pageX;
  lastMouseY = event.pageY;
}, { capture: true, passive: true });

// Handle pressing ALT while the cursor is already sitting on an item
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Alt' || event.repeat) {
    return;
  }

  const element = document.elementFromPoint(lastMouseX - window.scrollX, lastMouseY - window.scrollY);
  if (!element) {
    return;
  }

  // Pressing ALT while the cursor rests on the tooltip must not re-query the
  // tooltip's own contents - this is the most common way to hit that, since
  // moving onto the tooltip to read it is exactly what the hide delay invites.
  if (isInsideTooltip(element)) {
    return;
  }

  const itemNumber = extractItemNumber(element);
  if (!itemNumber) {
    return;
  }

  if (currentItemNumber === itemNumber && currentTooltip) {
    cancelHide();
    return;
  }

  if (hoverDebounceTimer) {
    clearTimeout(hoverDebounceTimer);
    hoverDebounceTimer = null;
    pendingHoverElement = null;
  }

  triggerLookup(itemNumber, element, lastMouseX, lastMouseY);
}, true);

// Dismiss immediately when the user clicks elsewhere on the page
document.addEventListener('mousedown', (event) => {
  if (currentTooltip && !currentTooltip.contains(event.target) && event.target !== currentItemElement) {
    hideTooltip();
  }
}, true);

// Hide tooltip when window loses focus
window.addEventListener('blur', hideTooltip);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) hideTooltip();
});
