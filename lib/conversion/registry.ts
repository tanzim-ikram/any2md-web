/**
 * THE SEAM. Every format-pair conversion is reached through this map and
 * nothing else -- API routes and the UI never import an engine module
 * directly. This is what makes "move pdf:md to a dedicated worker later"
 * (see the plan's PDF strategy escape hatch) a one-line change here
 * instead of a refactor across the app.
 *
 * Engines are loaded via dynamic import so each route's bundle only pulls
 * in the dependencies it actually uses -- Chromium never ships alongside
 * pdf.js, mammoth never ships alongside pptxgenjs, etc. (the plan's
 * "per-route dependency split").
 */
import type { ConversionEngine, FormatId } from "./types";
import { ConversionError } from "./types";
import { getTool, isToolUsable } from "./tools";

type EngineLoader = () => Promise<ConversionEngine>;

const loaders: Record<string, EngineLoader> = {
  "docx:md": async () => (await import("./engines/docx")).docxToMarkdown,
  "pdf:md": async () => (await import("./engines/pdf/index")).pdfToMarkdown,
  "xlsx:md": async () => (await import("./engines/xlsx")).xlsxToMarkdown,
  "pptx:md": async () => (await import("./engines/pptx")).pptxToMarkdown,
  "html:md": async () => (await import("./engines/html")).htmlFileToMarkdown,
  "csv:md": async () => (await import("./engines/csv")).csvToMarkdown,
  "txt:md": async () => (await import("./engines/txt")).txtToMarkdown,
  "md:docx": async () => (await import("./engines/to-docx")).markdownToDocx,
  "md:pdf": async () => (await import("./engines/to-pdf")).markdownToPdf,
  "md:html": async () => (await import("./engines/html")).markdownToHtml,
  "md:pptx": async () => (await import("./engines/to-pptx")).markdownToPptx,
};

/** Two-hop pairs compose two registry entries through the "md" hub format.
 * Declared explicitly (rather than derived) so an unsupported combination
 * fails with a clear error instead of silently chaining the wrong engines. */
const TWO_HOP_PAIRS: Record<string, [string, string]> = {
  "pdf:docx": ["pdf:md", "md:docx"],
  "docx:pdf": ["docx:md", "md:pdf"],
  "pdf:html": ["pdf:md", "md:html"],
  "pdf:pptx": ["pdf:md", "md:pptx"],
  "xlsx:docx": ["xlsx:md", "md:docx"],
  "xlsx:pdf": ["xlsx:md", "md:pdf"],
  "pptx:docx": ["pptx:md", "md:docx"],
  "pptx:pdf": ["pptx:md", "md:pdf"],
  "html:docx": ["html:md", "md:docx"],
  "html:pdf": ["html:md", "md:pdf"],
  "csv:docx": ["csv:md", "md:docx"],
  "csv:pdf": ["csv:md", "md:pdf"],
  "txt:docx": ["txt:md", "md:docx"],
  "txt:pdf": ["txt:md", "md:pdf"],
};

function pairId(source: FormatId, target: FormatId): string {
  return `${source}:${target}`;
}

function assertUsable(id: string): void {
  const tool = getTool(id);
  if (!tool) {
    throw new ConversionError(
      "UNSUPPORTED_FORMAT",
      "Conversion not supported",
      `There is no "${id}" conversion.`,
    );
  }
  if (tool.status === "unavailable") {
    throw new ConversionError(
      "TOOL_UNAVAILABLE",
      `${tool.name} isn't available yet`,
      tool.limitations?.join(" ") ?? "This conversion is not currently available.",
    );
  }
}

/**
 * Run a conversion. Resolves a direct engine if one is registered, or
 * composes a two-hop pipeline through Markdown otherwise. This is the only
 * function the API layer calls.
 */
export async function runConversion(
  source: FormatId,
  target: FormatId,
  input: Buffer,
  filename: string,
  options: Parameters<ConversionEngine>[2] = {},
): ReturnType<ConversionEngine> {
  if (source === target) {
    throw new ConversionError(
      "SAME_FORMAT",
      "Already in this format",
      `This file is already ${target.toUpperCase()}.`,
    );
  }

  const directId = pairId(source, target);
  if (loaders[directId]) {
    assertUsable(directId);
    const engine = await loaders[directId]();
    return engine(input, filename, options);
  }

  const twoHop = TWO_HOP_PAIRS[directId];
  if (twoHop) {
    const [firstId, secondId] = twoHop;
    assertUsable(firstId);
    assertUsable(secondId);

    const firstEngine = await loaders[firstId]();
    const intermediate = await firstEngine(input, filename, {});

    const secondEngine = await loaders[secondId]();
    // Carry the custom output name through to the final hop, not the
    // intermediate Markdown file.
    return secondEngine(intermediate.buffer, intermediate.filename, options);
  }

  throw new ConversionError(
    "UNSUPPORTED_FORMAT",
    "Conversion not supported",
    `Converting ${source.toUpperCase()} to ${target.toUpperCase()} is not supported.`,
  );
}

export function isConversionSupported(source: FormatId, target: FormatId): boolean {
  if (source === target) return false;
  const id = pairId(source, target);
  if (loaders[id]) {
    const tool = getTool(id);
    return isToolUsable(tool);
  }
  const twoHop = TWO_HOP_PAIRS[id];
  if (!twoHop) return false;
  return twoHop.every((hopId) => isToolUsable(getTool(hopId)));
}
