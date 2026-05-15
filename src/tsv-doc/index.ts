import { generateStandaloneHtml } from "./htmlGenerator";
import { ViewerOptions, HtmlCustomOptions } from "./types";

export function generate(options: ViewerOptions, custom?: HtmlCustomOptions) {
  if (!options.inputDir) {
    throw new Error("inputDir is required");
  }
  if (!options.outputDir) {
    throw new Error("outputDir is required");
  }
  generateStandaloneHtml(options.inputDir, options.outputDir, custom);
}

export { FrontMatterTSV } from "./frontMatter";
export type { ViewerOptions, HtmlCustomOptions, InputMeta, TsvData, MdData } from "./types";