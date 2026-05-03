type JsonData = { [filename: string]: any };

export function run(
  inputData: JsonData,
  tabs: string[],
  meta: any
): {
  tabs?: string[];
  title?: string;
} {
  return {
    tabs: tabs.sort(),
    title: "SF Viewer - 基本設計書"
  };
}