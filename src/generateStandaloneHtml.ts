import * as fs from "fs";
import * as path from "path";
import { FrontMatterTSV } from "./FrontMatterTSV";

interface TsvData {
  name: string;
  meta: { [key: string]: string };
  headers: string[];
  rows: string[][];
}

export function generateStandaloneHtml(outputDir: string, meta: any) {
  console.log("\n--- スタンダアロンHTMLを生成します ---");

  const standaloneDir = path.join(__dirname, "../standaloneHtml");
  if (!fs.existsSync(standaloneDir)) {
    fs.mkdirSync(standaloneDir, { recursive: true });
  }

  const tsvFiles = fs.readdirSync(outputDir).filter((f) => f.endsWith(".tsv"));
  const mdFiles = fs.readdirSync(outputDir).filter((f) => f.endsWith(".md"));

  const tsvDataList: TsvData[] = [];
  const mdDataList: {
    name: string;
    meta: { [key: string]: string };
    content: string;
  }[] = [];

  for (const file of tsvFiles) {
    const filePath = path.join(outputDir, file);
    const content = fs.readFileSync(filePath, "utf8");
    const parsed = FrontMatterTSV.parse(content);

    tsvDataList.push({
      name: file,
      meta: parsed.meta,
      headers: parsed.headers,
      rows: parsed.rows,
    });
  }

  for (const file of mdFiles) {
    const filePath = path.join(outputDir, file);
    const content = fs.readFileSync(filePath, "utf8");
    const parsed = FrontMatterTSV.parse(content);

    let mdContent: string;
    if (parsed.meta && Object.keys(parsed.meta).length > 0) {
      // Has front matter - extract content after front matter
      mdContent = parsed.rows.map((row) => row.join("\t")).join("\n");
    } else {
      // No front matter - use entire content
      mdContent = content;
    }

    mdDataList.push({
      name: file,
      meta: parsed.meta,
      content: mdContent,
    });
  }

const tsvDataJson = JSON.stringify(tsvDataList);
  const mdDataJson = JSON.stringify(mdDataList);
  const metaJson = JSON.stringify(meta);

  const outputMetaPath = path.join(outputDir, "meta.json");
  const outputMeta = JSON.parse(fs.readFileSync(outputMetaPath, "utf8"));
  const tabsJson = JSON.stringify(outputMeta.tabs || []);
  const pageTitle = outputMeta.title || "SF Viewer - 基本設計書";

  const viewerJs = fs.readFileSync(path.join(__dirname, "html/js/viewer.js"), "utf8");
  const viewerCss = fs.readFileSync(path.join(__dirname, "html/css/viewer.css"), "utf8");

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${pageTitle}</title>
  <link href="https://cdnjs.cloudflare.com/ajax/libs/tabulator/5.5.0/css/tabulator.min.css" rel="stylesheet">
  <style>${viewerCss}</style>
</head>
<body>
  <header>
    <h1>${pageTitle}</h1>
    <div class="meta">
      <span id="alias"></span> | 
      <span id="retrievedAt"></span>
    </div>
  </header>
  
  <div class="tabs" id="tabs"></div>
  
  <div class="content">
    <div class="table-container">
      <div id="table"></div>
      <div id="markdown"></div>
    </div>
  </div>

  <script src="https://cdnjs.cloudflare.com/ajax/libs/tabulator/5.5.0/js/tabulator.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
  <script>
    const tsvDataList = ${tsvDataJson};
    const mdDataList = ${mdDataJson};
    const meta = ${metaJson};
    const tabs = ${tabsJson};
    ${viewerJs}
    initViewer(tsvDataList, mdDataList, meta, tabs);
  </script>
</body>
</html>`;

  const outputPath = path.join(standaloneDir, "viewer.html");
  fs.writeFileSync(outputPath, html);
  console.log(`standaloneHtml/viewer.html に保存しました。`);
}
