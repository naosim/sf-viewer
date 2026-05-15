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
- `meta.json` - メタデータ（tabs, title 等）

### meta.json の形式

```json
{
  "tabs": ["fields.tsv", "flows.tsv"],
  "title": "基本設計書",
  "alias": "dev",
  "retrievedAt": "2026/5/15 12:00:00"
}
```

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

## 出力

`outputDir/viewer.html` を生成（単一HTMLファイル）

## 依存

このライブラリは外部依存がありません。独立して使用可能です。