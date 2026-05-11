import { execFile } from "child_process";
import * as fs from "fs";
import * as path from "path";

export const formatTimestamp = (date: Date): string => {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}_${String(date.getHours()).padStart(2, "0")}${String(date.getMinutes()).padStart(2, "0")}${String(date.getSeconds()).padStart(2, "0")}`;
};

export const normalizeToArray = <T>(value: T | T[] | undefined | null): T[] => {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
};

function findGitBashPath(): string | undefined {
  if (process.platform !== "win32") {
    return undefined;
  }

  const gitBashPath = "C:\\Program Files\\Git\\bin\\bash.exe";
  if (fs.existsSync(gitBashPath)) {
    return gitBashPath;
  }

  const gitBashPathX86 = "C:\\Program Files (x86)\\Git\\bin\\bash.exe";
  if (fs.existsSync(gitBashPathX86)) {
    return gitBashPathX86;
  }

  return undefined;
}

const gitBashPath = findGitBashPath();
const useGitBash = !!gitBashPath;

const shellEscape = (value: string): string => {
  return `'${value.replace(/'/g, `'\\''`)}'`;
};

export interface IFileSaver {
  saveJson(fileName: string, data: any): void;
}

interface CommandExecutor {
  cmd: string;
  args: string[];
  logMessage: string;
}

type ExecutorCreator = (cmd: string, args: string[]) => CommandExecutor;

function createGitBashExecutor(cmd: string, args: string[]): CommandExecutor {
  const commandString = [cmd, ...args].map(shellEscape).join(" ");
  return {
    cmd: gitBashPath!,
    args: ["-lc", commandString],
    logMessage: `[sf command] ${commandString} (git-bash)`,
  };
}

function createCmdExecutor(cmd: string, args: string[]): CommandExecutor {
  const formattedArgs = args.map((arg) => (/\s/.test(arg) ? `"${arg}"` : arg)).join(" ");
  const commandString = `${cmd} ${formattedArgs}`;
  return {
    cmd: process.env.comspec || "cmd.exe",
    args: ["/c", cmd, ...args],
    logMessage: `[sf command] ${commandString} (cmd)`,
  };
}

function createShellExecutor(cmd: string, args: string[]): CommandExecutor {
  const formattedArgs = args.map((arg) => (/\s/.test(arg) ? `"${arg}"` : arg)).join(" ");
  const commandString = `${cmd} ${formattedArgs}`;
  return {
    cmd: cmd,
    args: args,
    logMessage: `[sf command] ${commandString}`,
  };
}

const executorCreator: ExecutorCreator = gitBashPath
  ? createGitBashExecutor
  : process.platform === "win32"
    ? createCmdExecutor
    : createShellExecutor;

export const execPromise = (
  cmd: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> => {
  return new Promise((resolve, reject) => {
    const effectiveCmd = cmd === "sf" ? "npx" : cmd;
    const effectiveArgs = cmd === "sf" ? ["sf", ...args] : args;
    const executor = executorCreator(effectiveCmd, effectiveArgs);
    console.log(executor.logMessage);

    execFile(
      executor.cmd,
      executor.args,
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

  return execPromise("sf", sfArgs);
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
  private options?: any;
  private baseUrl?: string;
  private runSf: (
    args: string[],
    options: SfOptions,
  ) => Promise<{ stdout: string; stderr: string }>;

  constructor(
    alias: string,
    outputDir: string,
    retrievedAt: Date,
    options?: any,
    runSfFunc = _runSf,
  ) {
    this.alias = alias;
    this.outputDir = outputDir;
    this.retrievedAt = retrievedAt;
    this.options = options;
    this.runSf = runSfFunc;
  }

  getAlias(): string {
    return this.alias;
  }

  getBaseUrlSync(): string | undefined {
    return this.baseUrl;
  }

  getOptions(): any | undefined {
    return this.options;
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

  async saveMetadataFieldsFile(objectNames: string[]): Promise<any> {
    const fileName = "sobjectFields.json";
    console.log("メタデータオブジェクトのフィールドを取得中...");

    const allMetadataFields: any[] = [];

    const chunkSize = 10;
    for (let i = 0; i < objectNames.length; i += chunkSize) {
      const chunk = objectNames.slice(i, i + chunkSize);

      await Promise.all(
        chunk.map(async (objName: string) => {
          try {
            const result = await this.runSf(
              ["sobject", "describe", "--sobject", objName],
              { alias: this.alias, json: true },
            );
            const debugFileName = `debug_${objName}_describe.json`;
            this.saveJson(debugFileName, JSON.parse(result.stdout));
            console.log(`  ${objName} のレスポンスを output/${debugFileName} に保存しました`);

            const referenceDir = path.join(__dirname, "../spec-reference");
            if (!fs.existsSync(referenceDir)) {
              fs.mkdirSync(referenceDir, { recursive: true });
            }
            fs.writeFileSync(
              path.join(referenceDir, debugFileName),
              result.stdout,
            );
            console.log(`  ${objName} のレスポンスを spec-reference/${debugFileName} に保存しました`);

            const parsed = JSON.parse(result.stdout);
            const fields = parsed.result?.fields || [];
            allMetadataFields.push({
              objectName: objName,
              fields: fields.map((f: any) => ({
                name: f.name,
                label: f.label,
                type: f.type,
              })),
            });
            console.log(`  ${objName}: ${fields.length} fields`);
          } catch (err) {
            console.warn(`  警告: ${objName} のメタデータ取得に失敗しました。`);
          }
        }),
      );
    }

    this.saveJson(fileName, allMetadataFields);
    console.log(
      `メタデータオブジェクトのフィールドを取得し、output/${fileName} に保存しました。（${allMetadataFields.length} オブジェクト）`,
    );
    return allMetadataFields;
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
    if (this.baseUrl !== undefined) {
      dataToSave.meta.base_url = this.baseUrl;
    }
    if (this.options !== undefined) {
      dataToSave.meta.options = this.options;
    }
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

  async getBaseUrl(): Promise<string> {
    const result = await this.runSf(["org", "display"], { alias: this.alias, json: true });
    const parsed = JSON.parse(result.stdout);
    if (parsed.status !== 0) {
      throw new Error(`sf org display の実行に失敗しました: ${JSON.stringify(parsed.warnings || parsed.message || 'Unknown error')}`);
    }
    const instanceUrl = parsed.result?.instanceUrl;
    if (!instanceUrl) {
      throw new Error(`エラー: sf org display の結果に instanceUrl が見つかりません。`);
    }
    this.baseUrl = instanceUrl;
    return instanceUrl;
  }

  static sobjectListJsonFileName = "sobject-list.json";
  static objectsJsonFileName = "objects.json";
  static fieldsJsonFileName = "fields.json";
  static sobjectFieldsJsonFileName = "sobjectFields.json";
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
