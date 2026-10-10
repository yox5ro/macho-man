# macho-man

React + Hono + Cloudflare D1で動くトレーニング記録アプリ。現在はログイン・ログアウト・セッション復元と、運営用のユーザー管理CLIを実装しています。

## 開発環境

Node.js 24以上とnpmを使用します。プロジェクトのルートで実行してください。

```sh
npm ci
npm run build
npm run db:migrate
npm run user -- create your-id --local
```

パスワードは4〜1024文字で、非表示の対話入力と確認入力を求めます。公開会員登録はありません。

別々のターミナルで起動します。

```sh
npm run dev:server
npm run dev:client
```

[ログイン画面](http://localhost:5173)を開き、作成したユーザーでログインしてください。Viteは`/api`を`localhost:8787`へ転送します。Worker単体の[画面](http://localhost:8787)も、ビルド済み静的アセットを配信します。

## ユーザー管理

```sh
npm run user -- list --local
npm run user -- reset-password your-id --local
```

本番を操作する場合は`--local`を`--remote`に置き換えます。必ず対象を明示し、パスワードは引数に渡しません。再設定と全セッションの失効は1つのトランザクションで実行します。

## DB・デプロイ

```sh
npm run db:generate
npm run db:migrate
```

Drizzle Kitで生成した`server/migrations`のSQLを確認し、バージョン管理します。

本番用D1はまだ作成していません。`wrangler.jsonc`の`database_id`はローカル開発用の仮IDです。本番利用時はD1を作成し、実際のIDへ置き換えてから実行してください。

```sh
npx wrangler d1 create macho-man
npx wrangler d1 migrations apply macho-man --remote
npm run build
npm run deploy
```

安全なパスワード検証にはCPU時間が必要です。Workers無料枠のCPU制限内で動くことは未検証のため、本番で計測し、必要なら認証処理の構成やプランを見直してください。ハッシュ強度を下げて回避しません。

## 確認

```sh
npm test
npm run lint
npm run build
npm run build:server
```

テストにはMiniflareによるローカルD1統合テストが含まれます。`build:server`はデプロイせずにWorkerをビルドします。`client/dist`と`server/dist`に成果物を出力します。

## 構成

- `client/`: Reactのログイン画面とAPIクライアント
- `server/src/auth/`: 認証API・モデル・Drizzleスキーマ・repository
- `server/migrations/`: D1マイグレーション
- `shared/`: API入力スキーマ・共有型
- `scripts/user.ts`: 運営用CLI
- [仕様書](training-app-spec.md)
- [設計書](training-app-design.md)
- [開発方針](AGENTS.md)

トレーニング記録・種目・テンプレート・本人によるパスワード変更・PWAは未実装です。
