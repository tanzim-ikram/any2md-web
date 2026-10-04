import type { FormatId, ToolDefinition } from "./types";

/**
 * Single source of truth for every tool the product offers. The converter
 * UI, the SEO landing pages, and the routing logic in registry.ts all read
 * from this list — never from a hardcoded format pair.
 *
 * A tool with status "unavailable" still appears (so the user learns it
 * exists and why it's not offered) but cannot be invoked. See the plan's
 * "don't fake functionality" principle.
 */
export const TOOLS: ToolDefinition[] = [
  {
    id: "docx:md",
    name: "Word to Markdown",
    description: "Convert .docx documents to clean Markdown.",
    sourceFormats: ["docx"],
    targetFormats: ["md"],
    category: "conversion",
    status: "stable",
  },
  {
    id: "pdf:md",
    name: "PDF to Markdown",
    description: "Extract structured Markdown from PDF documents.",
    sourceFormats: ["pdf"],
    targetFormats: ["md"],
    category: "conversion",
    status: "stable",
    limitations: [
      "Tables without visible borders may not be recovered as Markdown tables.",
      "Scanned (image-only) PDFs are not OCR'd — only text-layer PDFs are supported.",
      "Bold and italic emphasis are not recovered — text is extracted without inline formatting.",
    ],
  },
  {
    id: "xlsx:md",
    name: "Excel to Markdown",
    description: "Convert spreadsheets to Markdown tables, one per worksheet.",
    sourceFormats: ["xlsx"],
    targetFormats: ["md"],
    category: "conversion",
    status: "stable",
    limitations: ["Charts, pivot tables, and cell formatting are not preserved."],
  },
  {
    id: "pptx:md",
    name: "PowerPoint to Markdown",
    description: "Extract slide text, titles, and speaker notes as Markdown.",
    sourceFormats: ["pptx"],
    targetFormats: ["md"],
    category: "conversion",
    status: "stable",
    limitations: ["Slide layout, transitions, and embedded media are not preserved."],
  },
  {
    id: "html:md",
    name: "HTML to Markdown",
    description: "Convert web pages and HTML files to Markdown.",
    sourceFormats: ["html"],
    targetFormats: ["md"],
    category: "conversion",
    status: "stable",
  },
  {
    id: "csv:md",
    name: "CSV to Markdown",
    description: "Convert CSV data to a Markdown table.",
    sourceFormats: ["csv"],
    targetFormats: ["md"],
    category: "conversion",
    status: "stable",
  },
  {
    id: "txt:md",
    name: "Text to Markdown",
    description: "Wrap plain text as Markdown.",
    sourceFormats: ["txt"],
    targetFormats: ["md"],
    category: "conversion",
    status: "stable",
  },
  {
    id: "md:docx",
    name: "Markdown to Word",
    description: "Export Markdown as a polished .docx document.",
    sourceFormats: ["md"],
    targetFormats: ["docx"],
    category: "conversion",
    status: "stable",
  },
  {
    id: "md:pdf",
    name: "Markdown to PDF",
    description: "Render Markdown as a paginated PDF.",
    sourceFormats: ["md"],
    targetFormats: ["pdf"],
    category: "conversion",
    status: "stable",
  },
  {
    id: "md:html",
    name: "Markdown to HTML",
    description: "Render Markdown as a standalone HTML page.",
    sourceFormats: ["md"],
    targetFormats: ["html"],
    category: "conversion",
    status: "stable",
  },
  {
    id: "md:pptx",
    name: "Markdown to PowerPoint",
    description: "Generate a basic slide deck from Markdown.",
    sourceFormats: ["md"],
    targetFormats: ["pptx"],
    category: "conversion",
    status: "beta",
    limitations: [
      "One slide per top-level heading or `---` divider; no theme or layout design.",
      "Best for text, bullet lists, and simple tables — not a design tool.",
    ],
  },

  // Two-hop tools: composed client-side from the pairs above via the
  // "md" hub format. Listed here so they appear in the UI/SEO surface.
  {
    id: "pdf:docx",
    name: "PDF to Word",
    description: "Convert PDF to Word via a Markdown intermediate.",
    sourceFormats: ["pdf"],
    targetFormats: ["docx"],
    category: "conversion",
    status: "stable",
  },
  {
    id: "docx:pdf",
    name: "Word to PDF",
    description: "Convert Word documents to PDF via a Markdown intermediate.",
    sourceFormats: ["docx"],
    targetFormats: ["pdf"],
    category: "conversion",
    status: "stable",
  },

  // PDF toolbox (Phase 4 scaffold — merge/split/rotate are implemented;
  // others are declared so the architecture and nav are visibly extensible).
  {
    id: "pdf:merge",
    name: "Merge PDF",
    description: "Combine multiple PDFs into one.",
    sourceFormats: ["pdf"],
    targetFormats: ["pdf"],
    category: "pdf",
    status: "stable",
  },
  {
    id: "pdf:split",
    name: "Split PDF",
    description: "Split a PDF into separate files by page range.",
    sourceFormats: ["pdf"],
    targetFormats: ["pdf"],
    category: "pdf",
    status: "stable",
  },
  {
    id: "pdf:rotate",
    name: "Rotate PDF",
    description: "Rotate one or more pages in a PDF.",
    sourceFormats: ["pdf"],
    targetFormats: ["pdf"],
    category: "pdf",
    status: "stable",
  },
  {
    id: "pdf:extract",
    name: "Extract pages",
    description: "Pull selected pages out into a new PDF.",
    sourceFormats: ["pdf"],
    targetFormats: ["pdf"],
    category: "pdf",
    status: "stable",
  },
  {
    id: "pdf:reorder",
    name: "Reorder pages",
    description: "Change the page order of a PDF.",
    sourceFormats: ["pdf"],
    targetFormats: ["pdf"],
    category: "pdf",
    status: "stable",
  },
  {
    id: "pdf:compress",
    name: "Compress PDF",
    description: "Shrink PDF file size by re-encoding embedded images.",
    sourceFormats: ["pdf"],
    targetFormats: ["pdf"],
    category: "pdf",
    status: "beta",
    limitations: [
      "Only meaningfully shrinks image-heavy PDFs — text-heavy PDFs may barely change.",
      "If compression would not reduce file size, the original file is returned unchanged.",
    ],
  },
];

export function getTool(id: string): ToolDefinition | undefined {
  return TOOLS.find((t) => t.id === id);
}

export function isToolUsable(tool: ToolDefinition | undefined): tool is ToolDefinition {
  return !!tool && tool.status !== "unavailable";
}

/** Client-safe: which conversion tools accept this source format, usable
 * ones only. Pure data lookup over TOOLS -- no engine imports, so this is
 * safe to use from a client component (unlike lib/conversion/registry.ts,
 * which dynamically imports every engine and must stay server-only). */
export function getToolsForSource(source: FormatId): ToolDefinition[] {
  return TOOLS.filter(
    (t) => t.category === "conversion" && t.sourceFormats.includes(source) && t.status !== "unavailable",
  );
}
