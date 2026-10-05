import { describe, it, expect } from "vitest";
import { csvToMarkdown, parseCsv, csvRowsToMarkdownTable } from "../../lib/conversion/engines/csv";
import { escapeTableCell } from "../../lib/conversion/engines/util";
import { txtToMarkdown } from "../../lib/conversion/engines/txt";
import { htmlFileToMarkdown, markdownToHtml } from "../../lib/conversion/engines/html";
import { docxToMarkdown } from "../../lib/conversion/engines/docx";
import { xlsxToMarkdown } from "../../lib/conversion/engines/xlsx";
import ExcelJS from "exceljs";
import { Document, Packer, Paragraph, HeadingLevel } from "docx";

describe("csv parser", () => {
  it("parses simple rows", () => {
    const rows = parseCsv("a,b,c\n1,2,3\n");
    expect(rows).toEqual([["a", "b", "c"], ["1", "2", "3"]]);
  });

  it("handles quoted fields with embedded commas and quotes", () => {
    const rows = parseCsv('name,note\n"Doe, John","He said ""hi"""\n');
    expect(rows).toEqual([
      ["name", "note"],
      ["Doe, John", 'He said "hi"'],
    ]);
  });

  it("renders a markdown table with a header separator", () => {
    const md = csvRowsToMarkdownTable([["a", "b"], ["1", "2"]]);
    expect(md).toContain("| a | b |");
    expect(md).toContain("| --- | --- |");
    expect(md).toContain("| 1 | 2 |");
  });

  it("escapes a literal pipe in a cell so it can't be read as a column separator", () => {
    const md = csvRowsToMarkdownTable([["h"], ["a|b"]]);
    const dataRow = md.split("\n")[2];
    // the pipe must be backslash-escaped, not emitted bare -- a bare "|"
    // here would render as a spurious extra column in any markdown viewer.
    expect(dataRow).toBe("| a\\|b |");
  });
});

describe("escapeTableCell", () => {
  it("escapes pipes and converts newlines to <br>", () => {
    expect(escapeTableCell("a|b")).toBe("a\\|b");
    expect(escapeTableCell("a\nb")).toBe("a<br>b");
    expect(escapeTableCell("a\r\nb")).toBe("a<br>b");
    expect(escapeTableCell("plain")).toBe("plain");
  });
});

describe("csvToMarkdown engine", () => {
  it("converts a CSV buffer end to end", async () => {
    const buf = Buffer.from("x,y\n1,2\n3,4\n", "utf-8");
    const result = await csvToMarkdown(buf, "data.csv", {});
    const text = result.buffer.toString("utf-8");
    expect(result.filename).toBe("data.md");
    expect(text).toContain("| x | y |");
    expect(text).toContain("| 3 | 4 |");
  });

  it("rejects an empty file with a friendly error", async () => {
    await expect(csvToMarkdown(Buffer.from(""), "empty.csv", {})).rejects.toMatchObject({
      code: "CORRUPTED_FILE",
    });
  });

  it("escapes a pipe inside a cell end to end", async () => {
    const buf = Buffer.from('x,y\n"A|B",2\n', "utf-8");
    const result = await csvToMarkdown(buf, "data.csv", {});
    const text = result.buffer.toString("utf-8");
    expect(text).toContain("A\\|B");
    expect(text).not.toContain("| A|B |");
  });
});

describe("txtToMarkdown engine", () => {
  it("escapes markdown-significant characters so text round-trips literally", async () => {
    const buf = Buffer.from("# Not a heading\n* not a bullet", "utf-8");
    const result = await txtToMarkdown(buf, "notes.txt", {});
    const text = result.buffer.toString("utf-8");
    expect(text).toContain("\\# Not a heading");
    expect(text).toContain("\\* not a bullet");
  });
});

describe("html <-> markdown", () => {
  it("converts html to markdown", async () => {
    const html = "<h1>Title</h1><p>Hello <strong>world</strong></p><ul><li>one</li><li>two</li></ul>";
    const result = await htmlFileToMarkdown(Buffer.from(html, "utf-8"), "page.html", {});
    const text = result.buffer.toString("utf-8");
    expect(text).toContain("# Title");
    expect(text).toContain("**world**");
    expect(text).toMatch(/-\s+one/);
  });

  it("strips script tags from untrusted html input", async () => {
    const html = '<p>safe</p><script>alert(1)</script>';
    const result = await htmlFileToMarkdown(Buffer.from(html, "utf-8"), "page.html", {});
    const text = result.buffer.toString("utf-8");
    expect(text).not.toContain("alert(1)");
    expect(text).toContain("safe");
  });

  it("renders markdown to a full html document", async () => {
    const md = "# Title\n\nSome **bold** text.\n";
    const result = await markdownToHtml(Buffer.from(md, "utf-8"), "doc.md", {});
    const html = result.buffer.toString("utf-8");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<strong>bold</strong>");
  });
});

describe("docxToMarkdown engine", () => {
  it("converts a generated docx to markdown", async () => {
    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph({ text: "Report Title", heading: HeadingLevel.HEADING_1 }),
            new Paragraph({ text: "Body paragraph text." }),
          ],
        },
      ],
    });
    const buffer = await Packer.toBuffer(doc);
    const result = await docxToMarkdown(buffer, "report.docx", {});
    const text = result.buffer.toString("utf-8");
    expect(result.filename).toBe("report.md");
    expect(text).toContain("Report Title");
    expect(text).toContain("Body paragraph text.");
  });

  it("rejects a corrupted docx with a friendly error", async () => {
    await expect(docxToMarkdown(Buffer.from("not a docx"), "bad.docx", {})).rejects.toMatchObject({
      code: "CORRUPTED_FILE",
    });
  });
});

describe("xlsxToMarkdown engine", () => {
  it("converts a generated workbook with two sheets", async () => {
    const wb = new ExcelJS.Workbook();
    const s1 = wb.addWorksheet("Sheet1");
    s1.addRow(["Name", "Score"]);
    s1.addRow(["Ada", 99]);
    const s2 = wb.addWorksheet("Sheet2");
    s2.addRow(["X"]);
    s2.addRow([1]);

    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const result = await xlsxToMarkdown(buf, "book.xlsx", {});
    const text = result.buffer.toString("utf-8");
    expect(text).toContain("## Sheet1");
    expect(text).toContain("| Name | Score |");
    expect(text).toContain("Ada");
    expect(text).toContain("## Sheet2");
  });

  it("escapes a pipe inside a cell end to end (shares csv.ts's table renderer)", async () => {
    const wb = new ExcelJS.Workbook();
    const s1 = wb.addWorksheet("Sheet1");
    s1.addRow(["Name", "Formula"]);
    s1.addRow(["Alpha", "A|B"]);

    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const result = await xlsxToMarkdown(buf, "book.xlsx", {});
    const text = result.buffer.toString("utf-8");
    expect(text).toContain("A\\|B");
    expect(text).not.toContain("| A|B |");
  });
});
