function run() {
  // 設定チェック
  if (CONFIG.DRIVE_FOLDER_ID === 'YOUR_DRIVE_FOLDER_ID' || CONFIG.SPREADSHEET_ID === 'YOUR_SPREADSHEET_ID') {
    throw new Error('エラー: config.gs の DRIVE_FOLDER_ID と SPREADSHEET_ID を正しく設定してください。');
  }

  console.log('=== 開始 ===');

  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const folder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);

  // フォルダ内のTSVファイルを取得
  const files = folder.getFiles();
  const fileNames = [];

  while (files.hasNext()) {
    const file = files.next();
    const name = file.getName();
    if (name.endsWith('.tsv') || name.endsWith('.md')) {
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
      const isMarkdown = name.endsWith('.md');

      let parsed;
      let sheetName;

      if (isMarkdown) {
        parsed = parseFrontMatterMarkdown(content);
        sheetName = parsed.meta.label || name.replace('.md', '');
      } else {
        parsed = parseFrontMatterTSV(content);
        sheetName = parsed.meta.label || name.replace('.tsv', '');
      }

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

      // メタ情報を1行目から順に書き込み
      const metaRows = Object.entries(parsed.meta).map(([key, value]) => [key, value]);
      if (metaRows.length > 0) {
        sheet.getRange(1, 1, metaRows.length, 2).setValues(metaRows);
        console.log(` Wrote ${metaRows.length} metadata entries`);
      }

      const metaRowCount = metaRows.length;

      if (isMarkdown) {
        // Markdown: contentを2列以上に書き込み
        // A列: #で始まる行, B列以降: テーブル cells またはその他
        const dataStartRow = metaRowCount + 1;

        if (parsed.content && parsed.content.length > 0) {
          const contentRows = parsed.content
            .map(line => {
              // ヘッダー行 (#で始まる)
              if (line.startsWith('#')) {
                return [line, ''];
              }

              // テーブルセパレーターをスキップ
              if (isTableSeparator(line)) {
                return null;
              }

              // テーブル行（|を含む）
              if (line.includes('|')) {
                const cells = line.split('|')
                  .map(cell => cell.trim())
                  .filter((_, i) => i !== 0 && i !== line.split('|').length - 1);
                return ['', ...cells];
              }

              // 通常行（|を含まない）
              return ['', line];
            })
            .filter(row => row !== null);

          // 最大列数を取得
          const maxCols = contentRows.reduce((max, row) => Math.max(max, row.length), 0);

          // 列数が少ない行は空文字で埋める
          const paddedRows = contentRows.map(row => {
            while (row.length < maxCols) {
              row.push('');
            }
            return row;
          });

          sheet.getRange(dataStartRow, 1, paddedRows.length, maxCols).setValues(paddedRows);
          console.log(` Wrote ${paddedRows.length} content rows`);
        }
      } else {
        // TSV: 既存の処理
        const headerRow = metaRowCount + 1;
        const dataStartRow = headerRow + 1;

        // ヘッダー書き込み
        if (parsed.headers.length > 0) {
          sheet.getRange(headerRow, 1, 1, parsed.headers.length).setValues([parsed.headers]);
          console.log(` Wrote headers: ${parsed.headers.length} columns`);
        }

        // データ書き込み
        if (parsed.rows.length > 0) {
          sheet.getRange(dataStartRow, 1, parsed.rows.length, parsed.headers.length).setValues(parsed.rows);
          console.log(` Wrote ${parsed.rows.length} rows`);
        }
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

function parseFrontMatterMarkdown(text) {
  const lines = text.split('\n');
  const meta = {};
  const content = [];
  let phase = 'meta';
  let metaLineCount = 0;

  for (const line of lines) {
    if (phase === 'meta') {
      if (line === '---') {
        if (metaLineCount === 0) {
          metaLineCount++;
          continue;
        } else {
          phase = 'content';
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
    } else if (phase === 'content') {
      content.push(line);
    }
  }

  return { meta, content };
}

function isTableSeparator(line) {
  const cells = line.split('|');
  if (cells.length < 3) return false;
  return cells.every(cell => {
    const trimmed = cell.trim();
    return trimmed === '' || trimmed === '-' || trimmed.startsWith(':') || /^-+$/.test(trimmed);
  });
}