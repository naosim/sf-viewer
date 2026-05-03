// 設定
const CONFIG = {
  DRIVE_FOLDER_ID: '1G-irkqSLnwuQ9ZrQzLBx66tlYv4e36pp',
  SPREADSHEET_ID: '1z8ROPd3FrdwiEsuH6OA3tSv2_u6fd_TzKjiYDaOwqPE'
};

function run() {
  console.log('=== 開始 ===');

  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const folder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);

  // フォルダ内のTSVファイルを取得
  const files = folder.getFiles();
  const fileNames = [];

  while (files.hasNext()) {
    const file = files.next();
    const name = file.getName();
    if (name.endsWith('.tsv')) {
      fileNames.push({ name: name, file: file });
    }
  }

  console.log(` Found ${fileNames.length} TSV files`);

  // シート名 목록 수집
  const existingSheets = ss.getSheets().map(s => s.getName());
  console.log(` Existing sheets: ${existingSheets.join(', ')}`);

  for (const { name, file } of fileNames) {
    try {
      console.log(`\n--- Processing: ${name} ---`);
      const content = file.getBlob().getDataAsString();
      const parsed = parseFrontMatterTSV(content);

      const sheetName = parsed.meta.label || name.replace('.tsv', '');
      console.log(` Sheet name: ${sheetName}`);

      // シートの取得または作成
      let sheet = ss.getSheetByName(sheetName);
      if (sheet) {
        console.log(` Clearing existing sheet...`);
        sheet.clear();
      } else {
        console.log(` Creating new sheet...`);
        sheet = ss.insertSheet(sheetName);
      }

      // ヘッダー書き込み
      if (parsed.headers.length > 0) {
        sheet.getRange(1, 1, 1, parsed.headers.length).setValues([parsed.headers]);
        console.log(` Wrote headers: ${parsed.headers.length} columns`);
      }

      // データ書き込み
      if (parsed.rows.length > 0) {
        sheet.getRange(2, 1, parsed.rows.length, parsed.headers.length).setValues(parsed.rows);
        console.log(` Wrote ${parsed.rows.length} rows`);
      }

      console.log(` Done: ${sheetName}`);
    } catch (e) {
      console.error(` Error processing ${name}: ${e.message}`);
    }
  }

  console.log('\n--- Processing: meta.json ---');

  // meta.jsonを取得して書き込む
  const metaFiles = folder.getFilesByName('meta.json');
  if (metaFiles.hasNext()) {
    const metaFile = metaFiles.next();
    const metaContent = metaFile.getBlob().getDataAsString();
    const meta = JSON.parse(metaContent);

    console.log(` Meta: alias=${meta.alias}, retrievedAt=${meta.retrievedAt}`);

    // シートの作成またはクリア
    let metaSheet = ss.getSheetByName('meta');
    if (metaSheet) {
      metaSheet.clear();
    } else {
      metaSheet = ss.insertSheet('meta');
    }

    // データを2次元配列に変換
    const metaRows = [
      ['alias', meta.alias || ''],
      ['retrievedAt', meta.retrievedAt || '']
    ];

    if (meta.queryJobs) {
      for (const job of meta.queryJobs) {
        metaRows.push(['queryJob', JSON.stringify(job)]);
      }
    }

    metaSheet.getRange(1, 1, metaRows.length, 2).setValues(metaRows);
    console.log(` Wrote meta info: ${metaRows.length} rows`);
  } else {
    console.log(` meta.json not found`);
  }

  console.log('\n=== 完了 ===');
}

function parseFrontMatterTSV(text) {
  const lines = text.split('\n');
  const meta = {};
  const rows = [];
  let headers = [];
  let phase = 'meta';
  let metaLineCount = 0;

  for (const line of lines) {
    if (phase === 'meta') {
      if (line === '---') {
        if (metaLineCount === 0) {
          metaLineCount++;
          continue;
        } else {
          phase = 'header';
          continue;
        }
      }
      if (metaLineCount > 0 && line.trim()) {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          const key = line.substring(0, colonIndex).trim();
          const value = line.substring(colonIndex + 1).trim();
          meta[key] = value;
        }
      }
    } else if (phase === 'header') {
      if (line.trim()) {
        headers = line.split('\t').map(unescapeCell);
        phase = 'data';
      }
    } else if (phase === 'data') {
      if (line.trim()) {
        rows.push(line.split('\t').map(unescapeCell));
      }
    }
  }

  return { meta, headers, rows };
}

function unescapeCell(value) {
  return value.replace(/\\t/g, '\t').replace(/\\n/g, '\n');
}