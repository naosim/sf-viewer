import * as fs from "fs";
import * as path from "path";
import { createRequire } from "module";
import { FrontMatterTSV } from "./FrontMatterTSV";

interface AddonResult {
  meta: { [key: string]: string };
  headers?: string[];
  rows?: string[][];
  type?: 'tsv' | 'markdown';
  content?: string;
}

interface DesignDocResult {
  tabs?: string[];
  title?: string;
}

interface HtmlCustomResult {
  css?: string;
  js?: string;
}

export function runAddons(inputDir: string, outputDir: string, meta: any): void {
  const addonsDir = path.join(__dirname, "../addons");
  if (!fs.existsSync(addonsDir)) {
    console.log("addons/ ディレクトリが存在しないため、スキップします。");
    return;
  }

  const addonFiles = fs.readdirSync(addonsDir).filter((f) => f.endsWith(".ts") && !f.startsWith("designDoc") && !f.startsWith("html"));
  if (addonFiles.length === 0) {
    console.log("アドオンファイルが存在しないため、スキップします。");
    return;
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

      const results: AddonResult[] = runFunction(inputData);

      if (!Array.isArray(results)) {
        throw new Error("run 関数は配列を返す必要があります。");
      }

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const isMarkdown = result.type === 'markdown';
        const ext = isMarkdown ? '.md' : '.tsv';
        const fileName = `${addonName}_${i}${ext}`;
        const filePath = path.join(outputDir, fileName);

        let content: string;
        if (isMarkdown && result.content) {
          // Markdown にも FrontMatter を追加
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
      console.error(`アドオン ${addonFile} の実行中にエラーが発生しました: ${error.message}`);
      throw error;
    }
  }
}

export function runDesignDocAddons(inputDir: string, meta: any, tabs: string[]): DesignDocResult {
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
      console.error(`designDocアドオン ${addonFile} の実行中にエラーが発生しました: ${error.message}`);
      throw error;
    }
  }

  return { tabs: currentTabs, title: currentTitle };
}

export function runHtmlAddons(meta: any): HtmlCustomResult {
  const addonsDir = path.join(__dirname, "../addons");
  if (!fs.existsSync(addonsDir)) {
    return {};
  }

  const htmlAddonFiles = fs.readdirSync(addonsDir).filter((f) => f.startsWith("html") && f.endsWith(".ts"));
  if (htmlAddonFiles.length === 0) {
    return {};
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
      console.error(`HTMLアドオン ${addonFile} の実行中にエラーが発生しました: ${error.message}`);
      throw error;
    }
  }

  return result;
}