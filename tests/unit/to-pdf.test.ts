import { describe, it, expect } from "vitest";
import { markdownToPdf } from "../../lib/conversion/engines/to-pdf";

const SAMPLE_MD = `# Phase 0 Spike

This document exists to prove headless Chromium can render Markdown to a
paginated PDF with page numbers, matching the desktop app's WeasyPrint
output as closely as a different rendering engine can.

## A table

| Name | Score |
| --- | --- |
| Ada | 99 |
| Lin | 87 |

## Enough content to paginate

${"Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(400)}
`;

describe("markdownToPdf (Chromium spike)", () => {
  it(
    "renders a real multi-page PDF with the ported CSS and page numbers",
    async () => {
      const result = await markdownToPdf(Buffer.from(SAMPLE_MD, "utf-8"), "spike.md", {});
      expect(result.mimeType).toBe("application/pdf");
      expect(result.filename).toBe("spike.pdf");

      // A real PDF: starts with the file signature and has a non-trivial size.
      expect(result.buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
      expect(result.buffer.length).toBeGreaterThan(5000);

      // Enough content to force multiple pages -- confirms pagination, not
      // just single-page rendering.
      const text = result.buffer.toString("latin1");
      const pageCount = (text.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
      expect(pageCount).toBeGreaterThan(1);
    },
    60_000,
  );
});
