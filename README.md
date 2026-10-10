# macho-man

トレーニング記録アプリの初期セットアップ。現在は React + TypeScript の Vite テンプレートと、Cloudflare Workers 向け Hono テンプレートのみを配置しています。

## 開発環境

Node.js 24 以上と npm を使用します。依存関係はルートの `package.json` と `package-lock.json` で一括管理します。TypeScript、Vite、Wrangler、lint の設定もルートに集約しています。

```sh
npm ci
```

## ローカル起動

プロジェクトのルートで、別々のターミナルから実行します。

```sh
npm run dev:client
```

http://localhost:5173 で React のデフォルト画面を表示します。`npm run dev` も同じコマンドです。

```sh
npm run dev:server
```

http://localhost:8787 で `Hello Hono!` を返します。ローカル起動に Cloudflare のログインは不要です。

## 確認コマンド

```sh
npm run lint
npm run build
npm run build:server
```

`build` は双方の型チェックと client のビルドを行います。`build:server` はデプロイせずに Worker をビルドします。成果物はそれぞれ `client/dist`、`server/dist` に出力します。

`npm run preview` で client のビルド成果物を確認できます。Worker の型生成は `npm run cf-typegen` で実行します。

## 構成

- `client/`: Vite + React + TypeScript
- `server/`: Hono + Cloudflare Workers
- `tsconfig.json`: client・server・Vite 設定の共通型チェック（strict）
- `vite.config.ts`: client の開発サーバーとビルド
- `wrangler.jsonc`: server の Worker 設定
- `.oxlintrc.json`: 共通 lint 設定
- [仕様書](training-app-spec.md)
- [設計書](training-app-design.md)
- [開発方針](AGENTS.md)

アプリの機能、DB、PWA、client と API を同一 Worker で配信する設定は今後実装します。現時点の `npm run deploy` は server のテンプレートのみをデプロイするコマンドです。
