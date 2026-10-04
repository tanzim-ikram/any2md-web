import type { ConversionEngine } from "../types";
import { renderMarkdownToHtml } from "../../markdown/render";
import { htmlToDocx } from "../../docx/html-to-docx";
import { outputName } from "./util";

export const markdownToDocx: ConversionEngine = async (input, filename, options) => {
  const markdown = input.toString("utf-8");
  const html = options.renderedHtml ?? (await renderMarkdownToHtml(markdown));
  const buffer = await htmlToDocx(html);
  return {
    buffer,
    filename: outputName(options.customOutputName, filename, "docx"),
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
};
