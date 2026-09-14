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

# The converter defaults to macOS 10.14 / iOS 15.0, but extension/manifest.json is
# MV3 with a background service_worker, and Safari only supports that from Safari
# 15.4 / iOS 15.4. macOS Mojave tops out at Safari 14, so a 10.14 build would
# install happily and then never run — the worst kind of failure. Raise the floors
# to OS versions that can actually reach Safari 15.4.
# (Safari updates semi-independently of macOS, so a Big Sur user may still need to
# update Safari itself; the OS floor only rules out those who cannot.)
PBX="$DIR/Recipe Catcher/Recipe Catcher.xcodeproj/project.pbxproj"
if [ -f "$PBX" ]; then
  sed -i '' \
    -e 's/MACOSX_DEPLOYMENT_TARGET = [0-9.]*/MACOSX_DEPLOYMENT_TARGET = 11.0/g' \
    -e 's/IPHONEOS_DEPLOYMENT_TARGET = [0-9.]*/IPHONEOS_DEPLOYMENT_TARGET = 15.4/g' \
    "$PBX"
  echo "Set deployment targets to macOS 11.0 / iOS 15.4 (Safari 15.4 service_worker floor)."
fi

echo
echo "Generated: $DIR/Recipe Catcher/Recipe Catcher.xcodeproj"
echo "Open it in Xcode, or build the macOS app:"
echo "  xcodebuild -project \"$DIR/Recipe Catcher/Recipe Catcher.xcodeproj\" -scheme \"Recipe Catcher (macOS)\" build"
