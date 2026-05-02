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

export const runSf = (
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

  constructor(alias: string, outputDir: string, retrievedAt: Date) {
    this.alias = alias;
    this.outputDir = outputDir;
    this.retrievedAt = retrievedAt;
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
    const result = await runSf(args, { alias: this.alias, json: true });
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

  async saveSobjectListFile(fileName: string = "sobject-list.json") {
    console.log("sObject一覧を取得中...");
    const result = await runSf(["sobject", "list", "--sobject", "all"], {
      alias: this.alias,
      json: true,
    });
    const parsed = JSON.parse(result.stdout);
    this.saveJson(fileName, parsed);
    console.log(`sObject一覧を取得し、output/${fileName} に保存しました。`);
    return parsed;
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

  createSobjectRepository(fileName: string) {
    return new SobjectRepository(this.outputDir, fileName);
  }

  static async checkSfInstalled(): Promise<void> {
    try {
      await runSf(["--version"]);
    } catch (error) {
      throw new Error(
        "エラー: sf コマンドが見つかりません。Salesforce CLIをインストールしてください。",
      );
    }
  }
}

export class SobjectRepository {
  private outputDir: string;
  private fileName: string;
  obj?: any;
  list?: any[];
  qualifiedApiNameSet?: Set<string>;

  constructor(outputDir: string, fileName: string) {
    this.outputDir = outputDir;
    this.fileName = fileName;
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
    // console.log("obj", this.obj);
    // console.log("list", this.list);
    // console.log("qualifiedApiNameSet", this.qualifiedApiNameSet);
    return this.qualifiedApiNameSet!.has(qualifiedApiName);
  }
}
