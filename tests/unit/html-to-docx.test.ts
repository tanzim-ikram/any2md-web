import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { renderMarkdownToHtml } from "../../lib/markdown/render";
import { htmlToDocx } from "../../lib/docx/html-to-docx";
import { markdownToDocx } from "../../lib/conversion/engines/to-docx";

const SAMPLE_MD = `# Report Title

Some **bold** and *italic* and \`inline code\` text, plus a [link](https://example.com).

## Section

- one
- two
  - nested
1. first
2. second

> A blockquote.

\`\`\`
function hi() {
  return 1;
}
\`\`\`

| Name | Score |
| --- | --- |
| Ada | 99 |
| Lin | 87 |

---

End of document.
`;

async function readDocumentXml(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const file = zip.file("word/document.xml");
  if (!file) throw new Error("document.xml missing -- not a valid docx");
  return file.async("text");
}

describe("htmlToDocx", () => {
  it("produces a valid docx zip with the expected content", async () => {
    const html = await renderMarkdownToHtml(SAMPLE_MD);
    const buffer = await htmlToDocx(html);
    expect(buffer.length).toBeGreaterThan(0);

    const xml = await readDocumentXml(buffer);
    expect(xml).toContain("Report Title");
    expect(xml).toContain("bold");
    expect(xml).toContain("italic");
    expect(xml).toContain("inline code");
    expect(xml).toContain("blockquote");
    expect(xml).toContain("function hi");
    expect(xml).toContain("Ada");
    expect(xml).toContain("End of document");
  });

  it("round-trips through the registered md:docx engine", async () => {
    const result = await markdownToDocx(Buffer.from(SAMPLE_MD, "utf-8"), "report.md", {});
    expect(result.filename).toBe("report.docx");
    const xml = await readDocumentXml(result.buffer);
    expect(xml).toContain("Report Title");
  });
});
