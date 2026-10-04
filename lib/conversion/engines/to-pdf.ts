/**
 * Markdown -> PDF via headless Chromium, replacing the desktop app's
 * WeasyPrint renderer (WeasyPrint needs Pango/Cairo system libraries that
 * cannot be installed on Vercel).
 *
 * Chrome 131+ supports CSS `@page` margin boxes (`@bottom-right`,
 * `counter(page)`, etc.) when `preferCSSPageSize: true` is passed to
 * `page.pdf()` -- this is what lets lib/markdown/print.css's ported
 * `@bottom-right { content: counter(page) }` page-number rule actually
 * render, matching (and arguably improving on) the desktop app's
 * pagination.
 *
 * Two Chromium sources, selected at runtime:
 *   - production (Vercel/Linux serverless): puppeteer-core +
 *     @sparticuz/chromium, a Brotli-compressed Linux binary built for
 *     exactly this environment.
 *   - local dev (Windows/Mac/Linux desktops): the full `puppeteer` package,
 *     which manages its own downloaded browser. @sparticuz/chromium ships
 *     Linux-only binaries, so it cannot run here.
 */
import type { Browser, PDFOptions } from "puppeteer-core";
import { ConversionError, type ConversionEngine } from "../types";
import { renderMarkdownToHtml, wrapHtmlDocument } from "../../markdown/render";
import { outputName } from "./util";
import fs from "node:fs/promises";
import path from "node:path";

const isProduction = !!process.env.VERCEL || process.env.NODE_ENV === "production";

let cachedCss: { markdown: string; print: string } | null = null;
async function getCss() {
  if (cachedCss) return cachedCss;
  const dir = path.join(process.cwd(), "lib/markdown");
  const [markdown, print] = await Promise.all([
    fs.readFile(path.join(dir, "markdown.css"), "utf-8"),
    fs.readFile(path.join(dir, "print.css"), "utf-8"),
  ]);
  cachedCss = { markdown, print };
  return cachedCss;
}

async function launchBrowser(): Promise<Browser> {
  if (isProduction) {
    const chromium = (await import("@sparticuz/chromium")).default;
    const puppeteer = await import("puppeteer-core");
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    }) as unknown as Promise<Browser>;
  }
  // Local dev: use the full `puppeteer` package's own managed browser.
  const puppeteer = await import("puppeteer");
  return puppeteer.launch({ headless: true }) as unknown as Promise<Browser>;
}

/** Render a full HTML document to a PDF buffer. Exported separately from
 * the registry engine so the PDF toolbox's HTML-based tools (if any) and
 * tests can call it directly without going through Markdown first. */
export async function renderHtmlToPdf(fullHtml: string): Promise<Buffer> {
  let browser: Browser;
  try {
    browser = await launchBrowser();
  } catch (err) {
    throw new ConversionError(
      "INTERNAL_ERROR",
      "PDF rendering is temporarily unavailable",
      "The PDF renderer could not start. Please try again shortly.",
    );
  }

  try {
    const page = await browser.newPage();
    await page.setContent(fullHtml, { waitUntil: "load" });
    const pdfOptions: PDFOptions = {
      printBackground: true,
      preferCSSPageSize: true, // honor @page { size } and margin boxes from print.css
      timeout: 60_000,
    };
    const pdf = await page.pdf(pdfOptions);
    return Buffer.from(pdf);
  } catch (err) {
    throw new ConversionError(
      "INTERNAL_ERROR",
      "Couldn't generate the PDF",
      "The document could not be rendered to PDF. It may contain content the renderer couldn't process.",
    );
  } finally {
    await browser.close().catch(() => void 0);
  }
}

export const markdownToPdf: ConversionEngine = async (input, filename, options) => {
  const markdown = input.toString("utf-8");
  const bodyHtml = options.renderedHtml ?? (await renderMarkdownToHtml(markdown));
  const { markdown: markdownCss, print: printCss } = await getCss();
  const title = (options.customOutputName as string | undefined) ?? undefined;
  const fullHtml = wrapHtmlDocument(bodyHtml, {
    title,
    css: `${markdownCss}\n${printCss}`,
  });

  const buffer = await renderHtmlToPdf(fullHtml);

  return {
    buffer,
    filename: outputName(options.customOutputName, filename, "pdf"),
    mimeType: "application/pdf",
  };
};
