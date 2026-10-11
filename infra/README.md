# 本番構成とR2のセットアップ

Terraformのplan/applyはローカルで実行します。GitHub ActionsはPR/mainの品質チェックと、mainのCI成功後のアプリ配信を担当します。stateは非公開R2 bucket `macho-man-tfstate`の`production/terraform.tfstate`へ保存し、S3 backendの`use_lockfile=true`を維持します。

## R2と認証情報

管理者からbucket作成完了が報告されています。Standard、default jurisdiction、r2.dev public access Disabled、Custom Domain未接続を確認してください。実接続・ロックの排他動作は未検証です。bucketはbackend initより先に必要で、初回plan/applyのimport blockによりTerraform管理へ取り込みます。prevent_destroyとr2.dev無効化を管理します。

ローカルの認証情報はパスワード管理ツールなどから必要な端末セッションだけへ読み込み、shell履歴・リポジトリ・PR・ログへ書きません。`.env`ファイルを自動で読み込む仕組みはありません。

| ローカル環境変数                          | 用途                                       |
| ----------------------------------------- | ------------------------------------------ |
| CLOUDFLARE_ACCOUNT_ID                     | 実Account ID                               |
| CLOUDFLARE_API_TOKEN                      | インフラ管理token                          |
| AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY | bucket限定のR2 Object Read & Write資格情報 |
| R2_STATE_BUCKET                           | macho-man-tfstate                          |
| TF_VAR_account_id                         | CLOUDFLARE_ACCOUNT_IDと同じ値              |
| TF_VAR_state_bucket_name                  | macho-man-tfstate                          |

Cloudflare管理tokenとR2 S3資格情報は別です。管理tokenには対象アカウントのWorkers Scripts Edit、D1 Edit、Workers R2 Storage Editと、zone・Custom Domainに必要なZone Edit/Read・Workers Routes Edit・DNS Editを設定し、対象を限定します。R2資格情報はこのbucketだけに限定します。

CD用にはGitHub Environment `production`を作り、Deployment branchesをmainだけに制限します。Secretsは`CLOUDFLARE_ACCOUNT_ID`、配信用`CLOUDFLARE_API_TOKEN`（Workers Scripts Edit・D1 Edit）、CD専用のR2 Read onlyキーを`R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`へ登録します。Environment Variable `R2_STATE_BUCKET=macho-man-tfstate`も登録します。未信頼PRには資格情報を渡しません。

Terraform用Environment、GHA用インフラtoken、plan暗号化passphrase、plan run IDは不要です。Repository Variable `ENABLE_PRODUCTION_DEPLOY`は初回構築まで未設定にします。

## ローカルinit → plan → 同じ保存planのapply

Node.js 24、Terraform 1.15.6を使用し、最新mainのクリーンなcheckoutで実行します。認証情報を読み込んでから、次の非秘密値を設定します。

```sh
export R2_STATE_BUCKET=macho-man-tfstate
export TF_VAR_state_bucket_name="$R2_STATE_BUCKET"
export TF_VAR_account_id="$CLOUDFLARE_ACCOUNT_ID"
node scripts/prepare-backend.ts
terraform -chdir=infra init -input=false -lockfile=readonly -backend-config=backend.tfbackend.json
```

backend設定に認証情報を埋め込みません。生成設定・state・planはgitignore対象です。planとローカルstateキャッシュは機密を含み得るため、端末のアクセス権で保護し、共有artifactへアップロードしません。

変更前に`ENABLE_PRODUCTION_DEPLOY=false`にし、進行中のCDが完了していることをActionsで確認します。作業中のpush・CD再有効化を避けます。GHAのconcurrencyはCD同士だけを直列化し、ローカルapplyとの競合を防ぎません。S3 lockもWorker配信を保護しないため、この運用手順で同時変更を避けます。

```sh
umask 077
terraform -chdir=infra plan -input=false -lock-timeout=60s -var=enable_custom_domain=false -out=reviewed.tfplan
terraform -chdir=infra show reviewed.tfplan
```

変更内容を確認し、既存stateがある場合はapply前にAWS CLIの`aws s3 cp`を使い、account固有のR2 endpointを指定して`production/terraform.tfstate`を同じ非公開bucketの`backups/<日時>.tfstate`へコピーします。backupに失敗したらapplyしません。初回の空stateは省略します。plan後はcheckout・変数・認証対象を変えず、確認したファイルを適用します。

```sh
terraform -chdir=infra apply -input=false -lock-timeout=60s reviewed.tfplan
rm -f infra/reviewed.tfplan
```

stateが変わった場合や変更内容を修正する場合はplanを作り直します。applyと整合性確認が成功してから、準備済みのCDを再有効化し、最新mainのCIを実行します。途中失敗時はCDを停止したまま原因を解消します。PRのCIは資格情報なしのfmt/validate/mockのみで、実plan/applyは実行しません。

## DNSと初回配信

Terraformはzone `yox5ro.net`、D1 `macho-man`、Worker本体、workers.dev/preview無効化、Custom Domain `macho-man.yox5ro.net`を管理します。既存zoneがある場合は実zone IDのimport blockを追加してからplanします。既存DNSを移行し、dashboardでname serversを確認してレジストラーのNSを変更します。架空のDNS recordは作成しません。

初回は`enable_custom_domain=false`で構築します。zoneがActiveになった後にCDを導入し、`ENABLE_PRODUCTION_DEPLOY=true`で最新mainのCIを実行します。CDはRead only R2資格情報でinitし、適用済み`wrangler_config` outputをプロセス内で検証します。state全体をログへ出さず、仮D1 IDやAccount ID不一致では配信を停止します。

初回コード配信後にCDを停止し、`-var=enable_custom_domain=true`でplanを作り、確認して同じ保存planをapplyします。同名のA/AAAA/CNAME競合を確認し、Custom DomainのDNSを二重管理しません。公開後に画面、未認証APIの401、ログイン/ログアウトとCPU使用量を確認します。

Worker本体resourceはCloudflare provider 5.27.0でbetaです。Terraformはコードversion/deploymentを管理せず、CDはversions upload/deployで配信します。D1/ASSETS binding・互換設定・SPA/API設定はTerraform outputをCDが反映します。binding変更は次回配信で反映されるため、旧アプリとの互換性を保ちます。SQLマイグレーションはWorkerのロールバックで戻りません。Cloudflare Workers Buildsによる別系統の配信は有効化しません。

## ロックと復旧

[Terraform S3 backend](https://developer.hashicorp.com/terraform/language/backend/s3)のlockfileはGet/Put/Deleteと条件付きPutを使用し、[R2公式互換表](https://developers.cloudflare.com/r2/api/s3/api/)では必要なAPIが対応しています。ただし実R2とTerraform 1.15.6での排他確認は未実施です。初回planで取得・解放を確認し、運用前に独立したクライアントの同時planが同じkeyでロック待ち/失敗することも確認してください。mockはこの実機検証を代替しません。`-lock=false`は使用しません。

R2のS3 versioningには依存せず、非公開backupを必要な期間保持し、live stateに自動削除ルールを設定しません。復旧時はCDと全Terraform実行を止め、backupのlineage/serialと実資源を照合します。保護したbackupをR2へ復元するか、ローカルの`terraform state push`/importで復旧し、まずplanで整合性を確認します。stateを戻してもCloudflare資源やD1データは戻りません。

残留lockは実行中処理がないこと、account/bucket/keyとlock IDを確認してから、同じbackendのローカル端末で`terraform -chdir=infra force-unlock LOCK_ID`を実行します。稼働中のlockを消さず、自動解除も行いません。
