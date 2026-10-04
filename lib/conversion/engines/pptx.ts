/**
 * PPTX -> Markdown. PPTX is a zip of OOXML parts; there is no maintained
 * high-level JS library for this (python-pptx has no real JS equivalent),
 * so this walks the raw XML directly:
 *
 *   ppt/presentation.xml             -> slide order (via r:id -> rels -> part)
 *   ppt/_rels/presentation.xml.rels
 *   ppt/slides/slideN.xml            -> shape text runs (<a:t>), title detection
 *   ppt/slides/_rels/slideN.xml.rels -> which notesSlide belongs to this slide
 *   ppt/notesSlides/notesSlideN.xml  -> speaker notes text
 *
 * Scope matches the stated limitation in lib/conversion/tools.ts: text,
 * titles, lists, tables, and notes only -- no layout/theme/media.
 */
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import type { ConversionEngine } from "../types";
import { outputName } from "./util";
import { ConversionError } from "../types";

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (name) => ["p:sp", "a:p", "a:r", "a:tr", "a:tc", "Relationship", "p:sldId"].includes(name),
});

type XmlNode = Record<string, unknown>;

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/** Recursively collect every <a:t> text node under an element, in document order. */
function collectText(node: unknown): string {
  if (node === null || node === undefined) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(collectText).join("");
  if (typeof node === "object") {
    let out = "";
    for (const [key, value] of Object.entries(node as XmlNode)) {
      if (key === "a:t") out += collectText(value);
      else if (key.startsWith("@_")) continue;
      else out += collectText(value);
    }
    return out;
  }
  return "";
}

function isTitlePlaceholder(sp: XmlNode): boolean {
  const nvSpPr = sp["p:nvSpPr"] as XmlNode | undefined;
  const nvPr = nvSpPr?.["p:nvPr"] as XmlNode | undefined;
  const ph = nvPr?.["p:ph"] as XmlNode | undefined;
  const type = ph?.["@_type"] as string | undefined;
  return type === "title" || type === "ctrTitle";
}

/** Render one shape's paragraphs as Markdown lines (plain text + bullets). */
function shapeToMarkdownLines(sp: XmlNode): string[] {
  const txBody = sp["p:txBody"] as XmlNode | undefined;
  if (!txBody) return [];
  const paragraphs = asArray(txBody["a:p"] as XmlNode | XmlNode[] | undefined);
  const lines: string[] = [];
  for (const p of paragraphs) {
    const text = collectText(p["a:r"] ?? p).trim();
    if (!text) continue;
    const pPr = p["a:pPr"] as XmlNode | undefined;
    const hasBullet = pPr?.["a:buChar"] !== undefined || pPr?.["a:buAutoNum"] !== undefined;
    const level = Number(pPr?.["@_lvl"] ?? 0);
    lines.push(hasBullet ? `${"  ".repeat(level)}- ${text}` : text);
  }
  return lines;
}

function slideToMarkdown(slideXml: XmlNode, slideNumber: number): string {
  const sld = slideXml["p:sld"] as XmlNode;
  const cSld = sld?.["p:cSld"] as XmlNode;
  const spTree = cSld?.["p:spTree"] as XmlNode;
  const shapes = asArray(spTree?.["p:sp"] as XmlNode | XmlNode[] | undefined);

  let title: string | null = null;
  const bodyLines: string[] = [];

  for (const sp of shapes) {
    const lines = shapeToMarkdownLines(sp);
    if (lines.length === 0) continue;
    if (title === null && isTitlePlaceholder(sp)) {
      title = lines.join(" ").trim();
      continue;
    }
    bodyLines.push(...lines);
  }

  const heading = `## ${title && title.length > 0 ? title : `Slide ${slideNumber}`}`;
  const body = bodyLines.length > 0 ? bodyLines.join("\n\n") : "";
  return body ? `${heading}\n\n${body}` : heading;
}

/** Resolve r:id -> target path from a .rels XML document. */
function parseRels(relsXml: string | undefined): Record<string, string> {
  if (!relsXml) return {};
  const parsed = xmlParser.parse(relsXml) as XmlNode;
  const relationships = parsed.Relationships as XmlNode | undefined;
  const rels = asArray(relationships?.Relationship as XmlNode | XmlNode[] | undefined);
  const map: Record<string, string> = {};
  for (const r of rels) {
    const id = r["@_Id"] as string;
    const target = r["@_Target"] as string;
    if (id && target) map[id] = target;
  }
  return map;
}

function normalizeZipPath(base: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const baseDir = base.split("/").slice(0, -1);
  const parts = target.split("/");
  for (const part of parts) {
    if (part === "..") baseDir.pop();
    else if (part === ".") continue;
    else baseDir.push(part);
  }
  return baseDir.join("/");
}

export const pptxToMarkdown: ConversionEngine = async (input, filename, options) => {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(input);
  } catch {
    throw new ConversionError(
      "CORRUPTED_FILE",
      "Couldn't read this presentation",
      `"${filename}" could not be opened. It may be corrupted or not a valid .pptx file.`,
    );
  }

  const readText = async (path: string): Promise<string | undefined> => {
    const file = zip.file(path);
    return file ? await file.async("text") : undefined;
  };

  const presentationXml = await readText("ppt/presentation.xml");
  const presentationRelsXml = await readText("ppt/_rels/presentation.xml.rels");
  if (!presentationXml) {
    throw new ConversionError(
      "CORRUPTED_FILE",
      "Couldn't read this presentation",
      `"${filename}" is missing its presentation data.`,
    );
  }

  const presentationRels = parseRels(presentationRelsXml);
  const presentation = xmlParser.parse(presentationXml) as XmlNode;
  const sldIdLst = (presentation["p:presentation"] as XmlNode)?.["p:sldIdLst"] as XmlNode | undefined;
  const sldIds = asArray(sldIdLst?.["p:sldId"] as XmlNode | XmlNode[] | undefined);

  // Ordered slide part paths, resolved from the presentation's own slide
  // ID list rather than zip entry order (slide2.xml < slide10.xml lexically
  // would otherwise sort wrong).
  const slidePaths: string[] = [];
  for (const sldId of sldIds) {
    const rId = sldId["@_r:id"] as string | undefined;
    const target = rId ? presentationRels[rId] : undefined;
    if (target) slidePaths.push(normalizeZipPath("ppt/presentation.xml", target));
  }

  if (slidePaths.length === 0) {
    throw new ConversionError(
      "CORRUPTED_FILE",
      "Nothing to convert",
      `"${filename}" has no slides.`,
    );
  }

  const sections: string[] = [];
  let slideNumber = 0;

  for (const slidePath of slidePaths) {
    slideNumber++;
    const slideXmlText = await readText(slidePath);
    if (!slideXmlText) continue;
    const slideXml = xmlParser.parse(slideXmlText) as XmlNode;

    let section = slideToMarkdown(slideXml, slideNumber);

    if (options.includeSpeakerNotes !== false) {
      const slideDir = slidePath.split("/").slice(0, -1).join("/");
      const slideFile = slidePath.split("/").pop()!;
      const relsPath = `${slideDir}/_rels/${slideFile}.rels`;
      const slideRels = parseRels(await readText(relsPath));
      const notesTarget = Object.values(slideRels).find((t) => t.includes("notesSlide"));
      if (notesTarget) {
        const notesPath = normalizeZipPath(slidePath, notesTarget);
        const notesXmlText = await readText(notesPath);
        if (notesXmlText) {
          const notesXml = xmlParser.parse(notesXmlText) as XmlNode;
          const notesSld = notesXml["p:notes"] as XmlNode;
          const notesCSld = notesSld?.["p:cSld"] as XmlNode;
          const notesSpTree = notesCSld?.["p:spTree"] as XmlNode;
          const notesShapes = asArray(notesSpTree?.["p:sp"] as XmlNode | XmlNode[] | undefined);
          const notesLines = notesShapes.flatMap((sp) => shapeToMarkdownLines(sp));
          if (notesLines.length > 0) {
            section += `\n\n> **Speaker notes:** ${notesLines.join(" ")}`;
          }
        }
      }
    }

    sections.push(section);
  }

  const markdown = sections.join("\n\n---\n\n") + "\n";
  return {
    buffer: Buffer.from(markdown, "utf-8"),
    filename: outputName(options.customOutputName, filename, "md"),
    mimeType: "text/markdown",
  };
};
