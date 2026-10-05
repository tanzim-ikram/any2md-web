import { describe, it, expect } from "vitest";
import { parsePageList, validateRangeInputs } from "../../lib/pdf/page-list";

describe("parsePageList", () => {
  it("parses a mix of single pages and ranges, deduped and sorted", () => {
    expect(parsePageList("1,3,5-7", 10)).toEqual([1, 3, 5, 6, 7]);
    expect(parsePageList("3,1,3,2", 5)).toEqual([1, 2, 3]);
  });

  it("rejects a backwards range", () => {
    expect(() => parsePageList("5-1", 10)).toThrow();
  });

  it("rejects an empty input", () => {
    expect(() => parsePageList("", 10)).toThrow();
    expect(() => parsePageList("   ", 10)).toThrow();
  });

  it("rejects a page beyond maxPage", () => {
    expect(() => parsePageList("11", 10)).toThrow(/only has 10 pages/);
  });

  it("treats maxPage === 0 as zero allowed pages, not unlimited", () => {
    // Number(0) is falsy, so `if (maxPage && ...)` previously skipped the
    // bound check entirely for a 0-page document.
    expect(() => parsePageList("1", 0)).toThrow();
  });

  it("rejects exponential and hex notation disguised as integers", () => {
    // Number("1e3") === 1000 and Number.isInteger(1000) === true, so a
    // bare Number() cast on unvalidated input silently accepted these.
    expect(() => parsePageList("1e3", 10000)).toThrow();
    expect(() => parsePageList("0x10", 10000)).toThrow();
    expect(() => parsePageList("1.5", 10)).toThrow();
    expect(() => parsePageList("+1", 10)).toThrow();
  });

  it("rejects a range whose bound check would otherwise run after an unbounded expansion", () => {
    const start = performance.now();
    expect(() => parsePageList("1-999999999", 10)).toThrow(/only has 10 pages/);
    // The bound check must happen before expanding the range into a Set --
    // a regression here would make this call allocate ~1e9 entries first.
    expect(performance.now() - start).toBeLessThan(100);
  });

  it("caps the total expanded page count even within maxPage", () => {
    expect(() => parsePageList("1-500", 1000)).toThrow(/too many pages|limit/i);
  });
});

describe("validateRangeInputs", () => {
  it("accepts well-formed ranges", () => {
    const result = validateRangeInputs([{ start: "1", end: "3" }, { start: "5", end: "5" }], 10);
    expect(result).toEqual({ ok: true, ranges: [{ start: 1, end: 3 }, { start: 5, end: 5 }] });
  });

  it("rejects a blank end field", () => {
    // Number("") === 0, which IS an integer -- the bug this closes.
    const result = validateRangeInputs([{ start: "1", end: "" }], 10);
    expect(result.ok).toBe(false);
  });

  it("rejects a blank start field", () => {
    const result = validateRangeInputs([{ start: "", end: "3" }], 10);
    expect(result.ok).toBe(false);
  });

  it("rejects end beyond the known page count", () => {
    const result = validateRangeInputs([{ start: "1", end: "20" }], 10);
    expect(result.ok).toBe(false);
  });

  it("rejects start greater than end", () => {
    const result = validateRangeInputs([{ start: "5", end: "1" }], 10);
    expect(result.ok).toBe(false);
  });

  it("rejects a non-integer page number", () => {
    const result = validateRangeInputs([{ start: "1.5", end: "3" }], 10);
    expect(result.ok).toBe(false);
  });

  it("rejects more than the row cap", () => {
    const rows = Array.from({ length: 101 }, () => ({ start: "1", end: "1" }));
    const result = validateRangeInputs(rows, 10);
    expect(result.ok).toBe(false);
  });

  it("accepts ranges when the page count isn't known yet", () => {
    const result = validateRangeInputs([{ start: "1", end: "999" }], null);
    expect(result.ok).toBe(true);
  });
});
