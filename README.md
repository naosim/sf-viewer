# sf-viewer

sf-viewer は Salesforce CLI を使って Salesforce 組織からメタデータやフロー関連データを取得し、JSON ファイルとして保存するユーティリティです。

## 概要

- Salesforce CLI (`npx sf`) を呼び出して Salesforce 組織からデータを取得
　　- Windows では Git Bash がある場合、`bash.exe -lc` 経由で `npx sf` を実行
- 取得対象はオブジェクト一覧、項目一覧、sObject一覧など（config.jsonでカスタマイズ可能）
- 出力形式: TSV, HTML, スタンダアロンHTML, Google SpreadSheet (GAS)

## 事前準備

1. Node.js と npm がインストールされていること
2. `env.json` に対象組織の alias を設定すること
3. `config.json` に objectBlackList と queryJobs を設定すること

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
`queryJobs`: 取得するデータのカスタマイズ（追加・削除・クエリ修正が可能）。デフォルトではFlowDefinition、FlowRecord、CronTriggerが含まれる。

## Getting Started

### 1. インストール

```bash
npm install
```

### 2. Salesforce CLI ログイン

```bash
sf org login web -r [salesforceのURL] -a dev
```
alias(-a)の値も任意の値にできます。

### 3. 設定

`env.json` と `config.json` を編集します（詳細は「事前準備」を参照）。

### 4. データ取得と基本設計書生成

```bash
# デフォルトのaliasを使用する場合
npx ts-node src/index.ts

# 明示的にaliasを指定する場合
npx ts-node src/index.ts dev1
```

### 5. スタンダアロンHTMLを開く

`standaloneHtml/viewer.html` をブラウザで開いて確認します。

---

## 追加機能

### HTML Viewer で表示

1. ローカルサーバーを起動:
   ```bash
   npx http-server . -p 8080
   ```

2. ブラウザーで `http://localhost:8080/html/index.html` にアクセス

### Google SpreadSheet へ反映

1. `out_designDoc/` を Google Drive の指定フォルダにアップロード
2. Google Apps Script のプロジェクトを開く（`gas/index.gs` と `gas/config.gs` を貼り付け）
3. `gas/config.gs` の設定（DRIVE_FOLDER_ID, SPREADSHEET_ID）を編集
4. `run()` 関数を実行（設定値が未編集の場合はエラーが表示されます）

各TSVファイルはメタ情報（alias, retrievedAt, labelなど）をシートの1行目から書き込み、ヘッダーとデータはメタ情報の後に続きます。

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
- 基本設計書生成のみ: `npx ts-node src/generateDesignDoc.ts`（TSVとスタンダアロンHTMLを両方生成）

## スタンダアロンHTML

基本設計書生成時に `standaloneHtml/viewer.html` に全データを埋め込んだ単独のHTMLファイルを生成します。外部依存なし（CDNは使用）で、単独で開いて表示可能です。

## アドオン

`addons/` ディレクトリに TypeScript ファイルを配置すると、基本設計書生成時に自動的に実行されます。

### インターフェース

```typescript
type JsonData = { [filename: string]: any };

export function run(inputData: JsonData): { meta: { [key: string]: string }; headers: string[]; rows: string[][] }[] {
  // output配下のJSONを読んで独自のTSVデータを返す
  // 戻り値は配列で、複数のファイルを生成可能
}
```

### 出力

- ファイル名: `{アドオン名}_{インデックス}.tsv`（例: `myAddon_0.tsv`）
- ディレクトリ: `out_designDoc/`
- エラー発生時は処理が中止されます

## テストの実行方法

```bash
npm test
```

テストは `test/` ディレクトリに配置されています。

## 補足

- `Flow` オブジェクトではなく、実行中/実行可能なフローのレコード情報を `FlowRecord` から取得する仕様です
- Windows では Git Bash を使う際 `bash.exe` が存在する場合に自動的に利用します
