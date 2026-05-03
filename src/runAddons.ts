import * as fs from "fs";
import * as path from "path";
import * as ts from "typescript";
import { FrontMatterTSV } from "./FrontMatterTSV";

interface AddonResult {
  meta: { [key: string]: string };
  headers?: string[];
  rows?: string[][];
  type?: 'tsv' | 'markdown';
  content?: string;
}

export function runAddons(inputDir: string, outputDir: string, meta: any): void {
  const addonsDir = path.join(__dirname, "../addons");
  if (!fs.existsSync(addonsDir)) {
    console.log("addons/ ディレクトリが存在しないため、スキップします。");
    return;
  }

  const addonFiles = fs.readdirSync(addonsDir).filter((f) => f.endsWith(".ts") && !f.startsWith("designDoc"));
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
      const addonCode = fs.readFileSync(addonPath, "utf8");

      const transpiled = ts.transpileModule(addonCode, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
      });

      const module: { exports: { run?: (inputData: any) => AddonResult[] } } = { exports: {} };
      const evalCode = new Function("module", "exports", transpiled.outputText);
      evalCode(module, module.exports);
      const runFunction = module.exports.run;

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