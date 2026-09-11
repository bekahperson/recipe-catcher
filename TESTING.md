# Testing Recipe Catcher on your devices

A Safari extension ships inside a small container app. "Installing the tester" means
running that app once so Safari registers the extension, then enabling it in Safari.

---

## macOS — test on this Mac now (no Apple account needed)

Build (already done once; re-run after code changes):

```bash
./scripts/build-app.sh
```

Then:

1. Open the app:
   ```bash
   open "dist/Recipe Catcher.app"
   ```
   Leave its window open — it just registers the extension with Safari.
2. Safari → **Settings → Advanced** → check **"Show features for web developers"**.
3. Safari → **Develop** menu → **"Allow Unsigned Extensions"**.
   ⚠️ This resets every time Safari restarts — re-check it if the extension vanishes.
4. Safari → **Settings → Extensions** → turn on **Recipe Catcher**, allow it on sites.
5. Open a recipe page, click the **Recipe Catcher** toolbar button → **Catch this recipe**.

---

## iPhone — test with a free Apple ID (no $99 needed)

Apps installed this way run for **7 days**, then re-run from Xcode to renew.

**0. One-time: install the iOS platform in Xcode.** Your Xcode currently has only the
macOS platform, so building for iPhone fails until you add iOS. Either:
   - Xcode → **Settings** (⌘,) → **Components** → install **iOS** (26.5), or
   - Terminal (large multi-GB download):
     ```bash
     xcodebuild -downloadPlatform iOS
     ```

1. Connect your iPhone to the Mac with a cable and unlock it.
2. Open the project:
   ```bash
   open "Recipe Catcher/Recipe Catcher.xcodeproj"
   ```
3. In the top bar, choose the **"Recipe Catcher (iOS)"** scheme and select **your iPhone**
   as the run destination.
4. For **both** the iOS app target **and** the "Recipe Catcher Extension (iOS)" target:
   **Signing & Capabilities** → check **Automatically manage signing** → set **Team** to
   your personal Apple ID (click **Add Account…** if it's not listed — a free Apple ID
   works). If Xcode complains the bundle ID is taken, change `BUNDLE_ID` in
   `scripts/build-xcode.sh` to something unique, regenerate, and retry.
5. Press **Run** (⌘R). Xcode installs the app on your phone.
6. First run only: on the iPhone, **Settings → General → VPN & Device Management →**
   your Developer App → **Trust**.
7. On the iPhone: **Settings → Safari → Extensions** → enable **Recipe Catcher** →
   **Allow** website access.
8. In Safari, open a recipe → tap the extensions button in the address bar →
   **Recipe Catcher → Catch this recipe**.

---

## iOS Simulator — quick look without a device

No account or cable needed, but it's the Simulator, not your phone:

1. `open "Recipe Catcher/Recipe Catcher.xcodeproj"`
2. Choose the **iOS** scheme and an iPhone **Simulator**, then Run.
3. In the Simulator's Safari, enable the extension the same way as on device.

---

## TestFlight — convenient beta installs (needs the paid Developer account)

Once you're enrolled in the Apple Developer Program ($99/yr):

1. In Xcode: **Product → Archive** → **Distribute App → App Store Connect → Upload**.
2. In **App Store Connect → TestFlight**, add yourself as an **internal tester**.
3. Install the **TestFlight** app on your iPhone/Mac and install the beta from there.

This lets you (and other testers) install without cables or Xcode, and is the natural
step right before submitting for review.

---

## Sample recipe pages for testing

- https://www.allrecipes.com/recipe/17481/simple-white-cake/
- https://www.bbcgoodfood.com/recipes/classic-victoria-sandwich
- https://www.seriouseats.com/classic-banana-bread-recipe-8642710

If a page ever shows "No recipe found," it likely has no structured recipe data — try
another; the vast majority of mainstream recipe sites work.
