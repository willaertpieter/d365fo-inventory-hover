// Settings page for the D365FO Inventory Hover extension.
//
// Division of labour with the toolbar popup: this page holds *configuration*
// (what the tooltip shows), the popup holds *runtime* controls and diagnostics
// (cross-company toggle, cache, query stats, audit log, site access).
//
// A note on why this page can't just fetch the field list itself: the D365 auth
// cookie is SameSite=Lax, so a request from the extension's own origin is
// cross-site and gets a 401. Every D365 call in this extension has to be made
// by a content script running inside a real D365 tab. "Refresh fields" therefore
// messages such a tab and waits for it to write the catalog to storage.

// Mirrors QUANTITY_FIELD_DEFS in content.js - keep both lists in sync if a
// field is ever added or renamed.
const QUANTITY_FIELD_DEFS = [
  { key: 'physical', label: 'Physical' },
  { key: 'available', label: 'Available' },
  { key: 'reserved', label: 'Reserved' },
  { key: 'ordered', label: 'Ordered' },
  { key: 'onOrder', label: 'On Order' }
];
const DEFAULT_QUANTITY_COLUMNS = QUANTITY_FIELD_DEFS.map(f => ({ key: f.key, visible: true }));

// Mirrors MAX_PRODUCT_FIELDS in content-product-fields.js.
const MAX_PRODUCT_FIELDS = 40;

// Mirrors DEFAULT_PRODUCT_FIELDS in content-product-fields.js - keep both in
// sync. Used for a first-time user and for the Restore defaults button.
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

let currentCatalogs = {};   // origin -> catalog, as stored by the content script
let selectedFields = [];    // [{ name, label? }] - the user's ordered selection
let availableFilter = '';

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

function setStatus(elementId, message, type = '') {
  const el = document.getElementById(elementId);
  el.textContent = message;
  el.className = `status-line ${type}`.trim();
}

// chrome.storage.sync rate-limits writes (120/minute), and the picker can fire
// a lot of small changes in quick succession, so coalesce them.
let saveTimer = null;
function saveSelectionSoon() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    chrome.storage.sync.set({ productFields: selectedFields }, () => {
      if (chrome.runtime.lastError) {
        setStatus('fields-status', `Could not save: ${chrome.runtime.lastError.message}`, 'error');
      } else {
        setStatus('fields-status', `Saved - ${selectedFields.length} field${selectedFields.length === 1 ? '' : 's'} will show in the tooltip`, 'success');
      }
      refreshConfigJson();
    });
  }, 400);
}

// ---------------------------------------------------------------------------
// Environments and field catalogs
// ---------------------------------------------------------------------------

// Host patterns the extension is allowed to run on: the built-in list from the
// manifest, plus any site the user activated manually via the popup. Read from
// the manifest rather than hardcoded so this never drifts out of sync.
async function getAllHostPatterns() {
  const manifest = chrome.runtime.getManifest();
  const staticPatterns = (manifest.content_scripts || []).flatMap(cs => cs.matches || []);
  const { manualOrigins = [] } = await chrome.storage.local.get(['manualOrigins']);
  return staticPatterns.concat(manualOrigins.map(o => o.pattern));
}

// Origins of D365 tabs currently open - these are the ones we can discover
// fields from right now.
async function getOpenEnvironmentOrigins() {
  try {
    const tabs = await chrome.tabs.query({ url: await getAllHostPatterns() });
    const origins = new Set();
    tabs.forEach(tab => {
      try { origins.add(new URL(tab.url).origin); } catch (e) { /* not a URL we can use */ }
    });
    return origins;
  } catch (e) {
    return new Set();
  }
}

function environmentLabel(origin, hasCatalog, isOpen) {
  let label = origin.replace(/^https:\/\//, '');
  const tags = [];
  if (isOpen) tags.push('open');
  if (hasCatalog) {
    const catalog = currentCatalogs[origin];
    tags.push(`${catalog.fields.length} fields`);
  } else {
    tags.push('not discovered yet');
  }
  return `${label} (${tags.join(', ')})`;
}

async function loadEnvironments() {
  const { fieldCatalogs = {} } = await chrome.storage.local.get(['fieldCatalogs']);
  currentCatalogs = fieldCatalogs;

  const openOrigins = await getOpenEnvironmentOrigins();
  const allOrigins = Array.from(new Set([...Object.keys(fieldCatalogs), ...openOrigins])).sort();

  const select = document.getElementById('env-select');
  const previous = select.value;
  select.innerHTML = '';

  if (allOrigins.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No D365 environment known yet';
    select.appendChild(option);
    select.disabled = true;
    document.getElementById('btn-refresh-fields').disabled = true;
    setStatus('env-status', 'Open a D365 F&O tab, ALT+hover an item once, then reload this page.', '');
    return;
  }

  select.disabled = false;
  allOrigins.forEach(origin => {
    const option = document.createElement('option');
    option.value = origin;
    option.textContent = environmentLabel(origin, !!fieldCatalogs[origin], openOrigins.has(origin));
    select.appendChild(option);
  });

  // Prefer keeping the current pick; otherwise default to an environment that
  // already has a catalog, so the picker isn't empty on first open.
  if (previous && allOrigins.includes(previous)) {
    select.value = previous;
  } else {
    select.value = allOrigins.find(o => fieldCatalogs[o]) || allOrigins[0];
  }

  onEnvironmentChanged();
}

function currentCatalog() {
  const origin = document.getElementById('env-select').value;
  return origin ? currentCatalogs[origin] : null;
}

async function onEnvironmentChanged() {
  const origin = document.getElementById('env-select').value;
  const catalog = currentCatalogs[origin];
  const openOrigins = await getOpenEnvironmentOrigins();

  document.getElementById('btn-refresh-fields').disabled = !openOrigins.has(origin);

  if (!catalog) {
    setStatus('env-status', openOrigins.has(origin)
      ? 'No fields discovered yet - click Refresh fields.'
      : `Open a tab on ${origin} to discover its fields.`, '');
  } else {
    const age = new Date(catalog.fetchedAt).toLocaleString();
    const how = catalog.source === 'probe+metadata'
      ? 'labels from D365 metadata'
      : 'labels derived from field names (D365 metadata API not available here)';
    setStatus('env-status', `${catalog.fields.length} fields, discovered ${age} - ${how}`, 'success');
  }

  renderAvailableFields();
  renderSelectedFields();
}

// Ask a content script in a live D365 tab to (re)discover the field list.
async function refreshFields() {
  const origin = document.getElementById('env-select').value;
  const btn = document.getElementById('btn-refresh-fields');

  const tabs = await chrome.tabs.query({ url: await getAllHostPatterns() });
  const tab = tabs.find(t => {
    try { return new URL(t.url).origin === origin; } catch (e) { return false; }
  });

  if (!tab) {
    setStatus('env-status', `No open tab on ${origin} - open one and try again.`, 'error');
    return;
  }

  btn.disabled = true;
  setStatus('env-status', 'Reading fields from the environment...', '');

  try {
    // frameId 0 targets the main frame only. The content script runs in every
    // frame (all_frames: true), and without this every frame would answer.
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'refreshFieldCatalog' }, { frameId: 0 });
    if (response && response.ok) {
      await loadEnvironments();
      document.getElementById('env-select').value = origin;
      await onEnvironmentChanged();
      setStatus('env-status', `Found ${response.fieldCount} fields on ${origin.replace(/^https:\/\//, '')}.`, 'success');
    } else {
      setStatus('env-status', `Could not read fields: ${(response && response.error) || 'no response'}`, 'error');
    }
  } catch (e) {
    setStatus('env-status', `Could not reach the D365 tab (${e.message}). Reload that tab and try again.`, 'error');
  } finally {
    btn.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// Available fields pane
// ---------------------------------------------------------------------------

function renderAvailableFields() {
  const listEl = document.getElementById('available-list');
  const countEl = document.getElementById('available-count');
  listEl.innerHTML = '';

  const catalog = currentCatalog();
  if (!catalog) {
    countEl.textContent = '';
    listEl.appendChild(emptyState('Nothing to show until this environment\'s fields are discovered.'));
    return;
  }

  const chosen = new Set(selectedFields.map(f => f.name));
  const needle = availableFilter.trim().toLowerCase();
  const matches = catalog.fields.filter(field => {
    if (!needle) return true;
    return field.label.toLowerCase().includes(needle) || field.name.toLowerCase().includes(needle);
  });

  countEl.textContent = needle
    ? `${matches.length} of ${catalog.fields.length}`
    : `${catalog.fields.length}`;

  if (matches.length === 0) {
    listEl.appendChild(emptyState(`No field matches "${availableFilter}".`));
    return;
  }

  matches.forEach(field => {
    const row = document.createElement('div');
    row.className = 'field-row';

    const main = document.createElement('div');
    main.className = 'field-main';

    const label = document.createElement('span');
    label.className = 'field-label';
    label.textContent = field.label;
    main.appendChild(label);

    // Always show the raw property name: it's what makes a field identifiable
    // across environments and languages, and what you'd quote in a bug report.
    const name = document.createElement('span');
    name.className = 'field-name';
    name.textContent = field.name;
    main.appendChild(name);

    row.appendChild(main);

    const type = document.createElement('span');
    type.className = 'field-type';
    type.textContent = field.type || 'Text';
    row.appendChild(type);

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'field-btn';
    addBtn.textContent = chosen.has(field.name) ? '✓' : '+';
    addBtn.title = chosen.has(field.name) ? 'Already shown in the tooltip' : 'Add to the tooltip';
    addBtn.disabled = chosen.has(field.name);
    addBtn.addEventListener('click', () => addField(field));
    row.appendChild(addBtn);

    listEl.appendChild(row);
  });
}

function emptyState(message) {
  const el = document.createElement('div');
  el.className = 'empty-state';
  el.textContent = message;
  return el;
}

function addField(field) {
  if (selectedFields.some(f => f.name === field.name)) return;
  if (selectedFields.length >= MAX_PRODUCT_FIELDS) {
    setStatus('fields-status', `Limit is ${MAX_PRODUCT_FIELDS} fields - remove one first.`, 'error');
    return;
  }
  selectedFields.push({ name: field.name });
  saveSelectionSoon();
  renderAvailableFields();
  renderSelectedFields();
}

// ---------------------------------------------------------------------------
// Selected fields pane
// ---------------------------------------------------------------------------

// The label shown for a field if the user hasn't renamed it: the catalog's
// label (D365's own, or derived from the name) for the selected environment.
function catalogLabelFor(name) {
  const catalog = currentCatalog();
  if (catalog) {
    const entry = catalog.fields.find(f => f.name === name);
    if (entry) return entry.label;
  }
  return name;
}

function renderSelectedFields() {
  const listEl = document.getElementById('selected-list');
  const countEl = document.getElementById('selected-count');
  listEl.innerHTML = '';

  countEl.textContent = `${selectedFields.length} / ${MAX_PRODUCT_FIELDS}`;

  if (selectedFields.length === 0) {
    listEl.appendChild(emptyState('No product fields selected - the tooltip shows inventory only.'));
    return;
  }

  const catalog = currentCatalog();
  const available = catalog ? new Set(catalog.fields.map(f => f.name)) : null;

  selectedFields.forEach((field, index) => {
    const row = document.createElement('div');
    row.className = 'field-row';

    const main = document.createElement('div');
    main.className = 'field-main';

    const rename = document.createElement('input');
    rename.type = 'text';
    rename.className = 'field-rename';
    rename.value = field.label || catalogLabelFor(field.name);
    rename.title = 'Label shown in the tooltip';
    rename.addEventListener('change', () => {
      const value = rename.value.trim();
      const fallback = catalogLabelFor(field.name);
      // Storing a label identical to the default would just be noise, and
      // would also freeze the label against a future metadata refresh.
      if (!value || value === fallback) {
        delete field.label;
        rename.value = fallback;
      } else {
        field.label = value;
      }
      saveSelectionSoon();
    });
    main.appendChild(rename);

    const name = document.createElement('span');
    name.className = 'field-name';
    // Flag fields this environment doesn't have. They're kept in the selection
    // on purpose - another environment may well have them - and are simply
    // skipped at query time.
    name.textContent = available && !available.has(field.name)
      ? `${field.name} - not in this environment`
      : field.name;
    main.appendChild(name);

    row.appendChild(main);

    const upBtn = document.createElement('button');
    upBtn.type = 'button';
    upBtn.className = 'field-btn';
    upBtn.textContent = '↑';
    upBtn.title = 'Move up';
    upBtn.disabled = index === 0;
    upBtn.addEventListener('click', () => moveField(index, index - 1));
    row.appendChild(upBtn);

    const downBtn = document.createElement('button');
    downBtn.type = 'button';
    downBtn.className = 'field-btn';
    downBtn.textContent = '↓';
    downBtn.title = 'Move down';
    downBtn.disabled = index === selectedFields.length - 1;
    downBtn.addEventListener('click', () => moveField(index, index + 1));
    row.appendChild(downBtn);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'field-btn remove';
    removeBtn.textContent = '✕';
    removeBtn.title = 'Remove from the tooltip';
    removeBtn.addEventListener('click', () => {
      selectedFields.splice(index, 1);
      saveSelectionSoon();
      renderAvailableFields();
      renderSelectedFields();
    });
    row.appendChild(removeBtn);

    listEl.appendChild(row);
  });
}

// Put the curated starting set back. Worth having now that there IS a default:
// without it, a user who clears the list has no way back to it.
function restoreDefaultFields() {
  selectedFields = DEFAULT_PRODUCT_FIELDS.map(f => ({ ...f }));
  saveSelectionSoon();
  renderAvailableFields();
  renderSelectedFields();
  setStatus('fields-status', `Restored the default ${selectedFields.length} fields`, 'success');
}

function moveField(from, to) {
  [selectedFields[from], selectedFields[to]] = [selectedFields[to], selectedFields[from]];
  saveSelectionSoon();
  renderSelectedFields();
}

// ---------------------------------------------------------------------------
// Quantity columns (moved here from the popup)
// ---------------------------------------------------------------------------

function quantityColumnLabel(key) {
  const def = QUANTITY_FIELD_DEFS.find(f => f.key === key);
  return def ? def.label : key;
}

function renderQuantityColumns(columns) {
  const listEl = document.getElementById('quantity-columns-list');
  listEl.innerHTML = '';

  columns.forEach((col, index) => {
    const row = document.createElement('div');
    row.className = 'qty-col-row';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = col.visible;
    checkbox.addEventListener('change', () => {
      const visibleCount = columns.filter(c => c.visible).length;
      if (!checkbox.checked && visibleCount <= 1) {
        // Keep at least one quantity column - an empty tooltip table isn't useful
        checkbox.checked = true;
        return;
      }
      col.visible = checkbox.checked;
      chrome.storage.sync.set({ quantityColumns: columns });
    });
    row.appendChild(checkbox);

    const label = document.createElement('span');
    label.className = 'qty-col-label';
    label.textContent = quantityColumnLabel(col.key);
    row.appendChild(label);

    const upBtn = document.createElement('button');
    upBtn.type = 'button';
    upBtn.className = 'field-btn';
    upBtn.textContent = '↑';
    upBtn.title = 'Move up';
    upBtn.disabled = index === 0;
    upBtn.addEventListener('click', () => {
      [columns[index - 1], columns[index]] = [columns[index], columns[index - 1]];
      chrome.storage.sync.set({ quantityColumns: columns });
      renderQuantityColumns(columns);
    });
    row.appendChild(upBtn);

    const downBtn = document.createElement('button');
    downBtn.type = 'button';
    downBtn.className = 'field-btn';
    downBtn.textContent = '↓';
    downBtn.title = 'Move down';
    downBtn.disabled = index === columns.length - 1;
    downBtn.addEventListener('click', () => {
      [columns[index], columns[index + 1]] = [columns[index + 1], columns[index]];
      chrome.storage.sync.set({ quantityColumns: columns });
      renderQuantityColumns(columns);
    });
    row.appendChild(downBtn);

    listEl.appendChild(row);
  });
}

// ---------------------------------------------------------------------------
// Import / export
// ---------------------------------------------------------------------------

function refreshConfigJson() {
  chrome.storage.sync.get(['productFields', 'hideEmptyProductFields', 'productDetailsLayout'], (result) => {
    document.getElementById('config-json').value = JSON.stringify({
      version: 1,
      entity: 'ReleasedProductsV2',
      productFields: result.productFields || [],
      hideEmptyProductFields: result.hideEmptyProductFields !== false,
      productDetailsLayout: result.productDetailsLayout || '2col'
    }, null, 2);
  });
}

function applyConfigJson() {
  let parsed;
  try {
    parsed = JSON.parse(document.getElementById('config-json').value);
  } catch (e) {
    setStatus('fields-status', `That isn't valid JSON: ${e.message}`, 'error');
    return;
  }

  if (!Array.isArray(parsed.productFields)) {
    setStatus('fields-status', 'Configuration has no productFields array.', 'error');
    return;
  }

  const cleaned = parsed.productFields
    .filter(f => f && typeof f.name === 'string' && f.name)
    .slice(0, MAX_PRODUCT_FIELDS)
    .map(f => (typeof f.label === 'string' && f.label ? { name: f.name, label: f.label } : { name: f.name }));

  selectedFields = cleaned;
  const hideEmpty = parsed.hideEmptyProductFields !== false;
  const layout = parsed.productDetailsLayout === '1col' ? '1col' : '2col';

  chrome.storage.sync.set({
    productFields: cleaned,
    hideEmptyProductFields: hideEmpty,
    productDetailsLayout: layout
  }, () => {
    document.getElementById('chk-hide-empty').checked = hideEmpty;
    document.getElementById('layout-select').value = layout;
    renderAvailableFields();
    renderSelectedFields();
    setStatus('fields-status', `Applied - ${cleaned.length} field${cleaned.length === 1 ? '' : 's'} selected.`, 'success');
  });
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', async () => {
  const sync = await chrome.storage.sync.get([
    'productFields', 'hideEmptyProductFields', 'productDetailsLayout', 'quantityColumns'
  ]);

  // Same absent-vs-empty rule as getProductFieldsSetting() in
  // content-product-fields.js: never configured starts from the defaults, an
  // explicitly emptied list stays empty.
  selectedFields = Array.isArray(sync.productFields)
    ? sync.productFields.filter(f => f && typeof f.name === 'string' && f.name).map(f => ({ ...f }))
    : DEFAULT_PRODUCT_FIELDS.map(f => ({ ...f }));

  document.getElementById('chk-hide-empty').checked = sync.hideEmptyProductFields !== false;
  document.getElementById('layout-select').value = sync.productDetailsLayout === '1col' ? '1col' : '2col';

  renderQuantityColumns(
    Array.isArray(sync.quantityColumns) && sync.quantityColumns.length > 0
      ? sync.quantityColumns.map(c => ({ ...c }))
      : DEFAULT_QUANTITY_COLUMNS.map(c => ({ ...c }))
  );

  await loadEnvironments();
  refreshConfigJson();

  document.getElementById('env-select').addEventListener('change', onEnvironmentChanged);
  document.getElementById('btn-refresh-fields').addEventListener('click', refreshFields);

  document.getElementById('field-search').addEventListener('input', (event) => {
    availableFilter = event.target.value;
    renderAvailableFields();
  });

  document.getElementById('chk-hide-empty').addEventListener('change', (event) => {
    chrome.storage.sync.set({ hideEmptyProductFields: event.target.checked }, refreshConfigJson);
  });

  document.getElementById('layout-select').addEventListener('change', (event) => {
    chrome.storage.sync.set({ productDetailsLayout: event.target.value }, refreshConfigJson);
  });

  document.getElementById('btn-copy-config').addEventListener('click', () => {
    const btn = document.getElementById('btn-copy-config');
    navigator.clipboard.writeText(document.getElementById('config-json').value).then(() => {
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
    });
  });

  document.getElementById('btn-apply-config').addEventListener('click', applyConfigJson);
  document.getElementById('btn-restore-defaults').addEventListener('click', restoreDefaultFields);
});
