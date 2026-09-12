# Recipe Catcher — Chrome & Firefox (DONE — submitted 2026-09-11)

Both stores are **submitted and awaiting review**. Nothing here is outstanding; this file
is kept as the record of what was done and what to know next time.

- **Chrome Web Store** — submitted, pending manual review. Expect extra scrutiny of the
  `<all_urls>` host permission; the justifications are in `store/webstore-listing.md`.
- **Firefox AMO** — submitted. Validator passed with 0 errors and 10 warnings, all
  reviewed and benign (see "Known warnings" below).
- **Safari / App Store** — **paused deliberately**, pending the $99/yr Apple Developer
  registration. See `HANDOFF.md`, and read "Before resubmitting Safari" below first.

Site: https://bekahperson.github.io/recipe-catcher/ (privacy policy + support page,
served from `docs/` via GitHub Pages). Repo: https://github.com/bekahperson/recipe-catcher
Support: recipecatcher.support@gmail.com

---

## Before resubmitting Safari — read this

1. **`store/review-notes.md` is inaccurate.** It tells App Review the content script
   "only reads … when the user taps Catch this recipe". It does not: `maybeSuggest()` runs
   `hasStructuredRecipe(document)` on every page load to decide whether to offer the
   prompt. Nothing leaves the device either way, but the claim is wrong and it is exactly
   the sort of discrepancy that invites questions on a broad host permission. The
   Chrome/AMO copy, the README and `store/privacy-policy.*` were all corrected; this file
   was left alone because Safari work was paused. **Fix it before resubmitting.**
2. **Re-sync the extension into the Xcode project** with `scripts/sync-extension.sh` —
   `extension/` changed materially this session (parser fixes, `activeTab`, regenerated
   icons). Do NOT run `build-xcode.sh`; it regenerates the project and resets signing.
3. **`store/appicon/icon-1024.png` must stay opaque.** Apple rejects an alpha channel.
   `scripts/build-icons.py` deliberately does not touch it.
4. The App Store listing copy in `store/app-store-listing.md` still assumes the $0.99
   price tier; Chrome and AMO are listed free.

---

## Known warnings (reviewed, no action needed)

AMO's validator: 0 errors, 10 warnings.

- **8x "Unsafe assignment to innerHTML"** — false positives. Every interpolation of
  page-derived data passes through `esc()` in `reader.js`, URLs additionally through
  `safeHref()` (http(s) only), and the rest are integers. `parser.js:22` assigns to a
  **detached `<textarea>`** purely to decode entities; its content model is RCDATA, so
  nothing executes. Mozilla's linter flags every `innerHTML` template literal regardless
  of escaping — it cannot prove safety statically. Wording to reply with is in
  `store/webstore-listing.md`.
- **2x "Manifest key not supported by the specified minimum Firefox version"** — real but
  harmless. `data_collection_permissions` needs Firefox 140; we declare
  `strict_min_version: 121`, so on 121-139 the key is ignored. Since the declaration is
  "collects nothing", nothing is concealed from those users. **Bump the floor to `140.0`
  in `scripts/build-webext.sh` at the next version bump** to clear both warnings.

## Next version — do these together

- Bump `version` in `extension/manifest.json` (single source of truth; the Firefox
  manifest is derived from it, so it only changes in one place).
- Raise `strict_min_version` to `140.0` (above).
- Consider adding `"64"` to `manifest.icons` — `icon-64.png` now exists and Firefox's
  about:addons uses that size, but it is currently unreferenced by the manifest.

---


## Progress — session of 2026-09-11

**Done:**
- §1 Cross-browser build: `scripts/build-webext.sh` produces `dist/chrome{,.zip}` and
  `dist/firefox{,.zip}`. Rather than two hand-maintained manifests, `extension/manifest.json`
  stays the single source of truth and the **Firefox manifest is derived from it with `jq`**
  (`jq` ships with macOS) — so version/description bumps can't drift between stores.
  The script also **validates** each package before zipping (every manifest/HTML-referenced
  file exists, every script parses) — the stand-in for `web-ext lint`. Verified it fails
  correctly on both a dangling reference and a syntax error.
- §4 `activeTab` re-added to `permissions` (the only source change; tests still 101/101 green).
- §5 Store prep: `store/webstore-listing.md` — Chrome + AMO copy, single-purpose statement,
  per-permission justifications, reviewer test steps. README updated for cross-browser.

- §3 **Firefox: TESTED END TO END, ALL GREEN.** Installed Firefox 155.0.1 + geckodriver via
  brew. Added `scripts/smoke-firefox.py` — installs `dist/firefox` as a temporary add-on in
  a real Firefox and asserts the whole path: prompt appears → Catch opens the reader →
  title, `450 degrees F (232°C)`, metric (`375 g` flour, ml liquids), servings scaler
  (`3 cups` → `3 3/8 cups`), nutrition. Run it with `./scripts/smoke-firefox.py`
  (`--headless` for CI). Fixture: `test/fixtures/recipe.html`.

  **The big Firefox risk did not materialize.** On Firefox 155, `<all_urls>` is already
  granted at install — confirmed by reading `ExtensionPermissions.get()` from the
  privileged chrome context — and the on-page prompt appears with **no** manual host grant.
  No `permissions.request` flow is needed. Caveat: verified on a *temporary* add-on
  install; re-check once on the first AMO-signed build.

**Not done — needs a human:**
- §2 **Chrome runtime test.** Not automatable: branded Chrome 152 logs
  `--disable-extensions-except is not allowed in Google Chrome, ignoring` and likewise
  ignores `--load-extension`, and **Load unpacked** opens a native file picker.
  Someone has to click through `chrome://extensions` once. Everything the Firefox smoke
  test exercises is shared, browser-agnostic code, so Chrome is low-risk — the one
  Chrome-specific unknown left is the MV3 *service worker* (Firefox runs an event page).

**Testing gotcha worth remembering:** don't smoke-test against live recipe sites.
bbcgoodfood served an automated browser a 1.7 KB "Crumbs." block page (no `@type: Recipe`
at all), and allrecipes' ads reflow the page mid-click — an early run "passed" by opening
an ad tab that was mistaken for the reader. Hence the local fixture, and hence the test
asserts the opened tab's URL starts with `moz-extension://`.

**Accuracy note:** `store/review-notes.md` (Safari) says the content script "only reads …
when the user taps Catch this recipe". That is not quite right — `maybeSuggest()` runs
`hasStructuredRecipe(document)` on every page load to decide whether to show the prompt.
Nothing leaves the device either way, but the Chrome/AMO copy states it accurately and the
README was corrected to match. **Fix `review-notes.md` before any Safari resubmission.**

---

## Starting state (facts)
- **Source of truth:** `~/recipe-catcher/extension/` — `manifest.json`, `background.js`
  (MV3 `service_worker`), `content.js`, `parser.js`, `units.js`, `nutrition.js`,
  `popup.{html,js,css}`, `reader.{html,js,css}`, `icons/`.
- **Manifest now:** MV3; `background.service_worker`; declarative `content_scripts` on
  `<all_urls>` (`units.js, parser.js, content.js` at `document_idle`); `permissions:
  ["scripting","storage"]`; `host_permissions: ["<all_urls>"]`; no `web_accessible_resources`
  (reader is opened as a top-level extension page, and the on-page prompt uses only inline
  styles + emoji in a closed Shadow DOM — so none are needed on Chrome/Firefox either).
- **Tooling on this Mac:** `node` is still NOT installed (logic tests run via `jsc`), so
  Mozilla's `web-ext` is unavailable — `scripts/build-webext.sh` does the lint-equivalent
  checks itself with `jq` + `jsc`. **Now installed (this session, via brew):** Firefox
  155.0.1 and geckodriver 0.37.1, which is what `scripts/smoke-firefox.py` drives.
  Chrome 152 is installed but cannot be automated (see §2).
- **Reusable assets in `store/`:** `privacy-policy.{md,html}` (host it at a public URL),
  `app-store-listing.md` (adapt the copy), `screenshots/macos/*` are **1280×800** — the
  exact size the Chrome Web Store wants, so they can be reused there.
- Tests: `./scripts/run-tests.sh` → ALL GREEN. The logic is unchanged by this work.

---

## Task list

### 1. Set up a cross-browser build (shared source, per-browser manifest) — ✅ DONE
Keep `extension/` as the shared Chrome-ready MV3 source. Add per-browser manifests + a
build script instead of hand-editing:
- Rename/keep the current manifest as the **Chrome** one (it already works for Chrome).
- Create a **Firefox** manifest variant (see §3).
- Add `scripts/build-webext.sh` that outputs:
  - `dist/chrome/`  = copy of `extension/` (Chrome manifest) + a `.zip`
  - `dist/firefox/` = copy of `extension/` with the Firefox manifest + a `.zip`
  (Simplest: keep `manifest.chrome.json` and `manifest.firefox.json` in the repo; the
  script copies `extension/`, then drops in the right `manifest.json`.)
- `dist/` is already gitignored.

### 2. Chrome — should work almost unchanged — ⏳ NEEDS MANUAL LOAD
- MV3 `service_worker`, declarative content scripts, `action` popup, `scripting`,
  `storage`, promise-based `chrome.*` (MV3 returns promises) — all supported. The
  `await api.*` / `.then()` calls we use are fine on Chrome MV3.
- **Test:** `chrome://extensions` → enable **Developer mode** → **Load unpacked** →
  select `extension/` (or `dist/chrome`). Then catch a recipe; verify the on-page prompt,
  reader tab, unit toggle, servings scaler, shopping copy, dark mode.
- **Likely the only issue:** the `<all_urls>` host permission + all-pages content script
  triggers Chrome's "read and change all your data on all websites" warning and reviewer
  scrutiny. It's needed for the auto-prompt on page load. Keep it, and write a clear
  permission justification for the listing (recipe detection is local-only; see the
  security review in `store/review-notes.md`).

### 3. Firefox — manifest tweaks required — ✅ DONE & TESTED (Firefox 155, all green)
Create `manifest.firefox.json` = current manifest with these changes:
- **Background as an event page**, not a service worker (Firefox MV3 preference):
  ```json
  "background": { "scripts": ["background.js"] }
  ```
  `background.js` registers listeners at top level with no DOM/global-state assumptions, so
  it runs fine as an event page. (Do NOT include `service_worker` in the Firefox manifest.)
- **Add the required gecko id:**
  ```json
  "browser_specific_settings": {
    "gecko": { "id": "recipe-catcher@rodgers", "strict_min_version": "121.0" }
  }
  ```
- **Add `activeTab`** to `permissions` (see §4) so the toolbar/prompt catch works even when
  the user hasn't granted broad host access (Firefox MV3 treats `host_permissions` as
  **optional/opt-in** — this is the biggest behavioral difference to test).
- **Test:** `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → pick
  `dist/firefox/manifest.json` (temporary; gone on restart). Or `web-ext run` if node is
  installed. Verify: does the on-page prompt appear without a manual host grant? If not,
  either (a) instruct users to set the extension's site access to "on all sites", or (b)
  add a `permissions.request` flow. Confirm catch → reader works.

### 4. Small code tweaks to make (shared, safe for all three browsers) — ✅ DONE
- **Re-add `activeTab`** to `permissions` in the manifest(s). We dropped it for Safari, but
  on Chrome/Firefox it lets the toolbar-triggered catch and `scripting.executeScript` work
  on the active tab without a full host grant — important for Firefox's optional-host model.
  (Harmless on Chrome/Safari.)
- **Verify promises on Chrome:** load unpacked and confirm `api.storage.local.get(...)`
  and `api.tabs.query(...)` resolve (they do on Chrome MV3). No code change expected.
- Everything else (closed Shadow DOM prompt, `navigator.clipboard.writeText` on a user
  gesture, `tabs.create(runtime.getURL("reader.html"))`) is supported on both.

### 5. Store prep (all doable/free except the fees) — ✅ DRAFTED in store/webstore-listing.md
- **Chrome Web Store:** one-time **$5** developer registration. Upload `dist/chrome.zip`;
  add 128px icon, ≥1 screenshot (**1280×800** — reuse `store/screenshots/macos/`),
  description (from `store/app-store-listing.md`), **privacy policy URL**, a single-purpose
  statement, and a justification for each permission. No paid extensions — list it free (or
  wire external payment later).
- **Firefox AMO (addons.mozilla.org):** **free**. Upload `dist/firefox.zip`; it gets signed
  automatically. Add listing + screenshots + privacy policy. Reviewers may ask for source —
  ours is unminified plain JS, so that's fine. You can also self-distribute the signed XPI.

---

## Gotchas
- **Don't run `scripts/build-xcode.sh`** for this work — it's Safari-only and regenerates
  the Xcode project.
- **`web_accessible_resources` stays empty.** The reader is a top-level extension page (not
  loaded by a web page), and the content-script prompt references no packaged files — so no
  WAR is required on Chrome or Firefox. Only add WAR if you later have a content script load
  a packaged asset.
- **Firefox optional host permissions** is the one real functional risk — budget testing
  time for whether the auto-prompt fires and whether `executeScript` works without an
  explicit grant. `activeTab` mitigates the toolbar path but not necessarily the on-load
  auto-prompt (which needs host access to inject the declarative content script).
- **No `node`** → `web-ext lint`/`web-ext build` need it. Either `brew install node` or lean
  on the stores' upload-time validators. The jsc test suite is unaffected.
- Chrome MV3 service worker is **ephemeral** — keep `background.js` stateless (it already
  is; all state lives in `storage.local`).

## Verify-it-works signal (per browser)
Load unpacked/temporary → open a real recipe (e.g. allrecipes, bbcgoodfood,
bowlofdelicious/dutch-oven-bread, preppykitchen/french-macarons) → the "Catch this recipe?"
prompt appears → clicking it (or the toolbar button) opens the clean reader in a new tab →
metric shows g/ml and instructions show `NNN°F (NNN°C)` → shopping Copy, servings scaler,
and dark mode all work. Same behavior you verified on Safari.

## Suggested order for the session
1. Add `activeTab`; split into `manifest.chrome.json` + `manifest.firefox.json`; write
   `scripts/build-webext.sh`. 2. Load unpacked in Chrome, fix anything. 3. Load temporary in
   Firefox, handle the host-permission behavior. 4. Then do store listings (reusing
   `store/` assets). Commit when done (repo has no remote yet — consider adding one).
