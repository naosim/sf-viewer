import * as fs from "fs";
import * as path from "path";
import { SfClient, loadConfig, IFileSaver, formatTimestamp, normalizeToArray } from "./sfUtil";
import { resolveUserDataDir, resolveUserDataSubDir } from "./pathUtil";
import { RetrieveSalesforce } from "./retrieveSalesforce";

function loadEnvOptions(alias: string, userDataDir: string): any | undefined {
  const envPath = path.join(userDataDir, "env.json");
  if (!fs.existsSync(envPath)) {
    throw new Error(`エラー: env.json が見つかりません。パス: ${envPath}`);
  }
  const envData: Array<{ alias: string; isDefault?: boolean; options?: any }> =
    JSON.parse(fs.readFileSync(envPath, "utf8"));
  const envEntry = envData.find((e) => e.alias === alias);
  if (!envEntry) {
    throw new Error(`エラー: env.json に alias "${alias}" が存在しません。`);
  }
  return envEntry.options;
}

async function main() {
  console.log("--- 処理1: Salesforceからのデータ取得を開始します ---");

  const alias = process.env.SF_ALIAS;
  const onlyObjects = process.env.SF_ONLY_OBJECTS === "true";
  if (!alias) {
    throw new Error("エラー: SF_ALIAS 環境変数が設定されていません。");
  }

  const userDataDir = resolveUserDataDir();
  const configPath = path.join(userDataDir, "config.json");
  const config = loadConfig(configPath);

  console.log(`対象エイリアス: ${alias}`);
  console.log(`データディレクトリ: ${userDataDir}`);

  const options = loadEnvOptions(alias, userDataDir);

  const outputDir = resolveUserDataSubDir("output");
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

  const sfClient = new SfClient(alias, outputDir, retrievedAt, options);

  await sfClient.checkSfInstalled();

  const baseUrl = await sfClient.getBaseUrl();

  const meta: any = {
    alias: alias,
    retrievedAt: retrievedAt.toLocaleString(),
    base_url: baseUrl,
    queryJobs: queryJobs,
  };
  if (options !== undefined) {
    meta.options = options;
  }
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

  const retrieveSalesforce = new RetrieveSalesforce(
    sfClient,
    config,
    sfClient as IFileSaver,
  );
  retrieveSalesforce.run(onlyObjects);
}

main().catch((error: any) => {
  console.error("データ取得中にエラーが発生しました:");
  if (error.message) console.error("Message:", error.message);
  if (error.stdout) console.error("STDOUT:", error.stdout);
  if (error.stderr) console.error("STDERR:", error.stderr);
  process.exit(1);
});
