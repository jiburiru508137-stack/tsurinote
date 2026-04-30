# Cloudflare Pages 公開手順

確認日: 2026-04-28

対象: [fishing-log-web-v1](/Users/kusuharasora/Desktop/fishing-log-web-v1)

## 前提

- このプロジェクトは静的ファイルと Pages Functions を使います。
- `index.html` が入口です。
- 記録本体、下書き、候補データ、バックアップ状態は D1 に保存します。
- 写真本体は引き続き各端末に保存します。

## 事前にやること

1. 直接開く用のバンドルを更新します。

```bash
cd "/Users/kusuharasora/Desktop/fishing-log-web-v1"
./build_bundle.command
```

2. 公開前チェックを実行します。

```bash
cd "/Users/kusuharasora/Desktop/fishing-log-web-v1"
./verify_release.command
```

3. 公開前チェックの内容を見ます。

- [PUBLIC_RELEASE_CHECKLIST.md](/Users/kusuharasora/Desktop/fishing-log-web-v1/PUBLIC_RELEASE_CHECKLIST.md)
- [FINAL_UI_CHECKLIST.md](/Users/kusuharasora/Desktop/fishing-log-web-v1/FINAL_UI_CHECKLIST.md)

4. 公開用の最小ファイルだけを書き出す場合は次を実行します。

```bash
cd "/Users/kusuharasora/Desktop/fishing-log-web-v1"
./export_public_site.command
```

最小構成の一覧は [PUBLIC_FILES.md](/Users/kusuharasora/Desktop/fishing-log-web-v1/PUBLIC_FILES.md) にまとめています。

## Cloudflare Pages の設定

公式ドキュメントでは、フレームワークなしのプロジェクトでは Build command を空にする方法と、`exit 0` を使う方法の両方が案内されています。  
このプロジェクトは将来 Functions を足す余地を残したいので、**Build command は `exit 0`** を勧めます。

### 推奨設定

- Framework preset: なし
- Production branch: `main`
- Build command: `exit 0`
- Build output directory: `public-site`
- Root directory: 空欄

### D1 の設定

1. Cloudflare dashboard で D1 データベースを 1 つ作ります
2. [cloudflare/d1-schema.sql](/Users/kusuharasora/Desktop/fishing-log-web-v1/cloudflare/d1-schema.sql) を実行してテーブルを作ります
3. Pages プロジェクトの `Settings > Bindings` で D1 を追加します
4. Variable name は `TSURINOTE_DB` にします
5. バインド追加後に再デプロイします

## 公開手順

1. GitHub にこのプロジェクトを置きます。
2. `./export_public_site.command` を実行して `public-site` を更新します。
3. Cloudflare dashboard で Pages プロジェクトを作ります。
4. GitHub リポジトリを接続します。
5. 上の設定で初回デプロイします。
6. `Settings > Bindings` で D1 を `TSURINOTE_DB` として追加します。
7. `*.pages.dev` の URL で開いて確認します。

## 公開後に確認すること

- ホームが開くこと
- ホーム画像が出ること
- 新規記録が保存できること
- 別端末で開いても保存済み記録と下書きが見えること
- バックアップの書き出しと復元ができること
- スマホで横スクロールが出ないこと
- 記録はこのサイトに保存され、写真はこの端末に残ることが分かること

## 注意

- `index.html` は `./src/styles.css` と `./src/app.bundle.js` を読みます。
- `assets/photos/home-hero-user.jpg` も同じ階層構造のまま置く必要があります。
- `src` や `assets` の中身だけを別の場所へ移すと、読み込み中のまま止まる原因になります。
- `functions` と `cloudflare/d1-schema.sql` は `public-site` に入れませんが、リポジトリには必要です。
- この構成は単一利用者向けです。公開 URL を不特定多数に開くと、同じ D1 を共有します。
- 本当に利用者ごとに分ける場合は、次の段階でログインか秘密鍵が必要です。
- 写真本体は初版の JSON バックアップに含みません。
