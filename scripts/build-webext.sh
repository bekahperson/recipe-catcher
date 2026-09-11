#!/bin/bash
# Build the Chrome and Firefox packages from the shared extension/ source.
#
#   dist/chrome/  + dist/chrome.zip   — extension/ verbatim (its manifest is
#                                       already Chrome-ready MV3)
#   dist/firefox/ + dist/firefox.zip  — extension/ with a Firefox manifest
#
# extension/manifest.json is the single source of truth; the Firefox manifest is
# DERIVED from it below, so version/name/description bumps only happen in one
# place and can't drift between stores. Safari is untouched by this script
# (use scripts/sync-extension.sh for that).
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$DIR/extension"
OUT="$DIR/dist"

command -v jq >/dev/null 2>&1 || { echo "jq is required (it ships with macOS)." >&2; exit 1; }
jq empty "$SRC/manifest.json" || { echo "extension/manifest.json is not valid JSON." >&2; exit 1; }

# Store field limits, Chrome's being the strictest of the three. Exceeding one is an
# upload rejection rather than a runtime bug, so catch it here instead of at submission.
check_len() { # field, max
  local len; len="$(jq -r "(.$1 // \"\") | length" "$SRC/manifest.json")"
  [ "$len" -le "$2" ] || {
    echo "manifest .$1 is $len characters; the Chrome Web Store allows $2." >&2
    echo "  (Firefox AMO is more generous, but one manifest feeds both.)" >&2
    exit 1
  }
}
check_len name 45
check_len description 132

rm -rf "$OUT/chrome" "$OUT/firefox" "$OUT/chrome.zip" "$OUT/firefox.zip"
mkdir -p "$OUT/chrome" "$OUT/firefox"

# icon.svg is the design source for icons/*.png, not loaded at runtime — keep it
# out of the shipped package.
copy_src() {
  rsync -a --exclude ".DS_Store" --exclude "icon.svg" "$SRC/" "$1/"
}

copy_src "$OUT/chrome"
copy_src "$OUT/firefox"

# Firefox MV3 differences:
#  - background runs as an EVENT PAGE (scripts), not a service worker
#  - an explicit gecko add-on id is required to sign/submit on AMO
#  - 121.0 is the floor for MV3 event-page background support
jq '
  .background = { "scripts": ["background.js"] }
  | .browser_specific_settings = {
      "gecko": { "id": "recipe-catcher@rodgers", "strict_min_version": "121.0" }
    }
' "$SRC/manifest.json" > "$OUT/firefox/manifest.json"

jq empty "$OUT/firefox/manifest.json" || { echo "generated Firefox manifest is invalid." >&2; exit 1; }

# Stand-in for `web-ext lint` (which needs node): confirm every file the manifest
# and the HTML pages point at is actually in the package, and that every script
# parses. A dangling reference here becomes a store rejection or a silent
# runtime failure, so fail the build rather than ship it.
JSC="/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc"
validate() {
  local pkg="$1" label="$2" missing=0
  local refs
  refs="$(jq -r '
    [ (.icons // {} | values[])
    , (.action.default_icon // {} | values[])
    , .action.default_popup
    , .background.service_worker
    , (.background.scripts // [])[]
    , (.content_scripts // [])[].js[]
    ] | map(select(. != null)) | unique[]' "$pkg/manifest.json")"

  # Local assets referenced by the packaged HTML pages (src="..." / href="...").
  local html_refs=""
  for page in "$pkg"/*.html; do
    [ -e "$page" ] || continue
    html_refs="$html_refs
$(grep -oE '(src|href)="[^"#:]+"' "$page" | sed -E 's/.*="([^"]+)"/\1/')"
  done

  while read -r ref; do
    [ -n "$ref" ] || continue
    [ -e "$pkg/$ref" ] || { echo "  MISSING: $ref" >&2; missing=1; }
  done <<< "$refs
$html_refs"

  # jsc's quit(1) does NOT set the process exit code, so treat any output from
  # the parse as the failure signal instead of checking $?.
  for js in "$pkg"/*.js; do
    local err
    err="$("$JSC" -e "try{new Function(readFile('$js'))}catch(e){print(e)}" 2>&1)"
    [ -z "$err" ] || { echo "  SYNTAX in $(basename "$js"): $err" >&2; missing=1; }
  done

  [ "$missing" -eq 0 ] || { echo "$label package failed validation." >&2; exit 1; }
  echo "$label package OK"
}
validate "$OUT/chrome"  "chrome"
validate "$OUT/firefox" "firefox"

# Both stores want manifest.json at the ZIP root, so zip from inside each dir.
( cd "$OUT/chrome"  && zip -qr "$OUT/chrome.zip"  . -x ".DS_Store" )
( cd "$OUT/firefox" && zip -qr "$OUT/firefox.zip" . -x ".DS_Store" )

VERSION="$(jq -r .version "$SRC/manifest.json")"
echo "Built Recipe Catcher v$VERSION"
echo "  dist/chrome/   -> dist/chrome.zip   ($(du -h "$OUT/chrome.zip"  | cut -f1 | tr -d ' '))"
echo "  dist/firefox/  -> dist/firefox.zip  ($(du -h "$OUT/firefox.zip" | cut -f1 | tr -d ' '))"
echo
echo "Load unpacked:  Chrome  chrome://extensions (Developer mode) -> dist/chrome"
echo "                Firefox about:debugging#/runtime/this-firefox -> dist/firefox/manifest.json"
