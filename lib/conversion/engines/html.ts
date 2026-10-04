/**
 * HTML <-> Markdown.
 *  - html:md uses turndown (+ GFM plugin for tables/strikethrough/task lists).
 *  - md:html uses the shared renderer in lib/markdown/render.ts so this
 *    output is byte-for-byte the same HTML that PDF/DOCX export consume.
 */
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import sanitizeHtml from "sanitize-html";
import type { ConversionEngine } from "../types";
import { renderMarkdownToHtml, wrapHtmlDocument } from "../../markdown/render";
import { stripExt, outputName } from "./util";
import fs from "node:fs/promises";
import path from "node:path";

let turndown: TurndownService | null = null;

function getTurndown(): TurndownService {
  if (turndown) return turndown;
  turndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    emDelimiter: "_",
  });
  turndown.use(gfm);
  return turndown;
}

/** Convert an HTML string to Markdown. Shared by the docx and html engines. */
export function htmlToMarkdown(html: string): string {
  // Sanitize untrusted HTML before it ever reaches turndown — this input may
  // come directly from a user-uploaded .html file.
  const clean = sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img", "h1", "h2"]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      img: ["src", "alt", "title", "width", "height"],
      "*": ["id"],
    },
    allowedSchemes: ["http", "https", "mailto", "data"],
  });
  return getTurndown()
    .turndown(clean)
    // collapse the >2 blank lines turndown sometimes leaves around tables/lists
    .replace(/\n{3,}/g, "\n\n")
    .trim() + "\n";
}

export const htmlFileToMarkdown: ConversionEngine = async (input, filename, options) => {
  const html = input.toString("utf-8");
  const markdown = htmlToMarkdown(html);
  const outName = outputName(options.customOutputName, filename, "md");
  return {
    buffer: Buffer.from(markdown, "utf-8"),
    filename: outName,
    mimeType: "text/markdown",
  };
};

let cachedCss: string | null = null;
async function getMarkdownCss(): Promise<string> {
  if (cachedCss) return cachedCss;
  cachedCss = await fs.readFile(path.join(process.cwd(), "lib/markdown/markdown.css"), "utf-8");
  return cachedCss;
}

export const markdownToHtml: ConversionEngine = async (input, filename, options) => {
  const markdown = input.toString("utf-8");
  const bodyHtml = options.renderedHtml ?? (await renderMarkdownToHtml(markdown));
  const css = await getMarkdownCss();
  const title = options.customOutputName ?? stripExt(filename);
  const fullHtml = wrapHtmlDocument(bodyHtml, { title, css });
  const outName = title + ".html";
  return {
    buffer: Buffer.from(fullHtml, "utf-8"),
    filename: outName,
    mimeType: "text/html",
  };
};

