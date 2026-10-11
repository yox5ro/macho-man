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

本番の構成は`infra`のTerraformで定義し、ローカルでplanを確認して保存済みplanを手動applyします。stateは非公開R2に保存し、ロックを有効にします。フロント/APIは1つのWorkerとD1を使います。GitHub repo、DNS、R2 state bucket、認証情報の準備は[本番セットアップ手順](infra/README.md)を参照してください。資源作成・applyはまだ行っていません。

ローカル用`wrangler.jsonc`のD1 IDは仮IDです。本番資源を手動作成したり仮IDで配信したりせず、ローカルのTerraformから構築してください。アプリの配信と本番CLIの設定取得は後続のCD段階で導入します。

安全なパスワード検証にはCPU時間が必要です。Workers無料枠のCPU制限内で動くことは未検証のため、本番で計測し、必要なら認証処理の構成やプランを見直してください。ハッシュ強度を下げて回避しません。

## CI・構成管理

PRとmainへのpushでLint、フォーマットチェック、テスト、型チェック、フロント/Workerのビルドを実行します。Node.js 24と`npm ci`を使い、失敗した場合はCIが失敗します。Terraformのfmt・validate・mockテストもCIで検証します。Cloudflareへの自動配信は次の段階で導入します。

## 確認

```sh
npm test
npm run lint
npm run format:check
npm run build
npm run build:server
```

フォーマット修正は`npm run format`で行います。Oxfmtを使用し、TypeScript/JavaScript、JSON/JSONC、YAML、Markdown、HTML、CSSを検証します。Terraform/HCLは`terraform fmt`で整形します。Prettierの直接依存はありませんが、HTMLなど一部の形式はOxfmt同梱のPrettierで処理します。

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
