import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";

interface EnvEntry {
  alias: string;
  isDefault?: boolean;
}

function getAliasFromArgs(args: string[]): string | null {
  const aliasIndex = args.findIndex((arg) => arg !== "--");
  if (aliasIndex >= 0 && aliasIndex < args.length) {
    return args[aliasIndex];
  }
  return null;
}

function loadEnvAlias(requestedAlias: string | null): string {
  const envPath = path.join(__dirname, "../env.json");
  if (!fs.existsSync(envPath)) {
    throw new Error("エラー: env.json が見つかりません。");
  }

  const envData: EnvEntry[] = JSON.parse(fs.readFileSync(envPath, "utf8"));

  if (requestedAlias) {
    const found = envData.find((e) => e.alias === requestedAlias);
    if (!found) {
      throw new Error(`エラー: env.json に alias "${requestedAlias}" が存在しません。`);
    }
    return requestedAlias;
  }

  const defaultEnv = envData.find((e) => e.isDefault);
  if (!defaultEnv) {
    throw new Error("エラー: env.json に isDefault: true のエントリがありません。");
  }
  return defaultEnv.alias;
}

const runScript = (scriptPath: string, alias: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["ts-node", scriptPath], {
      stdio: "inherit",
      shell: true,
      env: { ...process.env, SF_ALIAS: alias },
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Script ${scriptPath} exited with code ${code}`));
      }
    });

    child.on("error", (error) => {
      reject(error);
    });
  });
};

async function main() {
  const requestedAlias = getAliasFromArgs(process.argv.slice(2));
  const alias = loadEnvAlias(requestedAlias);

  console.log("=== Salesforce データ取得と基本設計書生成 ===\n");
  console.log(`対象エイリアス: ${alias}\n`);

  try {
    console.log("--- 処理1: Salesforceからデータを取得します ---");
    await runScript("src/retrieveData.ts", alias);

    console.log("\n--- 処理2: 基本設計書を生成します ---");
    await runScript("src/generateDesignDoc.ts", alias);

    console.log("\n=== 全ての処理が完了しました ===");
  } catch (error: any) {
    console.error("\nエラーが発生しました:");
    console.error(error.message);
    process.exit(1);
  }
}

main();