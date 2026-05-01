import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const isWindows = process.platform === 'win32';
const gitBashPath = isWindows ? (
  fs.existsSync('C:\\Program Files\\Git\\bin\\bash.exe') ? 'C:\\Program Files\\Git\\bin\\bash.exe' :
  fs.existsSync('C:\\Program Files (x86)\\Git\\bin\\bash.exe') ? 'C:\\Program Files (x86)\\Git\\bin\\bash.exe' :
  undefined
) : undefined;
const useGitBash = !!gitBashPath;

const shellEscape = (value: string): string => {
  return `'${value.replace(/'/g, `'\\''`)}'`;
};

// 汎用コマンド実行ヘルパー
export const execPromise = (cmd: string, args: string[], useShell: boolean = useGitBash): Promise<{ stdout: string; stderr: string }> => {
  return new Promise((resolve, reject) => {
    const shellCmd = cmd === 'sf' ? 'npx' : cmd;
    let actualCmd: string;
    let actualArgs: string[];

    if (useShell && useGitBash) {
      actualCmd = shellCmd;
      actualArgs = cmd === 'sf' ? ['sf', ...args] : args;
    } else if (process.platform === 'win32' && cmd === 'sf') {
      actualCmd = process.env.comspec || 'cmd.exe';
      actualArgs = ['/c', 'npx', 'sf', ...args];
    } else {
      actualCmd = cmd === 'sf' ? 'npx' : cmd;
      actualArgs = cmd === 'sf' ? ['sf', ...args] : args;
    }

    if (useShell && useGitBash) {
      const commandString = [actualCmd, ...actualArgs].map(shellEscape).join(' ');
      console.log(`[sf command] ${commandString} (git-bash)`);
      execFile(gitBashPath!, ['-lc', commandString], { maxBuffer: 1024 * 1024 * 50 }, (error, stdout, stderr) => {
        if (error) {
          const err: any = error;
          err.stdout = stdout;
          err.stderr = stderr;
          reject(err);
        } else {
          resolve({ stdout, stderr });
        }
      });
      return;
    }

    const formatted = [actualCmd, ...actualArgs.map(arg => /\s/.test(arg) ? `"${arg}"` : arg)].join(' ');
    console.log(`[sf command] ${formatted}`);
    execFile(actualCmd, actualArgs, { maxBuffer: 1024 * 1024 * 50 }, (error, stdout, stderr) => {
      if (error) {
        const err: any = error;
        err.stdout = stdout;
        err.stderr = stderr;
        reject(err);
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
};

export interface SfOptions {
  alias?: string;
  json?: boolean;
  useShell?: boolean;
}

export const runSf = (args: string[], options: SfOptions = {}): Promise<{ stdout: string; stderr: string }> => {
  const sfArgs = [...args];

  if (options.alias) {
    sfArgs.push('-o', options.alias);
  }
  if (options.json) {
    sfArgs.push('--json');
  }

  return execPromise('sf', sfArgs, options.useShell ?? useGitBash);
};

export interface SfQueryResult<T = any> {
  parsed: T;
  stdout: string;
  stderr: string;
}

export const sfQuery = async <T = any>(alias: string, query: string, tooling: boolean = false, extraArgs: string[] = []): Promise<SfQueryResult<T>> => {
  const args = ['data', 'query', ...(tooling ? ['-t'] : []), '-q', query, ...extraArgs];
  const result = await runSf(args, { alias, json: true });
  try {
    const parsed = JSON.parse(result.stdout) as T;
    return { parsed, stdout: result.stdout, stderr: result.stderr };
  } catch (error: any) {
    const parseError = new Error(`sfQuery JSON parse error: ${error.message}`);
    (parseError as any).stdout = result.stdout;
    (parseError as any).stderr = result.stderr;
    throw parseError;
  }
};

export const saveQueryJsonFile = async (outputDir: string, fileName: string, alias: string, query: string, tooling: boolean = false) => {
  const queryRes = await sfQuery(alias, query, tooling);
  const parsed = queryRes.parsed;
  const outputPath = path.join(outputDir, fileName);
  fs.writeFileSync(outputPath, JSON.stringify(parsed, null, 2));
  return parsed;
};

export const saveSobjectListFile = async (outputDir: string, alias: string, fileName: string = 'sobject-list.json') => {
  console.log('sObject一覧を取得中...');
  const result = await runSf(['sobject', 'list', '--sobject', 'all'], { alias, json: true });
  const parsed = JSON.parse(result.stdout);
  const outputPath = path.join(outputDir, fileName);
  fs.writeFileSync(outputPath, JSON.stringify(parsed, null, 2));
  console.log(`sObject一覧を取得し、output/${fileName} に保存しました。`);
  return parsed;
};
