#!/bin/bash
# Wrap the extension/ web-extension source into a Safari App Extension Xcode
# project targeting BOTH macOS and iOS. Re-run any time to regenerate.
#
# The generated "Recipe Catcher/" Xcode project is a build artifact (gitignored).
# extension/ is the source of truth; --copy-resources gives the project its own
# copy, so after editing extension/ you re-run this to refresh it.
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Bundle identifier prefix. CHANGE THIS to your own reverse-domain if you own
# one; it must be globally unique on the App Store. The app gets this id and the
# extension gets "<id>.extension".
BUNDLE_ID="com.rodgers.recipecatcher"

xcrun safari-web-extension-converter "$DIR/extension" \
  --project-location "$DIR" \
  --app-name "Recipe Catcher" \
  --bundle-identifier "$BUNDLE_ID" \
  --swift \
  --copy-resources \
  --no-open \
  --no-prompt \
  --force

# The converter builds the iOS App Store icon from the extension icon, which has
# transparent corners — Apple rejects iOS icons with an alpha channel. Swap in
# our flattened, opaque 1024 icon so every regeneration stays submittable.
ICON_SRC="$DIR/store/appicon/icon-1024.png"
ICON_DST="$DIR/Recipe Catcher/Shared (App)/Assets.xcassets/AppIcon.appiconset/universal-icon-1024@1x.png"
if [ -f "$ICON_SRC" ] && [ -f "$ICON_DST" ]; then
  cp "$ICON_SRC" "$ICON_DST"
  echo "Installed opaque iOS app icon (no alpha channel)."
fi

echo
echo "Generated: $DIR/Recipe Catcher/Recipe Catcher.xcodeproj"
echo "Open it in Xcode, or build the macOS app:"
echo "  xcodebuild -project \"$DIR/Recipe Catcher/Recipe Catcher.xcodeproj\" -scheme \"Recipe Catcher (macOS)\" build"
