# Chrome Web Store & Firefox AMO listing — Recipe Catcher

Copy-and-paste fields for the two web-extension stores. The Safari/App Store copy lives
in `app-store-listing.md`; this file is the browser-store adaptation of it.

Upload artifacts come from `./scripts/build-webext.sh`:
- Chrome  → `dist/chrome.zip`
- Firefox → `dist/firefox.zip`

---

## Shared copy

### Name
`Recipe Catcher`

### Short description / summary (Chrome: 132 max, AMO: 250 max)
This is also the manifest `description`, which the Chrome Web Store caps at 132 characters
— `scripts/build-webext.sh` fails the build if it grows past that.
`Grab just the ingredients and instructions from any recipe page — no ads, no pop-ups. Clean, printable, metric or imperial.`

### Full description

Tired of scrolling past pop-ups, auto-playing videos, cookie banners, and a novel's worth of backstory just to find the ingredients? Recipe Catcher fixes that.

On a recipe page, click the Recipe Catcher button (or the "Catch this recipe?" prompt) and it pulls out just what you need — the ingredients and instructions — and opens them in a clean, text-only tab you can actually read, print, or save as a PDF.

WHY IT'S DIFFERENT
Recipe Catcher reads the recipe's underlying structured data, so ads, overlays, and "subscribe to view" pop-ups simply don't get in the way.

FEATURES
• Clean, readable recipe — no ads, no clutter, no pop-ups
• One click to switch between metric and imperial
• Adjust the servings — quantities rescale instantly
• Built-in shopping list with checkboxes you can tick (on screen or on paper)
• Copy the shopping list to paste into notes, reminders, or a message
• Estimated nutrition per serving (calories + protein/fat/carbs)
• Print or save a tidy PDF
• Automatic light and dark mode
• Fast, private, and fully offline — nothing you do is tracked or uploaded

PRIVACY
Recipe Catcher has no accounts, no servers, and makes no network requests. Everything
happens on your device, and nothing is ever uploaded.

### Category
- Chrome: **Productivity** (alternative: Lifestyle)
- Firefox: **Shopping** or **Other** (AMO has no food category; "Other" is the honest fit)

### Privacy policy URL
**Privacy Policy URL** (required by both stores):

    https://bekahperson.github.io/recipe-catcher/privacy-policy.html

**Support / homepage URL:**

    https://bekahperson.github.io/recipe-catcher/

Both are live, served from `docs/` via GitHub Pages. Source repo: https://github.com/bekahperson/recipe-catcher

### Screenshots
Use `store/screenshots/chrome/*.png` — **1280×800, 24-bit PNG, no alpha**, which is what
the Chrome Web Store requires (it rejects PNGs with an alpha channel). 01 and 02 are the
`screenshots/macos/` designs with the redundant, fully-opaque alpha channel stripped, so
their pixels are unchanged. 03 was rebuilt (the original's headline overflowed behind the
card and its unit toggle contradicted the amounts shown); its source is
`store/screenshots/src/screenshot-03.html`, with the re-render command in that file's
header comment. AMO accepts the same files. Up to 5; at least 1 required.

### Promo tiles
Both 24-bit PNG, no alpha, sources in `store/promo/src/` with re-render commands in their
header comments. Neither is required to submit.

- **Small tile** `store/promo/small-tile-440x280.png` (440x280) — what the Web Store shows
  in category and search grids, so it is worth having.
- **Marquee** `store/promo/marquee-1400x560.png` (1400x560) — only used if Google features
  the extension, but it must already be uploaded to be eligible.

### Pricing
List **free** on both. The Chrome Web Store no longer supports paid extensions or its
in-app payments API, so the $0.99 price in the App Store listing does not carry over.

---

## Chrome Web Store specifics

One-time **$5** developer registration before you can publish.

### Single purpose statement
> Recipe Catcher extracts the ingredient list and cooking instructions from the recipe
> page the user is viewing and presents them in a single clean, readable, printable page.

### Permission justifications

Answer these in Dashboard → your item → **Privacy practices**. Be precise — a vague
justification for `<all_urls>` is the most common cause of review delay.

| Permission | Justification to paste |
|---|---|
| `activeTab` | Lets the toolbar button read the page the user is currently on, at the moment they click it, without requiring broad access to other sites. |
| `scripting` | The recipe parser normally loads with the page. If the page was already open before the extension was installed or updated, no parser is present, so the extension injects it into that one tab on demand when the user clicks Catch. Only extension files are injected; no remote code. |
| `storage` | Stores the user's preferences (metric/imperial, whether the on-page prompt is shown) and passes the extracted recipe to the reader tab that opens. Local to the device; nothing is sent anywhere. |
| `host_permissions` (`<all_urls>`) | Recipes are published on an unbounded set of independent websites, so the extension cannot list them in advance. On each page the extension checks locally whether the page contains structured recipe data, and if so offers a "Catch this recipe?" prompt. Both the check and the extraction run entirely in the browser; the extension makes no network requests and transmits nothing. |

### Remote code
**No**, this extension does not use remote code. All JavaScript is contained in the
uploaded package and is unminified.

### Data usage
Check **nothing** in the data collection list, then certify all three statements:
- Not being sold to third parties
- Not being used or transferred for purposes unrelated to the item's single purpose
- Not being used or transferred to determine creditworthiness or for lending

### Expected warning
Because of the `<all_urls>` content script, Chrome shows users **"Read and change all your
data on all websites."** That is unavoidable while the auto-prompt runs on page load. If a
reviewer pushes back, the fallback is to drop the declarative content script and rely on
`activeTab` + `scripting` alone — the toolbar button would still work, but the automatic
"Catch this recipe?" prompt would have to go.

---

## Firefox AMO specifics

Free to publish. Upload `dist/firefox.zip`; AMO signs it automatically. You can also
self-distribute the signed XPI instead of listing it.

- **Add-on ID:** `recipe-catcher@rodgers` (set in the generated Firefox manifest)
- **Minimum Firefox version:** 121.0 (MV3 event-page background support)
- **Source code:** reviewers may request it. Ours is plain, unminified JS with no build
  step for the extension itself, so point them at the uploaded package or this repo.
- **License:** MIT (see `LICENSE` at the repo root); select "MIT License" in the AMO form.

### Note on Firefox host permissions — resolved
The concern was that Firefox MV3's opt-in `host_permissions` would suppress the on-page
prompt until the user granted site access. **Tested on Firefox 155.0.1: it does not.**
`<all_urls>` is granted at install and the prompt appears with no manual step, so the
listing needs no first-run caveat. (Verified via a temporary add-on install with
`scripts/smoke-firefox.py`; re-check once on the first AMO-signed build.)

---

## Reviewer test steps (both stores)

1. Install/load the extension.
2. Open a recipe page, e.g.
   - https://www.allrecipes.com/recipe/17481/simple-white-cake/
   - https://www.bbcgoodfood.com/recipes/classic-victoria-sandwich
3. A "Catch this recipe?" prompt appears at the bottom of the page. Click **Catch recipe**
   (or use the toolbar button → "Catch this recipe").
4. A clean recipe tab opens. Try the Imperial/Metric toggle, the Servings stepper, the
   shopping-list checkboxes, **Copy**, and **Print / Save PDF**.

No sign-in, no accounts, no network access.
