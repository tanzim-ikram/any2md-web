import { describe, it, expect } from "vitest";
import { parsePageNumbers, parseQuality, parseRanges, MAX_RANGES, MAX_PAGE_NUMBERS } from "../../lib/pdf/request";

describe("parseRanges", () => {
  it("parses well-formed ranges", () => {
    expect(parseRanges([{ start: 1, end: 3 }, { start: 5, end: 5 }])).toEqual([
      { start: 1, end: 3 },
      { start: 5, end: 5 },
    ]);
  });

  it("rejects a non-array", () => {
    expect(() => parseRanges("1,2,3")).toThrow();
    expect(() => parseRanges({ start: 1, end: 2 })).toThrow();
    expect(() => parseRanges(null)).toThrow();
  });

  it("rejects an empty array", () => {
    expect(() => parseRanges([])).toThrow();
  });

  it("rejects an entry missing start or end", () => {
    expect(() => parseRanges([{ start: 1 }])).toThrow();
    expect(() => parseRanges([{ end: 1 }])).toThrow();
    expect(() => parseRanges([null])).toThrow();
  });

  it("rejects non-integer or non-number page values (type confusion)", () => {
    // A string like "1,2,3" previously reached toolbox.ts's .map() and
    // threw a raw TypeError (-> 500, and destroyed the upload).
    expect(() => parseRanges([{ start: "1", end: 2 }])).toThrow();
    expect(() => parseRanges([{ start: 1.5, end: 2 }])).toThrow();
    expect(() => parseRanges([{ start: 0, end: 2 }])).toThrow();
  });

  it("caps the number of ranges per request", () => {
    const many = Array.from({ length: MAX_RANGES + 1 }, () => ({ start: 1, end: 1 }));
    expect(() => parseRanges(many)).toThrow();
    const atLimit = Array.from({ length: MAX_RANGES }, () => ({ start: 1, end: 1 }));
    expect(() => parseRanges(atLimit)).not.toThrow();
  });
});

describe("parsePageNumbers", () => {
  it("parses a valid list", () => {
    expect(parsePageNumbers([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it("rejects a non-array (e.g. a comma-joined string)", () => {
    expect(() => parsePageNumbers("1,2,3")).toThrow();
  });

  it("rejects a mixed-type array", () => {
    expect(() => parsePageNumbers([1, "2"])).toThrow();
  });

  it("rejects non-integer entries", () => {
    expect(() => parsePageNumbers([1.5])).toThrow();
  });

  it("caps the number of pages per request", () => {
    const many = Array.from({ length: MAX_PAGE_NUMBERS + 1 }, (_, i) => i + 1);
    expect(() => parsePageNumbers(many)).toThrow();
  });
});

describe("parseQuality", () => {
  it("passes through undefined", () => {
    expect(parseQuality(undefined)).toBeUndefined();
  });

  it("rejects a non-number", () => {
    expect(() => parseQuality("60")).toThrow();
  });

  it("clamps an absurd value instead of letting it round-trip unclamped", () => {
    expect(parseQuality(1e9)).toBe(100);
    expect(parseQuality(-5)).toBe(1);
  });

  it("passes through an in-range value unchanged", () => {
    expect(parseQuality(60)).toBe(60);
  });
});
