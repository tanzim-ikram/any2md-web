import { describe, it, expect } from "vitest";
import { validateUpload, validateBatchSize, MAX_FILE_SIZE_BYTES } from "../../lib/security/validation";
import { Document, Packer } from "docx";

describe("validateUpload", () => {
  it("accepts a real docx by magic bytes, not just extension", async () => {
    const doc = new Document({ sections: [{ children: [] }] });
    const buffer = Buffer.from(await Packer.toBuffer(doc));
    const result = await validateUpload(buffer, "report.docx");
    expect(result.format).toBe("docx");
    expect(result.sanitizedFilename).toBe("report.docx");
  });

  it("rejects a file whose extension doesn't match its real content", async () => {
    // A plain text buffer renamed to .pdf -- the classic spoofing attempt.
    const buffer = Buffer.from("just some text, not a pdf", "utf-8");
    await expect(validateUpload(buffer, "fake.pdf")).rejects.toMatchObject({
      code: "INVALID_FILE_TYPE",
    });
  });

  it("rejects legacy .doc with a specific, honest error", async () => {
    await expect(validateUpload(Buffer.from("x"), "old.doc")).rejects.toMatchObject({
      code: "LEGACY_FORMAT_UNSUPPORTED",
    });
  });

  it("rejects files over the size cap", async () => {
    const big = Buffer.alloc(MAX_FILE_SIZE_BYTES + 1, "a");
    await expect(validateUpload(big, "big.txt")).rejects.toMatchObject({
      code: "FILE_TOO_LARGE",
    });
  });

  it("rejects an unknown extension", async () => {
    await expect(validateUpload(Buffer.from("data"), "file.xyz")).rejects.toMatchObject({
      code: "UNSUPPORTED_FORMAT",
    });
  });

  it("sanitizes a path-traversal-shaped filename for display without throwing", async () => {
    const result = await validateUpload(Buffer.from("hello"), "../../etc/passwd.txt");
    expect(result.sanitizedFilename).not.toContain("..");
    expect(result.sanitizedFilename).not.toContain("/");
  });

  it("enforces the batch size limit", () => {
    expect(() => validateBatchSize(5)).not.toThrow();
    expect(() => validateBatchSize(11)).toThrow();
  });
});
