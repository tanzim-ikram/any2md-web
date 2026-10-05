/**
 * Markdown -> PowerPoint via pptxgenjs. Deliberately basic, matching the
 * "beta" status and declared limitations in lib/conversion/tools.ts: one
 * slide per top-level heading or `---` divider, bullets/tables/images
 * rendered plainly, no theme or layout design. This is a format-conversion
 * utility, not a design tool.
 */
import PptxGenJS from "pptxgenjs";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type { Root, RootContent, ListItem, TableRow as MdTableRow } from "mdast";
import { ConversionError, type ConversionEngine } from "../types";
import { outputName } from "./util";

interface Slide {
  title: string;
  bullets: { text: string; level: number }[];
  table: string[][] | null;
}

function mdastToPlainText(node: RootContent | ListItem): string {
  if ("children" in node && Array.isArray(node.children)) {
    return node.children.map((c) => mdastToPlainText(c as RootContent)).join("");
  }
  if (node.type === "text") return (node as { value: string }).value;
  if (node.type === "inlineCode") return (node as { value: string }).value;
  return "";
}

/** Split a Markdown document into slides at each top-level heading or `---`
 * thematic break, collecting bullet lists and the first table per slide. */
function splitIntoSlides(tree: Root): Slide[] {
  const slides: Slide[] = [];
  let current: Slide = { title: "", bullets: [], table: null };
  let started = false;

  const pushCurrent = () => {
    if (started) slides.push(current);
  };

  function walkList(list: RootContent & { children: ListItem[] }, level: number) {
    for (const item of list.children) {
      const text = item.children
        .filter((c) => c.type !== "list")
        .map((c) => mdastToPlainText(c as RootContent))
        .join(" ")
        .trim();
      if (text) current.bullets.push({ text, level });
      const nested = item.children.find((c) => c.type === "list");
      if (nested) walkList(nested as RootContent & { children: ListItem[] }, level + 1);
    }
  }

  for (const node of tree.children) {
    if (node.type === "heading" && node.depth <= 2) {
      pushCurrent();
      current = { title: mdastToPlainText(node).trim(), bullets: [], table: null };
      started = true;
      continue;
    }
    if (node.type === "thematicBreak") {
      pushCurrent();
      current = { title: "", bullets: [], table: null };
      started = true;
      continue;
    }
    if (!started) {
      started = true;
    }
    if (node.type === "list") {
      walkList(node as RootContent & { children: ListItem[] }, 0);
    } else if (node.type === "table" && !current.table) {
      const rows = (node.children as MdTableRow[]).map((row) =>
        row.children.map((cell) => mdastToPlainText(cell as RootContent).trim()),
      );
      current.table = rows;
    } else if (node.type === "paragraph") {
      const text = mdastToPlainText(node).trim();
      if (text) current.bullets.push({ text, level: 0 });
    }
  }
  pushCurrent();

  return slides.filter((s) => s.title || s.bullets.length > 0 || s.table);
}

export const markdownToPptx: ConversionEngine = async (input, filename, options) => {
  const markdown = input.toString("utf-8");
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown) as unknown as Root;
  const slides = splitIntoSlides(tree);

  if (slides.length === 0) {
    throw new ConversionError(
      "CORRUPTED_FILE",
      "Nothing to convert",
      `"${filename}" has no headings or content to turn into slides.`,
    );
  }

  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "DOCSMITH", width: 10, height: 5.63 });
  pptx.layout = "DOCSMITH";

  for (const slideData of slides) {
    const slide = pptx.addSlide();
    let y = 0.4;

    if (slideData.title) {
      slide.addText(slideData.title, {
        x: 0.5,
        y,
        w: 9,
        h: 0.8,
        fontSize: 28,
        bold: true,
        color: "111110",
      });
      y += 1.0;
    }

    if (slideData.bullets.length > 0) {
      const bulletText = slideData.bullets.map((b) => ({
        text: b.text,
        options: { bullet: true, indentLevel: b.level, fontSize: 16, color: "1A1A18" },
      }));
      slide.addText(bulletText, { x: 0.5, y, w: 9, h: 5.63 - y - 0.3 });
    } else if (slideData.table && slideData.table.length > 0) {
      const rows = slideData.table.map((row, i) =>
        row.map((cell) => ({
          text: cell,
          options: i === 0 ? { bold: true, fill: { color: "F3F3F1" } } : {},
        })),
      );
      slide.addTable(rows, { x: 0.5, y, w: 9, fontSize: 12, border: { type: "solid", color: "E4E4E0", pt: 1 } });
    }
  }

  const buffer = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;

  return {
    buffer,
    filename: outputName(options.customOutputName, filename, "pptx"),
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  };
};
