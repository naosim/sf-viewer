import * as fs from "fs";
import * as path from "path";
import * as ts from "typescript";
import { FrontMatterTSV } from "./FrontMatterTSV";
import { formatTimestamp } from "./sfUtil";
import { generateStandaloneHtml } from "./generateStandaloneHtml";
import { runAddons } from "./runAddons";

interface QueryJob {
  fileName: string;
  label: string;
  tooling?: boolean;
}

function convertJsonToTsv(
  jsonPath: string,
  meta: { [key: string]: string | string[] },
  label: string,
  tsvPath: string,
): void {
  const metaWithLabel = { ...meta, label: label };

  if (!fs.existsSync(jsonPath)) {
    console.warn(`警告: ${jsonPath} が存在しません。スキップします。`);
    return;
  }

  const jsonData = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const data = jsonData.data || jsonData;
  const records = data.result?.records || data.result || [];

  const headers = records.length > 0
    ? Object.keys(records[0]).filter((key) => key !== "attributes")
    : [];

  const rows = records.map((record: any) =>
    headers.map((header) => {
      const value = record[header];
      if (value === null || value === undefined) return "";
      if (typeof value === "object") return JSON.stringify(value);
      return String(value);
    }),
  );

  const tsv = FrontMatterTSV.stringify(metaWithLabel, headers, rows);
  fs.writeFileSync(tsvPath, tsv);
}

function main() {
  console.log("--- 処理2: 基本設計書を生成します ---");

  const inputDir = path.join(__dirname, "../output");
  const outputDir = path.join(__dirname, "../out_designDoc");

  if (!fs.existsSync(inputDir)) {
    throw new Error("エラー: output ディレクトリが存在しません。処理1を先に実行してください。");
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const metaPath = path.join(outputDir, "meta.json");
  let prevRetrievedAt: Date | null = null;
  let prevAlias: string = "unknown";

  if (fs.existsSync(metaPath)) {
    const prevMeta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    prevRetrievedAt = new Date(prevMeta.retrievedAt);
    prevAlias = prevMeta.alias;
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
        `out_designDoc配下のファイルを backup/${timestamp}_${prevAlias} に退避しました。`,
      );
    }
  }

  const inputMetaPath = path.join(inputDir, "meta.json");
  if (!fs.existsSync(inputMetaPath)) {
    throw new Error("エラー: output/meta.json が存在しません。");
  }
  const inputMeta = JSON.parse(fs.readFileSync(inputMetaPath, "utf8"));

  const retrievedAt = new Date();
  const meta: { alias: string; retrievedAt: string; title?: string; queryJobs?: typeof inputMeta.queryJobs; tabs?: string[] } = {
    alias: inputMeta.alias,
    retrievedAt: retrievedAt.toLocaleString(),
    title: inputMeta.title || "SF Viewer - 基本設計書",
  };
  if (inputMeta.queryJobs) {
    meta.queryJobs = inputMeta.queryJobs;
  }
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

  const fieldsJsonPath = path.join(inputDir, "fields.json");
  if (fs.existsSync(fieldsJsonPath)) {
    const fieldsData = JSON.parse(fs.readFileSync(fieldsJsonPath, "utf8"));
    const rows: string[][] = [];
    for (const obj of fieldsData.data) {
      for (const field of obj.fields) {
        rows.push([
          obj.objectName,
          field.QualifiedApiName,
          field.Label,
          field.DataType,
          field.Length !== undefined ? String(field.Length) : "",
        ]);
      }
    }
    const { tabs, ...metaWithoutTabs } = meta;
    const metaWithLabel: { [key: string]: string } = { ...metaWithoutTabs, label: "オブジェクト定義" };
    const tsv = FrontMatterTSV.stringify(
      metaWithLabel,
      ["ObjectName", "FieldName", "Label", "DataType", "Length"],
      rows,
    );
    const tsvPath = path.join(outputDir, "fields.tsv");
    fs.writeFileSync(tsvPath, tsv);
    console.log(`fields.tsv を out_designDoc/fields.tsv に保存しました。`);
  }

  const queryJobs: QueryJob[] = inputMeta.queryJobs || [];
  for (const job of queryJobs) {
    const jsonPath = path.join(inputDir, job.fileName);
    const tsvFileName = job.fileName.replace(".json", ".tsv");
    const tsvPath = path.join(outputDir, tsvFileName);
    convertJsonToTsv(jsonPath, meta, job.label, tsvPath);
    console.log(`${tsvFileName} を out_designDoc/${tsvFileName} に保存しました。`);
  }

  console.log("\n--- アドオンを実行します ---");
  runAddons(inputDir, outputDir, meta);

  const tabs = fs.readdirSync(outputDir)
    .filter((f) => f.endsWith(".tsv") || f.endsWith(".md"))
    .sort();
  
  const result = runDesignDocAddons(inputDir, outputDir, meta, tabs);
  
  meta.tabs = result.tabs;
  if (result.title) {
    meta.title = result.title;
  }
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

  console.log("--- 処理2: 完了 ---");

  generateStandaloneHtml(outputDir, inputMeta);
}

interface DesignDocResult {
  tabs?: string[];
  title?: string;
}

function runDesignDocAddons(inputDir: string, outputDir: string, meta: any, tabs: string[]): DesignDocResult {
  const addonsDir = path.join(__dirname, "../addons");
  if (!fs.existsSync(addonsDir)) {
    console.log("addons/ ディレクトリが存在しないため、スキップします。");
    return { tabs };
  }

  const designDocFiles = fs.readdirSync(addonsDir).filter((f) => f.startsWith("designDoc") && f.endsWith(".ts"));
  if (designDocFiles.length === 0) {
    console.log("designDocアドオンが存在しないため、スキップします。");
    return { tabs };
  }

  const inputData: { [filename: string]: any } = {};
  const jsonFiles = fs.readdirSync(inputDir).filter((f) => f.endsWith(".json"));
  for (const jsonFile of jsonFiles) {
    const jsonPath = path.join(inputDir, jsonFile);
    inputData[jsonFile.replace(".json", "")] = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  }

  let currentTabs = tabs;
  let currentTitle = meta.title || "SF Viewer - 基本設計書";

  for (const addonFile of designDocFiles) {
    try {
      const addonName = addonFile.replace(".ts", "");
      console.log(`designDocアドオンを実行中: ${addonName}`);

      const addonPath = path.join(addonsDir, addonFile);
      const addonCode = fs.readFileSync(addonPath, "utf8");

      const transpiled = ts.transpileModule(addonCode, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
      });

      const module: { exports: { run?: (inputData: any, tabs: string[], meta: any) => DesignDocResult } } = { exports: {} };
      const evalCode = new Function("module", "exports", transpiled.outputText);
      evalCode(module, module.exports);
      const runFunction = module.exports.run;

      if (typeof runFunction !== "function") {
        throw new Error("run 関数がエクスポートされていません。");
      }

      const result: DesignDocResult = runFunction(inputData, currentTabs, meta);

      if (result.tabs && Array.isArray(result.tabs)) {
        const existingTabs = new Set(currentTabs);
        const mentionedTabs = result.tabs.filter(t => existingTabs.has(t));
        const remainingTabs = currentTabs.filter(t => !mentionedTabs.includes(t));
        currentTabs = [...mentionedTabs, ...remainingTabs];
        console.log(`${addonName}: タブ顺番を更新しました`);
      }

      if (result.title && typeof result.title === "string") {
        currentTitle = result.title;
        console.log(`${addonName}: タイトルを「${currentTitle}」に変更しました`);
      }
    } catch (error: any) {
      console.error(`designDocアドオン ${addonFile} の実行中にエラーが発生しました: ${error.message}`);
      throw error;
    }
  }

  return { tabs: currentTabs, title: currentTitle };
}

main();