/**
 * Group a page's raw text items into lines and then into paragraph-ready
 * blocks, porting the structural approach of the desktop app's
 * pdf_markdown.py (_page_to_blocks / _render_line / _merge_paragraphs)
 * onto pdf.js's text item model.
 */
import type { PdfLine, PdfRun, PdfTextItem } from "./types";
import { itemFontSize } from "./fonts";

/** Group text items into lines. pdf.js's own `hasEOL` flag (set by its
 * layout analysis) is the primary signal; a y-coordinate jump beyond half
 * the current font size is a fallback for content where hasEOL under- or
 * over-fires (common with multi-column layouts).
 *
 * Every run is emitted as non-bold/non-italic: pdf.js's public API does not
 * expose embedded-font weight/style for subsetted fonts (see the detailed
 * explanation in pdf/index.ts), so there is currently no reliable signal to
 * set these from. The run/format plumbing is kept (rather than collapsing
 * to plain strings) so the rendering and merge logic below needs no changes
 * if a future version adds a real detection source (e.g. reading raw
 * `/FontDescriptor` flags). */
export function groupItemsIntoLines(items: PdfTextItem[]): PdfLine[] {
  const lines: PdfLine[] = [];
  let runs: PdfRun[] = [];
  let lineFontSize = 0;
  let lineX = Infinity;
  let lineY = 0;
  let prevY: number | null = null;
  let prevFontSize = 12;

  const flush = () => {
    if (runs.length === 0) return;
    const text = runs
      .map((r) => r.text)
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    if (text) {
      lines.push({
        text,
        fontSize: lineFontSize || prevFontSize,
        bold: runs.every((r) => r.bold),
        italic: runs.every((r) => r.italic),
        x: lineX,
        y: lineY,
        runs,
      });
    }
    runs = [];
    lineFontSize = 0;
    lineX = Infinity;
  };

  for (const item of items) {
    const text = item.str;
    if (text === "" && !item.hasEOL) continue;

    const size = itemFontSize(item) || prevFontSize;
    const y = item.transform[5];

    const bigJump = prevY !== null && Math.abs(y - prevY) > Math.max(size, prevFontSize) * 0.5;
    if (bigJump) flush();

    if (text) {
      runs.push({ text, bold: false, italic: false });
      lineFontSize = Math.max(lineFontSize, size);
      lineX = Math.min(lineX, item.transform[4]);
      lineY = y;
      prevFontSize = size;
    }

    prevY = y;
    if (item.hasEOL) flush();
  }
  flush();

  return lines;
}

const BULLET_CHARS = /^[•‣◦▪▸·∙○●–—-]\s+/;
const NUMBERED_RE = /^(\d+[.)]|[a-zA-Z][.)]|\(\d+\)|[ivxlcdm]+[.)])\s+/i;

export type BlockKind = "heading" | "list-item" | "paragraph" | "blank";

export interface PdfBlock {
  kind: BlockKind;
  level?: number; // heading level 1-4
  text: string; // inline-formatted markdown text (bold/italic applied)
  ordered?: boolean;
}

function renderRunsAsMarkdown(runs: PdfRun[]): string {
  // Collapse consecutive runs with identical formatting before wrapping, so
  // "**foo bar**" isn't emitted as "**foo** **bar**".
  const merged: { text: string; bold: boolean; italic: boolean }[] = [];
  for (const run of runs) {
    const last = merged[merged.length - 1];
    if (last && last.bold === run.bold && last.italic === run.italic) {
      last.text += run.text;
    } else {
      merged.push({ ...run });
    }
  }
  return merged
    .map((r) => {
      let t = r.text;
      if (!t.trim()) return t;
      if (r.bold && r.italic) t = `***${t}***`;
      else if (r.bold) t = `**${t}**`;
      else if (r.italic) t = `_${t}_`;
      return t;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

/** Classify lines into heading/list/paragraph blocks and render inline
 * bold/italic markup, mirroring _render_line(). */
export function linesToBlocks(lines: PdfLine[], headingSizes: Map<number, number>): PdfBlock[] {
  const blocks: PdfBlock[] = [];

  for (const line of lines) {
    const roundedSize = Math.round(line.fontSize * 10) / 10;
    const headingLevel = headingSizes.get(roundedSize);
    const text = renderRunsAsMarkdown(line.runs);
    if (!text) continue;

    if (headingLevel) {
      blocks.push({ kind: "heading", level: headingLevel, text });
      continue;
    }

    const bulletMatch = BULLET_CHARS.exec(text);
    if (bulletMatch) {
      blocks.push({ kind: "list-item", ordered: false, text: text.slice(bulletMatch[0].length) });
      continue;
    }

    const numberedMatch = NUMBERED_RE.exec(text);
    if (numberedMatch) {
      blocks.push({ kind: "list-item", ordered: true, text: text.slice(numberedMatch[0].length) });
      continue;
    }

    blocks.push({ kind: "paragraph", text });
  }

  return blocks;
}

/** Merge consecutive plain-paragraph blocks that are really the same
 * paragraph wrapped across lines, mirroring _merge_paragraphs(). Headings
 * and list items are never merged into neighbors. */
export function mergeParagraphs(blocks: PdfBlock[]): PdfBlock[] {
  const out: PdfBlock[] = [];
  for (const block of blocks) {
    const last = out[out.length - 1];
    if (block.kind === "paragraph" && last?.kind === "paragraph") {
      last.text = `${last.text} ${block.text}`.replace(/\s+/g, " ").trim();
      continue;
    }
    out.push({ ...block });
  }
  return out;
}

export function blocksToMarkdown(blocks: PdfBlock[]): string {
  const lines: string[] = [];
  let prevKind: BlockKind | null = null;
  let listCounter = 0;

  for (const block of blocks) {
    if (block.kind === "list-item" && prevKind !== "list-item") listCounter = 0;

    if (block.kind === "heading") {
      lines.push(`${"#".repeat(block.level ?? 2)} ${block.text}`);
      listCounter = 0;
    } else if (block.kind === "list-item") {
      if (block.ordered) {
        listCounter++;
        lines.push(`${listCounter}. ${block.text}`);
      } else {
        lines.push(`- ${block.text}`);
      }
    } else {
      lines.push(block.text);
    }
    lines.push(""); // blank line between blocks -> clean Markdown spacing
    prevKind = block.kind;
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
