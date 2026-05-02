import {
  SfClient,
  IFileSaver,
  SobjectRepository,
  ObjectRepository,
} from "./execPromise";

const normalizeToArray = <T>(value: T | T[] | undefined | null): T[] => {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
};

const getObjectNameFromQuery = (query: string): string | null => {
  const fromMatch = query.match(/\bFROM\s+(\w+)/i);
  return fromMatch ? fromMatch[1] : null;
};

const getColumnNamesFromQuery = (query: string): string[] => {
  const selectMatch = query.match(/\bSELECT\s+(.+?)\s+FROM\b/i);
  if (!selectMatch) return [];

  const selectPart = selectMatch[1];
  const columns: string[] = [];

  let depth = 0;
  let current = "";

  for (const char of selectPart) {
    if (char === "(") {
      depth++;
      current += char;
    } else if (char === ")") {
      depth--;
      current += char;
    } else if (char === "," && depth === 0) {
      const trimmed = current.trim();
      if (trimmed) columns.push(trimmed);
      current = "";
    } else {
      current += char;
    }
  }

  const trimmed = current.trim();
  if (trimmed) columns.push(trimmed);

  return columns;
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
    let objectRepository: ObjectRepository;
    let sobjectRepository: SobjectRepository;
    // const objectBlackList = new Set<string>(
    //   normalizeToArray(config.objectBlackList).filter(
    //     (value): value is string => typeof value === "string",
    //   ),
    // );
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

        // 4. 項目一覧の取得
        const objectBlackListArray = normalizeToArray(
          config.objectBlackList,
        ).filter((value): value is string => typeof value === "string");
        await sfClient.saveFieldsFile(objectBlackListArray);

        await sfClient.saveSobjectListFile();
      } catch (error: any) {
        throw error;
      }
    }

    // sObject一覧の取得 (ファイルから読み込み)
    objectRepository = sfClient.createObjectRepository().init();
    sobjectRepository = sfClient.createSobjectRepository().init();

    for (const job of queryJobs) {
      console.log(`${job.label} を取得中...`);
      try {
        const objName = getObjectNameFromQuery(job.query);
        let dataType: string = "other";
        if (objName) {
          if (objectRepository.isObject(objName)) {
            dataType = "object";
          } else if (
            sobjectRepository &&
            sobjectRepository.isSobject(objName)
          ) {
            dataType = "metadata";
          }
        }
        const parsed = await sfClient.saveQueryJsonFile(
          job.fileName,
          job.query,
          job.tooling,
          dataType,
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
