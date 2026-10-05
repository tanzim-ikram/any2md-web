/**
 * Generates fixture files for the manual smoke test (see the smoke-test
 * plan). Run: npx tsx scripts/smoke-fixtures.ts <outDir>
 *
 * Deliberately reuses only dependencies already in package.json (docx,
 * exceljs, pdf-lib, pptxgenjs) -- no new deps for a throwaway script.
 */
import fs from "node:fs";
import path from "node:path";
import { Document, Packer, Paragraph, HeadingLevel, Table, TableRow, TableCell, TextRun } from "docx";
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import PptxGenJS from "pptxgenjs";

const outDir = process.argv[2];
if (!outDir) {
  console.error("Usage: npx tsx scripts/smoke-fixtures.ts <outDir>");
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });

function write(name: string, data: Buffer | string) {
  const p = path.join(outDir, name);
  fs.writeFileSync(p, data);
  console.log("wrote", p, typeof data === "string" ? data.length : data.length, "bytes");
}

async function main() {
  // --- table.csv: a pipe in a cell + a quoted comma cell ---
  const csv = [
    "Name,Formula,Note",
    'Alpha,"A|B",plain',
    'Beta,"x, y",has comma',
  ].join("\r\n") + "\r\n";
  write("table.csv", csv);

  // --- sheet.xlsx: two sheets, one cell containing | ---
  const wb = new ExcelJS.Workbook();
  const s1 = wb.addWorksheet("Sheet1");
  s1.addRow(["Name", "Formula"]);
  s1.addRow(["Alpha", "A|B"]);
  s1.addRow(["Beta", "C"]);
  const s2 = wb.addWorksheet("Sheet2");
  s2.addRow(["X", "Y"]);
  s2.addRow([1, 2]);
  write("sheet.xlsx", Buffer.from(await wb.xlsx.writeBuffer()));

  // --- doc.docx: heading + paragraph + table ---
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: "Smoke Test Document", heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ children: [new TextRun("A paragraph of body text for round-tripping.")] }),
          new Table({
            rows: [
              new TableRow({ children: [new TableCell({ children: [new Paragraph("H1")] }), new TableCell({ children: [new Paragraph("H2")] })] }),
              new TableRow({ children: [new TableCell({ children: [new Paragraph("a")] }), new TableCell({ children: [new Paragraph("b")] })] }),
            ],
          }),
        ],
      },
    ],
  });
  write("doc.docx", await Packer.toBuffer(doc));

  // --- deck.pptx: 2 slides + speaker notes ---
  const pptx = new PptxGenJS();
  const slide1 = pptx.addSlide();
  slide1.addText("Slide One", { x: 0.5, y: 0.5, fontSize: 28 });
  slide1.addNotes("Speaker notes for slide one.");
  const slide2 = pptx.addSlide();
  slide2.addText("Slide Two", { x: 0.5, y: 0.5, fontSize: 28 });
  slide2.addNotes("Speaker notes for slide two.");
  const pptxBuf = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
  write("deck.pptx", pptxBuf);

  // --- page.html ---
  write(
    "page.html",
    `<!doctype html><html><head><meta charset="utf-8"><title>Smoke</title></head>` +
      `<body><h1>Smoke Test</h1><p>Some <strong>bold</strong> text and a <a href="https://example.com">link</a>.</p>` +
      `<ul><li>one</li><li>two</li></ul></body></html>`,
  );

  // --- notes.txt ---
  write("notes.txt", "Line one.\nLine two with * and _ characters.\n# not a heading\n");

  // --- note.md ---
  write("note.md", "# Smoke Test\n\nA paragraph with **bold** and _italic_.\n\n- item one\n- item two\n");

  // --- my report.md (Content-Disposition check) ---
  write("my report.md", "# Report\n\nFor filename encoding checks.\n");

  // --- text.pdf: 6 pages, real extractable text ---
  const textPdf = await PDFDocument.create();
  const font = await textPdf.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 6; i++) {
    const page = textPdf.addPage([612, 792]);
    page.drawText(`Page ${i} of the smoke test document. This line has real extractable text content.`, {
      x: 50,
      y: 700,
      size: 14,
      font,
      color: rgb(0, 0, 0),
    });
    page.drawText(`Body paragraph on page ${i}: lorem ipsum dolor sit amet consectetur adipiscing elit.`, {
      x: 50,
      y: 650,
      size: 12,
      font,
    });
  }
  write("text.pdf", Buffer.from(await textPdf.save()));

  // --- blank.pdf: 6 pages, no text ---
  const blankPdf = await PDFDocument.create();
  for (let i = 0; i < 6; i++) blankPdf.addPage([612, 792]);
  write("blank.pdf", Buffer.from(await blankPdf.save()));

  // --- notapdf.pdf: plain text renamed .pdf (spoof fixture) ---
  write("notapdf.pdf", "This is not actually a PDF file, just text with a .pdf extension.\n");

  // --- big.txt: MAX_FILE_SIZE_BYTES + 1 ---
  const MAX = 20 * 1024 * 1024;
  const big = Buffer.alloc(MAX + 1, 0x61); // 'a'
  write("big.txt", big);

  console.log("\nDone. Fixtures in:", outDir);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
