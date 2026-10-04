import { describe, it, expect } from "vitest";
import { runConversion, isConversionSupported } from "../../lib/conversion/registry";
import { Document, Packer, Paragraph, HeadingLevel } from "docx";

describe("conversion registry", () => {
  it("reports supported and unsupported pairs correctly", () => {
    expect(isConversionSupported("docx", "md")).toBe(true);
    expect(isConversionSupported("pdf", "docx")).toBe(true); // two-hop
    expect(isConversionSupported("md", "md")).toBe(false); // same format
    expect(isConversionSupported("xlsx", "pptx")).toBe(false); // no such pair
  });

  it("runs a direct conversion", async () => {
    const result = await runConversion("csv", "md", Buffer.from("a,b\n1,2\n", "utf-8"), "x.csv");
    expect(result.filename).toBe("x.md");
    expect(result.buffer.toString("utf-8")).toContain("| a | b |");
  });

  it("rejects converting a format to itself", async () => {
    await expect(runConversion("md", "md", Buffer.from("# hi"), "x.md")).rejects.toMatchObject({
      code: "SAME_FORMAT",
    });
  });

  it("rejects an unknown pair", async () => {
    await expect(runConversion("xlsx", "pptx", Buffer.from(""), "x.xlsx")).rejects.toMatchObject({
      code: "UNSUPPORTED_FORMAT",
    });
  });

  it(
    "composes a two-hop docx -> pdf pipeline through markdown",
    async () => {
      const doc = new Document({
        sections: [{ children: [new Paragraph({ text: "Hop Test", heading: HeadingLevel.HEADING_1 })] }],
      });
      const buffer = await Packer.toBuffer(doc);
      const result = await runConversion("docx", "pdf", buffer, "report.docx");
      expect(result.filename).toBe("report.pdf");
      expect(result.buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    },
    60_000,
  );
});
