# Privacy policy: D365FO Inventory Hover

**Effective:** 24 September 2026 · **Applies to:** version 1.2.0 and later

## In short

- The extension talks **only to the Dynamics 365 Finance & Operations environment in your current tab**, using the sign-in you already have. It sees only what your D365 security roles already let you see.
- It sends **nothing to the developer or to any third party**. There is no server behind this extension, no analytics, no telemetry, no advertising and no remotely loaded code.
- What it keeps (settings, a lookup cache and a local query log) stays **in your own browser profile**, and you can clear it at any time.
- The full source code is public: every claim below can be checked in the code.

## Who makes it, and why

D365FO Inventory Hover is a personal project by Pieter Willaert, built in free time to avoid leaving the page every time stock needs checking. It has no business model: it is free, there is no paid tier, and it does not collect data or generate leads. If that ever changed, it would be announced in advance and released as a new major version with an updated policy. It would never happen silently in an update.

## What the extension accesses

It runs only on D365 F&O pages: the Microsoft-hosted address patterns listed in the manifest, plus any site you enable yourself with **Enable on this site** in the popup.

On those pages it does nothing until you **hold Alt while hovering** a field. It then reads:

- the D365 control name of the field under your cursor, to tell item number fields from all other fields, and
- only if it is an item number field, the value of that field: the item number.

It does not read, scrape or record any other page content.

For each lookup it makes these requests, all to the **same environment the page is on** (`window.location.origin`), with your existing session:

| Request | Purpose |
|---|---|
| `GET /data/WarehousesOnHandV2?...ItemNumber eq '<item>'...` | Stock per warehouse for that one item |
| `GET /data/ReleasedProductsV2?$select=<your chosen fields>...` | The product fields you chose to show, for that one item |
| `GET /data/ReleasedProductsV2?$top=1` | Once per environment per week: read which product **fields exist** (names and types). The record's values are used to infer field types and then discarded |
| `GET /metadata/PublicEntities(Name='ReleasedProductsV2')` | With the call above: field labels in your D365 language |

These are the only network requests in the extension. You can see every one of them in the popup's **Recent queries** log, and in your browser's DevTools (Network tab). The popup, settings page and background worker are additionally blocked from making any network request at all by the extension's content security policy (`connect-src 'none'` in `manifest.json`).

## What it stores, where, and for how long

| What | Where | Kept for | How to remove |
|---|---|---|---|
| Lookup results (stock and product fields), so hovering the same item again is instant | Memory of that browser tab | 5 minutes, or until the tab is closed | **Refresh inventory data** in the popup, or close the tab |
| Query log: time, item number, success or error, the request URL (which includes your environment's address, the item number and company), and the response text, capped at 5,000 characters per entry | Browser storage on this computer (`chrome.storage.local`) | The most recent 1,000 queries | **Clear Logs** in the popup |
| Query counters (today and total) | `chrome.storage.local` | Until cleared | **Clear Logs** |
| Field list per environment: field names, types and labels, the environment's address, and when it was read. No field **values** | `chrome.storage.local` | Re-read after 7 days | Replaced by **Refresh fields** in the settings; removed on uninstall |
| Sites you enabled manually (host names) | `chrome.storage.local` | Until you remove them | **Remove** in the popup |
| Your settings: cross-company on/off, quantity columns, which product fields to show and your own labels for them, hide-empty and layout | `chrome.storage.sync` | Until you change them | Settings page, or uninstall |

Two things are worth knowing:

- **The query log contains business data.** The stored responses are real stock figures and product field values, kept so you can see exactly what was requested and returned. They stay on this computer, inside your browser profile, and are never sent anywhere. If that is not acceptable on a shared or unmanaged device, use **Clear Logs** regularly.
- **Settings follow browser sync.** If you have turned on sync in Microsoft Edge (or Chrome), your browser syncs the settings above through your own Microsoft (or Google) account, the same way it syncs bookmarks. They contain no business data, only your preferences and any field labels you typed. The developer has no access to them.

Uninstalling the extension deletes everything it stored.

For troubleshooting, the extension also writes short messages to the browser's developer console of the D365 tab, such as the item number being looked up or the control name of a field that was skipped. They are visible only to you, in that tab, and are not stored.

## What it does not do

- It does not send data to the developer, to analytics or advertising services, or to anyone else.
- It does not sell, share or rent data of any kind.
- It does not load or run code from the internet. All code ships in the package, and D365 responses are only ever parsed as data.
- It never changes anything in D365. Every request is a read-only `GET`.
- It does not handle passwords or tokens. It relies on the browser session you are already signed in with.

## Permissions

| Permission | Why |
|---|---|
| Access to D365 F&O addresses (`host_permissions`) | To run on D365 pages and query the environment you are on |
| `storage` | Settings, the query log and field lists, as described above |
| `scripting` | Only for **Enable on this site**: running the extension on an address you approve that isn't on the built-in list |
| `activeTab` | Lets the popup see the current tab's address while it is open, to offer **Enable on this site** |
| Optional access to other `https` sites | Requested per site, with the browser's own permission prompt, only when you click **Enable on this site** |

## Updates

- Each release is built from a tagged version of the public source with `scripts/package.js`, and published with SHA-256 checksums of every file.
- You can check that the copy installed in your browser is exactly that source with `scripts/verify.js`.
- If an update ever asks for new permissions, your browser disables the extension and asks you before it runs again.
- Every change is listed in `CHANGELOG.md`.

Organisations can control or pin extensions with Microsoft Edge policies (`ExtensionSettings`, `ExtensionInstallAllowlist`, `ExtensionInstallForcelist`). They can also build and distribute a version they have reviewed themselves from the source.

## Changes to this policy

Changes to this policy are made in the public repository, so their full history is visible. The effective date at the top changes with every update.

## Contact

Questions or concerns: open an issue at https://github.com/willaertpieter/d365fo-inventory-hover/issues. For anything security-sensitive, see [SECURITY.md](SECURITY.md).
