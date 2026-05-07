function initViewer(tsvDataList, mdDataList, meta, tabs) {
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

  function loadTable(fileName) {
    const data = tsvDataList.find(d => d.name === fileName);
    if (!data) return;

    document.getElementById('markdown').style.display = 'none';
    document.getElementById('table').style.display = '';

    const tableData = data.rows.map(row => {
      const obj = {};
      data.headers.forEach((header, i) => {
        obj[header] = row[i];
      });
      return obj;
    });

    if (activeTable) {
      activeTable.destroy();
    }

    const headerHeight = document.querySelector("header").offsetHeight;
    const tabsHeight = document.querySelector(".tabs").offsetHeight;
    const tableHeight = `calc(100vh - ${headerHeight + tabsHeight + 20}px)`;

    activeTable = new Tabulator("#table", {
      data: tableData,
      layout: "fitDataFill",
      height: tableHeight,
      columns: data.headers.map(header => ({
        title: header,
        field: header,
        headerFilter: "input",
        sortable: true
      })),
    });
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