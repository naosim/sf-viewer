type JsonData = { [filename: string]: any };

export function run(inputData: JsonData): { meta: { [key: string]: string }; headers: string[]; rows: string[][] }[] {
  console.log("sampleAddon: 独自のTSV生成ロジックを実行");

  const result: { meta: { [key: string]: string }; headers: string[]; rows: string[][] }[] = [];

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

  return result;
}