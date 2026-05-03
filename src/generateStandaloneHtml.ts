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

  const files = fs.readdirSync(outputDir).filter((f) => f.endsWith(".tsv"));
  const tsvDataList: TsvData[] = [];

  for (const file of files) {
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

  const tsvDataJson = JSON.stringify(tsvDataList);
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
    .tabs { display: flex; background-color: #34495e; padding: 0 1rem; }
    .tab { padding: 1rem 1.5rem; color: #bdc3c7; cursor: pointer; border-bottom: 3px solid transparent; transition: all 0.2s; }
    .tab:hover { color: white; background-color: #2c3e50; }
    .tab.active { color: white; border-bottom-color: #3498db; }
    .content { padding: 1rem; }
    .table-container { background-color: white; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    #table { width: 100%; }
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
    </div>
  </div>

  <script src="https://cdnjs.cloudflare.com/ajax/libs/tabulator/5.5.0/js/tabulator.min.js"></script>
  <script>
    const tsvDataList = ${tsvDataJson};
    const meta = ${metaJson};

    document.getElementById('alias').textContent = meta.alias || '';
    document.getElementById('retrievedAt').textContent = meta.retrievedAt || '';

    const tabsContainer = document.getElementById('tabs');
    tsvDataList.forEach((data, i) => {
      const tab = document.createElement('div');
      tab.className = 'tab' + (i === 0 ? ' active' : '');
      tab.textContent = data.meta.label || data.name.replace('.tsv', '');
      tab.dataset.file = data.name;
      tab.onclick = () => switchTab(data.name);
      tabsContainer.appendChild(tab);
    });

    let activeTable = null;

    function loadTable(fileName) {
      const data = tsvDataList.find(d => d.name === fileName);
      if (!data) return;

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

    function switchTab(fileName) {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelector('.tab[data-file="' + fileName + '"]').classList.add('active');
      loadTable(fileName);
    }

    if (tsvDataList.length > 0) {
      loadTable(tsvDataList[0].name);
    }
  </script>
</body>
</html>`;

  const outputPath = path.join(standaloneDir, "viewer.html");
  fs.writeFileSync(outputPath, html);
  console.log(`standaloneHtml/viewer.html に保存しました。`);
}