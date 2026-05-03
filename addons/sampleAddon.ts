type JsonData = { [filename: string]: any };

type AddonResult = {
  meta: { [key: string]: string };
  headers?: string[];
  rows?: string[][];
  type?: 'tsv' | 'markdown';
  content?: string;
};

export function run(inputData: JsonData): AddonResult[] {
  console.log("sampleAddon: 独自のTSV生成ロジックを実行");

  const result: AddonResult[] = [];

  if (inputData.flows) {
    const flowsData = inputData.flows;
    const flows = flowsData.data?.result?.records || flowsData.data?.records || [];
    const rows = flows.map((flow: any) => [
      flow.ApiName || "",
      flow.FlowLabel || flow.Name || "",
      flow.FlowType || "",
      flow.ProgressStatus || "",
      flow.IsPaused ? "true" : "false",
    ]);

    result.push({
      meta: { label: "フロー一覧（独自フォーマット）" },
      headers: ["ApiName", "FlowLabel", "FlowType", "ProgressStatus", "IsPaused"],
      rows: rows,
    });
  }

  result.push({
    meta: { label: "フロー概要（Markdown）" },
    type: 'markdown',
    content: `# フロー概要

## 概要
このドキュメントはフローの一覧を示します。

## ステータス

| ステータス | 件数 |
|-----------|------|
| InProgress | ${(inputData.flows?.data?.result?.records || []).filter((f: any) => f.ProgressStatus === 'InProgress').length} |
| Paused | ${(inputData.flows?.data?.result?.records || []).filter((f: any) => f.ProgressStatus === 'Paused').length} |
| Activated | ${(inputData.flows?.data?.result?.records || []).filter((f: any) => f.ProgressStatus === 'Activated').length} |

## フローダイアグラム

\`\`\`mermaid
graph TD
    A[開始] --> B{条件判断}
    B -->|OK| C[処理1]
    B -->|NG| D[処理2]
    C --> E[終了]
    D --> E
\`\`\`
`,
  });

  return result;
}