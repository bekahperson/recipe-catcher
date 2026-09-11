#!/bin/bash
# Copy the current extension/ source into the already-generated Xcode project
# WITHOUT regenerating it — so your signing Team and other Xcode settings are
# preserved. Use this after editing extension/ instead of build-xcode.sh
# (which regenerates from scratch and resets signing).
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$DIR/Recipe Catcher/Shared (Extension)/Resources"

if [ ! -d "$DEST" ]; then
  echo "Xcode project not generated yet. Run scripts/build-xcode.sh once first" >&2
  echo "(that sets up the project; after that, use this script to update code)." >&2
  exit 1
fi

# Update the web-extension files in place; don't delete anything else.
rsync -a "$DIR/extension/" "$DEST/"
echo "Synced extension/ -> $DEST (signing untouched)."
echo "Now just press Run (⌘R) in Xcode to push the update to your phone."