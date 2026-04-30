#!/bin/zsh
set -eu

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT_FILE="$ROOT_DIR/src/app.bundle.js"
TMP_FILE="$OUT_FILE.tmp"

{
  printf '%s\n' '(function () {' '"use strict";' ''
  perl -0pe 's/^export\s+//mg' "$ROOT_DIR/src/questionDefinitions.js"
  printf '\n'
  perl -0pe 's/^export\s+//mg; s/^import[\s\S]*?from\s+"\.\/questionDefinitions\.js";\n//m;' "$ROOT_DIR/src/questionFlow.js"
  printf '\n'
  perl -0pe 's/^export\s+//mg' "$ROOT_DIR/src/models.js"
  printf '\n'
  perl -0pe 's/^export\s+//mg' "$ROOT_DIR/src/db.js"
  printf '\n'
  perl -0pe 's/^import[\s\S]*?from\s+"\.\/questionFlow\.js";\n//m; s/^import[\s\S]*?from\s+"\.\/questionDefinitions\.js";\n//m; s/^import[\s\S]*?from\s+"\.\/models\.js";\n//m; s/^import[\s\S]*?from\s+"\.\/db\.js";\n//m;' "$ROOT_DIR/src/app.js"
  printf '\n})();\n'
} > "$TMP_FILE"

mv "$TMP_FILE" "$OUT_FILE"
echo "Built: $OUT_FILE"
