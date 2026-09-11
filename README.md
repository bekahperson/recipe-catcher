# Recipe Catcher

A Safari extension (macOS + iOS) that grabs **just the ingredients and instructions**
from a recipe web page — skipping the pop-up ads, cookie walls, and "submit this form
to view the recipe" gates — and opens them in a clean, text-only tab you can **read,
print, or save to PDF**, with a one-tap **metric ⇄ imperial** toggle.

The reader shows the instructions in the main column and a right-hand rail with:

- **Servings scaler** — type an exact serving count (or step it); every ingredient
  quantity rescales and the whole-batch calorie total follows. When a recipe has no
  parseable yield, it falls back to a ½×–8× multiplier.
- **Shopping list** — the ingredients as tickable circle checkboxes (toggle on screen;
  they print as open circles to check off by hand). Ticks survive unit toggling.
  A **Copy** button puts the list (title + current units + scaled amounts) on the
  clipboard for pasting into Notes, Reminders, or a message.
- **Nutrition (per serving)** — uses the page's own `schema.org` nutrition data when
  present, otherwise **estimates** calories + protein/fat/carbs from the ingredients,
  clearly labeled and with a coverage note. (Per-serving values are intrinsic to the
  recipe, so they stay constant when you scale the batch; the whole-batch total moves.)

**Dark mode** follows the browser/OS appearance automatically (Auto). A toolbar toggle
cycles **Auto → Light → Dark** if you want to override it; the choice is remembered.

**On-page prompt.** When you land on a page that has a recipe, a small dismissible
**"Catch this recipe?"** bar slides up (bottom-right on desktop/iPad, full-width on
iPhone). It only appears on pages with real structured recipe data, it's an in-page
element in a Shadow DOM — not a browser pop-up, so pop-up blockers don't affect it — and
you can turn it off with the **"Suggest on recipe pages"** switch in the toolbar popup.

## How it works

Nearly every real recipe site embeds its recipe as machine-readable
[schema.org/Recipe](https://schema.org/Recipe) structured data (JSON-LD or microdata).
Recipe Catcher reads *that* — not the rendered, ad-covered page — which is why overlays
and interstitials don't matter: the recipe text is in the page's markup regardless of
what's visually on top of it. If a page has no structured data, it falls back to
microdata and then a heuristic scan for "Ingredients" / "Instructions" sections.

Everything runs locally. No network calls, no tracking, no accounts.

**Privacy by design.** Recipe Catcher makes no network requests, has no analytics, and
collects nothing. A small content script loads on the pages you visit so it's ready the
instant you click, but it does nothing on its own — it only reads and extracts a recipe
when you press **Catch this recipe**, and it never modifies pages or transmits anything.
Your preferences and the captured recipe live in local extension storage on your device.

## Project layout

```
extension/            The Safari Web Extension source (the real code)
  manifest.json         MV3 manifest
  parser.js             Recipe extraction (JSON-LD → microdata → heuristics)
  units.js              Metric/imperial parsing + conversion engine
  nutrition.js          Per-serving nutrition (site data, or ingredient estimate)
  content.js            Runs in the page; extracts on request
  background.js         Orchestrates capture → opens the reader tab
  popup.{html,js,css}   Toolbar button UI + default-units setting
  reader.{html,js,css}  The clean, printable recipe tab + unit toggle
  icons/                App/extension icons (generated from icon.svg)
scripts/
  run-tests.sh          Run the logic tests (node, or macOS jsc fallback)
  build-xcode.sh        Wrap extension/ into an Xcode project (macOS + iOS)
test/                   Unit tests for the parser and unit engine
store/                  App Store submission assets (see below)
  privacy-policy.html     Hostable privacy policy (also .md)
  app-store-listing.md    Name, subtitle, description, keywords, pricing notes
  review-notes.md         Notes + test steps for the App Review team
  appicon/                Opaque 1024 app icon (icon-app.svg → icon-1024.png)
```

## Develop & test

Run the logic tests (no browser needed):

```bash
./scripts/run-tests.sh
```

Uses `node --test` if Node is installed, otherwise the macOS-bundled JavaScriptCore.

## Build & load in Safari (macOS)

1. Generate the Xcode project:
   ```bash
   ./scripts/build-xcode.sh
   ```
2. Open `Recipe Catcher/Recipe Catcher.xcodeproj` in Xcode and **Run** the
   **Recipe Catcher (macOS)** scheme once (this registers the extension with Safari).
3. In Safari: **Settings → Advanced →** check **"Show features for web developers"**.
4. **Develop menu → Allow Unsigned Extensions** (needed until the app is signed with
   your Apple Developer account; this resets each time Safari restarts).
5. **Settings → Extensions →** enable **Recipe Catcher**, and allow it on the sites
   you want (or all sites).
6. Open any recipe page, click the **Recipe Catcher** toolbar button, then **Catch
   this recipe**. A clean tab opens. Use the **Imperial / Metric** toggle, and
   **Print / Save PDF** to export.

## Build for iOS

The same `build-xcode.sh` also creates a **Recipe Catcher (iOS)** target. Select it in
Xcode with an iOS Simulator or your device, set your signing **Team** on both the app
and the extension targets (Signing & Capabilities), and Run. Enable the extension in
**Settings → Safari → Extensions** on the device. On iOS, "Save to PDF" is done from
the share sheet in Safari's print preview.

## Publishing to the App Store (Safari)

The `store/` folder has the paperwork ready:

- **Privacy policy** — host `store/privacy-policy.html` anywhere (e.g. GitHub Pages) and
  use its URL in App Store Connect. Fill in the contact email placeholder first.
- **Listing copy** — `store/app-store-listing.md` (name, subtitle, description, keywords,
  category, and pricing notes for the $0.99 tier).
- **Review notes** — `store/review-notes.md` (how to enable + test; paste into App Review
  Information).
- **App icon** — `scripts/build-xcode.sh` installs the opaque 1024 icon
  (`store/appicon/icon-1024.png`) into the generated project automatically, because the
  converter's default iOS icon has an alpha channel that Apple rejects.

Before uploading: set your **bundle-ID prefix** in `scripts/build-xcode.sh` (`BUNDLE_ID`,
currently `com.rodgers.recipecatcher`) to your own reverse-domain, then in Xcode set your
signing **Team**, archive, and submit. To sell it, sign the **Paid Applications
Agreement** (App Store Connect → Business) or the price stays locked to Free.

## Notes & scope

- Ships English unit words and common abbreviations; the tables in `units.js` are easy
  to extend.
- Ranges (e.g. "1 to 2 cups") convert both ends; countable items ("2 eggs") and
  unmeasured lines ("salt, to taste") pass through unchanged.
- Oven temperatures in the instructions are annotated inline with the other unit —
  e.g. `450 degrees F (232°C)` — rounded to the nearest degree, in both directions.
- In metric, dry goods (flour, sugar, …) are weighed in **grams** while liquids stay in
  **ml**. The shopping list drops parenthetical prep notes for brevity.
- When a recipe writes an amount ambiguously (e.g. `2-21/2` with a missing space), the
  reader repairs it to its best reading (`2–2 1/2`) and marks it **⚠ check amount** so you
  can verify.
- Nutrition is a rough estimate when the site provides no data; the food table in
  `nutrition.js` covers common baking/cooking staples and is easy to extend. It reports
  how many ingredients it could account for and is not dietary advice.
- For real device install / the App Store, sign the app with your Apple ID; unsigned
  loading (above) is for local development only.
