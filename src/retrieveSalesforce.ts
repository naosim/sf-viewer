import { SfClient, IFileSaver, SobjectRepository } from "./execPromise";

const normalizeToArray = <T>(value: T | T[] | undefined | null): T[] => {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
};

const getObjectNameFromQuery = (query: string): string | null => {
  const fromMatch = query.match(/\bFROM\s+(\w+)/i);
  return fromMatch ? fromMatch[1] : null;
};

/**
 * Salesforceから各種データを取得する
 */
export class RetrieveSalesforce {
  constructor(
    readonly sfClient: SfClient,
    readonly config: any,
    private fileSaver: IFileSaver,
  ) {}

  async run(onlyFlows: boolean) {
    const sfClient = this.sfClient;
    const config = this.config;
    let objectNames: Set<string> = new Set();
    let sobjectRepository: SobjectRepository | undefined;
    const objectBlackList = new Set<string>(
      normalizeToArray(config.objectBlackList).filter(
        (value): value is string => typeof value === "string",
      ),
    );
    const queryJobs = normalizeToArray(config.queryJobs);

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

        // objectNames セットを構築
        if (objectsData && objectsData.result && objectsData.result.records) {
          objectNames = new Set(objectsData.result.records.map((obj: any) => obj.QualifiedApiName));
        }

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
          console.log(`取得進捗: ${count} / ${filteredObjectList.length} 完了`);
        }
        console.log(""); // 改行

        // そのまま保存
        this.fileSaver.saveJson("fields.json", allFieldsData);
        console.log(
          "すべての項目一覧を取得し、output/fields.json に保存しました。",
        );
      } catch (error: any) {
        throw error;
      }
    }

    // sObject一覧の取得 (ファイルから読み込み)
    const sobjectListJsonFileName = "sobject-list.json";
    try {
      sobjectRepository = sfClient.createSobjectRepository(sobjectListJsonFileName);
    } catch (err: any) {
      console.error(`\n警告: sObject一覧の読み込みに失敗しました。`);
      if (err.stdout) console.error("STDOUT:", err.stdout);
      else console.error("Error:", err.message);
      throw err; // エラーを再スロー（ユーザー要望）
    }

    for (const job of queryJobs) {
      console.log(`${job.label} を取得中...`);
      try {
        const objName = getObjectNameFromQuery(job.query);
        let dataType: string = "other";
        if (objName) {
          if (objectNames.has(objName)) {
            dataType = "object";
          } else if (sobjectRepository && sobjectRepository.isSobject(objName)) {
            dataType = "metadata";
          }
        }
        const parsed = await sfClient.saveQueryJsonFile(
          job.fileName,
          job.query,
          job.tooling,
          dataType
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
