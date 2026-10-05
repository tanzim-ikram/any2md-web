/**
 * HTML -> DOCX. A structural port of the desktop app's
 * any2md/conversion/from_markdown.py::FromMarkdownConverter._to_docx, which
 * walks BeautifulSoup-parsed HTML with python-docx. Here the walk is done
 * with cheerio (a DOM-like, jQuery-style API over parsed HTML) and documents
 * are built with the `docx` package.
 *
 * This is the second half of the "Markdown rendered to HTML exactly once"
 * design: the caller passes HTML already produced by
 * lib/markdown/render.ts, so this module never parses Markdown itself and
 * never needs to re-derive what the editor preview and PDF export already
 * agreed on.
 *
 * Images: only `data:` URIs are embedded (matching the desktop app's
 * offline-only image handling). Remote `http(s)` image URLs are not
 * fetched server-side -- fetching arbitrary user-supplied URLs from a
 * server function is an SSRF vector, so they fall back to alt text instead.
 */
import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";
import sharp from "sharp";
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
  type ParagraphChild,
} from "docx";

const MONO_FONT = "Consolas";
const CODE_SHADE = "F3F3F1";
const CODE_BLOCK_SHADE = "F7F7F5";
const CODE_BLOCK_BORDER = "E4E4E0";
const LINK_COLOR = "2563EB";
const QUOTE_BORDER = "2563EB";
const HR_COLOR = "BBBBB5";
const HEADER_SHADE = "F3F3F1";

const ORDERED_NUMBERING_REF = "docsmith-ordered";

interface InlineFormat {
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  code?: boolean;
  link?: boolean;
}

/** Render options threaded through the whole walk. */
interface RenderContext {
  $: cheerio.CheerioAPI;
  maxWidthEmu: number;
}

function isElement(node: AnyNode): node is Element {
  return node.type === "tag";
}

async function loadImageBytes(src: string): Promise<Buffer | null> {
  const trimmed = (src || "").trim();
  if (!trimmed.toLowerCase().startsWith("data:")) return null;
  const comma = trimmed.indexOf(",");
  if (comma === -1) return null;
  const header = trimmed.slice(5, comma);
  const payload = trimmed.slice(comma + 1);
  try {
    if (header.toLowerCase().includes(";base64")) {
      return Buffer.from(payload, "base64");
    }
    return Buffer.from(decodeURIComponent(payload), "latin1");
  } catch {
    return null;
  }
}

/** Build the inline (TextRun / hyperlink / image) children of a block-level
 * element, mirroring the desktop app's add_inline(). */
async function renderInline(
  ctx: RenderContext,
  node: AnyNode,
  fmt: InlineFormat,
): Promise<ParagraphChild[]> {
  const { $ } = ctx;
  const out: ParagraphChild[] = [];

  const children = isElement(node) ? node.children : [node];
  for (const child of children) {
    if (child.type === "text") {
      const text = child.data.replace(/\s+/g, " ");
      if (text) out.push(makeTextRun(text, fmt));
      continue;
    }
    if (!isElement(child)) continue;

    const name = child.tagName.toLowerCase();
    if (name === "br") {
      out.push(new TextRun({ text: "", break: 1 }));
    } else if (name === "img") {
      const src = $(child).attr("src") ?? "";
      const alt = $(child).attr("alt") ?? "";
      const image = await renderImage(ctx, src, alt);
      if (image) out.push(image);
    } else if (name === "strong" || name === "b") {
      out.push(...(await renderInline(ctx, child, { ...fmt, bold: true })));
    } else if (name === "em" || name === "i") {
      out.push(...(await renderInline(ctx, child, { ...fmt, italic: true })));
    } else if (name === "del" || name === "s" || name === "strike") {
      out.push(...(await renderInline(ctx, child, { ...fmt, strike: true })));
    } else if (name === "code") {
      out.push(...(await renderInline(ctx, child, { ...fmt, code: true })));
    } else if (name === "a") {
      const href = $(child).attr("href");
      if (href && /^(https?|mailto):/i.test(href)) {
        const linkChildren = await renderInline(ctx, child, { ...fmt, link: true });
        out.push(new ExternalHyperlink({ link: href, children: linkChildren as TextRun[] }));
      } else {
        out.push(...(await renderInline(ctx, child, fmt)));
      }
    } else {
      out.push(...(await renderInline(ctx, child, fmt)));
    }
  }
  return out;
}

function makeTextRun(text: string, fmt: InlineFormat): TextRun {
  if (fmt.code) {
    return new TextRun({
      text,
      bold: fmt.bold,
      italics: fmt.italic,
      strike: fmt.strike,
      font: MONO_FONT,
      size: 19, // 9.5pt in half-points
      shading: { type: ShadingType.CLEAR, fill: CODE_SHADE },
    });
  }
  return new TextRun({
    text,
    bold: fmt.bold,
    italics: fmt.italic,
    strike: fmt.strike,
    color: fmt.link ? LINK_COLOR : undefined,
    underline: fmt.link ? {} : undefined,
  });
}

async function renderImage(ctx: RenderContext, src: string, alt: string): Promise<ImageRun | TextRun | null> {
  const data = await loadImageBytes(src);
  if (!data) {
    return alt ? new TextRun({ text: `[image: ${alt}]`, italics: true }) : null;
  }
  try {
    const meta = await sharp(data).metadata();
    const width = meta.width ?? 400;
    const height = meta.height ?? 300;
    const maxWidthPx = ctx.maxWidthEmu / 9525; // 1 px = 9525 EMU at 96dpi
    const scale = width > maxWidthPx ? maxWidthPx / width : 1;
    const type = pickImageType(meta.format);
    if (!type) return alt ? new TextRun({ text: `[image: ${alt}]`, italics: true }) : null;
    return new ImageRun({
      type,
      data,
      transformation: { width: Math.round(width * scale), height: Math.round(height * scale) },
    });
  } catch {
    return alt ? new TextRun({ text: `[image: ${alt}]`, italics: true }) : null;
  }
}

function pickImageType(format: string | undefined): "png" | "jpg" | "gif" | "bmp" | undefined {
  switch (format) {
    case "png":
      return "png";
    case "jpeg":
      return "jpg";
    case "gif":
      return "gif";
    case "bmp":
      return "bmp";
    default:
      return undefined; // e.g. svg/webp/avif: ImageRun needs a raster type it can size
  }
}

function paragraphBorder(color: string, size = 6) {
  return {
    top: { style: BorderStyle.SINGLE, size, color, space: 4 },
    bottom: { style: BorderStyle.SINGLE, size, color, space: 4 },
    left: { style: BorderStyle.SINGLE, size, color, space: 4 },
    right: { style: BorderStyle.SINGLE, size, color, space: 4 },
  };
}

async function renderCodeBlock($: cheerio.CheerioAPI, node: Element): Promise<Paragraph> {
  const text = $(node).text().replace(/\n+$/, "");
  const lines = text.split("\n");
  const runs: TextRun[] = [];
  lines.forEach((line, i) => {
    runs.push(new TextRun({ text: line, font: MONO_FONT, size: 18 }));
    if (i < lines.length - 1) runs.push(new TextRun({ text: "", break: 1, font: MONO_FONT, size: 18 }));
  });
  return new Paragraph({
    children: runs,
    shading: { type: ShadingType.CLEAR, fill: CODE_BLOCK_SHADE },
    border: paragraphBorder(CODE_BLOCK_BORDER, 4),
    spacing: { before: 80, after: 160, line: 240 },
    indent: { left: 144 },
  });
}

async function renderList(ctx: RenderContext, node: Element, level: number): Promise<(Paragraph | Table)[]> {
  const { $ } = ctx;
  const ordered = node.tagName.toLowerCase() === "ol";
  const items = $(node).children("li").toArray();
  const out: (Paragraph | Table)[] = [];

  for (const li of items) {
    const directChildren = (li as Element).children.filter(
      (c) => !(isElement(c) && ["ul", "ol", "pre", "blockquote", "table"].includes(c.tagName.toLowerCase())),
    );
    const inline: ParagraphChild[] = [];
    for (const c of directChildren) {
      inline.push(...(await renderInline(ctx, c.type === "text" ? c : (c as Element), {})));
    }

    out.push(
      new Paragraph({
        children: inline,
        ...(ordered
          ? { numbering: { reference: ORDERED_NUMBERING_REF, level } }
          : { bullet: { level } }),
      }),
    );

    const nestedLists = $(li)
      .children("ul, ol")
      .toArray() as Element[];
    for (const nested of nestedLists) {
      out.push(...(await renderList(ctx, nested, level + 1)));
    }
    const nestedBlocks = $(li)
      .children("pre, blockquote, table")
      .toArray() as Element[];
    for (const block of nestedBlocks) {
      out.push(...(await renderBlock(ctx, block)));
    }
  }
  return out;
}

async function renderTable(ctx: RenderContext, node: Element): Promise<Table | null> {
  const { $ } = ctx;
  const rows = $(node).find("tr").toArray() as Element[];
  if (rows.length === 0) return null;
  const colCount = Math.max(...rows.map((r) => $(r).find("th, td").length));

  const tableRows: TableRow[] = [];
  for (const row of rows) {
    const cells = $(row).find("th, td").toArray() as Element[];
    const tableCells: TableCell[] = [];
    for (let i = 0; i < colCount; i++) {
      const cellNode = cells[i];
      const isHeader = cellNode && cellNode.tagName.toLowerCase() === "th";
      const inline = cellNode ? await renderInline(ctx, cellNode, { bold: !!isHeader }) : [];
      const style = cellNode ? ($(cellNode).attr("style") ?? "") : "";
      const alignment = style.includes("text-align: center")
        ? AlignmentType.CENTER
        : style.includes("text-align: right")
          ? AlignmentType.RIGHT
          : AlignmentType.LEFT;
      tableCells.push(
        new TableCell({
          children: [new Paragraph({ children: inline, alignment })],
          verticalAlign: VerticalAlign.TOP,
          shading: isHeader ? { type: ShadingType.CLEAR, fill: HEADER_SHADE } : undefined,
          margins: { top: 60, bottom: 60, left: 100, right: 100 },
        }),
      );
    }
    tableRows.push(new TableRow({ children: tableCells }));
  }

  return new Table({
    rows: tableRows,
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

/** Render one block-level node into zero or more top-level document
 * children (Paragraph | Table). Mirrors the desktop app's add_block(). */
async function renderBlock(ctx: RenderContext, node: AnyNode): Promise<(Paragraph | Table)[]> {
  const { $ } = ctx;
  if (node.type === "text") {
    const text = node.data.trim();
    return text ? [new Paragraph({ children: [new TextRun(text)] })] : [];
  }
  if (!isElement(node)) return [];

  const name = node.tagName.toLowerCase();

  if (/^h[1-6]$/.test(name)) {
    const level = Number(name[1]);
    const headingMap = [
      HeadingLevel.HEADING_1,
      HeadingLevel.HEADING_2,
      HeadingLevel.HEADING_3,
      HeadingLevel.HEADING_4,
      HeadingLevel.HEADING_5,
      HeadingLevel.HEADING_6,
    ];
    const inline = await renderInline(ctx, node, {});
    return [new Paragraph({ children: inline, heading: headingMap[level - 1] })];
  }

  if (name === "p") {
    const inline = await renderInline(ctx, node, {});
    return inline.length > 0 ? [new Paragraph({ children: inline })] : [];
  }

  if (name === "ul" || name === "ol") {
    return renderList(ctx, node, 0);
  }

  if (name === "pre") {
    return [await renderCodeBlock($, node)];
  }

  if (name === "blockquote") {
    const out: (Paragraph | Table)[] = [];
    for (const child of node.children) {
      if (isElement(child) && child.tagName.toLowerCase() === "p") {
        const inline = await renderInline(ctx, child, {});
        out.push(
          new Paragraph({
            children: inline,
            indent: { left: 288 },
            border: { left: { style: BorderStyle.SINGLE, size: 18, color: QUOTE_BORDER, space: 8 } },
          }),
        );
      } else {
        out.push(...(await renderBlock(ctx, child)));
      }
    }
    return out;
  }

  if (name === "table") {
    const table = await renderTable(ctx, node);
    return table ? [table, new Paragraph({ text: "" })] : [];
  }

  if (name === "hr") {
    return [
      new Paragraph({
        children: [],
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: HR_COLOR, space: 1 } },
      }),
    ];
  }

  if (name === "img") {
    const src = $(node).attr("src") ?? "";
    const alt = $(node).attr("alt") ?? "";
    const image = await renderImage(ctx, src, alt);
    return image ? [new Paragraph({ children: [image] })] : [];
  }

  // Unknown wrapper element (e.g. <div>): descend into its children.
  const out: (Paragraph | Table)[] = [];
  for (const child of node.children) {
    out.push(...(await renderBlock(ctx, child)));
  }
  return out;
}

/** Convert a rendered HTML fragment to a DOCX file buffer. */
export async function htmlToDocx(html: string): Promise<Buffer> {
  const $ = cheerio.load(html, {}, false);
  const root = $.root().get(0);
  if (!root) throw new Error("Empty HTML input");

  // Letter page, 1" margins -> usable width in EMU for image scaling.
  const pageWidthEmu = 12_240 * 635; // twips -> EMU (1 twip = 635 EMU)
  const marginEmu = 1440 * 635;
  const ctx: RenderContext = { $, maxWidthEmu: pageWidthEmu - 2 * marginEmu };

  const children: (Paragraph | Table)[] = [];
  for (const node of root.children) {
    children.push(...(await renderBlock(ctx, node)));
  }

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: ORDERED_NUMBERING_REF,
          levels: [0, 1, 2].map((level) => ({
            level,
            format: LevelFormat.DECIMAL,
            text: `%${level + 1}.`,
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 360 * (level + 1), hanging: 260 } } },
          })),
        },
      ],
    },
    styles: {
      default: {
        document: { run: { font: "Calibri", size: 22 } }, // 11pt
      },
    },
    sections: [{ children: children.length > 0 ? children : [new Paragraph("")] }],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
