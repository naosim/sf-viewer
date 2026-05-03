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
#### 事前準備
- `env.json` に alias 一覧を定義:
  ```json
  [
    { "alias": "dev", "isDefault": true },
    { "alias": "dev1" }
  ]
  ```
  - `alias`: Salesforce組織のエイリアス名
  - `isDefault`: デフォルトで使用するエイリアス（1つだけtrueに設定）

#### 処理1
- データ取得は `npx sf` で実行する
- Windows環境では Git Bash が利用可能なら `bash.exe -lc` 経由でコマンドを実行する
- `sf` コマンドの存在確認を行い、未インストールの場合は利用者にエラーメッセージを表示する
- alias は `env.json` から取得し、CLI引数またはisDefaultで指定
- 取得対象データ（デフォルト）:
  - オブジェクト一覧: `EntityDefinition` (SOQL)
  - 項目一覧: `FieldDefinition` (SOQL)
  - sObject一覧: `sf sobject list --sobject all` コマンドで取得（SOQL以外のCLIコマンドを使用）
  - フロー一覧: `FlowRecord` (SOQL、デフォルトで `LIMIT 200`)
  - FlowDefinition一覧: `FlowDefinition` (Tooling API)
  - 定期起動ジョブ一覧: `CronTrigger` (SOQL)
- 取得的データは `config.json` の `queryJobs` でカスタマイズ可能
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
  - `out_designDoc/meta.json` - メタデータ（alias, retrievedAt, queryJobs）
  - `out_designDoc/{queryJob fileName}.tsv` - queryJobsで指定したJSONファイルのTSV版
- 各TSVファイルには label メタデータが含まれる（fields.tsvは「オブジェクト定義」、他はqueryJobのlabel）
- 出力前に前回出力を `out_designDoc/backup/{timestamp}_{alias}/` にバックアップ

## 実行

### 一括実行（処理1 + 処理2）
```
# デフォルトaliasを使用
npx ts-node src/index.ts

# 明示的にaliasを指定
npx ts-node src/index.ts dev1
```

### 個別実行
- 処理1のみ: `SF_ALIAS=dev npx ts-node src/retrieveData.ts`
- 処理2のみ: `npx ts-node src/generateDesignDoc.ts`（TSVとスタンダアロンHTMLを両方生成）

### スタンダアロンHTML
- 処理2の実行時に `out_designDoc/` の全TSVデータをHTML内に埋め込んで、単独で開けるHTMLファイルを生成
- 出力先: `standaloneHtml/viewer.html`
- 外部依存なし（CDNは使用）
- 表示仕様はHTML Viewerと同じ（Tabulator使用、タブ切り替え）

### アドオン
- `addons/` ディレクトリ内のすべての `.ts` ファイルを自動検出・実行
- インターフェース:
  ```typescript
  type JsonData = { [filename: string]: any };
  export function run(inputData: JsonData): { meta: { [key: string]: string }; headers: string[]; rows: string[][] }[]
  ```
- 入力: `output/` 配下のJSONファイル（キーはファイル名、バリューはパース后的オブジェクト）
- 出力: `out_designDoc/{アドオン名}_{インデックス}.tsv`
- エラー発生時は処理中止

---

## 追加機能

### Google SpreadSheet への反映
- GAS（Google Apps Script）を使用して `out_designDoc/` を Google SpreadSheet に反映
- GAS のソースは `gas/index.gs` と `gas/config.gs` に保存
- 設定（`gas/config.gs` を編集）:
  - `DRIVE_FOLDER_ID`: TSVファイルを配置するGoogle DriveフォルダID
  - `SPREADSHEET_ID`: 反映先のSpreadSheet ID
- 設定値が未編集の場合はエラーが表示されます
- 処理内容:
  1. DriveフォルダからTSVファイルを取得
  2. 既存の同名シートをクリア（新規作成の場合は作成）
  3. 各TSVのメタ情報（alias, retrievedAt, labelなど）をシートの1行目부터書き込む
  4. その後にヘッダーとデータを書き込み
- meta.json の内容は `meta` シートに書き込む
- 実行は手動（`run()` 関数を実行）


