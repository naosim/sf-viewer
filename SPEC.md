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
  - オブジェクト一覧: `EntityDefinition` (SOQL)
  - 項目一覧: `FieldDefinition` (SOQL)
  - sObject一覧: `sf sobject list --sobject all` コマンドで取得（SOQL以外のCLIコマンドを使用）
  - フロー一覧: `FlowRecord` (SOQL、デフォルトで `LIMIT 200`)
  - FlowDefinition一覧: `FlowDefinition` (Tooling API)
  - 定期起動ジョブ一覧: `CronTrigger` (SOQL)
- 取得したデータは以下のファイルに保存する
  - `output/objects.json`
  - `output/fields.json`
  - `output/sobject-list.json`
  - `output/flowDefinitions.json`
  - `output/flows.json`
  - `output/cronJobs.json`
- `config.json` によるカスタマイズ
  - `objectBlackList`: 項目一覧取得時に除外するオブジェクト名の配列
  - `queryJobs`: 取得するデータのカスタマイズ（追加・削除・クエリ修正が可能）。各要素は以下のプロパティを持つ:
    - `fileName`: 保存ファイル名
    - `query`: SOQLクエリ
    - `tooling`: Tooling APIを使用するかどうか（boolean）
    - `label`: 表示用ラベル

#### 処理2
- 取得したJSONファイル（`output/` ディレクトリ）を元に基本設計書を生成する
- TSV形式（FrontMatterTSV）で出力
- 出力先: `out_designDoc/` ディレクトリ
- 出力ファイル:
  - `out_designDoc/fields.tsv` - 項目一覧（ObjectName, FieldName, Label, DataType, Length）
  - `out_designDoc/meta.json` - メタデータ（alias, retrievedAt）
- 出力前に前回出力を `out_designDoc/backup/{timestamp}_{alias}/` にバックアップ

## 開発工程
まずは処理1の完成を目指します。処理1が安定したら、処理2の設計と生成ロジックを追加します。

## 実行

### 処理1: データ取得
```
npx ts-node src/retrieveData.ts
```

### 処理2: 基本設計書生成
```
npx ts-node src/generateDesignDoc.ts
```


