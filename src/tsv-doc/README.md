# tsv-doc

TSV/MarkdownファイルからスタンダアロンHTML VIEWERを生成するライブラリ

## 機能

- TSV/MDファイルを読み込んでテーブル表示可能なHTMLを生成
- バックアップ機能（自動）
- マークダウン対応（Mermaid Diagram対応）
- カスタムCSS/JSの埋め込み（オプション）

## 使用方法

```typescript
import { generate } from 'tsv-doc';

// シンプル
generate({
  inputDir: './out_designDoc',
  outputDir: './standaloneHtml'
});

// カスタムCSS/JS付き
generate({
  inputDir: './out_designDoc',
  outputDir: './standaloneHtml'
}, {
  css: 'body { background: #f5f5f5; }',
  js: 'console.log("Hello");'
});
```

## 入力フォーマット

### inputDir に配置するファイル

- `*.tsv` - TSVファイル（FrontMatter対応）
- `*.md` - Markdownファイル
- `meta.json` - メタデータ

### meta.json の形式

```json
{
  "tabs": ["fields.tsv", "flows.tsv", "cronJobs.tsv"],
  "title": "基本設計書",
  "alias": "dev",
  "retrievedAt": "2026/5/15 12:00:00"
}
```

| フィールド | 必須 | 説明 |
|-----------|------|------|
| tabs | 必須 | 表示するタブのファイル名一覧（配列） |
| title | 推奨 | ページタイトル（未指定時はデフォルト値"TSV Doc Viewer"） |
| alias | 任意 | バックアップフォルダ名に使用 |
| retrievedAt | 任意 | バックアップフォルダ名に使用 |

### meta.json の例

`templates/meta.json.example` も参照してください。

## TSV形式

FrontMatter TSV形式（yamlヘッダー + TSV本文）:

```yaml
---
label: オブジェクト定義
alias: dev
---
ObjectName  FieldName  Label
Account     Name       取引先名
```

## 型定義

```typescript
interface ViewerOptions {
  inputDir: string;   // 入力ディレクトリ（TSV/MD/meta.json 配置場所）
  outputDir: string;  // 出力ディレクトリ（viewer.html 保存先）
}

interface HtmlCustomOptions {
  css?: string;       // カスタムCSS
  js?: string;        // カスタムJS
}

interface InputMeta {
  tabs?: string[];      // 表示するタブのファイル名一覧
  title?: string;       // ページタイトル
  alias?: string;       // エイリアス
  retrievedAt?: string; // 取得日時
}
```

## 出力

`outputDir/viewer.html` を生成（単一HTMLファイル）

## 依存

このライブラリは外部依存がありません。独立して使用可能です。