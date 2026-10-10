# 本番インフラと初回セットアップ

構成の定義はこのディレクトリに集約します。HCP Terraformのremote executionでplanを確認し、画面で手動applyします。GitHub ActionsはTerraformをapplyせず、適用済みの`wrangler_config` outputだけを読み、Workerのアプリバージョンを自動配信します。

## 管理の境界

| 対象                                                                             | 管理方法                                                          |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Cloudflare DNS zone、D1、Worker本体、workers.dev/previewの無効化、Custom Domain  | Terraformのresource                                               |
| D1/ASSETS binding、互換日付、nodejs_compat、SPA/APIの配信設定                    | Terraformのoutputから本番Wrangler設定を生成                       |
| Workerバージョンと静的アセットの内容、100%への切り替え                           | ActionsのWrangler versions upload/deploy                          |
| D1テーブルとデータ変更                                                           | バージョン管理されたSQLをActionsのWrangler migrations applyで適用 |
| Cloudflare/HCP/GitHubアカウント、API token、GitHub secrets、レジストラーのNS変更 | 初回の管理者設定                                                  |

Workerの本体とバージョンを別resourceとして扱えるCloudflare provider 5.27.0の`cloudflare_worker`を使います。このresourceは公式ドキュメントでbeta扱いです。Terraformに`cloudflare_workers_script`や`cloudflare_worker_version`、deployment resourceを追加するとActionsとコード配信を取り合うため、使用しません。

バージョンに結びつくbinding/配信設定はTerraformで定義し、Actionsがその適用済みoutputを配信します。Terraform applyだけでは配信中のバージョンのbindingは変わりません。インフラ変更を手動applyしたあと、mainのCIを再実行するか新たなpushでアプリを配信して反映します。ドメイン設定はWrangler設定に含めず、`wrangler deploy`や`triggers deploy`は本番で使いません。

## 0. GitHubリポジトリの作成と段階導入

GitHubリポジトリとremoteはまだ未作成です。まずGitHubの画面または認証済みGitHub CLIでリポジトリを作成し、ローカルの既存履歴をpushします。公開/非公開と所有者・リポジトリ名は作成時に指定してください。ローカルのブランチはCI→Terraform→CDの順に積み重ねています。GitHubで各ブランチをpushし、順にPRを作成して確認・マージしてください。この作業ではrepo作成・push・PR作成・mergeは行っていません。

1. CIブランチをmainへ取り込み、Actionsのチェックを確認します。
2. Terraformブランチを取り込み、以下のHCP workspaceを接続します。HCPの初回手動applyでCloudflareを構築します。
3. CDブランチを取り込み、secrets/variablesを設定してから配信を有効化します。

private repositoryのActionsにはGitHubプランの無料利用枠があるため、実行時間とアーティファクト保存量を確認してください。

## 1. CloudflareとHCP Terraformを準備

1. Cloudflareアカウントを用意し、実際のAccount IDを確認します。D1やWorkerは画面で先に作成しません。
2. HCP TerraformのorganizationとVCS連携workspace（例：`macho-man-production`）を作成し、このGitHubリポジトリの`main`へ接続します。Terraform Working Directoryを`infra`、Execution Modeを **Remote**、Terraformを **1.15.6** に設定します。
3. **Auto applyを無効**にします。VCSの変更検知は`infra/**`に限定します。pushでplanは作成されますが、applyは画面で内容を確認してから開始します。GitHubのCIが成功していることも確認します。ローカルの`terraform apply`は使いません。
4. HCP workspaceのTerraform変数に`account_id`を登録します。`enable_custom_domain`は初回は`false`（既定値）です。
5. HCP workspaceのEnvironment変数に`CLOUDFLARE_API_TOKEN`を **Sensitive** として登録します。Cloudflareの対象アカウントへ限定し、Workers Scripts EditとD1 Edit、zone作成・取得とCustom Domain管理に必要なZone Edit/Read、Workers Routes Edit、DNS Edit権限を設定します。初回zone作成のため、zone作成を許可する範囲が必要です。作成後は`yox5ro.net`へ制限を狭めてください。

HCP Terraform Freeは500管理リソースまでのremote execution/state管理を利用できます。料金・利用条件は[現行プラン](https://developer.hashicorp.com/terraform/cloud-docs/overview)で確認してください。stateとロックはHCP workspaceが管理します。この構成にローカルbackendや別のstate保存先は必要ありません。トークンを`.tfvars`やリポジトリへ保存しません。

## 2. 最初の手動applyとDNS

HCP画面でrunを開始してplanを確認し、zone・D1・Worker本体だけを作成することを確認して手動applyします。初回はドメインの公開とアプリ配信を行いません。D1とzone、Workerには`prevent_destroy`を設定しています。

`yox5ro.net`が既にCloudflareにある場合は新規作成せず、実際のzone IDを使った次のimport blockを`infra/imports.tf`に追加し、HCPでplan/applyしてください。すでに存在するD1やWorkerについても同様に既存資源をimportします。IDはCloudflareから取得してください。

```hcl
import {
  to = cloudflare_zone.app
  id = "実際のzone ID"
}
```

apply後の`name_servers` outputを取得します。既存のDNSレコード（Web、メール、TXT等）をCloudflareへ移し、必要なものはTerraformのDNS record resourceとして管理してから、取得済みドメインのレジストラーでNSを変更します。既存DNSの内容は未提供なので、このリポジトリでは架空のレコードを追加していません。CloudflareでzoneがActiveになるまで待ちます。NS変更はレジストラーの管理画面で行う初回作業です。

## 3. GitHubの配信設定

GitHubで`production` environmentを作成します。Deployment branchesは`main`に限定し、通常配信を自動にするためrequired reviewersは設定しません。以下のsecrets/variablesをenvironmentまたはrepositoryに登録します。

| 種類                | 名前                       | 値・権限                                                                                            |
| ------------------- | -------------------------- | --------------------------------------------------------------------------------------------------- |
| Secret              | `CLOUDFLARE_API_TOKEN`     | アプリ配信用。対象アカウントのWorkers Scripts Edit、D1 Edit。zone編集権限は不要                     |
| Secret              | `CLOUDFLARE_ACCOUNT_ID`    | Terraformの`account_id`と同じ実ID                                                                   |
| Secret              | `HCP_TERRAFORM_TOKEN`      | 対象workspaceのoutputsを読み取れるuser/team token。使用可能なtoken種別・権限はHCPのプランに合わせる |
| Variable            | `HCP_WORKSPACE_ID`         | workspaceの実ID（`ws-...`）。workspace名やorganization名ではない                                    |
| Repository Variable | `ENABLE_PRODUCTION_DEPLOY` | 初期構築が完了するまで未設定。準備後に文字列`true`へ設定                                            |

HCP tokenに不要なapply権限を与えません。Freeプランで専用の読み取りteamを利用できない場合は、権限を確認したuser tokenを使い、GitHub secretsで保護します。ActionsはoutputsのGETしか行いません。HCP outputs未作成、認証失敗、仮D1 ID、Account IDの不一致ではマイグレーション前に停止します。未設定のIDをリポジトリに埋め込む必要はありません。

## 4. 初回アプリ配信と公開

1. 最初の手動applyが成功した後で、repository variable `ENABLE_PRODUCTION_DEPLOY=true`を設定します。
2. mainへpushするか、最新のmain pushで起動したCIを **Re-run all jobs** します。CI成功後に別workflowが、同じコミットのフロント成果物とTerraformの適用済み設定を使ってD1マイグレーション→バージョンupload→100%配信を行います。PRから配信しません。古いmainのCIを再実行しても、配信開始時に最新mainでなければスキップします。
3. HCPの`enable_custom_domain=true`を設定し、改めてplanを確認して手動applyします。zoneがActiveで、同名ホストの既存A/AAAA/CNAMEが競合していないことを確認してください。TerraformのCustom Domain resourceがCloudflare側のDNSと証明書を管理します。二重にDNS recordを作りません。
4. `https://macho-man.yox5ro.net`で画面が表示され、未ログインの`/api/auth/session`が401になることを確認します。運営者CLIで本番ユーザーを作成します。CLIを使う端末では、上記と同じ認証情報で`npm run deploy:prepare`を実行し、`npm run user -- create your-id --remote`を実行します。CLIは`--remote`時に生成済み本番設定を使用します。パスワードは対話入力です。

Cloudflare Workers Buildsは有効化しません。Actionsと別系統の自動配信を作ると、CIの成功条件を迂回するためです。

## 変更・失敗時の運用

- CI→Terraform→CDの順でレビュー・導入できます。CIのTerraform jobは`infra`の導入と同時に追加し、CDは初回インフラapply後にvariableで有効化します。
- インフラ変更はHCPでplanを確認して手動applyし、その後アプリを配信します。D1/bindingを使うアプリ変更と同時にマージして先に配信しないよう、互換性を保った段階的な変更を行います。必要ならCDのvariableを一時的に`false`へ変更します。
- D1マイグレーションは旧バージョンが稼働したまま実行されます。まず列追加などの後方互換な変更を適用し、削除などの破壊的変更は別段階で実施します。マイグレーション成功後にコード配信が失敗してもDBは自動で戻りません。WorkerのロールバックでもDBは戻りません。
- 配信workflowは同時実行せず、進行中のマイグレーション・配信を新しいpushでキャンセルしません。TerraformとActionsのロックは別なので、同じWorker/D1への手動applyと配信を同時に開始しないでください。
- ActionsからHCPの未適用planを待ったりapplyしたりしません。Terraformで新しい配信設定を定義しても、手動apply前のCDは前回の適用済み設定を使います。
- 本番のログイン、セッションCookie、ログアウト、CLIとD1の整合性を確認します。scryptのCPU使用量とWorkersプランの適合は実環境で計測してください。

## 参照

- [Cloudflare IaCとWorker/Versionの分離](https://developers.cloudflare.com/workers/platform/infrastructure-as-code/)
- [Wrangler versionsコマンド](https://developers.cloudflare.com/workers/wrangler/commands/workers/)
- [HCP TerraformのVCS workflow](https://developer.hashicorp.com/terraform/cloud-docs/run/ui)
- [HCP Terraform outputs API](https://developer.hashicorp.com/terraform/cloud-docs/api-docs/state-version-outputs)
