type HtmlCustomResult = {
  css?: string;
  js?: string;
};

export function run(meta: any): HtmlCustomResult {
  return {
    css: `.markdown-body th {background-color: #f5f5f5;}`,
  };
}
