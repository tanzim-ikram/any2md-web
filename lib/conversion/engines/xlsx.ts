/**
 * XLSX -> Markdown. Each worksheet becomes a `##` section with its own
 * Markdown table, per the plan's "represent multiple worksheets clearly".
 * Charts, pivot tables, and cell formatting are not representable in
 * Markdown and are dropped (declared in lib/conversion/tools.ts).
 */
import ExcelJS from "exceljs";
import type { ConversionEngine } from "../types";
import { outputName } from "./util";
import { ConversionError } from "../types";
import { csvRowsToMarkdownTable } from "./csv";

function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    // Rich text, formula results, hyperlinks, dates
    if ("text" in value && typeof (value as { text?: unknown }).text === "string") {
      return (value as { text: string }).text;
    }
    if ("result" in value) {
      return cellToString((value as { result: ExcelJS.CellValue }).result);
    }
    if ("richText" in value && Array.isArray((value as { richText: { text: string }[] }).richText)) {
      return (value as { richText: { text: string }[] }).richText.map((r) => r.text).join("");
    }
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if ("hyperlink" in value && "text" in value) {
      return String((value as { text: unknown }).text ?? "");
    }
    return String(value);
  }
  return String(value);
}

export const xlsxToMarkdown: ConversionEngine = async (input, filename, options) => {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(input as unknown as ExcelJS.Buffer);
  } catch {
    throw new ConversionError(
      "CORRUPTED_FILE",
      "Couldn't read this spreadsheet",
      `"${filename}" could not be opened. It may be corrupted or password-protected.`,
    );
  }

  if (workbook.worksheets.length === 0) {
    throw new ConversionError(
      "CORRUPTED_FILE",
      "Nothing to convert",
      `"${filename}" has no worksheets.`,
    );
  }

  const sections: string[] = [];
  const multiSheet = workbook.worksheets.length > 1;

  for (const sheet of workbook.worksheets) {
    const rows: string[][] = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = [];
      // row.eachCell with includeEmpty:true within the row's own bounds keeps
      // column alignment stable even when early columns are blank.
      row.eachCell({ includeEmpty: true }, (cell) => {
        cells.push(cellToString(cell.value).trim());
      });
      if (cells.some((c) => c !== "")) rows.push(cells);
    });

    if (rows.length === 0) continue; // skip genuinely empty sheets

    const table = csvRowsToMarkdownTable(rows);
    sections.push(multiSheet ? `## ${sheet.name}\n\n${table}` : table);
  }

  if (sections.length === 0) {
    throw new ConversionError(
      "CORRUPTED_FILE",
      "Nothing to convert",
      `"${filename}" has no data in any worksheet.`,
    );
  }

  const markdown = sections.join("\n\n") + "\n";
  return {
    buffer: Buffer.from(markdown, "utf-8"),
    filename: outputName(options.customOutputName, filename, "md"),
    mimeType: "text/markdown",
  };
};
