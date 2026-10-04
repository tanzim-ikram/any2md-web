/* One-off Phase 0 verification script -- not part of the app. Renders a
 * sample Markdown doc to PDF, saves it, and extracts text with pdfjs-dist
 * to confirm the @bottom-right page-number margin box actually rendered
 * (not just that the PDF has multiple pages). Run with:
 *   npx tsx scripts/spike-check-pdf.ts
 */
import { markdownToPdf } from "../lib/conversion/engines/to-pdf";
import fs from "node:fs/promises";

const SAMPLE_MD = `# Phase 0 Spike

${"Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(500)}

## Page two content

${"More filler text to guarantee a third page of content appears here. ".repeat(300)}
`;

async function main() {
  const result = await markdownToPdf(Buffer.from(SAMPLE_MD, "utf-8"), "spike.md", {});
  const outPath = "G:/Projects/Web Projects/any2md-web/scripts/spike-output.pdf";
  await fs.writeFile(outPath, result.buffer);
  console.log("Saved:", outPath, result.buffer.length, "bytes");

  // Extract text per page with pdfjs-dist to look for rendered page numbers.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(result.buffer) }).promise;
  console.log("Page count:", doc.numPages);
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((it: any) => it.str).join("");
    const tail = text.slice(-40);
    console.log(`Page ${i} tail: ...${tail}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
