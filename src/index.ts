import * as fs from "fs";
import * as path from "path";
import { SfClient, loadConfig, IFileSaver } from "./execPromise";
import { RetrieveSalesforce } from "./retrieveSalesforce";

async function main() {
  const onlyFlows =
    process.argv.includes("--only-flows") ||
    process.argv.includes("--flow-only");
  if (onlyFlows) {
    console.log("--- 処理1: Flow取得以降のみを実行します ---");
  } else {
    console.log("--- 処理1: Salesforceからのデータ取得を開始します ---");
  }

  // 2. config.jsonの読み込み
  const configPath = path.join(__dirname, "../config.json");
  const config = loadConfig(configPath);

  const alias = config.alias;
  if (!alias) {
    throw new Error("エラー: config.json に alias が設定されていません。");
  }

  console.log(`対象エイリアス: ${alias}`);

  const outputDir = path.join(__dirname, "../output");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const retrievedAt = new Date();
  const sfClient = new SfClient(alias, outputDir, retrievedAt);
  // 1. sfコマンドの有無を確認
  await sfClient.checkSfInstalled();
  const retrieveSalesforce = new RetrieveSalesforce(
    sfClient,
    config,
    sfClient as IFileSaver,
  );
  retrieveSalesforce.run(onlyFlows);
}

main().catch((error: any) => {
  console.error("データ取得中にエラーが発生しました:");
  if (error.message) console.error("Message:", error.message);
  if (error.stdout) console.error("STDOUT:", error.stdout);
  if (error.stderr) console.error("STDERR:", error.stderr);
  process.exit(1);
});
