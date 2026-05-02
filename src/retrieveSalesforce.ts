import * as fs from "fs";
import * as path from "path";
import { SfClient } from "./execPromise";

const normalizeToArray = <T>(value: T | T[] | undefined | null): T[] => {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
};

/**
 * Salesforceから各種データを取得する
 */
export class RetrieveSalesforce {
  constructor(
    readonly sfClient: SfClient,
    readonly config: any,
    readonly outputDir: string,
  ) {}

  async run(onlyFlows: boolean) {
    const sfClient = this.sfClient;
    const config = this.config;
    const outputDir = this.outputDir;
    const objectBlackList = new Set<string>(
      normalizeToArray(config.objectBlackList).filter(
        (value): value is string => typeof value === "string",
      ),
    );
    const queryJobs = normalizeToArray(config.queryJobs);

    {
      if (!onlyFlows) {
        try {
          // 3. オブジェクト一覧の取得
          console.log("オブジェクト一覧を取得中...");
          const objectsQuery = `SELECT QualifiedApiName, Label, DeveloperName FROM EntityDefinition WHERE IsCustomizable = true ORDER BY QualifiedApiName`;
          const objectsData = await sfClient.saveQueryJsonFile(
            "objects.json",
            objectsQuery,
          );
          console.log(
            `オブジェクト一覧を取得し、output/objects.json に保存しました。（計 ${objectsData.result.totalSize} 件）`,
          );

          // 4. 項目一覧の取得
          console.log("項目一覧を取得中...");
          const objectList = objectsData.result.records;
          // ブラックリストでフィルタリング
          const filteredObjectList = objectList.filter(
            (obj: any) => !objectBlackList.has(obj.QualifiedApiName),
          );
          const allFieldsData: any[] = [];

          let count = 0;

          // 連続でAPIを叩くと時間がかかるため、10件ずつの並行処理（チャンク）で実行
          const chunkSize = 10;
          for (let i = 0; i < filteredObjectList.length; i += chunkSize) {
            const chunk = filteredObjectList.slice(i, i + chunkSize);

            await Promise.all(
              chunk.map(async (obj: any) => {
                const objName = obj.QualifiedApiName;

                const fieldsQuery = `SELECT QualifiedApiName, Label, DataType, Length FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = '${objName}' ORDER BY QualifiedApiName`;

                try {
                  const fieldsRes = await sfClient.sfQuery(fieldsQuery);
                  const fieldsParsed = fieldsRes.parsed;
                  allFieldsData.push({
                    objectName: objName,
                    fields: fieldsParsed.result
                      ? fieldsParsed.result.records
                      : [],
                  });
                } catch (err: any) {
                  // 取得できないオブジェクトがある場合は警告を出してスキップ
                  console.warn(
                    `\n警告: ${objName} の項目一覧の取得に失敗しました。スキップします。`,
                  );
                }
              }),
            );

            count += chunk.length;
            process.stdout.write(
              `\r取得進捗: ${count} / ${filteredObjectList.length} 完了`,
            );
          }
          console.log(""); // 改行

          // そのまま保存
          const fieldsOutputPath = path.join(outputDir, "fields.json");
          fs.writeFileSync(
            fieldsOutputPath,
            JSON.stringify(allFieldsData, null, 2),
          );
          console.log(
            "すべての項目一覧を取得し、output/fields.json に保存しました。",
          );
        } catch (error: any) {
          throw error;
        }
      }

      // sObject一覧の取得
      try {
        await sfClient.saveSobjectListFile();
      } catch (err: any) {
        console.error(`\n警告: sObject一覧の取得に失敗しました。`);
        if (err.stdout) console.error("STDOUT:", err.stdout);
        else console.error("Error:", err.message);
      }

      for (const job of queryJobs) {
        console.log(`${job.label} を取得中...`);
        try {
          const parsed = await sfClient.saveQueryJsonFile(
            job.fileName,
            job.query,
            job.tooling,
          );
          const totalSize = parsed.result ? parsed.result.totalSize : 0;
          console.log(
            `${job.label} を取得し、output/${job.fileName} に保存しました。（計 ${totalSize} 件）`,
          );
        } catch (err: any) {
          console.error(`\n警告: ${job.label} の取得に失敗しました。`);
          if (err.stdout) console.error("STDOUT:", err.stdout);
          else console.error("Error:", err.message);
        }
      }

      console.log("--- 処理1: 完了 ---");
    }
  }
}
