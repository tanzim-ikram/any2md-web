/* One-off Phase 0 spike: render a Markdown table to PDF via Chromium, then
 * dump the page's drawing operator list so we know which pdf.js OPS codes
 * actually appear for CSS table borders before writing table-detection
 * logic against assumptions. Run with: npx tsx scripts/spike-check-table-ops.ts
 */
import { markdownToPdf } from "../lib/conversion/engines/to-pdf";
import { getPdfjs } from "../lib/conversion/engines/pdf/pdfjs";

const SAMPLE_MD = `# Table test

| Name | Score | City |
| --- | --- | --- |
| Ada | 99 | London |
| Lin | 87 | Paris |
`;

async function main() {
  const result = await markdownToPdf(Buffer.from(SAMPLE_MD, "utf-8"), "t.md", {});
  const pdfjs = await getPdfjs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(result.buffer) }).promise;
  const page = await doc.getPage(1);
  const opList = await page.getOperatorList();

  const opNameByCode = new Map<number, string>();
  for (const [name, code] of Object.entries(pdfjs.OPS)) {
    opNameByCode.set(code as number, name);
  }

  console.log("Total ops:", opList.fnArray.length);
  const counts = new Map<string, number>();
  for (let i = 0; i < opList.fnArray.length; i++) {
    const name = opNameByCode.get(opList.fnArray[i]) ?? `#${opList.fnArray[i]}`;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  console.log("Op counts:", Object.fromEntries(counts));

  // Print the args for a sample of interesting ops.
  const interesting = ["constructPath", "rectangle", "stroke", "fill", "transform", "setLineWidth", "moveTo", "lineTo"];
  let printed = 0;
  for (let i = 0; i < opList.fnArray.length && printed < 40; i++) {
    const name = opNameByCode.get(opList.fnArray[i]) ?? `#${opList.fnArray[i]}`;
    if (interesting.includes(name)) {
      console.log(i, name, JSON.stringify(opList.argsArray[i]).slice(0, 200));
      printed++;
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
