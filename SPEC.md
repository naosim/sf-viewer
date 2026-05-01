# sf-viewer

## 概要

sf-viewerは、Salesforce CLI (`sf`) を通じてSalesforce組織からデータを取得し、JSON形式で保存する実行ユーティリティです。

## 処理ステップ
処理は大きく分けて2ステップあります。
- 処理1. Salesforceから必要なデータを取得する
- 処理2. 取得したデータを元に基本設計書を生成する

### 技術
- 言語: TypeScript
- 実行環境: Node.js
- Salesforce操作: `npx sf` を経由した Salesforce CLI

### 要件
#### 処理1
- データ取得は `npx sf` で実行する
- Windows環境では Git Bash が利用可能なら `bash.exe -lc` 経由でコマンドを実行する
- `sf` コマンドの存在確認を行い、未インストールの場合は利用者にエラーメッセージを表示する
- `config.json` に `alias` を記載し、対象Orgを指定する
- 取得対象データ
  - オブジェクト一覧: `EntityDefinition`
  - 項目一覧: `FieldDefinition`
  - フロー一覧: `FlowRecord`
  - FlowDefinition一覧: `FlowDefinition` (Tooling API)
  - 定期起動ジョブ一覧: `CronTrigger`
- 取得したデータは以下のファイルに保存する
  - `output/objects.json`
  - `output/fields.json`
  - `output/flowDefinitions.json`
  - `output/flows.json`
  - `output/cronJobs.json`
- オプション `--only-flows` を指定すると、オブジェクト一覧および項目一覧の取得をスキップし、Flow関連とCronTriggerのみ取得する

#### 処理2
- 取得したJSONをもとに基本設計書を生成する（現状未実装）

## 開発工程
まずは処理1の完成を目指します。処理1が安定したら、処理2の設計と生成ロジックを追加します。

## 実行
```
npx ts-node src/index.ts
```

### フロー関連のみ実行
```
npx ts-node src/index.ts --only-flows
```


