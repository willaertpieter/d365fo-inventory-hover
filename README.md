# D365FO Inventory Hover

Hover over item numbers on any D365 Finance & Operations page to see warehouse inventory levels — no extra clicks, no navigating away from what you're doing.

## Features

- ✅ Detect item numbers on any D365 F&O page, targeted at item/product fields specifically (not order numbers, warehouse codes, batch numbers, etc.)
- ✅ Hover tooltip: warehouse | physical | available | reserved | ordered | on order
- ✅ **PRODUCT DIMENSION COLUMNS** — Config, Color, Size, Style and Version each appear automatically, but only when the item actually uses that dimension (see [Product Dimension Columns](#product-dimension-columns))
- ✅ **CONFIGURABLE TOOLTIP COLUMNS** — choose which quantities show and in what order (see [Tooltip Quantity Configuration](#tooltip-quantity-configuration))
- ✅ **PRODUCT FIELDS IN THE TOOLTIP** — show any field from `ReleasedProductsV2` (item model group, buyer group, dimensions, lifecycle state, your own extension fields…) above the inventory table; the field list is discovered from each environment, so extension fields need no code change (see [Product Fields](#product-fields-releasedproductsv2))
- ✅ Loading spinner while the OData call is in flight
- ✅ "No inventory records found" / error messages shown directly in the tooltip (not just silence), **with the product details still shown** when the item exists but holds no stock
- ✅ OData caching (5-minute TTL) — re-hovering the same item doesn't re-query
- ✅ Client-side rate limiting — protects your D365 environment from being hammered
- ✅ **AUTO-ENVIRONMENT DETECTION** — always queries whatever D365 tab you're currently on, no configuration needed
- ✅ **CORRECT LEGAL ENTITY, EVEN AFTER SWITCHING COMPANY** — scoped to the company shown in the page URL, not your D365 user options' default company (see below)
- ✅ **CROSS-COMPANY MODE (optional)** — see inventory across every legal entity in the environment at once, toggle in the popup
- ✅ **ALT+HOVER REQUIREMENT** — only queries when ALT is held (prevents accidental queries); works whether you hold ALT first or press it while already hovering
- ✅ **QUERY COUNTER** — tracks today's & total queries in the popup
- ✅ **AUDIT LOGGING** — logs all queries locally with timestamp, status, warehouse count; click any entry to see the exact OData request URL and raw response, with a one-click copy for debugging
- ✅ **WORKS ON ANY D365 F&O ENVIRONMENT** — 21 built-in URL patterns cover every Microsoft-published geo plus dev/demo/OneBox VMs; anything else can be added on the spot via one click in the popup, no update required (see [Manual site activation](#manual-site-activation))

## Trust & privacy

This extension runs inside an authenticated F&O session, so "trust me" isn't good enough. Here is what you can check for yourself:

- **Why it exists.** A personal project by Pieter Willaert, built in free time to stop leaving the page to check stock. It is free and will stay free. There is no paid tier, no data collection and no lead generation. If that ever changed, it would be announced and released as a new major version, never slipped into an update.
- **Where your data goes.** Only to the D365 environment in your current tab, using your existing session, so D365 security roles apply exactly as in the UI. There are four request types in total, all read-only `GET`s to `window.location.origin` (see [Data Flow](#data-flow)). Nothing goes to the developer or to any third party: no server, analytics, telemetry or remote code.
- **Enforced, not just promised.** The popup, settings page and background worker are blocked from making any network request by the content security policy in `manifest.json` (`connect-src 'none'`).
- **Visible.** The popup's **Recent queries** log lists every request the extension made, with its exact URL and response. DevTools' Network tab shows the same thing.
- **What's kept locally.** Settings, a 5-minute lookup cache, per-environment field lists and the query log, all in your browser profile. [PRIVACY.md](PRIVACY.md) lists each item, how long it's kept and how to clear it.
- **Verifiable releases.** Store packages are built reproducibly from git tags (`scripts/package.js`), with SHA-256 checksums for every file. `scripts/verify.js` checks that the copy installed in your browser is exactly the tagged source. If an update ever needs new permissions, your browser disables the extension and asks you first. See [CHANGELOG.md](CHANGELOG.md).
- **Open source.** MIT licensed ([LICENSE](LICENSE)). The whole extension is about 2,700 lines of plain JavaScript, plus two HTML pages and a stylesheet, with no build step and no dependencies. It can be read in an afternoon. Security reports: [SECURITY.md](SECURITY.md).

Organisations can pin or restrict extensions with Microsoft Edge policies (`ExtensionSettings`, `ExtensionInstallAllowlist`, `ExtensionInstallForcelist`), or build and distribute a reviewed version from source themselves.

## Installation

### Chrome / Edge (Load unpacked)

1. Save all files to a folder:
   - `manifest.json`
   - `background.js`
   - `content-product-fields.js`
   - `content.js`
   - `styles.css`
   - `popup.html`
   - `popup.js`
   - `options.html`
   - `options.js`
   - `icons/` (icon-16.png, icon-48.png, icon-128.png, icon-300.png)

2. Open `chrome://extensions/` (Chrome) or `edge://extensions/` (Edge)

3. Enable **Developer mode** (toggle in top-right)

4. Click **Load unpacked** → select the extension folder

5. Pin the extension icon to your toolbar

There's no setup step after installing — the environment is always detected automatically from the D365 tab you're on.

### Edge Add-ons (store submission)

Commit and tag the release, then build the upload from the tag:

```
git tag v1.1.1
node scripts/package.js v1.1.1
```

This writes `dist/d365fo-inventory-hover-<version>.zip` and `dist/SHA256SUMS.txt`. The package is built from git, not the working folder, and is reproducible: the same tag gives the same bytes on any machine. Upload the zip via [Microsoft Partner Center](https://partner.microsoft.com/dashboard/microsoftedge/overview), and publish `SHA256SUMS.txt` with the GitHub release so anyone can check it (see [SECURITY.md](SECURITY.md#checking-a-release)). In the listing's privacy fields, link to [PRIVACY.md](PRIVACY.md) and declare that no user data is collected or transmitted.

Publishing is free — no developer registration fee, unlike the Chrome Web Store's one-time $5 fee. See the Permissions section below for the justification text the submission form asks for.

## Usage

1. Navigate to any D365 F&O page (Product info, Inventory, Sales orders, Warehouse, etc.)
2. **Hold ALT and hover** over an item number (full number, e.g., `FG0010421-01` not just `FG0010421`) — or hover first and press ALT afterwards, both work
3. A "Retrieving inventory..." tooltip appears immediately, then is replaced with:
   - Item number & product name
   - Warehouse ID and quantities per dimension combination (Config/Color/Size/Style/Version columns only shown for dimensions the item actually uses). By default: Physical, Available, Reserved, Ordered, On Order — which of these show, and in what order, is configurable in the popup (see [Tooltip Quantity Configuration](#tooltip-quantity-configuration))
   - Query timestamp
   - Or a short message if no records were found, the environment returned an error, or the extension is rate-limiting requests

4. **Popup displays** (click the toolbar icon):
   - "Site Access" status, with an "Enable on this site" button if the current tab isn't on the built-in environment list (see [Manual site activation](#manual-site-activation))
   - Cross-company inventory toggle (see [Multi-Legal-Entity Support](#multi-legal-entity--cross-company-support) below)
   - Tooltip Quantities — show/hide and reorder the quantity columns (see [Tooltip Quantity Configuration](#tooltip-quantity-configuration))
   - Query counter (Today / Total)
   - Recent audit logs (last 10 queries) — click an entry to expand the exact OData request URL and raw response, with a "Copy request + response" button
   - Refresh inventory data button
   - Clear Logs button

## Item Number Matching

The extension requires an **exact item number match**, and only triggers on fields it can identify as item/product related. Use the complete item number:
- ✅ `FG0010421-01` ← Correct (full suffix)
- ❌ `FG0010421` ← Won't match (missing suffix)
- ✅ `RM0020011` ← Correct (full number)
- ✅ `PACK-PALLET80_DEP` ← Correct (full number)

### Reducing false positives on other fields

D365 F&O renders form controls with a `data-dyn-controlname` attribute identifying the underlying field (e.g. `ItemId`, `ProductNumber`) — the same hook Microsoft's own UI test automation relies on. Where present, the extension uses this to veto matches on fields it can positively identify as *not* item/product related (order numbers, warehouse codes, batch numbers, status codes, etc. — which otherwise look identical in shape to a real item number). Where this attribute isn't present (some grid/list surfaces), it falls back to text-pattern matching only.

Note the direction of that veto: it rejects only fields it can **positively identify** as non-item. A field with no `data-dyn-controlname` at all is treated as "might be an item", which is what makes the two guards below necessary.

**The tooltip excludes itself.** The tooltip is appended to `document.body`, so it lives in the same document the hover and keydown listeners watch — and `handleMouseEnter` is registered in the capture phase, so it fires for elements inside the tooltip too. Without a guard, ALT+hovering the tooltip (or holding ALT while the cursor rests on it, which the 1-second hide delay actively invites) feeds the tooltip's own contents back into item detection. Plenty of what it shows satisfies `ITEM_PATTERN`:

| Tooltip value | Matches `ITEM_PATTERN`? |
|---|---|
| `09:41:22` (timestamp, 24-hour locales) | Yes |
| `1/10/2024` (a product date field) | Yes |
| `20.8` (a quantity) | Yes |
| `WH-01` (warehouse code) | Yes |
| `C010042` (a customer ID) | Yes |

`findControlName()` cannot prevent this — walking up from a tooltip node reaches `document.body` without finding a `data-dyn-controlname`, so it returns `null` and the veto is skipped. Both entry points therefore check `isInsideTooltip()` first.

**Shape-based rejections.** `NON_ITEM_PATTERNS` in `content.js` rejects strings that satisfy `ITEM_PATTERN` but are never item numbers. Currently just clock times (`9:41`, `09:41:22`) — `ITEM_PATTERN` has to permit `:` and `.` because item numbers like `ITEM/SKU:001` are real, which lets times through on any surface with no control name to veto them. Add to this list rather than tightening `ITEM_PATTERN`, which risks rejecting genuine item numbers.

If you're still seeing false positives on a specific field, check DevTools (right-click → Inspect) for that field's `data-dyn-controlname` value — the allow-list regex is `ITEM_FIELD_NAME_PATTERN` near the top of `content.js`, easy to extend.

## Multi-Legal-Entity / Cross-Company Support

**The problem this solves:** by default, an unscoped D365 F&O OData call is answered using the *session's default company* — the legal entity set in the user's own D365 user options (their "startup company"). That is **not necessarily the same company shown on screen**. If you switch legal entity via the D365 UI (`?cmp=` changes in the URL) without also changing your default company, an unscoped OData call keeps quietly returning the *old* company's data — which is exactly what made the inventory popup look wrong (or show data for the wrong legal entity) after switching company.

**The fix — a "Cross-company inventory" toggle in the popup:**

- **Off (default):** the extension reads the legal entity you're actually viewing from the page URL's `?cmp=LEGALENTITY` parameter, and explicitly scopes the OData call to that company via `cross-company=true&$filter=... and dataAreaId eq 'LEGALENTITY'`. This is the documented way to override which legal entity a D365 F&O OData request targets — the request stays correctly scoped to whatever company you're actually looking at, no matter what your user options say. If `?cmp=` isn't present in the URL for some reason, it falls back to the old behavior (unscoped, session default company).
- **On:** every query uses `cross-company=true` with no `dataAreaId` filter, returning matching inventory from **every legal entity in the environment** in one tooltip. Each row is then labeled with its `Company` (a column that only appears when more than one company is actually present in the results, same pattern as the Config column). A small "All companies (cross-company)" badge appears in the tooltip so it's obvious cross-company mode is active.

Toggle it any time in the popup — it takes effect on the very next hover, no page reload needed. The per-tab cache key includes which mode/company was used, so switching the toggle (or switching legal entity) can't accidentally show a stale result cached under a different scope.

## Tooltip Quantity Configuration

The hover tooltip can show five quantity columns, each pulled from the OData response:

| Column | OData field | Meaning |
|---|---|---|
| Physical | `OnHandQuantity` | Actual physical quantity on hand, regardless of reservations |
| Available | `AvailableOnHandQuantity` | On-hand quantity minus reservations — what's actually free to use |
| Reserved | `ReservedOnHandQuantity` | Quantity already reserved against on-hand stock |
| Ordered | `OrderedQuantity` | Quantity reserved against incoming purchase/production orders |
| On Order | `OnOrderQuantity` | Quantity on order but not yet received |

**Physical vs. Available:** these can legitimately differ — an item can show `Physical: 20.8` and `Available: 0` at the same time if everything on hand is reserved, blocked, or held in a status the "available" calculation nets out. If a tooltip looks like it's showing "no stock" when you know there's inventory, check whether Physical is enabled — Available alone doesn't tell the whole story.

**Choosing which columns show, and their order:** open the popup → **Configure tooltip…** → **Inventory quantities**. Each row has a checkbox (show/hide) and ↑/↓ buttons (reorder) — changes apply on the very next hover, no reload needed. At least one column must stay visible. The setting is stored in `chrome.storage.sync`, so it follows your browser profile. Default order: Physical, Available, Reserved, Ordered, On Order.

## Product Fields (ReleasedProductsV2)

The tooltip can show released-product master data above the inventory table — item model group, buyer group, product dimensions, lifecycle state, and **any extension field your implementation added**.

### How the field list is discovered

The extension never ships a hardcoded field list, because no two D365 implementations have the same one. Instead it reads the field list from the environment itself, in two steps:

| Step | Call | Purpose | Required? |
|---|---|---|---|
| 1. Probe | `GET /data/ReleasedProductsV2?cross-company=true&$top=1` | Field **names** and inferred types, read from one real record | Yes |
| 2. Labels | `GET /metadata/PublicEntities(Name='ReleasedProductsV2')` | Replaces derived labels with D365's own, in your D365 language | No — falls back to labels derived from the field name |

The probe is the primary source on purpose: it runs against the same endpoint, with the same cookie and the same permissions as the inventory lookup, so it works wherever the extension already works. It reports exactly what *you* can see in *this* environment, which is why extension fields (`CTSCustGroup`, `CTSItemPrimaryCustId`, …) appear automatically with no special handling, and why fields you have no access to never show up as selectable.

The probe record's **values are used only to guess types and are then discarded** — nothing from it is stored or written to the audit log.

If the Metadata API isn't reachable (it isn't enabled for cookie sessions on every tenant), labels are derived from the field name instead: `CTSCustGroup` → "CTS Cust Group". Everything else works identically, and you can rename any field yourself.

Discovery runs automatically on the first ALT+hover in a tab, is cached per environment for 7 days, and can be re-run any time with **Refresh fields**.

### Setting it up

A first-time user starts with a curated set of 20 standard D365 fields (inventory unit, item model group, tracking dimension group, reservation hierarchy, coverage group, production type, cost group, the ten product filter codes, primary vendor, tax group and unit sequence group). Every one exists on a stock `ReleasedProductsV2`, so the tooltip is useful immediately without any setup. **Restore defaults** in the options page puts that set back at any time.

Emptying the list is respected: a selection you deliberately clear stays cleared and the panel disappears. Only a never-configured install falls back to the defaults.

To change what's shown, open the popup → **Configure tooltip…** (or the extension's options page directly):

1. Pick the **environment** — the dropdown lists every environment with a discovered catalog, plus any D365 tab you currently have open.
2. **Search** the field list (matches both the label and the raw property name) and click **+** to add a field.
3. In **Shown in tooltip**, reorder with ↑/↓, remove with ✕, and **type over the name to relabel it** — useful for extension fields whose derived label is cryptic.
4. Optionally turn off **Hide empty fields**, or switch to a one-column layout for fields with long values.

Up to 40 fields can be selected. Changes apply on the next hover; use **Refresh inventory data** in the popup for results already cached.

### Working across multiple environments

Your field **selection** is stored in `chrome.storage.sync` and is shared by every environment; each environment's **field catalog** is stored locally. Before each query, the selection is intersected with that environment's catalog and unknown fields are dropped.

This matters: a `$select` naming a property the environment doesn't have fails the **whole request** with HTTP 400. So selecting `CTSCustGroup` on the environment that has it would otherwise break the panel everywhere else. Instead, the field is silently skipped there, the rest still renders, and the tooltip notes how many fields were skipped. The options page marks such fields "not in this environment" rather than removing them — the other environment still needs them.

If a 400 happens anyway (selection used on an environment with no catalog yet), the extension discovers the catalog and retries once.

### Value formatting

| Raw value | Shown as |
|---|---|
| `""` (empty string) | – (hidden by default) |
| `1900-01-01T12:00:00Z` (D365's "no date") | – (hidden by default) |
| Other dates | Locale date format |
| Numbers | Locale-formatted; `0` is shown, not hidden |
| `Yes` / `No` and other enums | As D365 returns them (already localised) |

The `2154-12-31` max-date sentinel is deliberately **not** blanked — in a field like `SellEndDate` it carries the real meaning "no end date".

A typical released product leaves roughly 150 of its ~285 fields blank or zero, which is why **Hide empty fields** defaults to on.

### Notes and limits

### When there is no inventory

An item can exist as a released product and hold no stock at all, which is itself worth knowing. Since 1.1.0, a lookup that finds no inventory rows still renders the full tooltip when the product lookup succeeded: header, product details, and a note where the quantity table would be, explaining why it's missing.

This applies to inventory **errors** too, not just "not found" — an OData failure on the inventory half no longer costs you the product half.

The tooltip falls back to the old message-only form only when there is genuinely nothing else to show: no product fields selected, or the item has no released product record in that company either.

### Notes and limits

- `ReleasedProductsV2` has **no** `ProductName` property (only `SearchName` / `ProductSearchName`) — the name in the tooltip header still comes from the inventory response, so a no-stock tooltip shows the item number alone unless you select `SearchName` as a field.
- Product master data is per-company. With cross-company mode on, the panel shows the record for the company in the page URL when there is one, otherwise the first match, labelled with its company.
- The product call runs **in parallel** with the inventory call, so it adds no latency, and a failure in it never takes the inventory table down.
- With no fields selected, the second call is never made at all.

## Product Dimension Columns

`WarehousesOnHandV2` reports on-hand stock per **product dimension combination**, so one item can return several rows for the same warehouse — one per colour, size, configuration and so on. The tooltip shows a column for each dimension:

| Column | OData field |
|---|---|
| Config | `ProductConfigurationId` |
| Color | `ProductColorId` |
| Size | `ProductSizeId` |
| Style | `ProductStyleId` |
| Version | `ProductVersionId` |

**These are structural, not configurable.** Unlike the quantity columns, their visibility follows the data: a dimension gets a column as soon as **any** returned row carries a value for it, and is left out entirely otherwise. Most items use none of them and see no extra columns at all; an item with colours gets a Color column and nothing else.

Where a column is shown but a particular row has no value, that cell renders as `-`. That case is real and worth keeping visible: stock can be held against a colour on one row and without one on another, and a blank there is information rather than noise.

Column order follows D365's own: Config, Color, Size, Style, Version. To change it, reorder `DIMENSION_FIELD_DEFS` in `content.js`.

## Data Flow

```
User Alt+hovers over an item number
    ↓
Content script (running on the D365 page itself) detects ALT is held
    ↓
Field checked against data-dyn-controlname (if present) - skip if clearly not an item field
    ↓
150ms debounce - only fires once the cursor settles on the item
    ↓
Cache checked (5-min TTL, keyed by item + company/cross-company mode) - hit? Show immediately, no network call
    ↓
Rate limit checked (max 30 calls/min, backs off on HTTP 429)
    ↓
Legal entity resolved ONCE: cross-company setting read from storage, ?cmp= read from the page URL if not cross-company
    ↓
Two OData calls issued IN PARALLEL from the content script, against the page's own origin, sharing that scope:
    ├─ /data/WarehousesOnHandV2  - warehouse quantities                    (always)
    └─ /data/ReleasedProductsV2  - $select of the user's chosen fields,
                                   intersected with this environment's
                                   discovered catalog                      (only if fields are selected)
    ↓
Both settled (allSettled - a failed product call never takes the inventory table down)
    ↓
Results cached separately, logged to local audit trail (via background service worker)
    ↓
Tooltip updated: product details block, then warehouse inventory
    (or a "not found"/error/rate-limit message)
```

Field discovery runs alongside this, fire-and-forget, on the first ALT+hover in a tab — top frame only, and only when this environment's catalog is missing or older than 7 days. It never delays a tooltip.

The OData call is made from the content script (not the background service worker) so it runs in the D365 page's own browser context — this is what lets it use your existing D365 login/session cookie. A background-worker fetch would be treated as cross-site and get rejected with a 401.

## Item Number Detection

Detects flexible formats (must include at least one digit):
- `FG0010421-01` (with hyphen suffix)
- `RM0020011` (letter prefix and digits)
- `PACK-PALLET80_DEP` (mixed alphanumeric with underscore)
- `FG0010421` (without suffix)
- `SKU/001:A.B` (with slashes, colons, dots)

Pattern: `/^(?=[A-Z0-9\-_\/:.]*\d)[A-Z0-9][A-Z0-9\-_\/:\.]{2,}$/` — the digit requirement filters out pure-letter false positives like currency/UOM/status codes (USD, PCS, OPEN).

## OData Query

Scoped to the legal entity in the URL (default):
```
GET /data/WarehousesOnHandV2?cross-company=true&$filter=ItemNumber eq '{itemNumber}' and dataAreaId eq '{legalEntity}'
```

Cross-company mode enabled:
```
GET /data/WarehousesOnHandV2?cross-company=true&$filter=ItemNumber eq '{itemNumber}'
```

Fallback, only used when `?cmp=` can't be found in the page URL:
```
GET /data/WarehousesOnHandV2?$filter=ItemNumber eq '{itemNumber}'
```

Returns warehouse-level on-hand inventory broken down by product dimension (and, in cross-company mode, legal entity).

**Note:** Uses exact item number match (`eq`), so you must use the complete item number including any suffixes (e.g., `FG0010421-01`, not `FG0010421`).

Item numbers are escaped before being placed in the `$filter` literal (a `'` is doubled), so item numbers containing quotes, slashes or colons can't produce a malformed query.

### Product fields query

Issued in parallel with the above, only when fields are selected (see [Product Fields](#product-fields-releasedproductsv2)):

```
GET /data/ReleasedProductsV2?cross-company=true&$top=10
    &$select=dataAreaId,ItemNumber,{selected fields}
    &$filter=ItemNumber eq '{itemNumber}' and dataAreaId eq '{legalEntity}'
```

`$select` keeps the response to a few hundred bytes — a full `ReleasedProductsV2` record is ~285 properties and roughly 10KB. `dataAreaId` and `ItemNumber` are always requested so the response can be matched back to the right company.

## Query Restrictions (Load Reduction)

- ✅ **ALT+Hover required** — prevents accidental queries from passive hovering
- ✅ **Field targeting** — skips fields positively identified as non-item (via `data-dyn-controlname`) before ever considering a query
- ✅ **150ms hover-settle debounce** — collapses the burst of hover events nested grid elements fire, and skips items the cursor only passes over
- ✅ **5-minute cache** — same item queried again within 5 min uses the cached result, no new OData call
- ✅ **Rate limit** — max 30 **lookups** per rolling 60 seconds (cache hits don't count); shown to the user as a tooltip message if hit. A hover is one lookup no matter how many requests it makes, so enabling product fields doesn't halve your budget — the product call checks the window and the 429 backoff but doesn't consume a slot of its own
- ✅ **`$select` on product fields** — only the selected properties are transferred, not all ~285
- ✅ **7-day field catalog cache** — field discovery costs one or two requests per environment per week, never on the hover path
- ✅ **429 backoff** — if D365 itself returns "Too Many Requests", the extension pauses further calls (honoring `Retry-After` if present, otherwise 30s) instead of continuing to hit it
- ✅ **Query logging** — local audit trail tracks all queries, including the request/response for debugging
- ✅ **Query counter** — shows usage per day in the popup

## Tooltip Behavior

- **Appears:** Immediately as a loading spinner on ALT+Hover, then replaced with the result
- **Stays visible:** For 1 second after leaving the item (gives time to move to the tooltip itself)
- **Stays visible longer:** If you hover over the tooltip itself
- **Disappears:** When you move away from both item and tooltip, click elsewhere on the page, or the window loses focus

| Issue | Fix |
|-------|-----|
| Tooltip not appearing | Hold ALT while hovering, or press ALT while already hovering. Item must match the pattern format above, and the field must not be vetoed as non-item (see popup audit log to confirm a query fired) |
| Tooltip triggers on non-item fields | Check that field's `data-dyn-controlname` in DevTools and extend `ITEM_FIELD_NAME_PATTERN` in `content.js` if needed |
| "No inventory records found" despite data existing | The item number actually queried may differ from what's on screen (whitespace, wrong field extracted) - or the item genuinely has no stock in that legal entity. Expand the query in the popup's Recent Queries to see the exact request URL, including which company was filtered on, or enable cross-company mode to check every legal entity at once |
| Tooltip shows the wrong legal entity's data after switching company | Should no longer happen by default (see [Multi-Legal-Entity Support](#multi-legal-entity--cross-company-support)) - if it still does, check that the page URL actually contains `?cmp=`, via the Recent Queries detail in the popup |
| OData error / 401 | Your D365 session may have expired — reload the D365 tab and log in again |
| "Too many inventory lookups" | The rate limiter kicked in (30 calls/min) — wait a few seconds |
| Performance lag | Clear cache in the popup if results seem stale |

## Permissions

- `storage` — used to store the local query audit log/counters (`chrome.storage.local`), the cross-company toggle and tooltip column preferences (`chrome.storage.sync`), and the list of manually-activated sites
- `scripting` — used only for [manual site activation](#manual-site-activation) (dynamically registering/injecting the content scripts on an environment outside the built-in list; the file list is read from the manifest so it can't drift out of sync)
- `activeTab` — lets the popup read the current tab's URL (to know whether to show the "Site Access" section) without needing broad `tabs` access or prior host permission for that site. Only active while the popup is open.
- `host_permissions` — the 21 patterns in the table below, required to run the content script and query the OData endpoint on D365 F&O pages
- `optional_host_permissions: ["https://*/*"]` — grants nothing by itself. It only lets the popup's "Enable on this site" button ask Chrome, per-site and with an explicit permission prompt, for access to one specific environment outside the built-in list. See [Manual site activation](#manual-site-activation).

- `content_security_policy.extension_pages` — not a permission but a restriction: `connect-src 'none'` stops the popup, options page and background worker from making any network request. Only the content script, running in the D365 page, can make requests, and it only ever targets that page's own origin.

No other permissions are requested. **Product field support added no new permissions** — both the probe and the Metadata API are same-origin calls on environments the extension already has access to. The extension does not collect, store, or transmit any data to the developer or any third party — everything stays in your browser and your own D365 environment. It does not use remote code — all JavaScript is bundled in the package, and OData responses are only ever parsed as JSON data, never executed.

### Supported environment types

Static coverage, verified against Microsoft's [published list of supported geographies](https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/dev-itpro/deployment/deployment-options-geo) plus known dev/demo VM naming schemes:

| Environment | Example URL | Pattern |
|---|---|---|
| Production — United States (default/global) | `contoso.operations.dynamics.com` | `*.operations.dynamics.com` |
| Production — Europe | `contoso.operations.eu.dynamics.com` | `*.operations.eu.dynamics.com` |
| Production — France | `contoso.operations.fr.dynamics.com` | `*.operations.fr.dynamics.com` |
| Production — Norway | `contoso.operations.no.dynamics.com` | `*.operations.no.dynamics.com` |
| Production — South Africa | `contoso.operations.sa.dynamics.com` | `*.operations.sa.dynamics.com` |
| Production — Switzerland | `contoso.operations.ch.dynamics.com` | `*.operations.ch.dynamics.com` |
| Production — United Arab Emirates | `contoso.operations.uae.dynamics.com` | `*.operations.uae.dynamics.com` |
| Production — US Government (GCC) | `contoso.operations.gov.microsoftdynamics.us` | `*.operations.gov.microsoftdynamics.us` |
| Production — US Government (GCC High) | `contoso.operations.high.microsoftdynamics.us` | `*.operations.high.microsoftdynamics.us` |
| Sandbox / UAT (each geo above) | `contoso.sandbox.operations.eu.dynamics.com` | `*.sandbox.operations.<geo>.dynamics.com` |
| Dev/demo/build VMs (LCS Tier 1 cloud-hosted) | `devaos.cloudax.dynamics.com` | `*.cloudax.dynamics.com` |
| Dev/demo/build VMs (older LCS naming) | `devaos.axcloud.dynamics.com` | `*.axcloud.dynamics.com` |
| OneBox (local dev VM) | `usnconeboxax1aos.cloud.onebox.dynamics.com` | `*.cloud.onebox.dynamics.com` |

Only the US and EU production URLs are shown verbatim in Microsoft's table; the sandbox variant for the other five commercial geos and both government geos follows that same documented `sandbox.` prefix convention rather than being individually confirmed by Microsoft — use [manual site activation](#manual-site-activation) below if one doesn't match.

**Not covered by the static list:** DoD cloud, China (21Vianet-operated), and other non-standard deployments (e.g. a customer-hosted environment on `*.cloudapp.azure.com`) weren't on Microsoft's published list and aren't included as a guess. Use manual site activation for those, or add a permanent entry yourself by mirroring the pattern above in `host_permissions` and `content_scripts.matches` in `manifest.json`, plus `STATIC_HOST_PATTERNS` in `background.js`.

**Environments proxied by Microsoft Defender for Cloud Apps (Conditional Access App Control / Session Control):** if your org enables session-based Conditional Access for D365 F&O, Defender for Cloud Apps reverse-proxies the whole session and rewrites the hostname by appending `.mcas.ms` (e.g. `contoso.operations.dynamics.com` → `contoso.operations.dynamics.com.mcas.ms`). This is a per-tenant security decision, not a geography, so it can't be covered by the static list without a wildcard broad enough to match *any* organization's proxied cloud apps — which isn't something this extension should ever request. Use [manual site activation](#manual-site-activation) on the exact `...mcas.ms` hostname instead; since the extension always queries `window.location.origin` rather than a hardcoded backend URL, it should work transparently through the proxy the same way the rest of the D365 page already does.

### Manual site activation

If you land on a D365 F&O environment the extension doesn't recognize, open the popup — a "Site Access" section shows "Not recognized as a D365 F&O environment" with an **Enable on this site** button. Clicking it:

1. Asks Chrome for permission on that exact hostname only (a native browser prompt — the extension never gets silent access)
2. Registers `content.js`/`styles.css` to run there from now on, and injects them into the current tab immediately (no reload needed)
3. Persists the grant, so it survives closing the tab, the browser, or reloading the extension

The site then appears in a list in the popup with a **Remove** button, which revokes the permission and un-registers the script. This is the fallback for any environment — government cloud, China, a newly-provisioned dev VM, anything — that doesn't match the static list above, without needing a manifest change or extension update.

## Configuration

Configuration is split in two: the **popup** holds runtime controls and diagnostics, the **options page** holds what the tooltip shows.

**In popup (runtime & diagnostics):**
- Cross-company inventory toggle (persisted via `chrome.storage.sync`)
- Tooltip Contents — summary of what's configured, plus **Configure tooltip…** which opens the options page
- Site Access — manual site activation for environments outside the built-in list (see [Manual site activation](#manual-site-activation))
- Query counter (read-only, informational)
- Audit logs (last 10 queries, clearable, expandable to show the request/response)
- **Refresh inventory data** — discards the in-memory lookup caches (inventory + product details) in every open D365 tab, so the next hover re-queries. Does **not** touch field catalogs or the audit log
- **Clear Logs** — empties the local audit trail and resets the query counters. Does **not** discard cached lookups, so nothing is re-queried

These are deliberately separate: clearing the cache to see fresh data shouldn't destroy the request/response history you may be using to debug, and tidying the log shouldn't force every cached item back onto the wire. The third cache — the per-environment field catalog — is refreshed from its own **Refresh fields** button on the options page

**In options page (configuration):**
- Inventory quantities — show/hide and reorder Physical/Available/Reserved/Ordered/On Order (see [Tooltip Quantity Configuration](#tooltip-quantity-configuration))
- Product details — pick, order and relabel `ReleasedProductsV2` fields per environment (see [Product Fields](#product-fields-releasedproductsv2))
- Hide empty fields / layout for the product details block
- Share this configuration — export/import the field setup as JSON

**In extension:**
- Cache TTL: 5 minutes (configurable in `content.js`)
- Rate limit: 30 calls/minute (configurable in `content.js`)
- Regex pattern: `/^(?=[A-Z0-9\-_\/:.]*\d)[A-Z0-9][A-Z0-9\-_\/:\.]{2,}$/` (configurable in `content.js`)
- Item field allow-list: `/item|productnumber/i` matched against `data-dyn-controlname` (configurable in `content.js`)
- Shapes rejected despite matching the pattern: `NON_ITEM_PATTERNS` in `content.js` (clock times)
- Available quantity columns and their default order: `QUANTITY_FIELD_DEFS` in `content.js` (mirrored in `options.js`)
- Product dimension columns and their order: `DIMENSION_FIELD_DEFS` in `content.js`
- Product entity, catalog TTL (7 days) and max selected fields (40): `PRODUCT_ENTITY`, `FIELD_CATALOG_TTL`, `MAX_PRODUCT_FIELDS` in `content-product-fields.js`
- Default field selection for a new install: `DEFAULT_PRODUCT_FIELDS` in `content-product-fields.js` (mirrored in `options.js`)

## Tests

No build step, no test runner, no dependencies — the suites fake `chrome.*` and just enough DOM to run the real source files in Node:

```
node tests/product-fields.test.js     # field discovery, formatting, panel rendering
node tests/hover-detection.test.js    # item detection, tooltip self-query guard
node tests/tooltip-columns.test.js    # dimension column visibility, OData field mapping
```

`hover-detection.test.js` drives the actual `mouseenter` / `keydown` handlers. Point `PROJECT_DIR` at an older checkout to watch it reproduce the bug it guards against:

```
PROJECT_DIR=/path/to/older/checkout node tests/hover-detection.test.js
```

### The RELEASEDPRODUCTSV2.txt fixture

`RELEASEDPRODUCTSV2.txt` is a **sanitised** capture of a `ReleasedProductsV2` OData response, used only by `tests/product-fields.test.js`. **The extension never reads it** — field discovery queries the live environment (see [Product Fields](#product-fields-releasedproductsv2)).

Every value in it is synthetic. What is preserved is the *shape* the code cares about:

- all 285 property names, including `CTS*` extension fields, so the tests exercise extension-field discovery
- the `@odata.etag` annotation, so the tests confirm it's excluded from `$select`
- empty strings and zeros, so "hide empty fields" is exercised against realistic density
- D365's `1900-01-01T12:00:00Z` null-date sentinel
- standard D365 enum literals (`Yes`, `No`, `None`, `Staging`, …), so type inference is exercised

Everything else — item numbers, product names, customer IDs, company code, ledger dimensions, etags, the tenant hostname, dates and non-zero numbers — is replaced with deterministic placeholders (`ITEM-0001`, `CUST-001`, `VAL-01`, `usmf`, `contoso.sandbox.operations.dynamics.com`).

To re-sanitise a fresh capture from your own environment:

```
node tests/sanitise-fixture.js /path/to/raw-capture.txt RELEASEDPRODUCTSV2.txt
```

The script biases toward replacement: anything not provably a standard D365 enum literal is replaced. A misclassified enum only makes the fixture slightly less realistic; a misclassified business value would be a leak. It verifies nothing survives by checking the output against every distinct value in the input.

## Next Steps

- [ ] Warehouse pre-filter (only query selected warehouse)
- [ ] Page whitelist (only work on specific pages)
- [ ] Export audit logs as CSV
- [ ] Dark mode support
- [ ] Per-environment field selections (today the selection is global, with unavailable fields skipped per environment)
- [ ] Flag extension vs. standard fields in the picker by diffing catalogs across environments
- [ ] Keyboard shortcut to toggle on/off globally
- [ ] Cross-tab/frame rate limiting (currently per-tab/frame, not globally coordinated)
- [ ] Column-header-based field targeting for grid surfaces without `data-dyn-controlname`
- [ ] Legal entity resolution fallback for D365 surfaces that don't expose `?cmp=` in the URL

## Notes

- Extension uses your existing D365 browser session (no separate login, no credentials handled by the extension)
- All OData queries run directly in the D365 page's own context (content script), not the background service worker
- Audit logs stored locally in the browser only, never synced or transmitted elsewhere
- Field catalogs are stored per environment in `chrome.storage.local` (a ~285-field entity exceeds `storage.sync`'s 8KB per-item cap); the field *selection* is what syncs
- ALT+Hover requirement, field targeting, debouncing, caching, and rate limiting together keep OData traffic to a minimum and reduce false positives
- Query counter resets daily at UTC midnight

---

**Version:** 1.1.1
**Last Updated:** 2026-09-23
**License:** MIT — see [LICENSE](LICENSE) · [Privacy](PRIVACY.md) · [Security](SECURITY.md) · [Changelog](CHANGELOG.md)
