# Recipe Catcher — Chrome & Firefox Handoff (start here next session)

Goal: prepare the existing Safari extension to **run and be published on Chrome and
Firefox**. Safari work is paused (see `HANDOFF.md`); do not touch the Xcode project for
this.

**Good news up front:** the extension is Manifest V3 and already browser-agnostic — the
recipe logic is pure JS, and every script uses `const api = typeof browser !== "undefined"
? browser : chrome;`. **Chrome runs the current `extension/` folder essentially as-is.**
Firefox needs a few manifest changes. You can develop and test **both for free**; only
*publishing* costs anything ($5 one-time for Chrome, $0 for Firefox).

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
- **Tooling on this Mac:** `node` is NOT installed (tests run via `jsc`). Mozilla's
  `web-ext` needs node, so either `brew install node` first, or skip web-ext and use the
  browser's built-in loaders + the store upload linters.
- **Reusable assets in `store/`:** `privacy-policy.{md,html}` (host it at a public URL),
  `app-store-listing.md` (adapt the copy), `screenshots/macos/*` are **1280×800** — the
  exact size the Chrome Web Store wants, so they can be reused there.
- Tests: `./scripts/run-tests.sh` → ALL GREEN. The logic is unchanged by this work.

---

## Task list

### 1. Set up a cross-browser build (shared source, per-browser manifest)
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

### 2. Chrome — should work almost unchanged
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

### 3. Firefox — manifest tweaks required
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

### 4. Small code tweaks to make (shared, safe for all three browsers)
- **Re-add `activeTab`** to `permissions` in the manifest(s). We dropped it for Safari, but
  on Chrome/Firefox it lets the toolbar-triggered catch and `scripting.executeScript` work
  on the active tab without a full host grant — important for Firefox's optional-host model.
  (Harmless on Chrome/Safari.)
- **Verify promises on Chrome:** load unpacked and confirm `api.storage.local.get(...)`
  and `api.tabs.query(...)` resolve (they do on Chrome MV3). No code change expected.
- Everything else (closed Shadow DOM prompt, `navigator.clipboard.writeText` on a user
  gesture, `tabs.create(runtime.getURL("reader.html"))`) is supported on both.

### 5. Store prep (all doable/free except the fees)
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
