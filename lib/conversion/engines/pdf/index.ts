/**
 * PDF -> Markdown. Structure-aware extraction ported from the desktop
 * app's any2md/conversion/pdf_markdown.py onto pdf.js, per the plan's
 * "PDF strategy" section:
 *
 *   Pass 1 (this file + fonts.ts/lines.ts): font-size-based heading
 *   detection, bullet/numbered list detection, paragraph merging across
 *   wrapped lines.
 *
 *   Pass 2 (tables.ts): ruled-table recovery from vector drawing
 *   operators. Borderless (whitespace-aligned) tables are out of v1 --
 *   declared in lib/conversion/tools.ts, not silently dropped.
 *
 * Bold/italic emphasis (unlike the desktop app's pdfplumber-based version)
 * is NOT recovered here. This was attempted and verified empirically
 * (scripts/spike-check-fonts.ts) to be infeasible through pdf.js's public
 * API: for embedded/subsetted fonts -- which is what Chromium, Word, and
 * most modern PDF producers emit -- `page.commonObjs.get(fontName)`
 * resolves to a renderer-facing `FontFaceObject` stub, not the font's real
 * PostScript name or descriptor flags, so the desktop app's
 * name-based bold/italic heuristic has nothing to inspect. Reading the raw
 * `/FontDescriptor` flags would require bypassing pdf.js's content-stream
 * parsing and re-deriving the page/resource font mapping ourselves --
 * real work for a cosmetic feature, so it is declared as a limitation
 * (lib/conversion/tools.ts) rather than shipped half-working.
 *
 * No OCR: scanned (image-only) PDFs produce little or no text and are
 * reported as such rather than silently returning an empty document.
 */
import { ConversionError, type ConversionEngine } from "../../types";
import { outputName } from "../util";
import { getPdfjs } from "./pdfjs";
import { detectBodySize, detectHeadingSizes } from "./fonts";
import { groupItemsIntoLines, linesToBlocks, mergeParagraphs, blocksToMarkdown, type PdfBlock } from "./lines";
import type { PdfTextItem } from "./types";
import { detectRuledTables, removeItemsInTables, tableToBlock } from "./tables";

const MAX_PAGES = 300; // mirrors the plan's resource cap

/** Browser-generated PDFs (confirmed via scripts/spike-check-pdf-ops.ts on
 * our own Chromium output) render @page margin-box content -- page
 * numbers, running headers/footers -- as ordinary text items physically
 * positioned in the page's margin area. pdf.js's text layer makes no
 * distinction between "body text" and "margin box text", so a lone page
 * number would otherwise leak into the extracted Markdown as a stray "1"
 * on its own line. Items that are purely 1-4 digits AND sit within this
 * many PDF points of the page's bottom or top edge are treated as
 * running footer/header artifacts and dropped. */
const MARGIN_ARTIFACT_ZONE_PT = 40;
const PAGE_NUMBER_RE = /^\d{1,4}$/;

export const pdfToMarkdown: ConversionEngine = async (input, filename, options) => {
  const pdfjs = await getPdfjs();

  let doc;
  try {
    doc = await pdfjs.getDocument({
      data: new Uint8Array(input),
      useSystemFonts: false,
    }).promise;
  } catch (err) {
    const message = String((err as Error)?.message ?? err);
    if (/password/i.test(message)) {
      throw new ConversionError(
        "PASSWORD_PROTECTED",
        "This PDF is password-protected",
        `"${filename}" is encrypted. Please remove the password and try again.`,
      );
    }
    throw new ConversionError(
      "CORRUPTED_FILE",
      "Couldn't read this PDF",
      `"${filename}" could not be opened. It may be corrupted or not a valid PDF file.`,
    );
  }

  if (doc.numPages === 0) {
    throw new ConversionError("CORRUPTED_FILE", "Nothing to convert", `"${filename}" has no pages.`);
  }
  if (doc.numPages > MAX_PAGES) {
    throw new ConversionError(
      "PAGE_LIMIT_EXCEEDED",
      "This PDF is too long",
      `"${filename}" has ${doc.numPages} pages. The limit is ${MAX_PAGES} pages.`,
    );
  }

  // Pass over every page once to build a document-wide font-size histogram:
  // heading detection needs to see the whole document, not decide
  // page-by-page (a one-page cover sheet would otherwise skew it).
  const pageItems: PdfTextItem[][] = [];
  let allItems: PdfTextItem[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const rawItems = content.items as unknown as PdfTextItem[];
    const [, pageBottom, , pageTop] = page.view; // [x0, y0, x1, y1] in PDF points
    const items = rawItems.filter((it) => {
      const text = it.str.trim();
      if (!PAGE_NUMBER_RE.test(text)) return true;
      const y = it.transform[5];
      const nearBottom = y <= pageBottom + MARGIN_ARTIFACT_ZONE_PT;
      const nearTop = y >= pageTop - MARGIN_ARTIFACT_ZONE_PT;
      return !(nearBottom || nearTop);
    });
    pageItems.push(items);
    allItems = allItems.concat(items);
  }

  const totalChars = allItems.reduce((sum, it) => sum + it.str.trim().length, 0);
  if (totalChars < 20) {
    throw new ConversionError(
      "CORRUPTED_FILE",
      "No extractable text found",
      `"${filename}" doesn't appear to contain a text layer. Scanned (image-only) PDFs are not supported -- only text-based PDFs can be converted.`,
    );
  }

  const bodySize = detectBodySize(allItems);
  const headingSizes = detectHeadingSizes(allItems, bodySize);

  const sections: string[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const items = pageItems[i - 1];

    // Pass 2: find ruled tables on this page via drawing operators, then
    // exclude their text items from the normal line/paragraph flow so a
    // table's cell text doesn't also show up as stray paragraphs.
    let tableBlocks: PdfBlock[] = [];
    let remainingItems = items;
    if (options.detectTables !== false) {
      const opList = await page.getOperatorList();
      const tables = detectRuledTables(opList, pdfjs, items);
      if (tables.length > 0) {
        tableBlocks = tables.map(tableToBlock);
        remainingItems = removeItemsInTables(items, tables);
      }
    }

    const lines = groupItemsIntoLines(remainingItems);
    const blocks = mergeParagraphs(linesToBlocks(lines, headingSizes));
    const combined = interleaveTableBlocks(blocks, tableBlocks);

    const pageMarkdown = blocksToMarkdown(combined);
    if (pageMarkdown.trim()) sections.push(pageMarkdown.trim());
  }

  const markdown = sections.join("\n\n") + "\n";

  return {
    buffer: Buffer.from(markdown, "utf-8"),
    filename: outputName(options.customOutputName, filename, "md"),
    mimeType: "text/markdown",
  };
};

/** Tables are detected separately from the text flow (Pass 2 operates on
 * drawing ops, Pass 1 on text items) so simply append table blocks after
 * the page's text blocks. This loses exact vertical interleaving when a
 * page mixes prose above and below a table, which is an acceptable v1
 * trade-off -- documented alongside the borderless-table limitation. */
function interleaveTableBlocks(textBlocks: PdfBlock[], tableBlocks: PdfBlock[]): PdfBlock[] {
  if (tableBlocks.length === 0) return textBlocks;
  return [...textBlocks, ...tableBlocks];
}
