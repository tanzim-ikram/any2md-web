/**
 * POST /api/markdown-preview -- { markdown } -> { html }
 *
 * Renders a full HTML document for the editor's live preview, using the
 * same renderMarkdownToHtml (lib/markdown/render.ts) that every export
 * format is built on, so the preview always matches what .html/.pdf/.docx
 * exports will actually produce (the plan's "Markdown is rendered to HTML
 * exactly once" guarantee). No file storage or lifecycle tracking is
 * involved -- this is a pure, stateless render, not a conversion.
 */
import { NextResponse, type NextRequest } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { renderMarkdownToHtml, wrapHtmlDocument } from "../../../lib/markdown/render";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "../../../lib/rate-limit";
import { errorResponse, readJsonBody } from "../../../lib/api/errors";
import { ConversionError } from "../../../lib/conversion/types";

export const runtime = "nodejs";
export const maxDuration = 15;

const MAX_MARKDOWN_LENGTH = 500_000; // generous editor-sized cap, not a document-upload cap

let cachedCss: string | null = null;
async function getMarkdownCss(): Promise<string> {
  if (cachedCss) return cachedCss;
  cachedCss = await fs.readFile(path.join(process.cwd(), "lib/markdown/markdown.css"), "utf-8");
  return cachedCss;
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request.headers);
    const rate = await checkRateLimit(RATE_LIMITS.preview, ip);
    if (!rate.success) {
      throw new ConversionError("RATE_LIMITED", "Too many requests", "Please slow down and try again shortly.");
    }

    const body = await readJsonBody<{ markdown?: unknown }>(request);
    // `body.markdown` is untrusted JSON, not necessarily a string: a
    // number crashed renderMarkdownToHtml into a generic 500, and an
    // object/array silently rendered an EMPTY preview with a 200 -- worse
    // than the 500, since it looks like it worked.
    if (body.markdown !== undefined && typeof body.markdown !== "string") {
      throw new ConversionError("INVALID_REQUEST", "Invalid request", "`markdown` must be a string.");
    }
    const markdown = body.markdown ?? "";
    if (markdown.length > MAX_MARKDOWN_LENGTH) {
      throw new ConversionError(
        "FILE_TOO_LARGE",
        "Document too large",
        `The editor supports up to ${MAX_MARKDOWN_LENGTH.toLocaleString()} characters.`,
      );
    }

    const bodyHtml = await renderMarkdownToHtml(markdown);
    const css = await getMarkdownCss();
    const html = wrapHtmlDocument(bodyHtml, { title: "Preview", css });

    return NextResponse.json({ html });
  } catch (err) {
    return errorResponse(err);
  }
}
