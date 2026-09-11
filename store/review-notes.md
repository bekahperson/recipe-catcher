# App Review notes — Recipe Catcher

Paste this into App Store Connect → your version → **App Review Information → Notes**.

---

Recipe Catcher is a Safari Web Extension. It extracts the ingredients and instructions
from a recipe web page and shows them in a clean, text-only tab, with a metric/imperial
toggle, a servings scaler, a checkable shopping list, and an estimated nutrition summary.

NO SIGN-IN IS REQUIRED. There are no accounts and no server; everything runs locally.

HOW TO ENABLE AND TEST (Safari, macOS):
1. Launch the Recipe Catcher app once (this registers the extension with Safari).
2. In Safari: Settings → Extensions → turn on "Recipe Catcher".
   (If needed on macOS: Safari → Settings → Advanced → "Show features for web
   developers", so the Extensions pane is available.)
3. When prompted for site access, allow it (the extension only reads a page when the
   button is clicked).
4. Open any recipe page, for example:
   - https://www.allrecipes.com/recipe/17481/simple-white-cake/
   - https://www.bbcgoodfood.com/recipes/classic-victoria-sandwich
5. Click the Recipe Catcher button in the toolbar, then "Catch this recipe".
6. A clean recipe tab opens. Try the Imperial/Metric toggle, the Servings stepper, the
   shopping-list checkboxes, "Copy", and "Print / Save PDF".

HOW TO TEST (iOS):
1. Install the app, then go to Settings → Safari → Extensions → enable "Recipe Catcher"
   and allow website access.
2. In Safari, open a recipe page (e.g. the links above), tap the extensions button in
   the address bar, choose Recipe Catcher, then "Catch this recipe".

PRIVACY: The extension collects and transmits no data and makes no network requests. A
content script is present on pages so it can respond instantly, but it only reads and
extracts a recipe when the user taps "Catch this recipe"; it never modifies pages, and
it stores only local preferences on the device.

Thank you for reviewing!
