/** Small helpers shared across conversion engines. */

/** Strip the extension from a filename, e.g. "report.docx" -> "report".
 * Deliberately not regex-based (a backslash-heavy character class here is
 * an easy way to write a silent syntax error) and guards dotfiles like
 * ".gitignore" (lastIndexOf 0) by returning them unchanged. */
export function stripExt(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(0, dot) : filename;
}

export function outputName(customName: string | undefined, sourceFilename: string, ext: string): string {
  const base = customName ?? stripExt(sourceFilename);
  return `${base}.${ext}`;
}
