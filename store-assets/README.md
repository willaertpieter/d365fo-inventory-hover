# Store assets

Screenshots for the Microsoft Edge Add-ons listing, 1280x800 as the store requires.

| File | Shows |
|---|---|
| `shot-1-hover.png` | ALT+hover tooltip: product details above the inventory table |
| `shot-2-dimensions.png` | Colour/Size columns appearing for an item that uses those dimensions |
| `shot-3-settings.png` | The options page field picker |
| `shot-4-popup.png` | The toolbar popup: runtime controls, counters, audit log |

Each `.png` is rendered from the `.html` beside it. To regenerate after a UI change:

```
"%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --headless=new --disable-gpu ^
  --hide-scrollbars --force-device-scale-factor=1 --window-size=1280,800 ^
  --screenshot=shot-1-hover.png --user-data-dir=%TEMP%\edge-shot-1 ^
  --virtual-time-budget=3000 file:///<full-path>/shot-1-hover.html
```

Use a **fresh `--user-data-dir` per shot**: Edge hands the URL to an already-running
instance otherwise and silently skips the screenshot.

Accuracy notes, which matter if these are ever regenerated:

- Shots 3 and 4 are the extension's real `options.html` and `popup.html`, with a
  small `<script>` appended to inject demo data (the real scripts need `chrome.*`).
  The markup and CSS are the product's own.
- Shots 1 and 2 link the real `styles.css` and mirror the DOM `content.js` builds,
  so the tooltip is pixel-accurate. The page behind it is a neutral stand-in, not a
  D365 screenshot: no Microsoft branding, no logos, synthetic data throughout.
- All data is invented. Nothing here comes from a real environment.

**When editing these, do not paste values from a live system.** Warehouse codes,
unit sequence groups, product names and even quantity rows are customer-specific.
An early version of these shots reused warehouse codes and a quantity row from a
real screenshot; they were replaced with MAIN / WH001 / WH002 and invented figures.
Generic codes that read the same on any implementation, such as the PCS-PL unit
sequence group, are fine to keep.
