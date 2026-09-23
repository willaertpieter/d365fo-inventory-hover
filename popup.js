// Load and display query statistics
function loadQueryStats() {
  chrome.storage.local.get(['queryCount'], (result) => {
    const counters = result.queryCount || { today: 0, total: 0 };
    
    document.getElementById('query-today').textContent = counters.today;
    document.getElementById('query-total').textContent = counters.total;
  });
}

// Which log entries the user has expanded to see request/response detail.
// Kept across the 2-second auto-refresh so an expanded entry doesn't keep
// snapping shut while you're reading it.
const expandedLogKeys = new Set();

function logKey(log) {
  return `${log.timestamp}-${log.itemNumber}`;
}

// What a successful call actually achieved, per call type. Entries logged
// before `kind` existed have none, and are treated as inventory lookups.
function successDetails(log) {
  switch (log.kind) {
    case 'product':
      return `${log.fieldCount || 0} product fields`;
    case 'catalog':
      return `${log.fieldCount || 0} fields discovered`;
    default:
      return `${log.warehouseCount || 0} warehouses`;
  }
}

// Load and display audit logs. Built with DOM APIs (not innerHTML) because
// itemNumber/errorMsg/url/raw can carry text derived from the D365 response.
function loadAuditLogs() {
  chrome.storage.local.get(['queryLogs'], (result) => {
    const logs = result.queryLogs || [];
    const logsDiv = document.getElementById('audit-logs');
    logsDiv.innerHTML = '';

    if (logs.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'color: #999; text-align: center; padding: 12px;';
      empty.textContent = 'No queries yet';
      logsDiv.appendChild(empty);
      return;
    }

    // Show last 10 logs
    const recentLogs = logs.slice(-10).reverse();
    recentLogs.forEach(log => {
      const key = logKey(log);
      const time = new Date(log.timestamp).toLocaleTimeString();
      const details = log.success ? successDetails(log) : (log.errorMsg || 'Unknown error');

      const entry = document.createElement('div');
      entry.className = 'audit-log-entry';

      const text = document.createElement('div');
      text.className = 'log-item-text';
      text.style.cursor = 'pointer';
      text.title = 'Click to see the OData request and response';

      const caret = document.createElement('span');
      caret.className = 'log-caret';
      caret.textContent = expandedLogKeys.has(key) ? '▾' : '▸';
      text.appendChild(caret);

      const status = document.createElement('span');
      status.className = log.success ? 'log-success' : 'log-error';
      status.textContent = log.success ? '✓' : '✗';
      text.appendChild(status);
      text.appendChild(document.createTextNode(` ${log.itemNumber} `));

      const timeSpan = document.createElement('span');
      timeSpan.style.cssText = 'color: #999; margin-left: 8px;';
      timeSpan.textContent = time;
      text.appendChild(timeSpan);

      const detailsSpan = document.createElement('span');
      detailsSpan.style.cssText = 'color: #666; font-size: 10px; margin-left: 8px;';
      detailsSpan.textContent = `(${details})`;
      text.appendChild(detailsSpan);

      entry.appendChild(text);

      const detailBlock = buildLogDetail(log);
      detailBlock.style.display = expandedLogKeys.has(key) ? 'block' : 'none';
      entry.appendChild(detailBlock);

      text.addEventListener('click', () => {
        const isOpen = expandedLogKeys.has(key);
        if (isOpen) {
          expandedLogKeys.delete(key);
        } else {
          expandedLogKeys.add(key);
        }
        detailBlock.style.display = isOpen ? 'none' : 'block';
        caret.textContent = isOpen ? '▸' : '▾';
      });

      logsDiv.appendChild(entry);
    });
  });
}

// Expandable panel showing the exact OData request URL and raw response for
// one log entry, with a one-click copy for pasting elsewhere (e.g. into a
// bug report or a chat when asking for help debugging a query).
function buildLogDetail(log) {
  const box = document.createElement('div');
  box.className = 'log-detail';

  const urlLabel = document.createElement('div');
  urlLabel.className = 'log-detail-label';
  urlLabel.textContent = 'Request';
  box.appendChild(urlLabel);

  const urlText = document.createElement('div');
  urlText.className = 'log-detail-url';
  urlText.textContent = log.url || '(not recorded)';
  box.appendChild(urlText);

  const rawLabel = document.createElement('div');
  rawLabel.className = 'log-detail-label';
  rawLabel.textContent = 'Response';
  box.appendChild(rawLabel);

  const rawPre = document.createElement('pre');
  rawPre.className = 'log-detail-raw';
  rawPre.textContent = log.raw || '(not recorded)';
  box.appendChild(rawPre);

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'log-copy-btn';
  copyBtn.textContent = 'Copy request + response';
  copyBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    const payload = `${log.url || '(not recorded)'}\n\n${log.raw || '(not recorded)'}`;
    navigator.clipboard.writeText(payload).then(() => {
      copyBtn.textContent = 'Copied!';
      setTimeout(() => {
        copyBtn.textContent = 'Copy request + response';
      }, 1500);
    });
  });
  box.appendChild(copyBtn);

  return box;
}

// Manual site activation: lets the extension run on a D365 F&O environment whose
// URL doesn't match any of the built-in patterns in manifest.json (e.g. a national
// cloud or dev VM naming scheme not on Microsoft's published geo list). Uses
// optional_host_permissions + chrome.scripting so no manifest/store update is
// needed - the permission grant and the dynamically-registered content script
// both persist across browser restarts (reconciled on startup in background.js).

function patternForUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:') return null;
    return `https://${url.hostname}/*`;
  } catch (e) {
    return null;
  }
}

function manualScriptId(hostname) {
  return `manual-${hostname}`;
}

// The files a manually-activated site needs are read straight from the manifest
// rather than hardcoded here. The content script is split across more than one
// file now, and a hardcoded list that fell behind would leave manual sites
// loading half the extension and failing with a ReferenceError at hover time.
function contentScriptFiles() {
  const [primary] = chrome.runtime.getManifest().content_scripts || [];
  return {
    js: (primary && primary.js) || ['content.js'],
    css: (primary && primary.css) || ['styles.css']
  };
}

async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function loadManualSiteSection() {
  const section = document.getElementById('manual-site-section');
  const statusEl = document.getElementById('manual-site-status');
  const addBtn = document.getElementById('btn-add-site');

  const tab = await getCurrentTab();
  const pattern = tab && tab.url ? patternForUrl(tab.url) : null;

  if (!pattern) {
    // Not an https page (chrome://, file://, a New Tab page, etc.) - nothing to activate
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';
  const hostname = new URL(tab.url).hostname;
  const alreadyActive = await chrome.permissions.contains({ origins: [pattern] });

  if (alreadyActive) {
    statusEl.textContent = `Active on ${hostname}`;
    addBtn.style.display = 'none';
  } else {
    statusEl.textContent = `Not recognized as a D365 F&O environment: ${hostname}`;
    addBtn.style.display = 'block';
    addBtn.onclick = () => addManualSite(tab, pattern, hostname);
  }

  await renderManualSiteList();
}

async function addManualSite(tab, pattern, hostname) {
  // Must be called synchronously from this click handler - chrome.permissions.request
  // requires an active user gesture and won't work from a relayed background message.
  const granted = await chrome.permissions.request({ origins: [pattern] });
  if (!granted) {
    showStatus('Permission was not granted - extension not enabled on this site', 'error');
    return;
  }

  const { js, css } = contentScriptFiles();
  const scriptDef = {
    id: manualScriptId(hostname),
    matches: [pattern],
    js,
    css,
    allFrames: true
  };

  try {
    await chrome.scripting.registerContentScripts([scriptDef]);
  } catch (e) {
    // Already registered (e.g. re-adding after the permission was revoked externally)
    await chrome.scripting.updateContentScripts([scriptDef]);
  }

  const { manualOrigins = [] } = await chrome.storage.local.get(['manualOrigins']);
  if (!manualOrigins.some(o => o.pattern === pattern)) {
    manualOrigins.push({ pattern, hostname, addedAt: new Date().toISOString() });
    await chrome.storage.local.set({ manualOrigins });
  }

  // Inject into the current tab immediately so it works without a page reload
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: js });
    await chrome.scripting.insertCSS({ target: { tabId: tab.id, allFrames: true }, files: css });
  } catch (e) {
    // Some frames (e.g. cross-origin iframes) may reject injection - not fatal,
    // the top frame is what matters for the hover feature.
  }

  showStatus(`Enabled on ${hostname}`, 'success');
  await loadManualSiteSection();
}

async function removeManualSite(pattern, hostname) {
  try {
    await chrome.scripting.unregisterContentScripts({ ids: [manualScriptId(hostname)] });
  } catch (e) {}
  try {
    await chrome.permissions.remove({ origins: [pattern] });
  } catch (e) {}

  const { manualOrigins = [] } = await chrome.storage.local.get(['manualOrigins']);
  await chrome.storage.local.set({ manualOrigins: manualOrigins.filter(o => o.pattern !== pattern) });

  showStatus(`Removed ${hostname}`, 'success');
  await loadManualSiteSection();
}

async function renderManualSiteList() {
  const listEl = document.getElementById('manual-site-list');
  const { manualOrigins = [] } = await chrome.storage.local.get(['manualOrigins']);
  listEl.innerHTML = '';

  manualOrigins.forEach(({ pattern, hostname }) => {
    const row = document.createElement('div');
    row.className = 'manual-site-row';

    const name = document.createElement('span');
    name.textContent = hostname;
    row.appendChild(name);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'manual-site-remove';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => removeManualSite(pattern, hostname));
    row.appendChild(removeBtn);

    listEl.appendChild(row);
  });
}

// Mirrors DEFAULT_PRODUCT_FIELDS.length in content-product-fields.js - keep in
// sync (tests/product-fields.test.js checks it). A never-configured install
// shows these defaults in the tooltip, so the summary has to count them too.
const DEFAULT_PRODUCT_FIELD_COUNT = 20;

// One-line summary of what the tooltip is currently configured to show. The
// configuration itself lives on the options page (see options.js) - a 285-field
// picker doesn't fit in a 400px popup - so this is just a readable pointer to it.
async function loadTooltipSummary() {
  const { quantityColumns, productFields } = await chrome.storage.sync.get(['quantityColumns', 'productFields']);

  const quantityCount = Array.isArray(quantityColumns) && quantityColumns.length > 0
    ? quantityColumns.filter(c => c.visible).length
    : 5; // default: all of them

  // Absent means never configured (the tooltip uses the defaults); an empty
  // array means the user removed every field on purpose.
  const productCount = Array.isArray(productFields) ? productFields.length : DEFAULT_PRODUCT_FIELD_COUNT;

  const parts = [`${quantityCount} quantity column${quantityCount === 1 ? '' : 's'}`];
  parts.push(productCount === 0
    ? 'no product fields'
    : `${productCount} product field${productCount === 1 ? '' : 's'}`);

  document.getElementById('tooltip-summary').textContent = `Showing ${parts.join(', ')}.`;
}

// Load and wire the cross-company inventory setting
function loadCrossCompanySetting() {
  chrome.storage.sync.get(['crossCompanyEnabled'], (result) => {
    document.getElementById('chk-cross-company').checked = !!result.crossCompanyEnabled;
  });
}

// Load settings on popup open
document.addEventListener('DOMContentLoaded', () => {
  // Load stats and logs
  loadQueryStats();
  loadAuditLogs();
  loadCrossCompanySetting();
  loadManualSiteSection();
  loadTooltipSummary();

  // Refresh stats every 2 seconds
  setInterval(() => {
    loadQueryStats();
    loadAuditLogs();
  }, 2000);

  // Button event listeners
  document.getElementById('btn-clear-cache').addEventListener('click', clearCache);
  document.getElementById('btn-clear-logs').addEventListener('click', clearLogs);
  document.getElementById('btn-open-settings').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });
  document.getElementById('chk-cross-company').addEventListener('change', (event) => {
    chrome.storage.sync.set({ crossCompanyEnabled: event.target.checked }, () => {
      showStatus(
        event.target.checked ? 'Cross-company inventory enabled' : 'Cross-company inventory disabled',
        'success'
      );
    });
  });
});

// Clear cache
function clearCache() {
  chrome.runtime.sendMessage({ action: 'clearCache' }, () => {
    showStatus('Cached lookups discarded - next hover re-queries D365', 'success');
  });
}

// Clear audit logs
function clearLogs() {
  chrome.storage.local.set({ queryLogs: [], queryCount: { today: 0, total: 0, lastDate: new Date().toISOString().split('T')[0] } }, () => {
    expandedLogKeys.clear();
    showStatus('Audit log and counters cleared', 'success');
    loadAuditLogs();
    loadQueryStats();
  });
}

// Show status message
function showStatus(message, type) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.className = `status ${type}`;
  
  if (type === 'error') {
    setTimeout(() => {
      status.className = 'status';
    }, 4000);
  }
}
