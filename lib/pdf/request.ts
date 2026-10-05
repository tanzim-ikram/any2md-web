/**
 * Validates the untyped `options` payload of POST /api/pdf-tools before it
 * reaches lib/pdf/toolbox.ts. Everything here is pure (no Next/KV/storage
 * imports), so it's fully covered by tests/unit/pdf-request.test.ts without
 * needing route-level fakes.
 *
 * Without this, a malformed options object (a string where an array is
 * expected, a non-integer page number, ...) throws a raw TypeError deep
 * inside toolbox.ts, which surfaces as a generic 500 AND -- because the
 * route's catch destroys the input on any non-recoverable error -- takes
 * the user's upload down with it. An unbounded array (thousands of ranges)
 * also makes toolbox.ts generate and `save()` one PDF per entry in a single
 * request with no cap at all.
 */
import { ConversionError } from "../conversion/types";
import type { PageRange } from "./toolbox";

/** Generous but finite: splitting into more pieces than this in one request
 * is never a legitimate use of the tool, only an accident or an attempt to
 * make the server do unbounded work. */
export const MAX_RANGES = 100;
export const MAX_PAGE_NUMBERS = 1000;

function invalid(message: string): never {
  throw new ConversionError("INVALID_PAGE_RANGE", "Invalid request", message);
}

/** A JSON value that survived `JSON.parse` and claims to be a page number.
 * Deliberately checked with `Number.isSafeInteger` on the already-parsed
 * value -- never `Number(someString)`, which accepts exponential/hex
 * notation ("1e3", "0x10") as valid integers. */
function asPageNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    invalid(`"${String(value)}" isn't a valid page number.`);
  }
  return value;
}

export function parseRanges(value: unknown): PageRange[] {
  if (!Array.isArray(value)) {
    invalid("`ranges` must be an array of { start, end } page ranges.");
  }
  if (value.length === 0) {
    invalid("Specify at least one page range to split.");
  }
  if (value.length > MAX_RANGES) {
    invalid(`Too many ranges: the limit is ${MAX_RANGES} per request.`);
  }
  return value.map((entry) => {
    if (typeof entry !== "object" || entry === null) {
      invalid("Each range must be an object with `start` and `end`.");
    }
    const { start, end } = entry as { start?: unknown; end?: unknown };
    return { start: asPageNumber(start), end: asPageNumber(end) };
  });
}

export function parsePageNumbers(value: unknown): number[] {
  if (!Array.isArray(value)) {
    invalid("`pages` must be an array of page numbers.");
  }
  if (value.length > MAX_PAGE_NUMBERS) {
    invalid(`Too many pages: the limit is ${MAX_PAGE_NUMBERS} per request.`);
  }
  return value.map(asPageNumber);
}

export function parseQuality(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    invalid("`quality` must be a number between 1 and 100.");
  }
  // Clamped rather than rejected -- compressPdf already clamps internally,
  // this just keeps an absurd value (1e9) from round-tripping unclamped
  // through logs/records before it gets there.
  return Math.round(Math.min(100, Math.max(1, value)));
}
