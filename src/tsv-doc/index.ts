import { generateStandaloneHtml } from "./htmlGenerator";
import { ViewerOptions, HtmlCustomOptions } from "./types";

export function generate(options: ViewerOptions, custom?: HtmlCustomOptions) {
  // Validate input
  if (!options.inputDir) {
    throw new Error("inputDir is required");
  }
  if (!options.outputDir) {
    throw new Error("outputDir is required");
  }

  // Generate HTML with custom css/js
  generateStandaloneHtml(options.inputDir, options.outputDir, custom);
}