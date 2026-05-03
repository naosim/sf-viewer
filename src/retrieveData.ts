import * as fs from "fs";
import * as path from "path";
import { SfClient, loadConfig, IFileSaver, formatTimestamp, normalizeToArray } from "./sfUtil";
import { RetrieveSalesforce } from "./retrieveSalesforce";

async function main() {
  console.log("--- 処理1: Salesforceからのデータ取得を開始します ---");

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
        `output配下のファイルを backup/${timestamp} に退避しました。`,
      );
    }
  }

  const retrievedAt = new Date();
  const queryJobs = normalizeToArray(config.queryJobs).map((job: any) => ({
    fileName: job.fileName,
    label: job.label,
    tooling: job.tooling,
  }));
  const meta = {
    alias: alias,
    retrievedAt: retrievedAt.toLocaleString(),
    queryJobs: queryJobs,
  };
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

  const sfClient = new SfClient(alias, outputDir, retrievedAt);
  // 1. sfコマンドの有無を確認
  await sfClient.checkSfInstalled();
  const retrieveSalesforce = new RetrieveSalesforce(
    sfClient,
    config,
    sfClient as IFileSaver,
  );
  retrieveSalesforce.run();
}

main().catch((error: any) => {
  console.error("データ取得中にエラーが発生しました:");
  if (error.message) console.error("Message:", error.message);
  if (error.stdout) console.error("STDOUT:", error.stdout);
  if (error.stderr) console.error("STDERR:", error.stderr);
  process.exit(1);
});
