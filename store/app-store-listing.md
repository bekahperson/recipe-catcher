# App Store listing — Recipe Catcher

Copy-and-paste fields for App Store Connect. Character limits noted in ().

---

## App Name (30)
`Recipe Catcher`

> "Recipe Catcher" may already be taken on the App Store. Backups (each ≤30 chars):
> - `Recipe Catcher: Clean Recipes`
> - `Recipe Catcher — Reader`
> - `Clean Recipe Catcher`

## Subtitle (30)
`Clean, ad-free recipes`

## Promotional text (170)
`Skip the pop-ups, ads, and endless life stories. Grab just the ingredients and steps in a clean, printable page — with metric/imperial, a shopping list, and nutrition.`

## Keywords (100, comma-separated, no spaces after commas)
`recipe,recipes,cooking,ingredients,shopping list,metric,imperial,print,reader,ad-free,food,baking,meal,kitchen`

## Description
Tired of scrolling past pop-ups, auto-playing videos, cookie banners, and a novel's worth of backstory just to find the ingredients? Recipe Catcher fixes that.

Click the toolbar button on any recipe page and Recipe Catcher pulls out just what you need — the ingredients and instructions — and opens them in a clean, text-only tab you can actually read, print, or save as a PDF.

WHY IT'S DIFFERENT
Recipe Catcher reads the recipe's underlying structured data, so ads, overlays, and "subscribe to view" pop-ups simply don't get in the way.

FEATURES
• Clean, readable recipe — no ads, no clutter, no pop-ups
• One tap to switch between metric and imperial
• Adjust the servings — quantities rescale instantly
• Built-in shopping list with checkboxes you can tick (on screen or on paper)
• Copy the shopping list to paste into Notes, Reminders, or a message
• Estimated nutrition per serving (calories + protein/fat/carbs)
• Print or save a tidy PDF
• Automatic light and dark mode, or choose your own
• Fast, private, and fully offline — nothing you do is tracked or uploaded

PRIVACY
Recipe Catcher collects nothing and sends nothing. It reads a page only when you ask it
to, and everything happens on your device.

Recipe Catcher is a Safari extension. After installing, enable it in Safari Settings →
Extensions, then click the Recipe Catcher button on any recipe page.

## What's New (version 1.0)
`First release. Catch any recipe into a clean, printable page — with metric/imperial, a servings scaler, a checkable shopping list, and estimated nutrition.`

## Category
- Primary: **Food & Drink**
- Secondary: **Utilities**

## URLs
- Support URL: `https://bekahperson.github.io/recipe-catcher/`
- Marketing URL (optional): `https://bekahperson.github.io/recipe-catcher/`
- Privacy Policy URL: `https://bekahperson.github.io/recipe-catcher/privacy-policy.html`

## App Privacy (nutrition label)
- Data collection: **Data Not Collected** (answer "No" to collecting data)

## Age rating
- No objectionable content → expect **4+**. Answer "None" to all content questions.

## Pricing
- Price: **$0.99** (Tier 1). Requires the Paid Applications Agreement + banking/tax
  info completed in App Store Connect → Business, or the price will be locked to Free.

## Minimum OS versions
**macOS 11.0, iOS/iPadOS 15.4.** Not arbitrary: the extension is Manifest V3 with a
background `service_worker`, which Safari supports only from **Safari 15.4 / iOS 15.4**
(per MDN browser-compat-data). macOS Mojave tops out at Safari 14, so the converter's
default floor of 10.14 would have let users install something that could never run.
Set in `scripts/build-xcode.sh`, which re-applies it whenever the project is regenerated.
