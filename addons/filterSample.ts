export function run(file: { fileName: string; label: string }): boolean {
  console.log(`フィルターチェック: ${file.fileName} (label: ${file.label})`);
  return true;
}
