function initViewer(tsvDataList, mdDataList, meta, tabs) {
  const MAX_UNIQUE_VALUES_DISPLAY = 30;

  // タイムゾーン情報を取得して表示
  const timezoneName = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const tzOffset = new Date().getTimezoneOffset();
  const sign = tzOffset >= 0 ? '-' : '+';
  const hours = String(Math.abs(Math.floor(tzOffset / 60))).padStart(2, '0');
  const timezoneInfo = `${timezoneName} (UTC${sign}${hours})`;
  document.querySelectorAll('.timezone-info').forEach(el => {
    el.textContent = timezoneInfo;
  });

  mermaid.initialize({ startOnLoad: false });

  document.getElementById('alias').textContent = meta.alias || '';
  document.getElementById('retrievedAt').textContent = meta.retrievedAt || '';

  const tabsContainer = document.getElementById('tabs');
  const dataMap = {};
  tsvDataList.forEach(d => dataMap[d.name] = { ...d, type: 'tsv' });
  mdDataList.forEach(d => dataMap[d.name] = { ...d, type: 'markdown' });

  tabs.forEach((fileName, i) => {
    const data = dataMap[fileName];
    if (!data) return;

    const tab = document.createElement('div');
    tab.className = 'tab' + (i === 0 ? ' active' : '');
    tab.textContent = data.meta.label || fileName.replace('.tsv', '').replace('.md', '');
    tab.dataset.file = fileName;
    tab.dataset.type = data.type;
    tab.onclick = () => switchTab(fileName, data.type);
    tabsContainer.appendChild(tab);
  });

  let activeTable = null;
  let currentFilterText = "";

  function parseAndEvaluateFilter(expr, data) {
    let parsed = expr;

    // DateTime() / Date() 関数を変換
    const dateTimeRegex = /(?:DateTime|Date)\(['"]([^'"]+)['"]\)/gi;
    let invalidDates = [];
    parsed = parsed.replace(dateTimeRegex, (match, dateStr) => {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        invalidDates.push(dateStr);
        return 'null';
      }
      return `new Date('${dateStr}')`;
    });

    // Invalid 日付がある場合は警告表示してフィルターをクリア
    if (invalidDates.length > 0) {
      showToast(`無効な日付: ${invalidDates.join(', ')}`);
      if (activeTable) {
        activeTable.clearFilter();
      }
      return true;
    }

    // Date/DateTime と ==, != の組み合わせを检测
    const hasDate = expr.includes('DateTime(') || expr.includes('Date(');
    const hasEqNe = /==|!=/.test(expr);
    if (hasDate && hasEqNe) {
      showToast('日付の ==, != は未対応です。範囲指定を使用してください。');
      if (activeTable) {
        activeTable.clearFilter();
      }
      return true;
    }

    parsed = parsed.replace(/(\w+)\s+IN\s*\(([^)]+)\)/gi, (match, col, values) => {
      const list = values.split(',').map(v => v.trim().replace(/['"]/g, ''));
      return `[${list.map(v => `'${v}'`).join(',')}].includes(__COL__)`.replace('__COL__', col);
    });

    parsed = parsed.replace(/(\w+)\s+NOT\s+IN\s*\(([^)]+)\)/gi, (match, col, values) => {
      const list = values.split(',').map(v => v.trim().replace(/['"]/g, ''));
      return `![${list.map(v => `'${v}'`).join(',')}].includes(__COL__)`.replace('__COL__', col);
    });

    parsed = parsed.replace(/(\w+)\s+LIKE\s+['"]([^'"]+)['"]/gi, (match, col, pattern) => {
      const isStart = pattern.startsWith('%');
      const isEnd = pattern.endsWith('%');
      const text = pattern.replace(/%/g, '');
      if (isStart && isEnd) return `__COL__.includes('${text}')`.replace('__COL__', col);
      if (isStart) return `__COL__.endsWith('${text}')`.replace('__COL__', col);
      if (isEnd) return `__COL__.startsWith('${text}')`.replace('__COL__', col);
      return `__COL__.includes('${text}')`.replace('__COL__', col);
    });

    parsed = parsed.replace(/(\w+)\s+IS\s+NULL/gi, '__COL__ == null'.replace('__COL__', '$1'));
    parsed = parsed.replace(/(\w+)\s+IS\s+NOT\s+NULL/gi, '__COL__ != null'.replace('__COL__', '$1'));

    parsed = parsed.replace(/\bAND\b/gi, '&&').replace(/\bOR\b/gi, '||');

    parsed = parsed.replace(/\b([A-Za-z_][A-Za-z0-9_]*)\b/g, (match) => {
      if (data.hasOwnProperty(match)) {
        return `data.${match}`;
      }
      return match;
    });

    // 左辺（日付列）をDateに変換 - 列参照を置換後に処理
    const hasDateTime = expr.includes('DateTime(') || expr.includes('Date(');
    if (hasDateTime) {
      const comparisonMatch = expr.replace(dateTimeRegex, '').match(/([A-Za-z_][A-Za-z0-9_]*)\s*(>=?|==|!=|<=?)/);
      if (comparisonMatch && comparisonMatch[1]) {
        const colName = comparisonMatch[1];
        parsed = parsed.replace(`data.${colName}`, `(new Date(data.${colName}))`);
      }
    }

    try {
      return new Function('data', `try { return (${parsed}); } catch(e) { return false; }`)(data);
    } catch (e) {
      return true;
    }
  }

  function applyFilter(filterText) {
    currentFilterText = filterText;
    const errorEl = document.getElementById('filterError');
    errorEl.textContent = '';

    if (!filterText.trim()) {
      if (activeTable) {
        activeTable.clearFilter();
      }
      return;
    }

    if (!activeTable) return;

    const filterFunc = (data) => parseAndEvaluateFilter(filterText, data);
    activeTable.setFilter(filterFunc);
  }

  function showColumnInfo(header, apiName, label) {
    const modal = document.getElementById('columnInfoModal');
    document.getElementById('modalColumnName').innerHTML = header.replace(/\n/g, '<br>');
    document.getElementById('columnApiName').textContent = `API名: ${apiName}`;
    document.getElementById('columnLabel').textContent = `ラベル: ${label}`;

    const uniqueValues = [...new Set(activeTable.getData().map(row => row[header]))]
      .filter(v => v && v.trim());

    const valuesSection = document.querySelector('.column-info-section:nth-child(2)');
    const createInBtn = document.getElementById('createInClause');

    if (uniqueValues.length > MAX_UNIQUE_VALUES_DISPLAY) {
      valuesSection.style.display = 'none';
      createInBtn.style.display = 'none';
    } else {
      valuesSection.style.display = 'block';
      const ul = document.getElementById('columnValues');
      ul.innerHTML = uniqueValues.map(v => `<li>${v}</li>`).join('');

      if (uniqueValues.length > 0) {
        createInBtn.style.display = 'inline-block';
        createInBtn.onclick = () => {
          const inClause = `${apiName} IN (${uniqueValues.map(v => `'${v}'`).join(', ')})`;
          navigator.clipboard.writeText(inClause).then(() => {
            showToast('IN句をクリップボードにコピーしました');
          });
        };
      } else {
        createInBtn.style.display = 'none';
      }
    }

    modal.style.display = 'block';
  }

  function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 2000);
  }

  document.getElementById('modalClose').onclick = () => {
    document.getElementById('columnInfoModal').style.display = 'none';
  };

  window.onclick = (e) => {
    const modal = document.getElementById('columnInfoModal');
    if (e.target === modal) {
      modal.style.display = 'none';
    }
  };

  document.getElementById('filterBtn').addEventListener('click', () => {
    const filterText = document.getElementById('filterInput').value;
    applyFilter(filterText);
  });

  document.getElementById('filterClear').addEventListener('click', () => {
    document.getElementById('filterInput').value = '';
    applyFilter('');
  });

  document.getElementById('filterHelpBtn').addEventListener('click', () => {
    document.getElementById('filterHelpModal').style.display = 'block';
  });

  document.getElementById('filterHelpClose').onclick = () => {
    document.getElementById('filterHelpModal').style.display = 'none';
  };

  window.onclick = (e) => {
    const filterHelpModal = document.getElementById('filterHelpModal');
    if (e.target === filterHelpModal) {
      filterHelpModal.style.display = 'none';
    }
  };

  document.getElementById('filterInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      applyFilter(e.target.value);
    }
  });

  function inferAndConvert(value) {
    if (!value || value.trim() === '') return null;

    const v = value.trim();

    if (v.toLowerCase() === 'true') return true;
    if (v.toLowerCase() === 'false') return false;

    if (!isNaN(v) && v !== '') return Number(v);

    return v;
  }

  function loadTable(fileName) {
    const data = tsvDataList.find(d => d.name === fileName);
    if (!data) return;

    document.getElementById('markdown').style.display = 'none';
    document.getElementById('table').style.display = '';

    const tableData = data.rows.map(row => {
      const obj = {};
      data.headers.forEach((header, i) => {
        const converted = inferAndConvert(row[i]);
        obj[header] = converted;
        const parts = header.split('\n');
        if (parts[1]) obj[parts[1]] = converted;
      });
      return obj;
    });

    if (activeTable) {
      activeTable.destroy();
    }

    const headerHeight = document.querySelector("header").offsetHeight;
    const tabsHeight = document.querySelector(".tabs").offsetHeight;
    const filterHeight = document.querySelector(".filter-bar").offsetHeight;
    const tableHeight = `calc(100vh - ${headerHeight + tabsHeight + filterHeight + 30}px)`;

    activeTable = new Tabulator("#table", {
      data: tableData,
      layout: "fitDataFill",
      height: tableHeight,
      rowHeader: {
        formatter: "rownum",
        headerSort: false,
        hozAlign: "center",
        resizable: false,
        frozen: true,
        width: 40,
      },
      selectable: true,
      selectableRange: 1,
      selectableRangeColumns: true,
      selectableRangeRows: true,
      selectableRangeClearCells: true,
      clipboard: true,
      clipboardCopyStyled: false,
      clipboardCopyRowRange: "range",
      clipboardCopySelector: "active",
      clipboardCopyConfig: {
        rowHeaders: false,
        columnHeaders: false,
      },
      multiSelect: true,
      columns: data.headers.map(header => {
        const parts = header.split('\n');
        const apiName = parts[1] || parts[0];
        const label = parts[0] || '';
        return {
          title: header.replace(/\n/g, '<br>'),
          field: header,
          sortable: true,
          selectable: true,
          headerFormatter: (cell, formatterParams, onRendered) => {
            const container = document.createElement('div');
            container.style.display = 'flex';
            container.style.alignItems = 'center';
            container.style.justifyContent = 'space-between';
            container.style.width = '100%';
            
            const titleSpan = document.createElement('span');
            titleSpan.innerHTML = header.replace(/\n/g, '<br>');
            container.appendChild(titleSpan);
            
            const infoBtn = document.createElement('span');
            infoBtn.className = 'column-info-btn';
            infoBtn.innerHTML = '&#9432;';
            infoBtn.dataset.header = header;
            infoBtn.dataset.api = apiName;
            infoBtn.dataset.label = label;
            container.appendChild(infoBtn);
            
            return container;
          },
          formatterClipboard: (cell, type) => {
            if (type === 'clipboard') {
              return cell.getValue();
            }
            return cell.getValue();
          },
        };
      }),
    });

    document.getElementById('table').addEventListener('click', (e) => {
      if (e.target.classList.contains('column-info-btn')) {
        const header = e.target.dataset.header;
        const apiName = e.target.dataset.api;
        const label = e.target.dataset.label;
        showColumnInfo(header, apiName, label);
      }
    });

    if (currentFilterText.trim()) {
      applyFilter(currentFilterText);
    }
  }

  function loadMarkdown(fileName) {
    const data = mdDataList.find(d => d.name === fileName);
    if (!data) {
      console.error('Markdown data not found:', fileName);
      return;
    }

    if (activeTable) {
      activeTable.destroy();
      activeTable = null;
    }

    document.getElementById('table').style.display = 'none';
    const mdDiv = document.getElementById('markdown');
    mdDiv.style.display = 'block';

    try {
      // markedの設定：codeブロックをmermaidとして扱う
      const htmlContent = marked.parse(data.content, {
        breaks: true,
      });
      mdDiv.innerHTML = htmlContent;

      if (typeof mermaid !== 'undefined') {
        // mermaid blockを检测して描画
        mdDiv.querySelectorAll('pre').forEach(async (pre) => {
          const code = pre.querySelector('code');
          if (code && (code.classList.contains('language-mermaid') ||
              code.textContent?.includes('graph ') ||
              code.textContent?.includes('sequenceDiagram') ||
              code.textContent?.includes('flowchart'))) {
            const graphDefinition = code.textContent;
            pre.classList.add('mermaid');
            try {
              const { svg } = await mermaid.render('mermaid-' + Math.random().toString(36).substr(2, 9), graphDefinition);
              pre.innerHTML = svg;
            } catch (err) {
              console.error('Mermaid error:', err);
              pre.textContent = graphDefinition;
            }
          }
        });
      }
    } catch (e) {
      console.error('Error rendering markdown:', e);
      mdDiv.innerHTML = '<pre>' + data.content + '</pre>';
    }
  }

  function switchTab(fileName, type, updateUrl = true) {
    console.log('switchTab called:', fileName, type);
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    const targetTab = document.querySelector('.tab[data-file="' + fileName + '"]');
    if (targetTab) {
      targetTab.classList.add('active');
    }

    // URLを更新（ページリロードなし）
    if (updateUrl) {
      const url = new URL(window.location.href);
      url.searchParams.set('page', fileName);
      window.history.pushState({}, '', url);
    }

    if (type === 'tsv') {
      loadTable(fileName);
    } else {
      console.log('Loading markdown for:', fileName);
      loadMarkdown(fileName);
    }
  }

  // URLパラメータから page を取得（拡張子ありの完全ファイル名）
  const urlParams = new URLSearchParams(window.location.search);
  const pageParam = urlParams.get('page');

  let targetFile = null;
  let targetType = null;

  if (pageParam && dataMap[pageParam]) {
    // 完全一致（拡張子あり）のみ対応
    targetFile = pageParam;
    targetType = dataMap[pageParam].type;
  } else {
    // デフォルトは最初のタブ
    if (tabs.length > 0) {
      targetFile = tabs[0];
      targetType = dataMap[targetFile]?.type;
    }
  }

  if (targetFile && targetType) {
    // 初期化時はURLを更新しない（updateUrl = false）
    switchTab(targetFile, targetType, false);

    // URLが異なる場合のみreplaceStateで更新
    const currentUrl = new URL(window.location.href);
    const currentPage = currentUrl.searchParams.get('page');
    if (currentPage !== targetFile) {
      currentUrl.searchParams.set('page', targetFile);
      window.history.replaceState({}, '', currentUrl);
    }
  }

  // ブラウザの戻る/進むボタン対応
  window.addEventListener('popstate', function(event) {
    const params = new URLSearchParams(window.location.search);
    const page = params.get('page');
    if (page && dataMap[page]) {
      switchTab(page, dataMap[page].type, false);
    } else if (tabs.length > 0) {
      switchTab(tabs[0], dataMap[tabs[0]].type, false);
    }
  });
}