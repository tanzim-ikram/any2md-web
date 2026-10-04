import { markdownToPdf } from "../lib/conversion/engines/to-pdf";
import { getPdfjs } from "../lib/conversion/engines/pdf/pdfjs";

const MD = `This paragraph has **bold text**, *italic text*, and plain text together.`;

async function main() {
  const pdf = await markdownToPdf(Buffer.from(MD, "utf-8"), "t.md", {});
  const pdfjs = await getPdfjs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf.buffer) }).promise;
  const page = await doc.getPage(1);
  await page.getOperatorList(); // forces font resolution into commonObjs
  const content = await page.getTextContent();
  console.log("styles:", JSON.stringify(content.styles, null, 1));
  for (const item of content.items as any[]) {
    console.log(JSON.stringify({ str: item.str, fontName: item.fontName }));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
