import {
  SfClient,
  IFileSaver,
  SobjectRepository,
  ObjectRepository,
} from "./sfUtil";

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

  async buildErrorMessage(
    job: { query: string; label: string },
    objName: string | null,
    dataType: string,
    err: any,
    objectRepository: ObjectRepository,
    sobjectRepository: SobjectRepository,
  ): Promise<string> {
    let errorMsg = `\n警告: ${job.label} の取得に失敗しました。`;
    if (dataType === "object" && objName) {
      const columnNames = getColumnNamesFromQuery(job.query);
      const undefinedCols = objectRepository.getUndefinedColumns(
        objName,
        columnNames,
      );
      if (undefinedCols.length > 0) {
        errorMsg += `\n未定義のカラム: ${undefinedCols.join(", ")}`;
      }
    } else if (dataType === "metadata" && objName) {
      const columnNames = getColumnNamesFromQuery(job.query);
      const undefinedCols = await sobjectRepository.getUndefinedColumns(
        objName,
        columnNames,
      );
      if (undefinedCols.length > 0) {
        errorMsg += `\n未定義のカラム: ${undefinedCols.join(", ")}`;
      }
    }
    return errorMsg;
  }

  async run(onlyObjects?: boolean) {
    const config = this.config;
    const queryJobs = normalizeToArray(config.queryJobs);

    const baseData = await this.fetchBaseData(onlyObjects);
    if (baseData.onlyObjects) {
      return { onlyObjects: true };
    }

    const { objectRepository, sobjectRepository } = baseData as { objectRepository: ObjectRepository; sobjectRepository: SobjectRepository };

    await this.runQueryJobs(queryJobs, objectRepository, sobjectRepository);

    console.log("--- 処理1: 完了 ---");
    return {};
  }

  async fetchBaseData(onlyObjects?: boolean) {
    const sfClient = this.sfClient;
    const config = this.config;

    console.log("オブジェクト一覧を取得中...");
    const objectsQuery = `SELECT QualifiedApiName, Label, DeveloperName FROM EntityDefinition WHERE IsCustomizable = true ORDER BY QualifiedApiName`;
    const objectsData = await sfClient.saveQueryJsonFile(
      "objects.json",
      objectsQuery,
    );
    console.log(
      `オブジェクト一覧を取得し、output/objects.json に保存しました。（計 ${objectsData.result.totalSize} 件）`,
    );

    const objectBlackListArray = normalizeToArray(
      config.objectBlackList,
    ).filter((value): value is string => typeof value === "string");

    const allObjects = objectsData.result?.records || [];
    const filteredObjects = allObjects.filter(
      (obj: any) => !objectBlackListArray.includes(obj.QualifiedApiName),
    );
    console.log(
      `\n取得予定オブジェクト: ${filteredObjects.length} 件\n${filteredObjects
        .map((o: any) => o.QualifiedApiName)
        .join(", ")}`,
    );

    if (onlyObjects) {
      console.log("--only-objects オプションのためここで終了します。");
      return { onlyObjects: true };
    }

    await sfClient.saveFieldsFile(objectBlackListArray);

    await sfClient.saveSobjectListFile();

    const objectRepository = sfClient.createObjectRepository();
    const sobjectRepository = sfClient.createSobjectRepository();

    return { objectRepository, sobjectRepository };
  }

  async runQueryJobs(
    queryJobs: any[],
    objectRepository: ObjectRepository,
    sobjectRepository: SobjectRepository,
  ) {
    const sfClient = this.sfClient;

    for await (const job of queryJobs) {
      console.log(`${job.label} を取得中...`);
      const objName = getObjectNameFromQuery(job.query);
      let dataType: string = "other";
      if (objName) {
        if (objectRepository.isObject(objName)) {
          dataType = "object";
        } else if (sobjectRepository.isSobject(objName)) {
          dataType = "metadata";
        }
      }
      try {
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
        const errorMsg = await this.buildErrorMessage(
          job,
          objName,
          dataType,
          err,
          objectRepository,
          sobjectRepository,
        );
        console.error(errorMsg);
        if (err.stdout) console.error("STDOUT:", err.stdout);
        else console.error("Error:", err.message);
      }
    }
  }
}
