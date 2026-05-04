# sf-viewer

[English version](./README.en.md)

Salesforce組織の構成情報を取得し、基本設計書として可視化するツールです。

## ユースケース

- **設計書の自動生成**: Salesforceの設定内容をTSV/Markdownとして出力
- **構成把握**: オブジェクト項目、フロー、Apexクラス等の情報を一覧表示
- **チーム共有**: スタンダアロンHTMLやGoogle SpreadSheetで情報を共有
- **アドオンによる拡張**: 独自のTSV出力やHTMLカスタマイズが可能

## 概要

- Salesforce CLI (`npx sf`) を呼び出して Salesforce 組織からデータを取得
- Windows では Git Bash がある場合、`bash.exe -lc` 経由で `npx sf` を実行
- 取得対象: オブジェクト一覧、項目一覧、フロー定義、定期実行ジョブなど（config.jsonでカスタマイズ可能）
- 出力形式: TSV, スタンダアロンHTML, Google SpreadSheet (GAS)

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
      "objectName": "FlowDefinition",
      "columns": ["Id", "DeveloperName", "MasterLabel"],
      "tooling": true,
      "label": "FlowDefinition一覧",
      "queryOption": "ORDER BY DeveloperName"
    }
  ]
}
```

`objectBlackList`: 項目一覧取得時に除外するオブジェクト名の配列
`queryJobs`: 取得するデータのカスタマイズ。各プロパティ:
- `fileName`: 保存ファイル名（.json）
- `objectName`: 取得対象のオブジェクト名
- `columns`: 取得するカラムの配列。`"*"` を指定するとfields.jsonから全カラムを取得
- `tooling`: trueでTooling API使用（省略時はfalse）
- `label`: 基本設計書のタブ名
- `queryOption`: SOQLのFROM句以降のオプション（例: `"ORDER BY Name LIMIT 100"`）

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

### 4. オブジェクト一覧の取得とblacklistの確認

まず、`--only-objects` オプションでオブジェクト一覧を取得します。

```bash
npx ts-node src/index.ts --only-objects
```

取得対象のオブジェクト一覧がログに出力されます。不要なオブジェクトがあれば `config.json` の `objectBlackList` に追加してください。

### 5. データ取得と基本設計書生成

blacklistを更新したら、通常通り実行します。

```bash
# デフォルトのaliasを使用する場合
npx ts-node src/index.ts

# 明示的にaliasを指定する場合
npx ts-node src/index.ts dev1
```

### 6. スタンダアロンHTMLを開く

`standaloneHtml/viewer.html` をブラウザで開いて確認します。

---

## 追加機能

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
- `out_designDoc/cronJobs.tsv` - CronTrigger 一覧

## 個別実行

- データ取得のみ: `SF_ALIAS=dev npx ts-node src/retrieveData.ts`
- 基本設計書生成のみ: `npx ts-node src/generateDesignDoc.ts`（TSVとスタンダアロンHTMLを両方生成）

## スタンダアロンHTML

基本設計書生成時に `standaloneHtml/viewer.html` に全データを埋め込んだ単独のHTMLファイルを生成します。外部依存なし（CDNは使用）で、単独で開いて表示可能です。

### HTMLテンプレート

HTMLテンプレートは `src/html/viewer.html` に配置されています。プレースホルダー:

- `{{PAGE_TITLE}}` - ページタイトル
- `{{VIEWER_CSS}}` - viewer.css の内容
- `{{VIEWER_JS}}` - viewer.js の内容
- `{{TSV_DATA}}` - TSVデータ（JSON）
- `{{MD_DATA}}` - Markdownデータ（JSON）
- `{{META}}` - メタデータ（JSON）
- `{{TABS}}` - タブ一覧（JSON）
- `{{CUSTOM_CSS}}` - htmlCustomアドオンのCSS
- `{{CUSTOM_JS}}` - htmlCustomアドオンのJS

### ソースファイル

```
src/html/
├── viewer.html   ← HTMLテンプレート
├── css/
│   └── viewer.css
└── js/
    └── viewer.js
```

## アドオン

`addons/` ディレクトリに TypeScript ファイルを配置すると、基本設計書生成時に自動的に実行されます。

### アドオンの種類

| プレフィックス | インターフェース | 実行タイミング | 用途 |
|--------------|----------------|--------------|------|
| `sample*.ts` | `run(inputData): AddonResult[]` | TSV生成後 | カスタムTSV/MD生成 |
| `designDoc*.ts` | `run(inputData, tabs, meta): {tabs?, title?}` | meta.json更新前 | タブ順、タイトル設定 |
| `htmlCustom*.ts` | `run(meta): {css?, js?}` | HTML生成時 | CSS/JSカスタマイズ |

### インターフェース

#### 標準アドオン (sample*.ts)
```typescript
type JsonData = { [filename: string]: any };

export function run(inputData: JsonData): AddonResult[] {
  // 戻り値は配列で、複数のファイルを生成可能
}
```

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

### ファイル名規則

- 標準: `{アドオン名}_{インデックス}.tsv`（例: `myAddon_0.tsv`）
- designDoc: `meta.json` に保存
- htmlCustom: HTMLに直接埋め込み

### 出力先

- 標準アドオン: `out_designDoc/`
- エラー発生時は処理が中止されます

## テストの実行方法

```bash
npm test
```

テストは `test/` ディレクトリに配置されています。

## 補足

- `Flow` オブジェクトではなく、実行中/実行可能なフローのレコード情報を `FlowRecord` から取得する仕様です
- Windows では Git Bash を使う際 `bash.exe` が存在する場合に自動的に利用します


## QA

### aliasを指定してもうまくいかない
`ts-node src/index.ts dev_hoge`のようにaliasを正しく指定しても、env.jsonに記載がないと動作しません。
env.jsonを編集してください。

### オブジェクト定義に表示されないオブジェクトがある
`config.json` の `objectBlackList` に記載されているオブジェクトは除外されます。これは標準的なオブジェクトや不要なオブジェクトを事前にフィルタリングするための設定です。対象を表示したい場合、`objectBlackList` から該当オブジェクトを削除してください。

### 独自のSOQLでデータを取得するには怎样才能よい？
`config.json` の `queryJobs` にクエリを追加してください。

```json
"queryJobs": [
  {
    "fileName": "myCustom.json",
    "objectName": "Account",
    "columns": ["Id", "Name"],
    "tooling": false,
    "label": "カスタムデータ",
    "queryOption": "ORDER BY Name"
  }
]
```

各プロパティ:
- `fileName`: 保存ファイル名（.json）
- `objectName`: 取得対象のオブジェクト名
- `columns`: 取得するカラムの配列。`"*"` でfields.jsonから全カラムを取得
- `tooling`: trueでTooling API使用（省略時はfalse）
- `label`: 基本設計書のタブ名
- `queryOption`: FROM句以降のオプション

## 基本設計書に表だけでなくテキストのページも加えたい
アドオンでMarkdownファイルを出力できます。

```typescript
// addons/myMarkdown.ts
export function run(inputData: JsonData): AddonResult[] {
  return [{
    meta: { label: "テキストページ" },
    type: 'markdown',
    content: "# 見出し\n\nテキスト内容..."
  }];
}
```

## 2つのオブジェクトをjoinしたような表が作りたい
アドオンで独自のTSVを生成できます。JSONデータを結合して出力：

```typescript
// addons/joinObjects.ts
export function run(inputData: JsonData): AddonResult[] {
  const accountData = inputData.account?.data?.records || [];
  const contactData = inputData.contact?.data?.records || [];
  
  const rows = accountData.map(acc => {
    const contact = contactData.find(c => c.AccountId === acc.Id);
    return [acc.Name, contact?.Email || ""];
  });
  
  return [{
    meta: { label: "AccountとContactの結合" },
    headers: ["Account名", "連絡先メール"],
    rows: rows
  }];
}
```

## HTMLViewerでタブの順序を変更したい
`designDoc*.ts` アドオンで tabs にファイル名の配列を返します。

```typescript
// addons/designDocCustom.ts
export function run(
  inputData: JsonData,
  tabs: string[],
  meta: any
): {
  tabs?: string[];
} {
  return {
    tabs: ["flows.tsv", "fields.tsv", "flowDefinitions.tsv"]
  };
}
```

## HTMLViewerでタイトルを変えたい
`designDoc*.ts` アドオンで title を返します。

```typescript
// addons/designDocCustom.ts
export function run(
  inputData: JsonData,
  tabs: string[],
  meta: any
): {
  title?: string;
} {
  return {
    title: "カスタムタイトル - 基本設計書"
  };
}
```
