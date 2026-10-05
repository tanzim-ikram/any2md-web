import { describe, it, expect } from "vitest";
import { describeRejections } from "../../lib/upload/rejections";

function rejection(name: string, code: string, message = "rejected") {
  return { file: { name }, errors: [{ code, message }] };
}

describe("describeRejections", () => {
  it("returns no messages for an empty list", () => {
    expect(describeRejections([])).toEqual([]);
  });

  it("describes a too-large file by name", () => {
    const messages = describeRejections([rejection("big.pdf", "file-too-large")]);
    expect(messages).toEqual(['"big.pdf" is too large.']);
  });

  it("describes an invalid file type by name", () => {
    const messages = describeRejections([rejection("archive.zip", "file-invalid-type")]);
    expect(messages).toEqual(['"archive.zip" isn\'t a supported file type.']);
  });

  it("describes a single too-many-files rejection by name", () => {
    const messages = describeRejections([rejection("eleventh.pdf", "too-many-files")]);
    expect(messages).toEqual(['"eleventh.pdf" wasn\'t added -- too many files at once.']);
  });

  it("falls back to the raw error message for an unrecognized code", () => {
    const messages = describeRejections([rejection("weird.pdf", "some-other-code", "Something else went wrong.")]);
    expect(messages).toEqual(["Something else went wrong."]);
  });

  it("collapses many too-many-files rejections into a single count", () => {
    // Dropping 15 files with a cap of 10 rejects the last 5 as
    // "too-many-files", each with a different filename -- these must not
    // produce 5 nearly-identical toasts.
    const many = Array.from({ length: 5 }, (_, i) => rejection(`f${i}.zip`, "too-many-files"));
    const messages = describeRejections(many);
    expect(messages).toEqual(["5 files weren't added -- too many at once."]);
  });

  it("caps per-file messages at 5, independent of a too-many-files summary", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      file: { name: `f${i}.zip` },
      errors: [{ code: "file-invalid-type", message: `msg-${i}` }],
    }));
    const messages = describeRejections(many);
    expect(messages.length).toBe(5);
  });
});
