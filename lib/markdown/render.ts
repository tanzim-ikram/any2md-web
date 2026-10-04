/**
 * The ONE place Markdown becomes HTML. Every output format that isn't
 * Markdown itself (PDF, DOCX, PPTX, the editor preview, the .html export)
 * consumes this function's output, so they are guaranteed to agree with
 * each other. See the plan's "Markdown is rendered to HTML exactly once".
 *
 * Pipeline: remark-parse -> remark-gfm -> remark-rehype -> rehype-raw
 *           -> rehype-sanitize -> rehype-stringify
 *
 * rehype-sanitize is not optional: this HTML is later fed to Chromium
 * (md:pdf) and to a DOM walker (md:docx), so it must never carry script
 * content even though the Markdown source is user-supplied.
 */
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import type { Schema } from "hast-util-sanitize";

/** Extend the default sanitize schema to allow the handful of attributes
 * Markdown output legitimately needs (checkbox task lists, table alignment,
 * image/link attributes) while still stripping scripts, inline event
 * handlers, and anything else untrusted HTML might carry. */
const schema: Schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    input: [...(defaultSchema.attributes?.input ?? []), "type", "checked", "disabled"],
    th: [...(defaultSchema.attributes?.th ?? []), "align"],
    td: [...(defaultSchema.attributes?.td ?? []), "align"],
    img: [...(defaultSchema.attributes?.img ?? []), "src", "alt", "title", "width", "height"],
    "*": [...(defaultSchema.attributes?.["*"] ?? []), "className", "id"],
  },
  protocols: {
    ...defaultSchema.protocols,
    src: ["http", "https", "data"],
    href: ["http", "https", "mailto"],
  },
};

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeSanitize, schema)
  .use(rehypeStringify);

/** Render a Markdown string to a sanitized HTML fragment (no <html>/<body>). */
export async function renderMarkdownToHtml(markdown: string): Promise<string> {
  const file = await processor.process(markdown);
  return String(file);
}

/** Wrap a rendered fragment into a complete, styleable HTML document. */
export function wrapHtmlDocument(bodyHtml: string, opts: { title?: string; css: string }): string {
  const title = (opts.title ?? "Document").replace(/[<>]/g, "");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
${opts.css}
  </style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}
