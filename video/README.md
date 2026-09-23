# Promo / tutorial video

Source for the YouTube video that shows and explains D365FO Inventory Hover. Everything is
generated from code: the narration, every frame, the sound effects and the music. Edit a
line of narration or a scene and re-run one command.

## What it produces (`output/`)

| File | Use |
|---|---|
| `D365FO-Inventory-Hover.mp4` | The video: 2560x1440, 30 fps, narration + sound effects + music, loudness-normalised to -14 LUFS (YouTube's target), chapters embedded |
| `D365FO-Inventory-Hover-no-music.mp4` | Same, without the music bed, in case you'd rather add a track from YouTube Studio's audio library |
| `captions.srt` | English captions; upload under Subtitles in YouTube Studio |
| `thumbnail.png` | 1280x720 custom thumbnail |
| `youtube-description.txt` | Title, description with chapter timestamps, and tags |

Before publishing, put the real Microsoft Edge Add-ons link in the description: either edit
the text file, or rebuild it with `STORE_LINK=https://... node make.js extras`.

## How it's built

| File | Role |
|---|---|
| `script.js` | The narration. `say` is what the voice speaks (written for the ear: "D-three-sixty-five"), `cap` the caption text, `{marker}` sync points the visuals land on |
| `tts.js` | Synthesizes each line (Microsoft Edge neural voice `en-US-AndrewMultilingualNeural`, via `msedge-tts`) and lays out `timeline.json`: line start times, word timings, marker times. Lines are cached by content hash |
| `stage/` | The video as a web page. `renderFrame(t)` draws any moment, so frames render in any order and in parallel |
| `stage/scenes.js` | Choreography of all 11 scenes, scheduled against narration markers |
| `stage/components.js` | Camera, cursor, spotlight, Alt-key overlay, Microsoft Edge frame, D365 page recreation, tooltip builder |
| `stage/data.js` | The demo data (all fictional) |
| `render.js` | Headless Microsoft Edge renders the frames and pipes them to ffmpeg |
| `audio.js` | Mixes narration, synthesized UI sounds and an original generated music bed that ducks under the voice |
| `make.js` | Runs everything and writes `output/` |

**Accuracy.** The tooltip in every scene is the extension's real markup (mirroring
`createTooltip()` / `buildProductDetailsPanel()`) styled by the real `../styles.css`. The toolbar
popup and the settings page are the real `../popup.html` and `../options.html`, loaded as-is
with demo data filled in the way `popup.js` / `options.js` render it. A UI change in the
extension shows up in the video on the next render.

**Data.** All data is invented: a fictional coffee and tea company on a `contoso` environment,
with Microsoft's well-known sample names (Contoso, Northwind Traders, USMF/GBSI). The D365 pages
are recreated in HTML in the standard blue theme, with colours sampled from real screenshots (UI
chrome only). As with `store-assets/`, **never paste values from a live system into
`stage/data.js`**: warehouse codes, unit sequence groups, customer and product names are all
customer-specific.

## Rebuilding

Needs Node 18+ and Microsoft Edge (used headless for rendering). The narration step needs
internet access: the script text is sent to Microsoft's Edge read-aloud service.

```
cd video
npm install
node node_modules/ffmpeg-static/install.js   # only if npm skipped install scripts
node make.js                                  # everything, ~5 minutes
```

Steps can be run on their own: `node make.js tts`, `video`, `audio`, `mux`, `extras`.
Intermediate files go to `build/`; point `BUILD_DIR` elsewhere to keep them out of OneDrive.

To check a single moment without rendering the whole video:

```
node render.js stills 56 75.8     # -> build/stills/*.png at those times (seconds)
```

Options: `WORKERS=4` (parallel renderers), `SCALE=1.25` (render 1920x1080 instead of 1440p),
`MUSIC_DB=-15` (music level; lower is quieter).
