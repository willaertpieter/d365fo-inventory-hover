// Cap how much of the raw request/response we keep per log entry, so a
// pathologically large OData response can't blow out storage.local's quota.
const RAW_LOG_CHAR_LIMIT = 5000;

// Mirrors manifest.json's host_permissions/content_scripts.matches exactly - keep
// both in sync if this list changes. Duplicated here (rather than read from the
// manifest at runtime) because chrome.tabs.query needs a plain URL pattern array.
const STATIC_HOST_PATTERNS = [
  'https://*.operations.dynamics.com/*',
  'https://*.sandbox.operations.dynamics.com/*',
  'https://*.operations.eu.dynamics.com/*',
  'https://*.sandbox.operations.eu.dynamics.com/*',
  'https://*.operations.fr.dynamics.com/*',
  'https://*.sandbox.operations.fr.dynamics.com/*',
  'https://*.operations.no.dynamics.com/*',
  'https://*.sandbox.operations.no.dynamics.com/*',
  'https://*.operations.sa.dynamics.com/*',
  'https://*.sandbox.operations.sa.dynamics.com/*',
  'https://*.operations.ch.dynamics.com/*',
  'https://*.sandbox.operations.ch.dynamics.com/*',
  'https://*.operations.uae.dynamics.com/*',
  'https://*.sandbox.operations.uae.dynamics.com/*',
  'https://*.operations.gov.microsoftdynamics.us/*',
  'https://*.sandbox.operations.gov.microsoftdynamics.us/*',
  'https://*.operations.high.microsoftdynamics.us/*',
  'https://*.sandbox.operations.high.microsoftdynamics.us/*',
  'https://*.cloudax.dynamics.com/*',
  'https://*.axcloud.dynamics.com/*',
  'https://*.cloud.onebox.dynamics.com/*'
];

// Sites the user manually activated via the popup (for environments that don't
// match STATIC_HOST_PATTERNS) live in chrome.storage.local as { pattern, hostname,
// addedAt }[], and are separately registered as dynamic content scripts via
// chrome.scripting - see popup.js. On every browser start/extension load, drop any
// entry whose host permission was revoked outside the popup (e.g. via
// chrome://extensions site permissions) so a stale dynamic content script
// registration doesn't linger forever.
async function reconcileManualOrigins() {
  const { manualOrigins = [] } = await chrome.storage.local.get(['manualOrigins']);
  const stillGranted = [];

  for (const entry of manualOrigins) {
    const granted = await chrome.permissions.contains({ origins: [entry.pattern] });
    if (granted) {
      stillGranted.push(entry);
    } else {
      try {
        await chrome.scripting.unregisterContentScripts({ ids: [`manual-${entry.hostname}`] });
      } catch (e) {
        // Already gone - fine
      }
    }
  }

  if (stillGranted.length !== manualOrigins.length) {
    await chrome.storage.local.set({ manualOrigins: stillGranted });
  }
}

chrome.runtime.onInstalled.addListener(reconcileManualOrigins);
chrome.runtime.onStartup.addListener(reconcileManualOrigins);

// Log a query to audit trail.
//
// `kind` distinguishes the three call types the extension makes against an
// environment: 'inventory' (WarehousesOnHandV2), 'product' (ReleasedProductsV2
// field values) and 'catalog' (one-off ReleasedProductsV2 field discovery).
// Entries written before this existed have no `kind` and are rendered as
// inventory by the popup.
async function logQuery({ kind = 'inventory', itemNumber, success, warehouseCount = 0, fieldCount = 0, errorMsg = null, url = null, raw = null }) {
  const today = new Date().toISOString().split('T')[0];

  // Get existing logs
  const result = await new Promise((resolve) => {
    chrome.storage.local.get(['queryLogs', 'queryCount'], (res) => {
      resolve(res);
    });
  });

  const logs = result.queryLogs || [];
  const counters = result.queryCount || { today: 0, total: 0, lastDate: today };

  // Reset counter if new day
  if (counters.lastDate !== today) {
    counters.today = 0;
    counters.lastDate = today;
  }

  let rawText = null;
  if (raw !== null && raw !== undefined) {
    rawText = typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2);
    if (rawText.length > RAW_LOG_CHAR_LIMIT) {
      rawText = `${rawText.slice(0, RAW_LOG_CHAR_LIMIT)}\n... (truncated)`;
    }
  }

  // Add log entry
  const logEntry = {
    timestamp: new Date().toISOString(),
    kind,
    itemNumber,
    success,
    warehouseCount,
    fieldCount,
    errorMsg,
    url,
    raw: rawText
  };

  logs.push(logEntry);
  // Keep only last 1000 logs
  if (logs.length > 1000) {
    logs.shift();
  }

  // Update counters
  counters.today++;
  counters.total++;

  // Save to storage
  await new Promise((resolve) => {
    chrome.storage.local.set({
      queryLogs: logs,
      queryCount: counters
    }, resolve);
  });

  console.log(`[D365 Inventory] Query logged. Count: ${counters.today} today, ${counters.total} total`);
}

// Message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Content script performed the actual OData fetch (it runs in the page's own
  // origin so the D365 auth cookie is sent) and reports the result here for logging.
  if (request.action === 'logQuery') {
    const { kind, itemNumber, success, warehouseCount, fieldCount, errorMsg, url, raw } = request;
    logQuery({ kind, itemNumber, success, warehouseCount, fieldCount, errorMsg, url, raw })
      .then(() => sendResponse({ success: true }));
    return true; // Keep channel open for async response
  }

  if (request.action === 'clearCache') {
    // Cache lives per-tab inside each content script; broadcast the clear request.
    // Includes both the static list and any manually-activated sites (see popup.js).
    chrome.storage.local.get(['manualOrigins'], ({ manualOrigins = [] }) => {
      const urls = STATIC_HOST_PATTERNS.concat(manualOrigins.map(o => o.pattern));
      chrome.tabs.query({ url: urls }, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, { action: 'clearCacheContent' }, () => {
            // Swallow errors from tabs without the content script injected (e.g. not yet loaded)
            void chrome.runtime.lastError;
          });
        });
        sendResponse({ success: true });
      });
    });
    return true; // Keep channel open for async response
  }
});
