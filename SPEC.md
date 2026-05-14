# sf-viewer

## 概要

sf-viewerは、Salesforce組織の構成情報を取得して基本設計書を可視化するツールです。

### ユースケース

- Salesforceの設定内容をTSV/Markdownとして出力
- オブジェクト項目、フロー、Apexクラス等の情報を一覧表示
- スタンダアロンHTMLやGoogle SpreadSheetでチーム共有
- アドオンで独自出力やHTMLカスタマイズ

### ディレクトリ構造
```
sf-viewer/
├── src/                 # ソースコード
│   ├── index.ts         # エントリーポイント
│   ├── retrieveData.ts  # 処理1: Salesforceからデータ取得
│   ├── generateDesignDoc.ts  # 処理2: 基本設計書生成
│   └── ...
├── userData/            # ユーザーデータ（デフォルト）
│   ├── env.json        # alias設定
│   ├── config.json     # 取得設定
│   ├── output/         # 取得データJSON
│   ├── out_designDoc/  # 出力設計書
│   ├── standaloneHtml/ # 生成HTML
│   └── addons/         # アドオン
└── gas/                 # Google Apps Script
```

### データディレクトリの指定
`--user-data-dir` オプションでデータディレクトリのパスを指定できます。指定しない場合は `./userData`（プロジェクトルートからの相対パス）が使用されます。

#### 引数の順序

**重要**: `--user-data-dir` は alias の前または後のどちらにも配置できますが、**alias を先に指定することを推奨**します。

```
# 推奨: alias を先に指定
npx ts-node src/index.ts dev --user-data-dir ./myData

# または --user-data-dir を先に指定
npx ts-node src/index.ts --user-data-dir ./myData dev

# 基本設計書のみ再生成
npx ts-node src/generateDesignDoc.ts dev --user-data-dir ./myData

# デフォルトのデータディレクトリを使用
npx ts-node src/index.ts dev
```

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
    { "alias": "dev", "isDefault": true, "options": {"url": "https://example.com"} },
    { "alias": "dev1" }
  ]
  ```
  - `alias`: Salesforce組織のエイリアス名
  - `isDefault`: デフォルトで使用するエイリアス（1つだけtrueに設定）
  - `options`: 任意のオプション情報（出力JSONの `meta.options` に保存）
  - `base_url`: 出力JSONの `meta.base_url` に自動保存される（Salesforce組織のインスタンスURL、`sf org display` で取得）

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
  - `userData/output/objects.json`
  - `userData/output/fields.json`
  - `userData/output/sobject-list.json`
  - `userData/output/flowDefinitions.json`
  - `userData/output/flows.json`
  - `userData/output/cronJobs.json`
- `config.json` によるカスタマイズ
  - `objectBlackList`: 項目一覧取得時に除外するオブジェクト名の配列
  - `queryJobs`: 取得するデータのカスタマイズ（追加・削除・クエリ修正が可能）。各要素は以下のプロパティを持つ:
    - `fileName`: 保存ファイル名
    - `query`: SOQLクエリ
    - `tooling`: Tooling APIを使用するかどうか（boolean）
    - `label`: 表示用ラベル

#### 処理2
- 取得したJSONファイル（`userData/output/` ディレクトリ）を元に基本設計書を生成する
- TSV形式（FrontMatterTSV）で出力
- 出力先: `userData/out_designDoc/` ディレクトリ
- 出力ファイル:
  - `userData/out_designDoc/fields.tsv` - 項目一覧（ObjectName, FieldName, Label, DataType, Length）
  - `userData/out_designDoc/meta.json` - メタデータ（alias, retrievedAt, queryJobs）
  - `userData/out_designDoc/{queryJob fileName}.tsv` - queryJobsで指定したJSONファイルのTSV版
- 各TSVファイルには label メタデータが含まれる（fields.tsvは「オブジェクト定義」、他はqueryJobのlabel）
- 出力前に前回出力を `userData/out_designDoc/backup/{timestamp}_{alias}/` にバックアップ

## 実行

### 一括実行（処理1 + 処理2）
```
# デフォルトaliasを使用
npx ts-node src/index.ts

# 明示的にaliasを指定
npx ts-node src/index.ts dev1
```

### 個別実行
- 処理1のみ（データ取得）: `npx ts-node src/retrieveData.ts dev --user-data-dir ./myData`
- 処理2のみ（基本設計書生成）: `npx ts-node src/generateDesignDoc.ts dev --user-data-dir ./myData`（TSVとスタンダアロンHTMLを両方生成）

> **注意**: retrieveData.ts と generateDesignDoc.ts は連携しており、retrieveData.ts で生成した output/*.json を generateDesignDoc.ts で読み込みます。個別に実行する場合も、同じ `--user-data-dir` を指定してください。

### スタンダアロンHTML
- 処理2の実行時に `userData/out_designDoc/` の全TSVデータをHTML内に埋め込んで、単独で開けるHTMLファイルを生成
- 出力先: `userData/standaloneHtml/viewer.html`
- 外部依存なし（CDNは使用）
- 表示仕様はHTML Viewerと同じ（Tabulator使用、タブ切り替え）
- HTMLテンプレート: `src/html/viewer.html`（プレースホルダー: `{{PAGE_TITLE}}`, `{{VIEWER_CSS}}`, `{{VIEWER_JS}}`, `{{TSV_DATA}}`, `{{MD_DATA}}`, `{{META}}`, `{{TABS}}`, `{{CUSTOM_CSS}}`, `{{CUSTOM_JS}}`）
- CSS: `src/html/css/viewer.css`
- JS: `src/html/js/viewer.js`

### URL パラメータによるタブ直接表示
`viewer.html?page=filename.tsv` で対応するタブを直接表示できます。

- 例: `userData/standaloneHtml/viewer.html?page=flows.tsv` → flows.tsv タブを表示
- タブを切り替えると URL が `?page=ファイル名` に更新される（pushState）
- ブラウザの戻る/進むボタンでタブ履歴を辿れる（popstate イベント対応）

### アドオン
- `userData/addons/` ディレクトリ内の `.ts` ファイルを自動検出・実行
- プレフィックスによって処理が異なる:

| プレフィックス | インターフェース | 実行タイミング | 出力先 |
|--------------|----------------|--------------|--------|
| `sample*.ts` | `run(inputData): AddonResult[]` | TSV生成後 | `out_designDoc/{name}_{i}.tsv` |
| `designDoc*.ts` | `run(inputData, tabs, meta): {tabs?, title?}` | meta.json更新前 | `meta.json` |
| `htmlCustom*.ts` | `run(meta): {css?, js?}` | HTML生成時 | HTMLに直接埋め込み |
| `filter*.ts` | `run(file: {fileName, label}): boolean` | TSV/MD生成後 | 生成ファイルのフィルタリング |

#### 標準アドオン (sample*.ts)
```typescript
type JsonData = { [filename: string]: any };
type AddonResult = {
  meta: { [key: string]: string };
  headers?: string[];
  rows?: string[][];
  type?: 'tsv' | 'markdown';
  content?: string;
};

export function run(inputData: JsonData): AddonResult[]
```
- 入力: `userData/output/` 配下のJSONファイル
- 出力: `userData/out_designDoc/{アドオン名}_{インデックス}.tsv`

#### designDoc アドオン (designDoc*.ts)
```typescript
type JsonData = { [filename: string]: any };

export function run(
  inputData: JsonData,
  tabs: string[],
  meta: any
): {
  tabs?: string[];  // タブの順序を変更
  title?: string;   // ページタイトルを変更
} {}
```

#### HTMLアドオン (htmlCustom*.ts)
```typescript
export function run(meta: any): {
  css?: string;  // カスタムCSS（末尾の<style>タグとして追加）
  js?: string;   // カスタムJS（末尾の<script>タグとして追加）
} {}
```

#### フィルターアドオン (filter*.ts)
```typescript
export function run(file: { fileName: string; label: string }): boolean {
  // true: 生成する（保持）, false: 生成しない（削除）
  return !file.fileName.includes("flows");
}
```
- 全ての標準アドオン終了後、生成されたファイル（TSV/MD）に対して実行
- `fileName` と `label` を参照して判定可能
- `false` を返したファイルは削除される

#### アドオン内での import 対応
アドオン内で `import` 文を使用できます（例: `import { hoge } from "./libs/util"`）。
`createRequire` により Node.js の require システム経由でモジュールが解決されます。

- エラー発生時は処理中止

---

## 追加機能

### Google SpreadSheet への反映
- GAS（Google Apps Script）を使用して `userData/out_designDoc/` を Google SpreadSheet に反映
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


