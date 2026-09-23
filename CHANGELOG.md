# Changelog

Every release, what changed and whether permissions changed. Releases are tagged
in git; each store package is built from its tag with `scripts/package.js` (see
[SECURITY.md](SECURITY.md#checking-a-release)).

## 1.1.1 (unreleased)

Transparency release, plus one fix. **No new permissions**.

- Fix: on a fresh install the popup said "no product fields", although the tooltip shows the 20 default fields. It now reports the defaults. A selection you empty on purpose still reads "no product fields".
- The popup, settings page and background worker are now blocked from making any network request, by a content security policy in `manifest.json` (`connect-src 'none'`). The only requests the extension can make are the D365 lookups from the page itself.
- Published under the MIT license, with a [privacy policy](PRIVACY.md) and a [security policy](SECURITY.md).
- Added `scripts/package.js` (reproducible store package with SHA-256 checksums) and `scripts/verify.js` (check an installed copy against the tagged source).

## 1.1.0 (2026-09-22)

- An item with no inventory records still shows its product details, with a note where the quantity table would be. Inventory errors no longer hide the product details either.

## 1.0.0 (2026-09-22)

- **Product fields in the tooltip:** show any `ReleasedProductsV2` field above the inventory table. The field list is read from each environment, so extension fields work without code changes. Fields can be picked, reordered and relabelled in the settings page.
- New installs start with a curated set of 20 standard fields.
- Color, Size, Style and Version columns appear when the item uses those dimensions, alongside Config.
- "Clear Cache" renamed to **Refresh inventory data**, with help text for it and for **Clear Logs**.
- Fix: holding Alt over the tooltip itself could trigger a lookup of the tooltip's own contents.
- Test suites added (`tests/`), with a sanitised fixture.

Permissions unchanged.

## 0.7.1

Baseline: Alt+hover inventory tooltip, cross-company mode, configurable quantity columns, caching, rate limiting, local audit log and manual site activation.
