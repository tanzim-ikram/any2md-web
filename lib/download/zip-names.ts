/** Picks a unique name for a file going into a ZIP archive, given the set
 * of names already used. Needed because PDF-tools output names can
 * genuinely collide: splitPdf names a single-page range "p1" and another
 * range that also starts at page 1 the same way (lib/pdf/toolbox.ts), so
 * two outputs can share a filename in the same request. Writing both into
 * a flat ZIP under the same name previously meant only one survived
 * (JS object key / zip-entry overwrite); this instead produces
 * "report.pdf", "report (2).pdf", "report (3).pdf", ... */
export function uniqueZipName(taken: Set<string>, name: string): string {
  if (!taken.has(name)) {
    taken.add(name);
    return name;
  }
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let n = 2;
  let candidate = `${base} (${n})${ext}`;
  while (taken.has(candidate)) {
    n += 1;
    candidate = `${base} (${n})${ext}`;
  }
  taken.add(candidate);
  return candidate;
}
