import * as fs from "fs";
import * as path from "path";
import { createRequire } from "module";
import { FrontMatterTSV } from "./tsv-doc/frontMatter";
import { resolveUserDataSubDir } from "./pathUtil";

interface AddonResult {
  meta: { [key: string]: string };
  headers?: string[];
  rows?: string[][];
  type?: 'tsv' | 'markdown';
  content?: string;
}

interface AddonError {
  addonName: string;
  error: string;
  errorCode?: string | null;
  objectName?: string | null;
  timestamp: string;
  errorStack?: string;
}

interface DesignDocResult {
  tabs?: string[];
  title?: string;
}

interface HtmlCustomResult {
  css?: string;
  js?: string;
}

export function runAddons(inputDir: string, outputDir: string, meta: any): { results: AddonResult[], errors: AddonError[] } {
  const errors: AddonError[] = [];
  const results: AddonResult[] = [];
  
  const addonsDir = resolveUserDataSubDir("addons");
  if (!fs.existsSync(addonsDir)) {
    console.log("addons/ ディレクトリが存在しないため、スキップします。");
    return { results, errors };
  }

  const addonFiles = fs.readdirSync(addonsDir).filter((f) => f.endsWith(".ts") && !f.startsWith("designDoc") && !f.startsWith("html") && !f.startsWith("filter"));
  if (addonFiles.length === 0) {
    console.log("アドオンファイルが存在しないため、スキップします。");
    return { results, errors };
  }

  const inputData: { [filename: string]: any } = {};
  const jsonFiles = fs.readdirSync(inputDir).filter((f) => f.endsWith(".json"));
  for (const jsonFile of jsonFiles) {
    const jsonPath = path.join(inputDir, jsonFile);
    inputData[jsonFile.replace(".json", "")] = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  }

  for (const addonFile of addonFiles) {
    try {
      const addonName = addonFile.replace(".ts", "");
      console.log(`実行中: ${addonName}`);

      const addonPath = path.join(addonsDir, addonFile);
      const requireFn = createRequire(addonPath);
      const addonModule: { run?: (inputData: any) => AddonResult[] } = requireFn(addonPath);
      const runFunction = addonModule.run;

      if (typeof runFunction !== "function") {
        throw new Error("run 関数がエクスポートされていません。");
      }

      const addonResults: AddonResult[] = runFunction(inputData);

      if (!Array.isArray(addonResults)) {
        throw new Error("run 関数は配列を返す必要があります。");
      }

      for (let i = 0; i < addonResults.length; i++) {
        const result = addonResults[i];
        results.push(result);
        const isMarkdown = result.type === 'markdown';
        const ext = isMarkdown ? '.md' : '.tsv';
        const fileName = `${addonName}_${i}${ext}`;
        const filePath = path.join(outputDir, fileName);

        let content: string;
        if (isMarkdown && result.content) {
          const metaLines = Object.entries(result.meta).map(
            ([key, value]) => `${key}: ${value}`
          );
          content = `---\n${metaLines.join("\n")}\n---\n\n${result.content}`;
        } else {
          content = FrontMatterTSV.stringify(
            result.meta,
            result.headers || [],
            result.rows || []
          );
        }
        fs.writeFileSync(filePath, content);
        console.log(`${fileName} を out_designDoc/${fileName} に保存しました。`);
      }
    } catch (error: any) {
      errors.push({
        addonName: addonFile,
        error: error.message,
        errorStack: error.stack,
        timestamp: new Date().toLocaleString(),
      });
      console.warn(`警告: アドオン ${addonFile} でエラーが発生しました。`);
    }
  }
  
  return { results, errors };
}

export function runDesignDocAddons(inputDir: string, meta: any, tabs: string[]): { result: DesignDocResult, errors: AddonError[] } {
  const errors: AddonError[] = [];
  
  const addonsDir = resolveUserDataSubDir("addons");
  if (!fs.existsSync(addonsDir)) {
    console.log("addons/ ディレクトリが存在しないため、スキップします。");
    return { result: { tabs }, errors };
  }

  const designDocFiles = fs.readdirSync(addonsDir).filter((f) => f.startsWith("designDoc") && f.endsWith(".ts") && !f.startsWith("filter"));
  if (designDocFiles.length === 0) {
    console.log("designDocアドオンが存在しないため、スキップします。");
    return { result: { tabs }, errors };
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
      const requireFn = createRequire(addonPath);
      const addonModule: { run?: (inputData: any, tabs: string[], meta: any) => DesignDocResult } = requireFn(addonPath);
      const runFunction = addonModule.run;

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
      errors.push({
        addonName: addonFile,
        error: error.message,
        errorStack: error.stack,
        timestamp: new Date().toLocaleString(),
      });
      console.warn(`警告: designDocアドオン ${addonFile} でエラーが発生しました。`);
    }
  }

  return { result: { tabs: currentTabs, title: currentTitle }, errors };
}

export function runFilterAddons(outputDir: string): AddonError[] {
  const errors: AddonError[] = [];
  
  const addonsDir = resolveUserDataSubDir("addons");
  if (!fs.existsSync(addonsDir)) {
    return errors;
  }

  const filterFiles = fs.readdirSync(addonsDir).filter((f) => f.startsWith("filter") && f.endsWith(".ts"));
  if (filterFiles.length === 0) {
    return errors;
  }

  const files = fs.readdirSync(outputDir).filter((f) => f.endsWith(".tsv") || f.endsWith(".md"));
  if (files.length === 0) {
    return errors;
  }

  const fileInfos: { fileName: string; label: string }[] = files.map((f) => {
    const filePath = path.join(outputDir, f);
    const content = fs.readFileSync(filePath, "utf8");
    let label = "";
    try {
      if (f.endsWith(".tsv")) {
        const parsed = FrontMatterTSV.parse(content);
        label = parsed.meta.label || "";
      } else if (f.endsWith(".md")) {
        const match = content.match(/^---\n([\s\S]*?)\n---/);
        if (match) {
          const metaLines = match[1].split("\n");
          for (const line of metaLines) {
            const colonIndex = line.indexOf(":");
            if (colonIndex > 0) {
              const key = line.substring(0, colonIndex).trim();
              const value = line.substring(colonIndex + 1).trim();
              if (key === "label") {
                label = value;
                break;
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn(`警告: ${f} のラベル読み取りに失敗しました。`);
    }
    return { fileName: f, label };
  });

  for (const filterFile of filterFiles) {
    try {
      const addonName = filterFile.replace(".ts", "");
      console.log(`フィルターアドオンを実行中: ${addonName}`);

      const addonPath = path.join(addonsDir, filterFile);
      const requireFn = createRequire(addonPath);
      const addonModule: { run?: (file: { fileName: string; label: string }) => boolean } = requireFn(addonPath);
      const runFunction = addonModule.run;

      if (typeof runFunction !== "function") {
        throw new Error("run 関数がエクスポートされていません。");
      }

      for (const fileInfo of fileInfos) {
        const shouldKeep = runFunction(fileInfo);
        if (shouldKeep === false) {
          const filePath = path.join(outputDir, fileInfo.fileName);
          fs.unlinkSync(filePath);
          console.log(`${addonName}: ${fileInfo.fileName} を削除しました（フィルターにより生成除外）`);
        }
      }
    } catch (error: any) {
      errors.push({
        addonName: filterFile,
        error: error.message,
        errorStack: error.stack,
        timestamp: new Date().toLocaleString(),
      });
      console.warn(`警告: フィルターアドオン ${filterFile} でエラーが発生しました。`);
    }
  }
  
  return errors;
}

export function runHtmlAddons(meta: any): { result: HtmlCustomResult, errors: AddonError[] } {
  const errors: AddonError[] = [];
  
  const addonsDir = resolveUserDataSubDir("addons");
  if (!fs.existsSync(addonsDir)) {
    return { result: {}, errors };
  }

  const htmlAddonFiles = fs.readdirSync(addonsDir).filter((f) => f.startsWith("html") && f.endsWith(".ts") && !f.startsWith("filter"));
  if (htmlAddonFiles.length === 0) {
    return { result: {}, errors };
  }

  let result: HtmlCustomResult = {};

  for (const addonFile of htmlAddonFiles) {
    try {
      const addonName = addonFile.replace(".ts", "");
      console.log(`HTMLアドオンを実行中: ${addonName}`);

      const addonPath = path.join(addonsDir, addonFile);
      const requireFn = createRequire(addonPath);
      const addonModule: { run?: (meta: any) => HtmlCustomResult } = requireFn(addonPath);
      const runFunction = addonModule.run;

      if (typeof runFunction !== "function") {
        throw new Error("run 関数がエクスポートされていません。");
      }

      const addonResult: HtmlCustomResult = runFunction(meta);
      if (addonResult.css) result.css = addonResult.css;
      if (addonResult.js) result.js = addonResult.js;
      console.log(`${addonName}: カスタムCSS/JSを適用しました`);
    } catch (error: any) {
      errors.push({
        addonName: addonFile,
        error: error.message,
        errorStack: error.stack,
        timestamp: new Date().toLocaleString(),
      });
      console.warn(`警告: HTMLアドオン ${addonFile} でエラーが発生しました。`);
    }
  }

  return { result, errors };
}