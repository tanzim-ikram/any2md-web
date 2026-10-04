/**
 * CSV -> Markdown table. Deliberately not using a CSV parsing library:
 * the format is simple enough that a small RFC-4180-aware parser (handles
 * quoted fields, embedded commas, embedded newlines, escaped quotes) is
 * easier to audit than pulling in a dependency for it.
 */
import type { ConversionEngine } from "../types";
import { outputName } from "./util";
import { ConversionError } from "../types";

/** Parse CSV text into rows of string cells. Handles RFC 4180 quoting. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  while (i < n) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      pushField();
      i++;
      continue;
    }
    if (ch === "\r") {
      i++;
      continue; // normalize CRLF -> LF below
    }
    if (ch === "\n") {
      pushRow();
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  // final field/row if the file doesn't end with a newline
  if (field.length > 0 || row.length > 0) pushRow();

  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

function escapeCell(cell: string): string {
  return cell.replace(/\|/g, "\|").replace(/\r?\n/g, "<br>");
}

export function csvRowsToMarkdownTable(rows: string[][]): string {
  if (rows.length === 0) return "";
  const colCount = Math.max(...rows.map((r) => r.length));
  const pad = (r: string[]) => {
    const copy = r.slice(0, colCount);
    while (copy.length < colCount) copy.push("");
    return copy;
  };

  const [header, ...rest] = rows.map(pad);
  const lines = [
    `| ${header.map(escapeCell).join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...rest.map((r) => `| ${r.map(escapeCell).join(" | ")} |`),
  ];
  return lines.join("\n") + "\n";
}

export const csvToMarkdown: ConversionEngine = async (input, filename, options) => {
  let text = input.toString("utf-8");
  // strip BOM if present (common from Excel-exported CSVs)
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows = parseCsv(text);
  if (rows.length === 0) {
    throw new ConversionError(
      "CORRUPTED_FILE",
      "Nothing to convert",
      `"${filename}" appears to be empty.`,
    );
  }

  const markdown = csvRowsToMarkdownTable(rows);
  return {
    buffer: Buffer.from(markdown, "utf-8"),
    filename: outputName(options.customOutputName, filename, "md"),
    mimeType: "text/markdown",
  };
};
