# sf-viewer

sf-viewer は Salesforce CLI を使って Salesforce 組織からメタデータやフロー関連データを取得し、JSON ファイルとして保存するユーティリティです。

## 概要

- Salesforce CLI (`npx sf`) を呼び出して Salesforce 組織からデータを取得
- 取得対象はオブジェクト一覧、項目一覧、sObject一覧、フロー一覧、FlowDefinition、CronTrigger
- Windows では Git Bash がある場合、`bash.exe -lc` 経由で `npx sf` を実行

## 事前準備

1. Node.js と npm がインストールされていること
2. Salesforce CLI プラグインが利用可能であること
3. `env.json` に対象組織の alias を設定すること
4. `config.json` に objectBlackList と queryJobs を設定すること

例:`env.json`

```json
[
  { "alias": "dev", "isDefault": true },
  { "alias": "dev1" }
]
```

- `alias`: Salesforce組織のエイリアス名
- `isDefault`: デフォルトで使用するエイリアス（trueのものを1つだけ設定）

例:`config.json`

```json
{
  "objectBlackList": ["Account", "Contact"],
  "queryJobs": [
    {
      "fileName": "flowDefinitions.json",
      "query": "SELECT Id, DeveloperName, MasterLabel FROM FlowDefinition ORDER BY DeveloperName",
      "tooling": true,
      "label": "FlowDefinition一覧"
    }
  ]
}
```

`objectBlackList`: 項目一覧取得時に除外するオブジェクト名の配列
`queryJobs`: 取得するデータのカスタマイズ（追加・削除・クエリ修正が可能）

## Getting Started

### 1. インストール

```bash
npm install
```

### 2. 設定

`env.json` と `config.json` を編集します（詳細は「事前準備」を参照）。

### 3. データ取得と基本設計書生成

```bash
# デフォルトのaliasを使用する場合
npx ts-node src/index.ts

# 明示的にaliasを指定する場合
npx ts-node src/index.ts dev1
```

### 4. HTML Viewer で表示

1. ローカルサーバーを起動:
   ```bash
   npx http-server . -p 8080
   ```

2. ブラウザーで `http://localhost:8080/html/index.html` にアクセス

## 出力ファイル

すべての出力は `output/` ディレクトリに保存されます。

- `output/objects.json` - 取得したオブジェクト一覧
- `output/fields.json` - 取得した項目一覧
- `output/sobject-list.json` - 取得した sObject 一覧
- `output/flowDefinitions.json` - 取得した FlowDefinition 一覧
- `output/flows.json` - 取得した FlowRecord 一覧
- `output/cronJobs.json` - 取得した CronTrigger 一覧

## 基本設計書（TSV）

基本設計書は `out_designDoc/` ディレクトリに保存されます。

- `out_designDoc/fields.tsv` - 項目一覧
- `out_designDoc/meta.json` - メタデータ（alias, retrievedAt, queryJobs）
- `out_designDoc/flowDefinitions.tsv` - FlowDefinition 一覧
- `out_designDoc/flows.tsv` - フロー一覧
- `out_designDoc/cronJobs.tsv` - CronTrigger 一詳

## 個別実行

- データ取得のみ: `SF_ALIAS=dev npx ts-node src/retrieveData.ts`
- 基本設計書生成のみ: `SF_ALIAS=dev npx ts-node src/generateDesignDoc.ts`

## テストの実行方法

```bash
npm test
```

テストは `test/` ディレクトリに配置されています。

## 補足

- `Flow` オブジェクトではなく、実行中/実行可能なフローのレコード情報を `FlowRecord` から取得する仕様です
- Windows では Git Bash を使う際 `bash.exe` が存在する場合に自動的に利用します
