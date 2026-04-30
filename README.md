# ツリノート

確認日: 2026年4月30日

## 概要

ツリノートは、釣れた日も反応がなかった日も、自分だけの記録として残す釣行ログです

## 公開方式

GitHub連携のCloudflare Pagesで静的サイトとして公開します

## 初版の保存方式

- 初版では IndexedDB による端末内保存を使います
- 同じ端末、同じブラウザでは再読み込み後も記録が残ります
- 別端末には自動同期されません
- ブラウザのデータを削除すると記録が消える可能性があります
- 必要に応じてバックアップを書き出します
- Cloudflare D1 やログインは初版では使いません

画面内の短い説明は次の方針にそろえています

- 入力中の内容はこの端末に残ります
- 必要なときだけバックアップできます

## ファイル構成

```text
index.html
404.html
src/styles.css
src/app.bundle.js
assets/photos/home-hero-user.jpg
```

現在の HTML は次を読み込みます

- `./src/styles.css`
- `./src/app.bundle.js`

`index.html` と `404.html` には、読み込み中表示と読み込み失敗時の表示を入れています  
[src/app.js](/Users/kusuharasora/Desktop/fishing-log-web-v1/src/app.js) では `globalThis.__TSURINOTE_BOOTED__ = true;` を設定しています

## ローカル確認

```bash
cd "/Users/kusuharasora/Desktop/fishing-log-web-v1"
python3 -m http.server 8000
```

ブラウザで次を開きます

- [http://localhost:8000](http://localhost:8000)

確認項目は次です

- ホームが表示される
- CSS が反映される
- JS が動く
- ホーム画像が表示される
- 画像がない場合はフォールバックが出る
- 新しく記録するボタンが動く
- 今すぐ記録が始められる
- 反応なし理由を選べる
- 下書き保存が動く
- 再読み込み後も下書きが残る
- 保存後に記録一覧へ出る
- バックアップを書き出せる
- スマホ幅で横スクロールしない
- 404 ページでも CSS と JS が読める

## Cloudflare Pages設定

Framework preset:
None

Build command:
空欄

Build output directory:
/ または .

Root directory:
/

推奨:
リポジトリのルートに `index.html` があるため、Build command は空欄、Build output directory は `/` または `.` とします

Cloudflare の UI で `/` が通らない場合は `.` を使います  
私の推奨は `Build command = 空欄` と `Build output directory = .` です

## GitHub連携での公開手順

1. GitHub にリポジトリを作成します
2. このプロジェクトを push します
3. Cloudflare Dashboard にログインします
4. Workers & Pages を開きます
5. Create application を選びます
6. Pages を選びます
7. Import an existing Git repository を選びます
8. GitHub と接続します
9. `tsurinote` リポジトリを選びます
10. Framework preset を `None` にします
11. Build command を空欄にします
12. Build output directory を `/` または `.` にします
13. Deploy を押します
14. 発行された pages.dev の URL で確認します

## GitHubへ push する手順

まだ Git リポジトリでない場合は次を実行します

```bash
cd "/Users/kusuharasora/Desktop/fishing-log-web-v1"
git init
git add .
git commit -m "Prepare Cloudflare Pages deployment"
git branch -M main
git remote add origin https://github.com/ユーザー名/tsurinote.git
git push -u origin main
```

すでに Git リポジトリの場合は、通常どおり `git add`、`git commit`、`git push` を使います

## 公開後チェックリスト

- pages.dev の URL でホームが開く
- 「画面を開けません」が出ない
- CSS が反映されている
- JS が動いている
- ホーム画像が表示される
- 画像がない場合はフォールバックが出る
- 新しく記録するが押せる
- 開始画面が4択になっている
- 反応なし理由を選べる
- 下書き保存が動く
- ページ再読み込み後も下書きが残る
- 保存済み記録が一覧に出る
- バックアップを書き出せる
- スマホ幅で横スクロールしない
- Safari と Chrome で確認する

## 将来拡張候補

- Cloudflare Pages Functions
- Cloudflare Workers
- Cloudflare D1
- Cloudflare R2
- /api 経由のサイト保存
- 写真込みバックアップ
- 複数端末同期
- ログイン

ただし、初版では実装しません
