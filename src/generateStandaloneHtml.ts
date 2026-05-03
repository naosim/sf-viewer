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
    mermaid.initialize({ startOnLoad: false });

    const tsvDataList = ${tsvDataJson};
    const mdDataList = ${mdDataJson};
    const meta = ${metaJson};

    document.getElementById('alias').textContent = meta.alias || '';
    document.getElementById('retrievedAt').textContent = meta.retrievedAt || '';

    const tabsContainer = document.getElementById('tabs');
    tsvDataList.forEach((data, i) => {
      const tab = document.createElement('div');
      tab.className = 'tab';
      tab.textContent = data.meta.label || data.name.replace('.tsv', '');
      tab.dataset.file = data.name;
      tab.dataset.type = 'tsv';
      tab.onclick = () => switchTab(data.name, 'tsv');
      tabsContainer.appendChild(tab);
    });

    mdDataList.forEach((data, i) => {
      const tab = document.createElement('div');
      tab.className = 'tab' + (tsvDataList.length === 0 && i === 0 ? ' active' : '');
      tab.textContent = data.meta.label || data.name.replace('.md', '');
      tab.dataset.file = data.name;
      tab.dataset.type = 'markdown';
      tab.onclick = () => switchTab(data.name, 'markdown');
      tabsContainer.appendChild(tab);
    });

    // Set initial active tab
    if (tsvDataList.length > 0) {
      tabsContainer.firstElementChild.classList.add('active');
    }

    let activeTable = null;

    function loadTable(fileName) {
      const data = tsvDataList.find(d => d.name === fileName);
      if (!data) return;

      document.getElementById('markdown').style.display = 'none';
      document.getElementById('table').style.display = '';

      const tableData = data.rows.map(row => {
        const obj = {};
        data.headers.forEach((header, i) => {
          obj[header] = row[i];
        });
        return obj;
      });

      if (activeTable) {
        activeTable.destroy();
      }

      activeTable = new Tabulator("#table", {
        data: tableData,
        layout: "fitDataFill",
        height: "600px",
        columns: data.headers.map(header => ({
          title: header,
          field: header,
          headerFilter: "input",
          sortable: true
        })),
      });
    }

    function loadMarkdown(fileName) {
      const data = mdDataList.find(d => d.name === fileName);
      if (!data) {
        console.error('Markdown data not found:', fileName);
        return;
      }

      if (activeTable) {
        activeTable.destroy();
        activeTable = null;
      }

      document.getElementById('table').style.display = 'none';
      const mdDiv = document.getElementById('markdown');
      mdDiv.style.display = 'block';

      try {
        // markedの設定：codeブロックをmermaidとして扱う
        const htmlContent = marked.parse(data.content, {
          breaks: true,
        });
        mdDiv.innerHTML = htmlContent;

        if (typeof mermaid !== 'undefined') {
          // mermaid blockを检测して描画
          mdDiv.querySelectorAll('pre').forEach(async (pre) => {
            const code = pre.querySelector('code');
            if (code && (code.classList.contains('language-mermaid') ||
                code.textContent?.includes('graph ') ||
                code.textContent?.includes('sequenceDiagram') ||
                code.textContent?.includes('flowchart'))) {
              const graphDefinition = code.textContent;
              pre.classList.add('mermaid');
              try {
                const { svg } = await mermaid.render('mermaid-' + Math.random().toString(36).substr(2, 9), graphDefinition);
                pre.innerHTML = svg;
              } catch (err) {
                console.error('Mermaid error:', err);
                pre.textContent = graphDefinition;
              }
            }
          });
        }
      } catch (e) {
        console.error('Error rendering markdown:', e);
        mdDiv.innerHTML = '<pre>' + data.content + '</pre>';
      }
    }

    function switchTab(fileName, type) {
      console.log('switchTab called:', fileName, type);
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      const targetTab = document.querySelector('.tab[data-file="' + fileName + '"]');
      if (targetTab) {
        targetTab.classList.add('active');
      }
      if (type === 'tsv') {
        loadTable(fileName);
      } else {
        console.log('Loading markdown for:', fileName);
        loadMarkdown(fileName);
      }
    }

    if (tsvDataList.length > 0) {
      switchTab(tsvDataList[0].name, 'tsv');
    } else if (mdDataList.length > 0) {
      switchTab(mdDataList[0].name, 'markdown');
    }
  </script>
</body>
</html>`;

  const outputPath = path.join(standaloneDir, "viewer.html");
  fs.writeFileSync(outputPath, html);
  console.log(`standaloneHtml/viewer.html に保存しました。`);
}
