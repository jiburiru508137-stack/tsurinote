#!/bin/zsh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

required_files=(
  "index.html"
  "404.html"
  "src/styles.css"
  "src/app.bundle.js"
  "assets/photos/home-hero-user.jpg"
  "_headers"
)

echo "公開前チェックを始めます"
echo "確認対象: $ROOT_DIR"
echo

missing_files=()

for relative_path in "${required_files[@]}"; do
  if [[ ! -f "$ROOT_DIR/$relative_path" ]]; then
    missing_files+=("$relative_path")
  fi
done

if (( ${#missing_files[@]} > 0 )); then
  echo "必要なファイルが足りません"
  for relative_path in "${missing_files[@]}"; do
    echo "  - $relative_path"
  done
  exit 1
fi

echo "必要なファイルはそろっています"

required_references=(
  "./src/styles.css"
  "./src/app.bundle.js"
  "./assets/photos/home-hero-user.jpg"
)

for reference in "${required_references[@]}"; do
  if ! grep -Fq "$reference" "$ROOT_DIR/index.html" && ! grep -Fq "$reference" "$ROOT_DIR/src/app.bundle.js"; then
    echo "参照が見つかりません: $reference"
    exit 1
  fi
done

if ! grep -Fq "./src/styles.css" "$ROOT_DIR/index.html"; then
  echo "index.html から src/styles.css を読んでいません"
  exit 1
fi

if ! grep -Fq "./src/app.bundle.js" "$ROOT_DIR/index.html"; then
  echo "index.html から src/app.bundle.js を読んでいません"
  exit 1
fi

if ! grep -Fq "__TSURINOTE_BOOTED__" "$ROOT_DIR/index.html"; then
  echo "index.html に読み込み失敗時の確認処理がありません"
  exit 1
fi

if ! grep -Fq "home-hero-user.jpg" "$ROOT_DIR/src/app.bundle.js"; then
  echo "ホーム画像の参照が app.bundle.js に見つかりません"
  exit 1
fi

echo "公開用の参照先を確認しました"
echo
echo "次のファイルを同じ階層構造のまま公開先へ置いてください"
echo "  - index.html"
echo "  - 404.html"
echo "  - src/styles.css"
echo "  - src/app.bundle.js"
echo "  - assets/photos/home-hero-user.jpg"
echo "  - _headers"
echo
echo "公開前チェックは通過しました"
