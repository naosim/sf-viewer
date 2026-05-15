import * as fs from "fs";
import * as path from "path";
import { FrontMatterTSV } from "./frontMatter";
import { HtmlCustomOptions } from "./types";

interface TsvData {
  name: string;
  meta: { [key: string]: string };
  headers: string[];
  rows: string[][];
}

interface MdData {
  name: string;
  meta: { [key: string]: string };
  content: string;
}

function formatTimestamp(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}_${hours}${minutes}${seconds}`;
}

export function generateStandaloneHtml(
  inputDir: string,
  outputDir: string,
  custom?: HtmlCustomOptions
) {
  console.log("\n--- スタンダアロンHTMLを生成します ---");

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // バックアップ機能追加（inputDir/meta.json から取得）
  const inputMetaPath = path.join(inputDir, "meta.json");
  let prevRetrievedAt: Date | null = null;
  let prevAlias: string = "unknown";

  if (fs.existsSync(inputMetaPath)) {
    const prevMeta = JSON.parse(fs.readFileSync(inputMetaPath, "utf8"));
    prevRetrievedAt = new Date(prevMeta.retrievedAt);
    prevAlias = prevMeta.alias || "unknown";
  }

  if (prevRetrievedAt) {
    const backupDir = path.join(outputDir, "backup");
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    const filesInOutput = fs
      .readdirSync(outputDir)
      .filter((f) => f !== "backup");
    if (filesInOutput.length > 0) {
      const timestamp = formatTimestamp(prevRetrievedAt);
      const backupPath = path.join(backupDir, `${timestamp}_${prevAlias}`);
      fs.mkdirSync(backupPath, { recursive: true });
      for (const file of filesInOutput) {
        const src = path.join(outputDir, file);
        const dest = path.join(backupPath, file);
        fs.copyFileSync(src, dest);
        fs.unlinkSync(src);
      }
      console.log(
        `outputDir配下のファイルを backup/${timestamp}_${prevAlias} に退避しました。`,
      );
    }
  }

  const tsvFiles = fs.readdirSync(inputDir).filter((f) => f.endsWith(".tsv"));
  const mdFiles = fs.readdirSync(inputDir).filter((f) => f.endsWith(".md"));

  const tsvDataList: TsvData[] = [];
  const mdDataList: MdData[] = [];

  for (const file of tsvFiles) {
    const filePath = path.join(inputDir, file);
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
    const filePath = path.join(inputDir, file);
    const content = fs.readFileSync(filePath, "utf8");
    const parsed = FrontMatterTSV.parse(content);

    let mdContent: string;
    if (parsed.meta && Object.keys(parsed.meta).length > 0) {
      mdContent = parsed.rows
        .map((row) => row.join("\t"))
        .join("\n");
    } else {
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

  const inputMeta = JSON.parse(fs.readFileSync(inputMetaPath, "utf8"));
  const metaJson = JSON.stringify(inputMeta);
  const tabsJson = JSON.stringify(inputMeta.tabs || []);
  const pageTitle = inputMeta.title || "TSV Doc Viewer";

  const templateDir = path.join(__dirname, "templates");
  const viewerHtml = fs.readFileSync(
    path.join(templateDir, "viewer.html"),
    "utf8",
  );
  const viewerJs = fs.readFileSync(
    path.join(templateDir, "js", "viewer.js"),
    "utf8",
  );
  const viewerCss = fs.readFileSync(
    path.join(templateDir, "css", "viewer.css"),
    "utf8",
  );

  const html = viewerHtml
    .replace(/\{\{PAGE_TITLE\}\}/g, pageTitle)
    .replace(/\{\{VIEWER_CSS\}\}/g, viewerCss)
    .replace(/\{\{VIEWER_JS\}\}/g, viewerJs)
    .replace(/\{\{TSV_DATA\}\}/g, tsvDataJson)
    .replace(/\{\{MD_DATA\}\}/g, mdDataJson)
    .replace(/\{\{META\}\}/g, metaJson)
    .replace(/\{\{TABS\}\}/g, tabsJson)
    .replace(
      /\{\{CUSTOM_CSS\}\}/g,
      custom?.css ? `\n  <style>${custom.css}</style>` : "",
    )
    .replace(
      /\{\{CUSTOM_JS\}\}/g,
      custom?.js ? `\n  <script>${custom.js}</script>` : "",
    );

  const outputPath = path.join(outputDir, "viewer.html");
  fs.writeFileSync(outputPath, html);
  console.log(`viewer.html に保存しました。`);
}