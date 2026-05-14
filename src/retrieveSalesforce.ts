import {
  SfClient,
  IFileSaver,
  SobjectRepository,
  ObjectRepository,
} from "./sfUtil";
import { resolveUserDataSubDir } from "./pathUtil";
import * as path from "path";
import * as fs from "fs";

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
    job: any,
    objName: string | null,
    dataType: string,
    err: any,
    objectRepository: ObjectRepository,
    sobjectRepository: SobjectRepository,
  ): Promise<string> {
    let errorMsg = `\n警告: ${job.label} の取得に失敗しました。`;
    if (dataType === "object" && objName) {
      const columnNames = job.columns;
      const undefinedCols = objectRepository.getUndefinedColumns(
        objName,
        columnNames,
      );
      if (undefinedCols.length > 0) {
        errorMsg += `\n未定義のカラム: ${undefinedCols.join(", ")}`;
      }
    } else if (dataType === "metadata" && objName) {
      const columnNames = job.columns;
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

    const baseData = await this.fetchBaseData(onlyObjects, queryJobs);
    if (baseData.onlyObjects) {
      return { onlyObjects: true };
    }

    const { objectRepository, sobjectRepository } = baseData as { objectRepository: ObjectRepository; sobjectRepository: SobjectRepository };

    await this.fetchMetadataFields(queryJobs, objectRepository, sobjectRepository);

    await this.runQueryJobs(queryJobs, objectRepository, sobjectRepository);

    console.log("--- 処理1: 完了 ---");
    return {};
  }

  async fetchBaseData(onlyObjects?: boolean, queryJobs?: any[]) {
    const sfClient = this.sfClient;
    const config = this.config;

    console.log("オブジェクト一覧を取得中...");

    // queryJobs から objectName を抽出
    const queryJobObjectNames = queryJobs
      ? [...new Set(queryJobs.map((job: any) => job.objectName).filter((name: any) => name))]
      : [];

    // ベースクエリ（IsCustomizable = true）
    const baseQuery = "SELECT QualifiedApiName, Label, DeveloperName FROM EntityDefinition WHERE IsCustomizable = true ORDER BY QualifiedApiName";
    
    let objectsData: any;
    
    if (queryJobObjectNames.length > 0) {
      // 2つのクエリを実行してマージ
      const quotedNames = queryJobObjectNames.map((name: string) => `'${name}'`).join(", ");
      const extraQuery = `SELECT QualifiedApiName, Label, DeveloperName FROM EntityDefinition WHERE QualifiedApiName IN (${quotedNames})`;
      
      const [baseResult, extraResult] = await Promise.all([
        sfClient.saveQueryJsonFile("objects_base.json", baseQuery),
        sfClient.saveQueryJsonFile("objects_extra.json", extraQuery),
      ]);
      
      // results をマージして重複を排除
      const mergedRecords: any[] = [];
      const seen = new Set<string>();
      
      for (const record of [...(baseResult.result?.records || []), ...(extraResult.result?.records || [])]) {
        if (!seen.has(record.QualifiedApiName)) {
          seen.add(record.QualifiedApiName);
          mergedRecords.push(record);
        }
      }
      
      // マージ結果を保存（正しいデータ構造で保存）
      objectsData = {
        result: {
          totalSize: mergedRecords.length,
          records: mergedRecords,
        },
      };

      // objects.json に保存（result.records 構造で保存）
      const outputDir = resolveUserDataSubDir("output");
      const meta = {
        retrievedAt: new Date().toLocaleString(),
        alias: sfClient.getAlias(),
        base_url: sfClient.getBaseUrlSync(),
        options: sfClient.getOptions(),
      };
      const objectsToSave = {
        meta: meta,
        data: {
          result: {
            records: mergedRecords,
          },
        },
      };
      fs.writeFileSync(
        path.join(outputDir, "objects.json"),
        JSON.stringify(objectsToSave, null, 2)
      );
      
      // 一時ファイルを削除
      ["objects_base.json", "objects_extra.json"].forEach((f) => {
        const fp = path.join(outputDir, f);
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
      });
    } else {
      objectsData = await sfClient.saveQueryJsonFile("objects.json", baseQuery);
    }

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

      const objName = job.objectName;
      const columns = job.columns;
      const queryOption = job.queryOption || "";

      let columnList: string[];
      if (columns.includes("*")) {
        const fieldsData = objectRepository.fields?.data;
        if (!fieldsData) {
          console.warn(`警告: fields.json がありません。${job.label} の取得をスキップします。`);
          continue;
        }
        
        // fields.json から探検
        let objFields = fieldsData.find((f: any) => f.objectName === objName);
        
        if (!objFields) {
          // sObject としても存在するか確認
          const isSobject = sobjectRepository.isSobject(objName);
          
          if (isSobject) {
            // sObject としては存在するが FieldDefinition には 없는
            console.warn(`警告: ${objName} は sObject ですが、FieldDefinition には存在しません。${job.label} の取得をスキップします。`);
          } else {
            // どちらにも存在しない
            console.warn(`警告: オブジェクト ${objName} は fields.json と sobject-list.json のどちらにも見つかりません。${job.label} の取得をスキップします。`);
          }
          continue;
        }
        columnList = objFields.fields.map((f: any) => f.QualifiedApiName);
      } else {
        columnList = columns;
      }

      const query = `SELECT ${columnList.join(", ")} FROM ${objName} ${queryOption}`;

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
          query,
          job.tooling,
          dataType,
        );
        const totalSize = parsed.result ? parsed.result.totalSize : 0;
        console.log(
          `${job.label} を取得し、output/${job.fileName} に保存しました。（計 ${totalSize} 件）`,
        );
      } catch (err: any) {
        // エラー情報を meta に含めて JSON を保存
        const outputDir = resolveUserDataSubDir("output");
        const errorData = {
          meta: {
            retrievedAt: new Date().toLocaleString(),
            alias: sfClient.getAlias(),
            base_url: sfClient.getBaseUrlSync() || "",
            error: err.message || "不明なエラー",
            errorCode: err.errorCode || null,
            objectName: objName,
            query: query,
          },
          data: null,
        };
        
        const outputPath = path.join(outputDir, job.fileName);
        fs.writeFileSync(outputPath, JSON.stringify(errorData, null, 2));
        
        console.warn(`警告: ${job.label} の取得に失敗しました。エラー情報を ${job.fileName} に保存しました。`);
        
        // エラー詳細をコンソールに出力
        const errorMsg = await this.buildErrorMessage(
          job,
          objName,
          dataType,
          err,
          objectRepository,
          sobjectRepository,
        );
        console.warn(errorMsg);
        if (err.stdout) console.warn("STDOUT:", err.stdout);
        else console.warn("Error:", err.message);
      }
    }
  }

  async fetchMetadataFields(
    queryJobs: any[],
    objectRepository: ObjectRepository,
    sobjectRepository: SobjectRepository,
  ) {
    const sfClient = this.sfClient;
    const metadataObjectNames: string[] = [];

    for (const job of queryJobs) {
      const objName = job.objectName;
      if (objectRepository.isObject(objName)) {
        continue;
      }
      if (sobjectRepository.isSobject(objName)) {
        if (!metadataObjectNames.includes(objName)) {
          metadataObjectNames.push(objName);
        }
      }
    }

    if (metadataObjectNames.length > 0) {
      await sfClient.saveMetadataFieldsFile(metadataObjectNames);
    }
  }
}
