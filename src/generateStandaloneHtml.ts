import * as fs from "fs";
import * as path from "path";
import { FrontMatterTSV } from "./FrontMatterTSV";
import { resolveUserDataSubDir } from "./pathUtil";
import { runHtmlAddons } from "./runAddons";
import { formatTimestamp } from "./sfUtil";

interface TsvData {
  name: string;
  meta: { [key: string]: string };
  headers: string[];
  rows: string[][];
}

interface AddonError {
  addonName: string;
  error: string;
  errorCode?: string | null;
  objectName?: string | null;
  timestamp: string;
}

export function generateStandaloneHtml(outputDir: string, meta: any, errors: AddonError[] = []) {
  console.log("\n--- スタンダアロンHTMLを生成します ---");

  const standaloneDir = resolveUserDataSubDir("standaloneHtml");
  if (!fs.existsSync(standaloneDir)) {
    fs.mkdirSync(standaloneDir, { recursive: true });
  }

  // バックアップ機能追加（out_designDoc/meta.json から取得）
  const outputMetaPath = path.join(outputDir, "meta.json");
  let prevRetrievedAt: Date | null = null;
  let prevAlias: string = "unknown";

  if (fs.existsSync(outputMetaPath)) {
    const prevMeta = JSON.parse(fs.readFileSync(outputMetaPath, "utf8"));
    prevRetrievedAt = new Date(prevMeta.retrievedAt);
    prevAlias = prevMeta.alias || "unknown";
  }

  if (prevRetrievedAt) {
    const backupDir = path.join(standaloneDir, "backup");
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    const filesInStandalone = fs
      .readdirSync(standaloneDir)
      .filter((f) => f !== "backup");
    if (filesInStandalone.length > 0) {
      const timestamp = formatTimestamp(prevRetrievedAt);
      const backupPath = path.join(backupDir, `${timestamp}_${prevAlias}`);
      fs.mkdirSync(backupPath, { recursive: true });
      for (const file of filesInStandalone) {
        const src = path.join(standaloneDir, file);
        const dest = path.join(backupPath, file);
        fs.copyFileSync(src, dest);
        fs.unlinkSync(src);
      }
      console.log(
        `standaloneHtml配下のファイルを backup/${timestamp}_${prevAlias} に退避しました。`,
      );
    }
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

  // HTMLアドオンを実行してエラー情報を収集
  const htmlCustom = runHtmlAddons(meta);
  const htmlCustomResult = htmlCustom.result;
  const htmlErrors = htmlCustom.errors;
  const allErrorsWithHtml = [...errors, ...htmlErrors];

  // エラー情報をTSVデータとして追加
  if (allErrorsWithHtml.length > 0) {
    const errorRows = allErrorsWithHtml.map(err => [
      err.addonName || err.objectName || "unknown",
      err.error || "",
      err.errorCode || "",
      err.timestamp || "",
    ]);
    
    tsvDataList.push({
      name: "addonErrors.tsv",
      meta: { label: "エラー情報" },
      headers: ["名前", "エラー内容", "エラーコード", "発生時刻"],
      rows: errorRows,
    });
  }

  const tsvDataJson = JSON.stringify(tsvDataList);
  const mdDataJson = JSON.stringify(mdDataList);
  const metaJson = JSON.stringify(meta);

  const outputMeta = JSON.parse(fs.readFileSync(outputMetaPath, "utf8"));
  const tabsJson = JSON.stringify(outputMeta.tabs || []);
  const pageTitle = outputMeta.title || "SF Viewer - 基本設計書";

  const viewerHtml = fs.readFileSync(
    path.join(__dirname, "html/viewer.html"),
    "utf8",
  );
  const viewerJs = fs.readFileSync(
    path.join(__dirname, "html/js/viewer.js"),
    "utf8",
  );
  const viewerCss = fs.readFileSync(
    path.join(__dirname, "html/css/viewer.css"),
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
      htmlCustomResult.css ? `\n  <style>${htmlCustomResult.css}</style>` : "",
    )
    .replace(
      /\{\{CUSTOM_JS\}\}/g,
      htmlCustomResult.js ? `\n  <script>${htmlCustomResult.js}</script>` : "",
    );

  const outputPath = path.join(standaloneDir, "viewer.html");
  fs.writeFileSync(outputPath, html);
  console.log(`standaloneHtml/viewer.html に保存しました。`);
}
