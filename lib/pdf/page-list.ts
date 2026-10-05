/** No real PDF this app handles can exceed this many pages (mirrors
 * lib/pdf/toolbox.ts's own MAX_PAGES), so a parsed page list is capped here
 * too -- otherwise a range like "1-999999999" would expand into a
 * multi-gigabyte Set before any bound was ever checked. Not imported from
 * toolbox.ts: this module is client-bundled (see rotate-panel.tsx /
 * extract-panel.tsx) and toolbox.ts pulls in server-only deps (pdf-lib,
 * sharp) that have no business in that bundle. */
const MAX_EXPANDED_PAGES = 300;

/** Parses a user-typed page list like "1,3,5-7" into [1,3,5,6,7] (1-indexed,
 * duplicates removed, sorted). Shared by the rotate/extract panels so both
 * accept the same input syntax. Throws a plain Error with a message meant
 * to be shown to the user directly (via toast), not a ConversionError --
 * this never reaches the server, it's parsed client-side before the call.
 *
 * `maxPage` of `0` is meaningful (a 0-page document) and must reject every
 * page number, so it's distinguished from "no bound given" via `?? `, not
 * `||`/truthiness. */
export function parsePageList(input: string, maxPage?: number): number[] {
  const bound = maxPage ?? Number.MAX_SAFE_INTEGER;
  const pages = new Set<number>();
  const parts = input
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    throw new Error("Enter at least one page or range.");
  }

  for (const part of parts) {
    const rangeMatch = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (rangeMatch) {
      // Matched against \d+ above, so these are plain decimal integers --
      // Number() here can't land on "1e3"/"0x10" the way it could on an
      // unvalidated string.
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      if (start < 1 || end < start) {
        throw new Error(`"${part}" isn't a valid range.`);
      }
      // Bound-check BEFORE expanding -- a check only after the loop still
      // lets "1-999999999" allocate a billion Set entries first.
      if (end > bound) {
        throw new Error(maxPage === 0 ? "This PDF has no pages." : `This PDF only has ${maxPage} pages.`);
      }
      if (end - start + 1 > MAX_EXPANDED_PAGES) {
        throw new Error(`"${part}" spans too many pages (limit ${MAX_EXPANDED_PAGES} per range).`);
      }
      for (let p = start; p <= end; p++) pages.add(p);
      continue;
    }
    // Matched against a strict all-digits pattern, not a bare Number()
    // call -- Number("1e3") is 1000 and Number.isInteger(1000) is true, so
    // an unvalidated Number() cast would silently accept exponential (and
    // "0x10" hex) notation as a page number.
    if (!/^\d+$/.test(part)) {
      throw new Error(`"${part}" isn't a valid page number.`);
    }
    const single = Number(part);
    if (single < 1) {
      throw new Error(`"${part}" isn't a valid page number.`);
    }
    if (single > bound) {
      throw new Error(maxPage === 0 ? "This PDF has no pages." : `This PDF only has ${maxPage} pages.`);
    }
    pages.add(single);
  }

  if (pages.size > MAX_EXPANDED_PAGES) {
    throw new Error(`Too many pages selected (limit ${MAX_EXPANDED_PAGES}).`);
  }

  return [...pages].sort((a, b) => a - b);
}

/** One row of the split panel's "page ranges" input before it's sent to the
 * server. Both `start` and `end` arrive as raw text, since that's what an
 * `<input>` produces. */
export interface RangeInputRow {
  start: string;
  end: string;
}

export type ValidatedRanges =
  | { ok: true; ranges: { start: number; end: number }[] }
  | { ok: false; message: string };

/** Generous but finite: mirrors lib/pdf/request.ts's MAX_RANGES on the
 * server, so the client-side error (if any) is the same shape. */
const MAX_RANGE_ROWS = 100;

/** Validates the split panel's page-range rows before they're sent to
 * /api/pdf-tools. `Number("")` is `0`, which IS an integer -- so a blank
 * input field was previously passing `Number.isInteger` and shipping
 * `{ start: 1, end: 0 }` to the server, which rejects it as "backwards"
 * (and, per the server's own recoverable-error handling, now resets the
 * upload rather than destroying it -- but it's still a client bug worth
 * catching before the round trip). */
export function validateRangeInputs(rows: RangeInputRow[], pageCount: number | null): ValidatedRanges {
  if (rows.length === 0) {
    return { ok: false, message: "Add at least one page range." };
  }
  if (rows.length > MAX_RANGE_ROWS) {
    return { ok: false, message: `Too many ranges: the limit is ${MAX_RANGE_ROWS}.` };
  }

  const ranges: { start: number; end: number }[] = [];
  for (const row of rows) {
    if (row.start.trim() === "" || row.end.trim() === "") {
      return { ok: false, message: "Every range needs both a start and an end page." };
    }
    if (!/^\d+$/.test(row.start.trim()) || !/^\d+$/.test(row.end.trim())) {
      return { ok: false, message: "Page numbers must be whole numbers." };
    }
    const start = Number(row.start);
    const end = Number(row.end);
    if (start < 1 || end < start) {
      return { ok: false, message: `"${row.start}-${row.end}" isn't a valid range.` };
    }
    if (pageCount !== null && end > pageCount) {
      return { ok: false, message: `This PDF only has ${pageCount} pages.` };
    }
    ranges.push({ start, end });
  }

  return { ok: true, ranges };
}
