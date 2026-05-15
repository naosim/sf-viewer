export interface ViewerOptions {
  inputDir: string;
  outputDir: string;
}

export interface HtmlCustomOptions {
  css?: string;
  js?: string;
}

export interface TsvData {
  name: string;
  meta: { [key: string]: string };
  headers: string[];
  rows: string[][];
}

export interface MdData {
  name: string;
  meta: { [key: string]: string };
  content: string;
}