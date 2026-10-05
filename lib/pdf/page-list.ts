/** Parses a user-typed page list like "1,3,5-7" into [1,3,5,6,7] (1-indexed,
 * duplicates removed, sorted). Shared by the rotate/extract panels so both
 * accept the same input syntax. Throws a plain Error with a message meant
 * to be shown to the user directly (via toast), not a ConversionError --
 * this never reaches the server, it's parsed client-side before the call. */
export function parsePageList(input: string, maxPage?: number): number[] {
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
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      if (start < 1 || end < start) {
        throw new Error(`"${part}" isn't a valid range.`);
      }
      for (let p = start; p <= end; p++) pages.add(p);
      continue;
    }
    const single = Number(part);
    if (!Number.isInteger(single) || single < 1) {
      throw new Error(`"${part}" isn't a valid page number.`);
    }
    pages.add(single);
  }

  const sorted = [...pages].sort((a, b) => a - b);
  if (maxPage && sorted.some((p) => p > maxPage)) {
    throw new Error(`This PDF only has ${maxPage} pages.`);
  }
  return sorted;
}
