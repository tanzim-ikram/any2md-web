import { describe, it, expect } from "vitest";
import { ConversionError, isOutputFormat, isRecoverable } from "../../lib/conversion/types";

describe("isOutputFormat", () => {
  it("accepts every real conversion target", () => {
    for (const f of ["md", "docx", "pdf", "html", "pptx"]) {
      expect(isOutputFormat(f)).toBe(true);
    }
  });

  it("rejects formats that are valid inputs but never outputs", () => {
    // These are valid FormatId values (lib/conversion/types.ts's
    // EXTENSION_TO_FORMAT), but no engine ever produces them -- validating
    // against the wrong allowlist let these reach the registry and fail
    // deep inside it, after the record had already been marked "processing".
    for (const f of ["xlsx", "csv", "txt"]) {
      expect(isOutputFormat(f)).toBe(false);
    }
  });

  it("rejects malformed or wrong-typed values", () => {
    for (const v of ["", " md", "MD", null, undefined, 123, {}, []]) {
      expect(isOutputFormat(v)).toBe(false);
    }
  });
});

describe("isRecoverable", () => {
  const codes = [
    "INVALID_PAGE_RANGE",
    "SAME_FORMAT",
    "UNSUPPORTED_FORMAT",
    "RATE_LIMITED",
    "PAGE_LIMIT_EXCEEDED",
    "TOO_MANY_FILES",
    "INVALID_REQUEST",
  ] as const;

  it("is true for every request-input error code", () => {
    for (const code of codes) {
      const err = new ConversionError(code, "t", "m");
      expect(isRecoverable(err)).toBe(true);
    }
  });

  it("is false for errors about the file itself", () => {
    for (const code of ["CORRUPTED_FILE", "PASSWORD_PROTECTED", "INTERNAL_ERROR", "FILE_EXPIRED"] as const) {
      const err = new ConversionError(code, "t", "m");
      expect(isRecoverable(err)).toBe(false);
    }
  });

  it("is false for a non-ConversionError", () => {
    expect(isRecoverable(new Error("boom"))).toBe(false);
    expect(isRecoverable("boom")).toBe(false);
    expect(isRecoverable(null)).toBe(false);
  });
});
