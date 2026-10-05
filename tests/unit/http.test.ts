import { describe, it, expect } from "vitest";
import { contentDisposition } from "../../lib/api/http";

describe("contentDisposition", () => {
  it("keeps a plain ASCII name as-is", () => {
    const header = contentDisposition("report.pdf");
    expect(header).toContain('filename="report.pdf"');
    expect(header).toContain("filename*=UTF-8''report.pdf");
  });

  it("preserves spaces via the extended parameter", () => {
    // sanitizeFilename (lib/security/validation.ts) permits spaces, so
    // "my report.md" must not download as "my%20report.md".
    const header = contentDisposition("my report.md");
    expect(header).toContain("filename*=UTF-8''my%20report.md");
    // the plain fallback parameter is still a valid quoted string
    expect(header).toMatch(/filename="[^"]*"/);
  });

  it("neutralizes a quote in the ASCII fallback without breaking the header", () => {
    const header = contentDisposition('weird"name.txt');
    const asciiMatch = header.match(/filename="([^;]*)"/);
    expect(asciiMatch).not.toBeNull();
    expect(asciiMatch![1]).not.toContain('"');
  });

  it("encodes a non-ASCII name in the extended parameter", () => {
    const header = contentDisposition("café.pdf");
    expect(header).toContain("filename*=UTF-8''caf%C3%A9.pdf");
    // the ASCII fallback must not contain the raw non-ASCII character
    const asciiMatch = header.match(/filename="([^;]*)"/);
    expect(asciiMatch![1]).not.toContain("é");
  });
});
