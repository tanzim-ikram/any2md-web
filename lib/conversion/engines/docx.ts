/**
 * DOCX -> Markdown via mammoth (the reference implementation this format
 * conversion is built on — Python's own mammoth.js port is downstream of
 * this library) + turndown for the HTML -> Markdown step.
 */
import mammoth from "mammoth";
import { ConversionError, type ConversionEngine, type EngineWarning } from "../types";
import { htmlToMarkdown } from "./html";
import { outputName } from "./util";

/** Style map mirrors the desktop app's docx.py: Word's "Quote" paragraph
 * style and heading styles don't always round-trip through mammoth's
 * defaults, so we pin them explicitly. */
const STYLE_MAP = [
  "p[style-name='Quote'] => blockquote > p:fresh",
  "p[style-name='Intense Quote'] => blockquote > p:fresh",
  "p[style-name='Heading 1'] => h1:fresh",
  "p[style-name='Heading 2'] => h2:fresh",
  "p[style-name='Heading 3'] => h3:fresh",
  "p[style-name='Heading 4'] => h4:fresh",
  "p[style-name='Title'] => h1:fresh",
];

export const docxToMarkdown: ConversionEngine = async (input, filename, options) => {
  let result;
  try {
    result = await mammoth.convertToHtml(
      { buffer: input },
      {
        styleMap: STYLE_MAP,
        convertImage: options.preserveImages === false
          ? mammoth.images.imgElement(() => ({ src: "" }))
          : undefined,
      },
    );
  } catch (err) {
    throw new ConversionError(
      "CORRUPTED_FILE",
      "Couldn't read this document",
      `"${filename}" could not be opened. It may be corrupted, password-protected, or not a valid .docx file.`,
    );
  }

  const warnings: EngineWarning[] = result.messages
    .filter((m) => m.type === "warning")
    .slice(0, 20) // cap: don't let a pathological document produce hundreds of warnings
    .map((m) => ({ code: "MAMMOTH_WARNING", message: m.message }));

  let html = result.value;
  if (options.preserveImages === false) {
    html = html.replace(/<img[^>]*>/gi, "");
  }

  const markdown = htmlToMarkdown(html);
  const outName = outputName(options.customOutputName, filename, "md");

  return {
    buffer: Buffer.from(markdown, "utf-8"),
    filename: outName,
    mimeType: "text/markdown",
    warnings,
  };
};

function stripExt(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(0, dot) : filename;
}

