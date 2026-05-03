import { spawn } from "child_process";

const runScript = (scriptPath: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["ts-node", scriptPath], {
      stdio: "inherit",
      shell: true,
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
  console.log("=== Salesforce データ取得と基本設計書生成 ===\n");

  try {
    console.log("--- 処理1: Salesforceからデータを取得します ---");
    await runScript("src/retrieveData.ts");

    console.log("\n--- 処理2: 基本設計書を生成します ---");
    await runScript("src/generateDesignDoc.ts");

    console.log("\n=== 全ての処理が完了しました ===");
  } catch (error: any) {
    console.error("\nエラーが発生しました:");
    console.error(error.message);
    process.exit(1);
  }
}

main();