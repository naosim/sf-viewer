import * as fs from "fs";
import * as path from "path";
import { FrontMatterTSV } from "./FrontMatterTSV";
import { formatTimestamp } from "./sfUtil";
import { resolveUserDataDir, resolveUserDataSubDir } from "./pathUtil";
import { generateStandaloneHtml } from "./generateStandaloneHtml";
import { runAddons, runDesignDocAddons, runFilterAddons, runHtmlAddons } from "./runAddons";

function parseArgs(args: string[]): { alias: string | null; userDataDir: string | null } {
  const userDataDirIndex = args.indexOf("--user-data-dir");
  const userDataDir = userDataDirIndex >= 0 && userDataDirIndex < args.length - 1
    ? args[userDataDirIndex + 1]
    : null;
  const aliasArgs = args.filter((arg) =>
    arg !== "--" && arg !== "--user-data-dir"
  );
  const aliasIndex = aliasArgs.findIndex((arg) => !arg.startsWith("-"));
  const alias = aliasIndex >= 0 && aliasIndex < aliasArgs.length ? aliasArgs[aliasIndex] : null;
  return { alias, userDataDir };
}

interface QueryJob {
  fileName: string;
  label: string;
  objectName?: string;
  tooling?: boolean;
}

interface AddonError {
  addonName: string;
  error: string;
  errorCode?: string | null;
  objectName?: string | null;
  timestamp: string;
}

type FieldLabelMap = Map<string, Map<string, string>>;

function loadFieldLabels(inputDir: string): FieldLabelMap {
  const fieldLabelMap: FieldLabelMap = new Map();
  const fieldsJsonPath = path.join(inputDir, "fields.json");
  if (!fs.existsSync(fieldsJsonPath)) {
    return fieldLabelMap;
  }

  const fieldsData = JSON.parse(fs.readFileSync(fieldsJsonPath, "utf8"));
  for (const obj of fieldsData.data) {
    const fieldMap = new Map<string, string>();
    for (const field of obj.fields) {
      fieldMap.set(field.QualifiedApiName, field.Label);
    }
    fieldLabelMap.set(obj.objectName, fieldMap);
  }
  return fieldLabelMap;
}

function getHeaderWithLabel(apiName: string, fieldLabelMap: FieldLabelMap, objectName: string): string {
  const objectFields = fieldLabelMap.get(objectName);
  if (objectFields && objectFields.has(apiName)) {
    const label = objectFields.get(apiName)!;
    return `${label}\n${apiName}`;
  }
  return apiName;
}

function convertJsonToTsv(
  jsonPath: string,
  meta: { [key: string]: string | string[] },
  label: string,
  tsvPath: string,
  fieldLabelMap?: FieldLabelMap,
  objectName?: string,
): void {
  const metaWithLabel = { ...meta, label: label };

  if (!fs.existsSync(jsonPath)) {
    console.warn(`警告: ${jsonPath} が存在しません。スキップします。`);
    return;
  }

  const jsonData = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const data = jsonData.data || jsonData;
  const records = data.result?.records || data.result || [];

  const apiHeaders =
    records.length > 0
      ? Object.keys(records[0]).filter((key) => key !== "attributes")
      : [];

  const headers = fieldLabelMap && objectName
    ? apiHeaders.map(apiName => getHeaderWithLabel(apiName, fieldLabelMap, objectName))
    : apiHeaders;

  const rows = records.map((record: any) =>
    apiHeaders.map((header) => {
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
  const args = process.argv.slice(2);
  const { alias: cliAlias, userDataDir: cliUserDataDir } = parseArgs(args);

  if (cliUserDataDir) {
    process.env.SF_USER_DATA_DIR = cliUserDataDir;
  }

  console.log("--- 処理2: 基本設計書を生成します ---");

  const inputDir = resolveUserDataSubDir("output");
  const outputDir = resolveUserDataSubDir("out_designDoc");

  if (!fs.existsSync(inputDir)) {
    throw new Error(
      "エラー: output ディレクトリが存在しません。処理1を先に実行してください。",
    );
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
  const meta: {
    alias: string;
    retrievedAt: string;
    title?: string;
    queryJobs?: typeof inputMeta.queryJobs;
    tabs?: string[];
  } = {
    alias: cliAlias || inputMeta.alias,
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
    const metaWithLabel: { [key: string]: string } = {
      ...metaWithoutTabs,
      label: "オブジェクト定義",
    };
    const tsv = FrontMatterTSV.stringify(
      metaWithLabel,
      ["ObjectName", "FieldName", "Label", "DataType", "Length"],
      rows,
    );
    const tsvPath = path.join(outputDir, "fields.tsv");
    fs.writeFileSync(tsvPath, tsv);
    console.log(`fields.tsv を out_designDoc/fields.tsv に保存しました。`);
  }

  const fieldLabelMap = loadFieldLabels(inputDir);

  const queryJobs: QueryJob[] = inputMeta.queryJobs || [];
  for (const job of queryJobs) {
    const jsonPath = path.join(inputDir, job.fileName);
    const tsvFileName = job.fileName.replace(".json", ".tsv");
    const tsvPath = path.join(outputDir, tsvFileName);
    convertJsonToTsv(jsonPath, meta, job.label, tsvPath, fieldLabelMap, job.objectName);
    console.log(
      `${tsvFileName} を out_designDoc/${tsvFileName} に保存しました。`,
    );
  }

  // output/*.json からエラー情報を収集
  const outputErrors: AddonError[] = [];
  const outputFiles = fs.readdirSync(inputDir).filter(f => f.endsWith(".json") && f !== "meta.json");
  for (const file of outputFiles) {
    const filePath = path.join(inputDir, file);
    const jsonData = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (jsonData.meta?.error) {
      outputErrors.push({
        addonName: file.replace(".json", ""),
        error: jsonData.meta.error,
        errorCode: jsonData.meta.errorCode || null,
        objectName: jsonData.meta.objectName || null,
        timestamp: jsonData.meta.retrievedAt || "",
      });
    }
  }

  console.log("\n--- アドオンを実行します ---");
  const { errors: addonErrors } = runAddons(inputDir, outputDir, meta);
  const addonErrorsList = [...addonErrors];

  convertSobjectFieldsToTsv(inputDir, outputDir);

  console.log("\n--- フィルターアドオンを実行します ---");
  const filterErrors = runFilterAddons(outputDir);
  addonErrorsList.push(...filterErrors);

  const tabs = getTabs(outputDir);
  const { result: designDocResult, errors: designDocErrors } = runDesignDocAddons(inputDir, meta, tabs);
  addonErrorsList.push(...designDocErrors);

  const { errors: htmlErrors } = runHtmlAddons(inputMeta);
  addonErrorsList.push(...htmlErrors);

  const allErrors = [...outputErrors, ...addonErrorsList];
  updateMetaWithTabs(metaPath, meta, designDocResult, allErrors);

  console.log("--- 処理2: 完了 ---");

  generateStandaloneHtml(outputDir, inputMeta, allErrors);
}

function convertSobjectFieldsToTsv(inputDir: string, outputDir: string): void {
  const sobjectFieldsPath = path.join(inputDir, "sobjectFields.json");
  if (!fs.existsSync(sobjectFieldsPath)) {
    return;
  }

  console.log("sobjectFields.json を TSV に変換中...");
  const sobjectFields = JSON.parse(fs.readFileSync(sobjectFieldsPath, "utf8"));
  const rows: string[][] = [];

  for (const obj of sobjectFields.data) {
    for (const field of obj.fields) {
      rows.push([obj.objectName, field.name, field.label, field.type]);
    }
  }

  const tsvContent = FrontMatterTSV.stringify(
    { label: "sObject項目一覧" },
    ["objectName", "name", "label", "type"],
    rows
  );
  fs.writeFileSync(path.join(outputDir, "sobjectFields.tsv"), tsvContent);
  console.log(`sobjectFields.tsv を out_designDoc/sobjectFields.tsv に保存しました。（${rows.length} 件）`);
}

function getTabs(outputDir: string): string[] {
  return fs
    .readdirSync(outputDir)
    .filter((f) => f.endsWith(".tsv") || f.endsWith(".md"))
    .sort();
}

function updateMetaWithTabs(metaPath: string, meta: any, result: { tabs?: string[]; title?: string }, errors: AddonError[]): void {
  meta.tabs = result.tabs;
  if (result.title) {
    meta.title = result.title;
  }
  if (errors.length > 0) {
    meta.addonErrors = errors;
  }
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
}

main();
