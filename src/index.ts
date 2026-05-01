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

const normalizeNodeId = (value: string): string => {
  return `node_${value.replace(/[^a-zA-Z0-9_]/g, '_')}`;
};

const escapeMermaidLabel = (value: string | undefined | null): string => {
  if (!value) return '';
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, '\\n');
};

const loadJsonFile = <T>(filePath: string): T => {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
};

const normalizeToArray = <T>(value: T | T[] | undefined | null): T[] => {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
};

const listFilesRecursively = (dir: string): string[] => {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? listFilesRecursively(fullPath) : [fullPath];
  });
};

// コマンドを実行するためのヘルパー関数
const execPromise = (cmd: string, args: string[], useShell: boolean = useGitBash): Promise<{ stdout: string; stderr: string }> => {
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

async function main() {
  const onlyFlows = process.argv.includes('--only-flows') || process.argv.includes('--flow-only');
  if (onlyFlows) {
    console.log('--- 処理1: Flow取得以降のみを実行します ---');
  } else {
    console.log('--- 処理1: Salesforceからのデータ取得を開始します ---');
  }

  // 1. sfコマンドの有無を確認
  try {
    await execPromise('sf', ['--version']);
  } catch (error) {
    console.error('エラー: sf コマンドが見つかりません。Salesforce CLIをインストールしてください。');
    process.exit(1);
  }

  // 2. config.jsonの読み込み
  const configPath = path.join(__dirname, '../config.json');
  if (!fs.existsSync(configPath)) {
    console.error(`エラー: config.json が見つかりません。パス: ${configPath}`);
    process.exit(1);
  }

  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (e) {
    console.error('エラー: config.json のフォーマットが不正です。');
    process.exit(1);
  }

  const alias = config.alias;
  if (!alias) {
    console.error('エラー: config.json に alias が設定されていません。');
    process.exit(1);
  }
  console.log(`対象エイリアス: ${alias}`);

  const outputDir = path.join(__dirname, '../output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  try {
    if (!onlyFlows) {
      try {
        // 3. オブジェクト一覧の取得
        console.log('オブジェクト一覧を取得中...');
        const objectsQuery = `SELECT QualifiedApiName, Label, DeveloperName FROM EntityDefinition WHERE IsCustomizable = true ORDER BY QualifiedApiName`;
        const objectsRes = await execPromise('sf', ['data', 'query', '-q', objectsQuery, '-o', alias, '--json']);
        const objectsData = JSON.parse(objectsRes.stdout);
        
        // そのまま保存
        const objectsOutputPath = path.join(outputDir, 'objects.json');
        fs.writeFileSync(objectsOutputPath, JSON.stringify(objectsData, null, 2));
        console.log(`オブジェクト一覧を取得し、output/objects.json に保存しました。（計 ${objectsData.result.totalSize} 件）`);

        // 4. 項目一覧の取得
        console.log('項目一覧を取得中...');
        const objectList = objectsData.result.records;
        const allFieldsData: any[] = [];

        let count = 0;
        
        // 連続でAPIを叩くと時間がかかるため、10件ずつの並行処理（チャンク）で実行
        const chunkSize = 10;
        for (let i = 0; i < objectList.length; i += chunkSize) {
          const chunk = objectList.slice(i, i + chunkSize);
          
          await Promise.all(chunk.map(async (obj: any) => {
            const objName = obj.QualifiedApiName;
            const fieldsQuery = `SELECT QualifiedApiName, Label, DataType, Length FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = '${objName}' ORDER BY QualifiedApiName`;
            
            try {
              const fieldsRes = await execPromise('sf', ['data', 'query', '-q', fieldsQuery, '-o', alias, '--json']);
              const fieldsParsed = JSON.parse(fieldsRes.stdout);
              allFieldsData.push({
                objectName: objName,
                fields: fieldsParsed.result ? fieldsParsed.result.records : []
              });
            } catch (err: any) {
              // 取得できないオブジェクトがある場合は警告を出してスキップ
              console.warn(`\n警告: ${objName} の項目一覧の取得に失敗しました。スキップします。`);
            }
          }));
          
          count += chunk.length;
          process.stdout.write(`\r取得進捗: ${count} / ${objectList.length} 完了`);
        }
        console.log(''); // 改行

        // そのまま保存
        const fieldsOutputPath = path.join(outputDir, 'fields.json');
        fs.writeFileSync(fieldsOutputPath, JSON.stringify(allFieldsData, null, 2));
        console.log('すべての項目一覧を取得し、output/fields.json に保存しました。');
      } catch (error: any) {
        console.error('データ取得中にエラーが発生しました:');
        if (error.message) console.error('Message:', error.message);
        if (error.stdout) console.error('STDOUT:', error.stdout);
        if (error.stderr) console.error('STDERR:', error.stderr);
        process.exit(1);
      }
    }

    console.log('FlowDefinition一覧を取得中...');
    const flowDefsQuery = `SELECT Id, DeveloperName, MasterLabel, ActiveVersionId, LatestVersionId FROM FlowDefinition ORDER BY DeveloperName`;
    try {
      const flowDefsRes = await execPromise('sf', ['data', 'query', '-q', flowDefsQuery, '-t', '-o', alias, '--json']);
      const flowDefsParsed = JSON.parse(flowDefsRes.stdout);
      const flowDefsOutputPath = path.join(outputDir, 'flowDefinitions.json');
      const flowDefsRecords = flowDefsParsed.result ? flowDefsParsed.result.records : [];
      fs.writeFileSync(flowDefsOutputPath, JSON.stringify(flowDefsRecords, null, 2));
      const flowDefsCount = flowDefsParsed.result ? flowDefsParsed.result.totalSize : 0;
      console.log(`FlowDefinition一覧を取得し、output/flowDefinitions.json に保存しました。（計 ${flowDefsCount} 件）`);
    } catch (err: any) {
      console.error('\n警告: FlowDefinition一覧の取得に失敗しました。');
      if (err.stdout) console.error('STDOUT:', err.stdout);
      else console.error('Error:', err.message);
    }

    console.log('フロー一覧（レコードとして）を取得中...');
    const flowsQuery = `SELECT Id, Name, FlowLabel, ApiName, ProgressStatus, IsPaused, FlowType, FlowDefinition, CreatedDate, LastModifiedDate FROM FlowRecord LIMIT 200`;
    try {
      const flowsRes = await execPromise('sf', ['data', 'query', '-q', flowsQuery, '-o', alias, '--json']);
      const flowsParsed = JSON.parse(flowsRes.stdout);
      
      const flowsOutputPath = path.join(outputDir, 'flows.json');
      const flows = flowsParsed.result ? flowsParsed.result.records : [];
      fs.writeFileSync(flowsOutputPath, JSON.stringify(flows, null, 2));
      const flowsCount = flowsParsed.result ? flowsParsed.result.totalSize : 0;
      console.log(`フロー一覧を取得し、output/flows.json に保存しました。（計 ${flowsCount} 件）`);
    } catch (err: any) {
      console.error('\n警告: FlowDefinition一覧の取得に失敗しました。');
      if (err.stdout) console.error('STDOUT:', err.stdout);
      else console.error('Error:', err.message);
    }

    // 6. 定期起動ジョブ（CronTrigger）の取得
    console.log('定期起動ジョブ一覧（CronTrigger）を取得中...');
    const cronQuery = `SELECT Id, CronExpression, NextFireTime, PreviousFireTime, State, CronJobDetail.Name, CronJobDetail.JobType FROM CronTrigger ORDER BY NextFireTime`;
    try {
      const cronRes = await execPromise('sf', ['data', 'query', '-q', cronQuery, '-o', alias, '--json']);
      const cronParsed = JSON.parse(cronRes.stdout);
      
      const cronOutputPath = path.join(outputDir, 'cronJobs.json');
      fs.writeFileSync(cronOutputPath, JSON.stringify(cronParsed.result ? cronParsed.result.records : [], null, 2));
      const cronCount = cronParsed.result ? cronParsed.result.totalSize : 0;
      console.log(`定期起動ジョブ一覧を取得し、output/cronJobs.json に保存しました。（計 ${cronCount} 件）`);
    } catch (err: any) {
      console.error('\n警告: 定期起動ジョブ一覧の取得に失敗しました。');
      if (err.stdout) console.error('STDOUT:', err.stdout);
      else console.error('Error:', err.message);
    }

    console.log('--- 処理1: 完了 ---');
  } catch (error: any) {
    console.error('データ取得中にエラーが発生しました:');
    if (error.message) console.error('Message:', error.message);
    if (error.stdout) console.error('STDOUT:', error.stdout);
    if (error.stderr) console.error('STDERR:', error.stderr);
    process.exit(1);
  }
}

main();
