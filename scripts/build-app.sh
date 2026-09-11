#!/bin/bash
# Build a runnable macOS tester app (ad-hoc signed, no Apple account needed) into
# ./dist. Run the app once, then enable the extension in Safari (see the printout).
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
PROJ="$DIR/Recipe Catcher/Recipe Catcher.xcodeproj"
DERIVED="$DIR/build/DerivedData"
DIST="$DIR/dist"

# Regenerate the Xcode project if it's not there yet.
if [ ! -d "$PROJ" ]; then
  echo "Xcode project missing — generating it first…"
  "$DIR/scripts/build-xcode.sh"
fi

echo "Building the macOS app (Debug, ad-hoc signed for local testing)…"
xcodebuild -project "$PROJ" \
  -scheme "Recipe Catcher (macOS)" \
  -configuration Debug \
  -derivedDataPath "$DERIVED" \
  build

APP="$DERIVED/Build/Products/Debug/Recipe Catcher.app"
mkdir -p "$DIST"
rm -rf "$DIST/Recipe Catcher.app"
cp -R "$APP" "$DIST/"

# The build also registers the copy inside build/ with Launch Services, which
# would make Safari show TWO "Recipe Catcher" entries. Unregister the build
# copy and register only the dist copy, so exactly one entry appears.
LSREGISTER="/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister"
if [ -x "$LSREGISTER" ]; then
  "$LSREGISTER" -u "$APP" >/dev/null 2>&1 || true
  "$LSREGISTER" -f "$DIST/Recipe Catcher.app" >/dev/null 2>&1 || true
fi

cat <<EOF

✅ Built: $DIST/Recipe Catcher.app

To test on this Mac:
  1. Open the app:   open "$DIST/Recipe Catcher.app"
     (leave its window open — it just registers the extension with Safari)
  2. Safari → Settings → Advanced → check "Show features for web developers"
  3. Safari → Develop menu → "Allow Unsigned Extensions"
     (this resets each time Safari restarts; re-check it if the extension disappears)
  4. Safari → Settings → Extensions → turn on "Recipe Catcher" and allow it on sites
  5. Open a recipe page, click the Recipe Catcher toolbar button → "Catch this recipe"
EOF
