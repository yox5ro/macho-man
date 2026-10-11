# 本番構成とR2の初回セットアップ

TerraformはGitHub Actionsで実行します。mainから手動でplanを作成し、内容を確認したあと、同じmainコミットのplan run IDを指定して手動applyします。stateは非公開Cloudflare R2へ保存します。ローカルのapplyは不要です。

## 現状と管理の境界

この変更前のリポジトリにはR2 backend設定がありませんでした。確認時点でGitHub repositoryのsecrets/variables/environmentは未登録です。管理者から`macho-man-tfstate`の作成完了が報告されています。認証情報がないため、bucketの非公開設定と実接続は未検証です。この変更作業ではAPI keyの作成、実plan/applyは行っていません。

| 対象                                                    | 管理                                         |
| ------------------------------------------------------- | -------------------------------------------- |
| zone、D1、Worker本体、Custom Domain                     | Terraform                                    |
| state用R2 bucketとr2.dev無効化                          | 初回dashboard bootstrap後、Terraformへimport |
| D1/ASSETS binding、互換日付、nodejs_compat、SPA/API設定 | Terraform outputをCDが配信                   |
| stateとロック                                           | R2のS3 backend、use_lockfile=true            |
| アプリのversion・assetsと100%切替                       | main CI成功後のCD                            |
| SQLマイグレーション                                     | CDでWranglerが適用                           |
| アカウント・API key・GitHub secrets・DNS委任            | 初回の管理者設定                             |

Worker本体resourceはprovider 5.27.0でbetaです。TerraformにWorker version/deployment resourceを追加せず、CDとコード配信を取り合わない構成です。バージョンに結びつくbinding変更はTerraform apply後の次回アプリ配信で反映します。ドメインはTerraformが管理し、CDはversions upload/deployのみを使います。

## 1. R2 bootstrap（Cloudflare dashboard）

1. Cloudflareアカウントの実Account IDを確認し、R2を有効化します。R2の利用条件・無料枠・支払い方法登録の要否はdashboardで確認してください。
2. state専用bucketをStandard、default jurisdictionで作成します。bucket名は`macho-man-tfstate`を使用し、GitHub Variable `R2_STATE_BUCKET`へその名前を登録します。r2.dev public accessはDisabled、Custom Domainも未接続にします。公開URL、アプリのassets bucketと兼用しません。
3. 対象bucketに限定したR2 S3 API資格情報（Access Key ID/Secret Access Key）を発行します。Terraform用はObject Read & Write（List/Get/Put/Delete、.tflock削除とprivate backupコピーを含む）、CD用は別のObject Read onlyを使用します。backendの資格情報はCloudflare管理用API tokenとは別です。
4. 作成直後のbucketにはstateがなくても構いません。backendはbucketの存在が必要なため、このbootstrapを最初のTerraform runより先に行います。初回plan/applyは`infra/state.tf`のimport blockで既存bucketをTerraform管理へ取り込み、prevent_destroyとr2.dev無効化を管理します。

R2 bucketをこのbackend自体でゼロから作ろうとするとinitができません。この初回だけdashboardで先行作成し、以後はTerraform管理にします。state bucketの削除・改名はbackendと復旧手順も含む変更です。

## 2. GitHubの設定

`terraform-production`と`production`のenvironmentを作り、どちらもDeployment branchesをmainだけに制限してください。未信頼ブランチがworkflowを変更しても資格情報にアクセスできないよう、この制限を必須にします。Terraformは手動dispatch、CDは自動実行です。必要ならTerraform environmentにrequired reviewersを追加できますが、その場合planも承認待ちになります。

| 設定                             | terraform-production                     | production（CD）                         |
| -------------------------------- | ---------------------------------------- | ---------------------------------------- |
| Secret CLOUDFLARE_ACCOUNT_ID     | 実Account ID                             | 同じ実ID                                 |
| Secret CLOUDFLARE_API_TOKEN      | インフラ管理token                        | Workers Scripts Edit・D1 Editの配信token |
| Secret R2_ACCESS_KEY_ID          | bucket限定のRead & Write                 | 別キーのRead only                        |
| Secret R2_SECRET_ACCESS_KEY      | 上のS3 secret                            | 上のS3 secret                            |
| Secret TERRAFORM_PLAN_PASSPHRASE | 十分に長いランダム値（32byte以上を推奨） | 不要                                     |
| Variable R2_STATE_BUCKET         | macho-man-tfstate                        | macho-man-tfstate                        |

インフラtokenは対象アカウントのWorkers Scripts Edit、D1 Edit、Workers R2 Storage Edit、zone作成・取得/Custom Domainに必要なZone Edit/Read・Workers Routes Edit・DNS Editを付与し、bootstrap後に対象zoneへ範囲を狭めます。R2 S3資格情報はbucketを限定します。CloudflareのAPI tokenはstateを読むだけのCD準備には使わず、アプリ配信時に使います。

Repository variable `ENABLE_PRODUCTION_DEPLOY`は初回構築まで未設定にし、準備後に文字列`true`へ設定します。repository secretsへ置くとenvironmentの境界が弱まるため、資格情報はenvironment secretsに登録してください。値を.tfvarsやworkflow・PR本文へ書きません。

## 3. planを確認して手動apply

1. Terraform PRをmainへmerge後、Actionsの **Terraform infrastructure → Run workflow** でmain、operation=plan、enable_custom_domain=falseを選びます。PRのCIは資格情報を使わずfmt/validate/mockのみ実行します。pushで実plan/applyは行いません。
2. plan jobのログを確認します。初回はstate bucketのimport、公開無効化、zone・D1・Worker本体が対象です。plan時にも.tflockの取得・解放が成功する必要があります。エラーならapplyへ進まず、権限・endpoint・互換性を確認します。
3. 成功run IDを控え、同じmain SHAでoperation=apply、plan_run_idにそのID、confirmationに`APPLY`を入力して別runを手動起動します。apply時のenable_custom_domain入力は使いません。saved planの値が適用されます。
4. applyは同じrepository/mainの成功した手動plan runだけを受け付け、暗号化artifactを復号してそのsaved planを適用します。途中でmainが進んだ場合、artifactの1日期限が切れた場合、stateが変更された場合は新しくplanを作り直します。

planは機密を含み得るため、生のbinary plan・state・terraform show -jsonを公開artifactへ保存しません。artifactはGPG AES256で暗号化し、passphraseはGitHub secretから標準入力FDで渡します。planの通常ログはTerraformがsensitiveと扱う値とGitHub登録secretを伏せます。今後秘密の変数を追加するときは必ずsensitive指定を行い、ログに表示しない設計を確認してください。

plan/apply/CDはconcurrency group `terraform-production`を共有し、cancel-in-progress=falseです。GitHubは待機runを入れ替える場合があり、FIFOや全runの実行は保証しません。取消された待機runは必要に応じ再dispatchします。実行中applyは自動キャンセルしません。外部実行に対してはS3 lockが保護します。ロック待ちは60秒で失敗し、-lock=falseに逃げません。

## 4. DNSと初回アプリ配信

既にCloudflareにzoneがある場合は、実zone IDによるimport blockを追加してmainからplan/applyします。

```hcl
import {
  to = cloudflare_zone.app
  id = "実際のzone ID"
}
```

apply結果のname_serversをCloudflare dashboardまたは資格情報を保護した運営環境のTerraform outputで確認します。既存のDNS（Web/メール/TXT等）を先に移し、TerraformのDNS record resourceで管理してから、レジストラーでNSを変更します。既存DNS情報は未提供なので、架空のレコードは追加していません。

zoneがActiveになり、初回apply成功後にCD PRを導入します。CDはread-only R2資格情報でbackendをinitし、`terraform output -json wrangler_config`のstdoutをプロセス内で受け取って検証します。state全体をログへ出さず、仮ID/Account ID不一致ではマイグレーション前に停止します。ENABLE_PRODUCTION_DEPLOY=trueとして最新mainのCIを実行すると、同じコミットのassetsを使いD1マイグレーション→upload→100%配信を行います。

初回コード配信後にplanでenable_custom_domain=trueを選び、確認してapplyします。同名ホストの既存A/AAAA/CNAMEが競合しないことを確認します。Custom Domain resourceがDNSと証明書を管理するため、同じホストのDNS recordを二重に作りません。公開後に画面、未認証APIの401、ログイン/ログアウトとCPU使用量を確認します。Cloudflare Workers Buildsによる別系統の配信は有効化しません。

## ロック互換性・バックアップ・復旧

[TerraformのS3 backend](https://developer.hashicorp.com/terraform/language/backend/s3)はuse_lockfile=trueで.tflockのGet/Put/Deleteを必要とし、条件付きPutで排他します。[R2公式S3互換表](https://developers.cloudflare.com/r2/api/s3/api/)はPutObjectのIf-None-MatchとGet/Delete対応を明記しています。必要なAPIは公式上対応していますが、このアカウントのR2とTerraform 1.15.6による実機の排他確認は未実施です。mockテストは実R2の互換性を証明しません。初回の実planで取得・解放を確認し、運用開始前に独立クライアントから同じkeyを使う同時planがロック待ち/失敗になることも確認してください。

apply前は既存stateを同じ非公開bucketの`backups/<run-id>-<attempt>.tfstate`へサーバー側コピーします。backup失敗時はapplyを停止します。初回の空stateはコピーを省略します。R2はS3 versioningをサポートしないため、versioningを有効にしたつもりで復旧を依存させません。成功後のbackupも必要な保持期間は削除せず、live stateには自動削除ルールを設定しません。

復旧時はCDを無効化し、関連runと外部Terraform実行を停止して、最新backupと実資源・lineage/serialを照合します。R2 dashboardで保護したstateを復元するか、管理者専用のクラウド復旧runでstate push/importを行い、その後まずplanで整合性を確認します。stateを戻しても実Cloudflare資源やD1データは戻りません。state全体をチケットやログへ貼りません。

lockが残った場合は進行中runがないこと、key/account/bucket、lock IDを確認し、管理者専用のクラウド復旧runで`terraform force-unlock LOCK_ID`を行います。通常workflowに自動解除は実装しません。稼働中のlockを消したり、ロック無効でapplyしたりしません。

Terraformで新しい配信設定を定義しても、apply前のCDは前回の適用済みoutputを使います。D1/binding変更は互換性を保って段階的に行います。SQLマイグレーション後の配信失敗・WorkerロールバックでDBは自動で戻りません。
