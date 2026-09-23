# Security

## Reporting a vulnerability

Please report security issues privately, not in a public issue:

- **Preferred:** GitHub's private vulnerability reporting. Open the repository's **Security** tab and choose **Report a vulnerability** (https://github.com/willaertpieter/d365fo-inventory-hover/security/advisories/new).
- Include the extension version, browser and version, and steps to reproduce. Never include real business data from your environment; a description or synthetic example is enough.

This is a free, one-person project, so fixes are best effort. You can expect an acknowledgement within a week. Confirmed issues are fixed in a new release, with credit if you'd like it.

Only the latest release is supported. Please check that the issue still exists in the latest version before reporting.

## In scope

- Anything that could send D365 data anywhere other than the environment in the current tab
- Code or HTML injection from OData values into the tooltip, popup or settings page
- The extension running on, or querying, sites it shouldn't
- Anything that bypasses the Alt-to-query requirement, the cache or the rate limit in a way that could harm an environment
- A published release that doesn't match its tagged source (see "Checking a release" below)

## How the extension is built to be safe

- **Same-origin only.** Every request goes to `window.location.origin`: the D365 environment the page is on. There is no developer server and no hard-coded external address.
- **Read-only.** Every request is an OData `GET`. The extension never writes to D365.
- **Your permissions, not more.** Requests use your existing browser session, so D365 security roles apply exactly as they do in the UI. The extension never sees your password or any token.
- **No remote code.** All JavaScript ships in the package. D365 responses are parsed as JSON data and rendered with DOM APIs (`textContent`), never as HTML.
- **Locked-down extension pages.** The content security policy in `manifest.json` (`connect-src 'none'`) blocks the popup, settings page and background worker from making any network request.
- **Escaped queries.** Item numbers are escaped before being placed in an OData `$filter`, so unusual item numbers can't produce a malformed query.
- **Gentle on your environment.** Queries run only while Alt is held. Results are cached for 5 minutes, there are at most 30 lookups per minute, and the extension backs off automatically when D365 returns HTTP 429.

## Checking a release

Every release is built from a git tag with `node scripts/package.js <tag>`. The package is reproducible: the same tag gives the same bytes on any machine. The release notes list the SHA-256 of every file.

To check that the extension installed in your browser is exactly that source:

```
git clone https://github.com/willaertpieter/d365fo-inventory-hover
cd d365fo-inventory-hover
node scripts/verify.js "%LOCALAPPDATA%\Microsoft\Edge\User Data\Default\Extensions\<extension-id>\<version>_0" v1.1.1
```

Every file must match byte-for-byte. The one exception is `manifest.json`, where the store adds its own fields (such as `update_url`); those are listed and allowed, and everything else must be identical. Find the extension id on `edge://extensions` with Developer mode on.
