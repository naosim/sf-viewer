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

  const viewerJs = fs.readFileSync(path.join(__dirname, "html/js/viewer.js"), "utf8");

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SF Viewer - 基本設計書</title>
  <link href="https://cdnjs.cloudflare.com/ajax/libs/tabulator/5.5.0/css/tabulator.min.css" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; background-color: #f5f5f5; }
    header { background-color: #2c3e50; color: white; padding: 1rem 2rem; }
    header h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    header .meta { font-size: 0.875rem; color: #bdc3c7; }
    .tabs { display: flex; background-color: #34495e; padding: 0 1rem; flex-wrap: wrap; }
    .tab { padding: 1rem 1.5rem; color: #bdc3c7; cursor: pointer; border-bottom: 3px solid transparent; transition: all 0.2s; }
    .tab:hover { color: white; background-color: #2c3e50; }
    .tab.active { color: white; border-bottom-color: #3498db; }
    .content { padding: 1rem; }
    .table-container { background-color: white; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    #table { width: 100%; }
    #markdown { display: none; padding: 1rem; background: white; border-radius: 4px; }
    #markdown h1, #markdown h2, #markdown h3 { margin-top: 1rem; margin-bottom: 0.5rem; }
    #markdown table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
    #markdown th, #markdown td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    #markdown th { background-color: #f5f5f5; }
    #markdown code { background-color: #f0f0f0; padding: 2px 4px; border-radius: 3px; }
    #markdown pre { background-color: #f0f0f0; padding: 1rem; overflow-x: auto; border-radius: 4px; }
    #markdown .mermaid { margin: 16px 0; text-align: center; }
    .loading { text-align: center; padding: 2rem; color: #7f8c8d; }
    .error { text-align: center; padding: 2rem; color: #e74c3c; }
  </style>
</head>
<body>
  <header>
    <h1>SF Viewer - 基本設計書</h1>
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
