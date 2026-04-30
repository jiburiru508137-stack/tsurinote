#!/bin/zsh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
EXPORT_DIR="$ROOT_DIR/public-site"

echo "公開用ファイルを書き出します"
echo "出力先: $EXPORT_DIR"

rm -rf "$EXPORT_DIR"
mkdir -p "$EXPORT_DIR/src"
mkdir -p "$EXPORT_DIR/assets/photos"

cp "$ROOT_DIR/index.html" "$EXPORT_DIR/index.html"
cp "$ROOT_DIR/404.html" "$EXPORT_DIR/404.html"
cp "$ROOT_DIR/_headers" "$EXPORT_DIR/_headers"
cp "$ROOT_DIR/.nojekyll" "$EXPORT_DIR/.nojekyll"
cp "$ROOT_DIR/src/styles.css" "$EXPORT_DIR/src/styles.css"
cp "$ROOT_DIR/src/app.bundle.js" "$EXPORT_DIR/src/app.bundle.js"
cp "$ROOT_DIR/assets/photos/home-hero-user.jpg" "$EXPORT_DIR/assets/photos/home-hero-user.jpg"

echo
echo "公開用に含めたファイル"
find "$EXPORT_DIR" -type f | sort
echo
echo "public-site は静的ファイルの出力先です"
echo "初版では、この中の静的ファイルだけを公開先へ置きます"
