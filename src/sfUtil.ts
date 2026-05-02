import { execFile } from "child_process";
import * as fs from "fs";
import * as path from "path";

const isWindows = process.platform === "win32";
const gitBashPath = isWindows
  ? fs.existsSync("C:\\Program Files\\Git\\bin\\bash.exe")
    ? "C:\\Program Files\\Git\\bin\\bash.exe"
    : fs.existsSync("C:\\Program Files (x86)\\Git\\bin\\bash.exe")
      ? "C:\\Program Files (x86)\\Git\\bin\\bash.exe"
      : undefined
  : undefined;
const useGitBash = !!gitBashPath;

const shellEscape = (value: string): string => {
  return `'${value.replace(/'/g, `'\\''`)}'`;
};

export interface IFileSaver {
  saveJson(fileName: string, data: any): void;
}

// 汎用コマンド実行ヘルパー
export const execPromise = (
  cmd: string,
  args: string[],
  useShell: boolean = useGitBash,
): Promise<{ stdout: string; stderr: string }> => {
  return new Promise((resolve, reject) => {
    const shellCmd = cmd === "sf" ? "npx" : cmd;
    let actualCmd: string;
    let actualArgs: string[];

    if (useShell && useGitBash) {
      actualCmd = shellCmd;
      actualArgs = cmd === "sf" ? ["sf", ...args] : args;
    } else if (process.platform === "win32" && cmd === "sf") {
      actualCmd = process.env.comspec || "cmd.exe";
      actualArgs = ["/c", "npx", "sf", ...args];
    } else {
      actualCmd = cmd === "sf" ? "npx" : cmd;
      actualArgs = cmd === "sf" ? ["sf", ...args] : args;
    }

    if (useShell && useGitBash) {
      const commandString = [actualCmd, ...actualArgs]
        .map(shellEscape)
        .join(" ");
      console.log(`[sf command] ${commandString} (git-bash)`);
      execFile(
        gitBashPath!,
        ["-lc", commandString],
        { maxBuffer: 1024 * 1024 * 50 },
        (error, stdout, stderr) => {
          if (error) {
            const err: any = error;
            err.stdout = stdout;
            err.stderr = stderr;
            reject(err);
          } else {
            resolve({ stdout, stderr });
          }
        },
      );
      return;
    }

    const formatted = [
      actualCmd,
      ...actualArgs.map((arg) => (/\s/.test(arg) ? `"${arg}"` : arg)),
    ].join(" ");
    console.log(`[sf command] ${formatted}`);
    execFile(
      actualCmd,
      actualArgs,
      { maxBuffer: 1024 * 1024 * 50 },
      (error, stdout, stderr) => {
        if (error) {
          const err: any = error;
          err.stdout = stdout;
          err.stderr = stderr;
          reject(err);
        } else {
          resolve({ stdout, stderr });
        }
      },
    );
  });
};

export interface SfOptions {
  alias?: string;
  json?: boolean;
  useShell?: boolean;
}

const _runSf = (
  args: string[],
  options: SfOptions = {},
): Promise<{ stdout: string; stderr: string }> => {
  const sfArgs = [...args];

  if (options.alias) {
    sfArgs.push("-o", options.alias);
  }
  if (options.json) {
    sfArgs.push("--json");
  }

  return execPromise("sf", sfArgs, options.useShell ?? useGitBash);
};

export interface SfQueryResult<T = any> {
  parsed: T;
  stdout: string;
  stderr: string;
}

export const loadConfig = (configPath: string): any => {
  if (!fs.existsSync(configPath)) {
    throw new Error(
      `エラー: config.json が見つかりません。パス: ${configPath}`,
    );
  }
  try {
    const content = fs.readFileSync(configPath, "utf8");
    return JSON.parse(content);
  } catch (e) {
    throw new Error("エラー: config.json のフォーマットが不正です。");
  }
};

export class SfClient implements IFileSaver {
  private alias: string;
  private outputDir: string;
  private retrievedAt: Date;
  private runSf: (
    args: string[],
    options: SfOptions,
  ) => Promise<{ stdout: string; stderr: string }>;

  constructor(
    alias: string,
    outputDir: string,
    retrievedAt: Date,
    runSfFunc = _runSf,
  ) {
    this.alias = alias;
    this.outputDir = outputDir;
    this.retrievedAt = retrievedAt;
    this.runSf = runSfFunc;
  }

  async sfQuery<T = any>(
    query: string,
    tooling: boolean = false,
    extraArgs: string[] = [],
  ): Promise<SfQueryResult<T>> {
    const args = [
      "data",
      "query",
      ...(tooling ? ["-t"] : []),
      "-q",
      query,
      ...extraArgs,
    ];
    const result = await this.runSf(args, { alias: this.alias, json: true });
    try {
      const parsed = JSON.parse(result.stdout) as T;
      return { parsed, stdout: result.stdout, stderr: result.stderr };
    } catch (error: any) {
      const parseError = new Error(
        `sfQuery JSON parse error: ${error.message}`,
      );
      (parseError as any).stdout = result.stdout;
      (parseError as any).stderr = result.stderr;
      throw parseError;
    }
  }

  async saveQueryJsonFile(
    fileName: string,
    query: string,
    tooling: boolean = false,
    dataType?: string,
  ) {
    const queryRes = await this.sfQuery(query, tooling);
    const parsed = queryRes.parsed;
    this.saveJson(fileName, parsed, dataType);
    return parsed;
  }

  async saveSobjectListFile() {
    const fileName = SfClient.sobjectListJsonFileName;
    console.log("sObject一覧を取得中...");
    const result = await this.runSf(["sobject", "list", "--sobject", "all"], {
      alias: this.alias,
      json: true,
    });
    const parsed = JSON.parse(result.stdout);
    this.saveJson(fileName, parsed);
    console.log(`sObject一覧を取得し、output/${fileName} に保存しました。`);
    return parsed;
  }

  async saveSobjectDescribeFile(
    sobjectName: string,
    fileName?: string,
  ): Promise<any> {
    console.log(`${sobjectName} のメタデータを取得中...`);
    const result = await this.runSf(
      ["sobject", "describe", "--sobject", sobjectName],
      { alias: this.alias, json: true },
    );
    const parsed = JSON.parse(result.stdout);
    const actualFileName = fileName || `${sobjectName}-describe.json`;
    this.saveJson(actualFileName, parsed);
    console.log(
      `${sobjectName} のメタデータを取得し、output/${actualFileName} に保存しました。`,
    );
    return parsed;
  }

  loadObjectsJson(): any {
    const filePath = path.join(this.outputDir, SfClient.objectsJsonFileName);
    if (!fs.existsSync(filePath)) {
      throw new Error(
        `エラー: ${SfClient.objectsJsonFileName} が見つかりません。`,
      );
    }
    const content = fs.readFileSync(filePath, "utf8");
    return JSON.parse(content);
  }

  async saveFieldsFile(objectBlackList: string[]): Promise<any> {
    const fileName = SfClient.fieldsJsonFileName;
    const objectsData = this.loadObjectsJson();
    const objectList = objectsData?.data?.result?.records || [];

    const blackListSet = new Set(objectBlackList);
    const filteredObjectList = objectList.filter(
      (obj: any) => !blackListSet.has(obj.QualifiedApiName),
    );

    console.log("項目一覧を取得中...");
    const allFieldsData: any[] = [];

    let count = 0;
    const chunkSize = 10;
    for (let i = 0; i < filteredObjectList.length; i += chunkSize) {
      const chunk = filteredObjectList.slice(i, i + chunkSize);

      await Promise.all(
        chunk.map(async (obj: any) => {
          const objName = obj.QualifiedApiName;
          const fieldsQuery = `SELECT QualifiedApiName, Label, DataType, Length FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = '${objName}' ORDER BY QualifiedApiName`;

          try {
            const fieldsRes = await this.sfQuery(fieldsQuery);
            const fieldsParsed = fieldsRes.parsed;
            allFieldsData.push({
              objectName: objName,
              fields: fieldsParsed.result ? fieldsParsed.result.records : [],
            });
          } catch (err: any) {
            console.warn(
              `\n警告: ${objName} の項目一覧の取得に失敗しました。スキップします。`,
            );
          }
        }),
      );

      count += chunk.length;
      console.log(`取得進捗: ${count} / ${filteredObjectList.length} 完了`);
    }
    console.log("");

    this.saveJson(fileName, allFieldsData);
    console.log(
      `すべての項目一覧を取得し、output/${fileName} に保存しました。`,
    );
    return allFieldsData;
  }

  saveJson(fileName: string, data: any, dataType?: string) {
    const dataToSave: any = {
      meta: {
        retrievedAt: this.retrievedAt.toLocaleString(),
        alias: this.alias,
      },
      data: data,
    };
    if (dataType) {
      dataToSave.meta.dataType = dataType;
    }
    const outputPath = path.join(this.outputDir, fileName);
    fs.writeFileSync(outputPath, JSON.stringify(dataToSave, null, 2));
  }

  createObjectRepository() {
    return new ObjectRepository(
      this.outputDir,
      SfClient.objectsJsonFileName,
      SfClient.fieldsJsonFileName,
    ).init();
  }

  createSobjectRepository() {
    return new SobjectRepository(
      this.outputDir,
      SfClient.sobjectListJsonFileName,
    ).init(this);
  }

  async checkSfInstalled(): Promise<void> {
    try {
      await this.runSf(["--version"], {});
    } catch (error) {
      throw new Error(
        "エラー: sf コマンドが見つかりません。Salesforce CLIをインストールしてください。",
      );
    }
  }

  static sobjectListJsonFileName = "sobject-list.json";
  static objectsJsonFileName = "objects.json";
  static fieldsJsonFileName = "fields.json";
}

export class ObjectRepository {
  objects!: any;
  objectNames!: Set<string>;
  fields!: any;
  constructor(
    readonly outputDir: string,
    readonly objectsJsonFileName: string,
    readonly fieldsJsonFileName: string,
  ) {}
  init() {
    this.loadJsonData();
    return this;
  }
  loadJsonData() {
    // オブジェクト一覧の取得
    this.objects = JSON.parse(
      fs.readFileSync(
        path.join(this.outputDir, this.objectsJsonFileName),
        "utf8",
      ),
    );
    // オブジェクト名のSet作成
    this.objectNames = new Set(
      this.objects.data.result.records.map((obj: any) => obj.QualifiedApiName),
    );

    this.fields = JSON.parse(
      fs.readFileSync(
        path.join(this.outputDir, this.fieldsJsonFileName),
        "utf8",
      ),
    );
  }

  isObject(objectName: string) {
    return this.objectNames.has(objectName);
  }

  getUndefinedColumns(objectName: string, columnNames: string[]): string[] {
    const fieldsArray = this.fields?.data || this.fields;
    const objFields = Array.isArray(fieldsArray)
      ? fieldsArray.find((f: any) => f.objectName === objectName)
      : undefined;
    if (!objFields) {
      return columnNames;
    }

    const existingColumns = new Set(
      objFields.fields.map((f: any) => f.QualifiedApiName),
    );

    return columnNames.filter((col) => !existingColumns.has(col));
  }
}

export class SobjectRepository {
  obj?: any;
  list?: any[];
  qualifiedApiNameSet?: Set<string>;
  private sfClient?: SfClient;

  constructor(
    readonly outputDir: string,
    readonly fileName: string,
  ) {}

  init(sfClient?: SfClient) {
    this.sfClient = sfClient;
    this.loadJsonData();
    return this;
  }

  loadJsonData() {
    const outputPath = path.join(this.outputDir, this.fileName);
    var sobjectListData = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    this.obj = sobjectListData;
    if (
      sobjectListData &&
      sobjectListData.result &&
      sobjectListData.result.records
    ) {
      this.list = sobjectListData.result.records;
    } else if (
      sobjectListData &&
      sobjectListData.result &&
      Array.isArray(sobjectListData.result)
    ) {
      this.list = sobjectListData.result;
    } else if (Array.isArray(sobjectListData)) {
      this.list = sobjectListData;
    } else if (
      sobjectListData &&
      sobjectListData.data &&
      sobjectListData.data.result &&
      Array.isArray(sobjectListData.data.result)
    ) {
      this.list = sobjectListData.data.result;
    }

    this.qualifiedApiNameSet = new Set(
      this.list!.map((item: any) => item.QualifiedApiName || item),
    );
  }

  isSobject(qualifiedApiName: string) {
    if (!this.obj) {
      this.loadJsonData();
    }
    return this.qualifiedApiNameSet!.has(qualifiedApiName);
  }

  async getUndefinedColumns(
    sobjectName: string,
    columnNames: string[],
  ): Promise<string[]> {
    const fileName = `${sobjectName}-describe.json`;
    const filePath = path.join(this.outputDir, fileName);

    let describeData: any;

    if (fs.existsSync(filePath)) {
      describeData = JSON.parse(fs.readFileSync(filePath, "utf8"));
    } else if (this.sfClient) {
      describeData = await this.sfClient.saveSobjectDescribeFile(
        sobjectName,
        fileName,
      );
    } else {
      return columnNames;
    }

    const fieldsData =
      describeData.data?.result?.fields ||
      describeData.result?.fields ||
      describeData.fields ||
      [];
    const existingColumns = new Set(
      fieldsData.map((f: any) => f.name),
    );

    return columnNames.filter((col) => !existingColumns.has(col));
  }
}
