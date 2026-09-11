#!/bin/bash
# Run Recipe Catcher's logic tests. Prefers Node (`node --test`); falls back to
# the macOS-bundled JavaScriptCore (jsc) so tests run with zero install.
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"

if command -v node >/dev/null 2>&1; then
  echo "Running tests with node --test…"
  exec node --test "$DIR/test/"
fi

JSC="/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc"
if [ -x "$JSC" ]; then
  echo "node not found — running tests with JavaScriptCore (jsc)…"
  exec "$JSC" -e "var DIR='$DIR';" "$DIR/test/jsc-runner.js"
fi

echo "Neither node nor jsc found; cannot run tests." >&2
exit 1
