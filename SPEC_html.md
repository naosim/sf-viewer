# SF Viewer HTML - 基本設計書

## 概要

| 項目 | 内容 |
|------|------|
| アプリケーション名 | SF Viewer HTML |
| 目的 | out_designDoc配下のTSVファイルをブラウザーで表示 |
| 対象ユーザー | 開発者・システム管理者 |

## システム構成

```
html/
├── index.html           # メインHTML
└── js/
    └── FrontMatterTSV.js # TSVパーサー
```

## 機能要件

| 機能 | 説明 |
|------|------|
| ファイル一覧取得 | meta.json を fetch してTSVファイル一覧を取得 |
| TSVパース | FrontMatterTSV.parse() でパース |
| テーブル表示 | Tabulatorを使用してテーブル表示 |
| タブ切り替え | 複数テーブルをタブで切り替え |
| メタデータ表示 | 各テーブルのメタデータ（alias, retrievedAt, label）を表示 |
| ページネーション | Tabulatorのページネーション機能 |
| ソート・フィルター | 列のソートとフィルター機能 |

## 技術スタック

| 技術 | 使用方法 |
|------|----------|
| HTML | シングルページアプリケーション |
| JavaScript | ES Modules (import/export) |
| Tabulator | CDN (https://cdnjs.cloudflare.com/ajax/libs/tabulator/5.5.0/) |
| TSVパーサー | FrontMatterTSV.js (TypeScriptから生成) |

## データフロー

```
1. index.html 読み込み (type="module")
2. import FrontMatterTSV from './js/FrontMatterTSV.js'
3. fetch('out_designDoc/meta.json') でファイル一覧取得
4. 各TSVファイルを fetch で読み込み
5. FrontMatterTSV.parse() でパース
6. Tabulator でテーブル生成
7. タブ切换えて表示
```

## TSVパーサー (FrontMatterTSV.js)

### 主要メソッド

| メソッド | 説明 |
|----------|------|
| `parse(text)` | TSVテキストをパースして {meta, headers, rows} を返す |
| `getFilesFromMeta(metaJson)` | meta.jsonから表示するファイル一覧を取得 |

### parse() の出力形式

```javascript
{
  meta: { alias: "dev", retrievedAt: "2026/5/3 9:59:13", label: "オブジェクト定義" },
  headers: ["ObjectName", "FieldName", "Label", "DataType", "Length"],
  rows: [
    ["Order", "AccountId", "取引先名", "参照関係(取引先)", "18"],
    ...
  ]
}
```

## 実行方法

```bash
# プロジェクトのルートディレクトリで
npx http-server . -p 8080
```

然后、ブラウザーで `http://localhost:8080/html/index.html` にアクセス

## 出力ファイル（out_designDoc/）

現在表示可能なファイル:

- `fields.tsv` - 項目一覧（label: オブジェクト定義）
- `flowDefinitions.tsv` - FlowDefinition一覧
- `flows.tsv` - フロー一覧
- `cronJobs.tsv` - CronTrigger一覧

## TypeScript → JavaScript

- TypeScriptソース: `html/js/FrontMatterTSV.ts`
- コンパイル済みJS: `html/js/FrontMatterTSV.js`
- コンパイル: `cd html && npx tsc --project tsconfig.json`

## 更新履歴

- 2026/5/3: 初版作成