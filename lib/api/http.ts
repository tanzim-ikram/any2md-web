/** HTTP header helpers shared by the download routes. */

/**
 * Builds a `Content-Disposition` header that survives a filename with
 * spaces or non-ASCII characters intact. The previous form --
 * `filename="${encodeURIComponent(name)}"` -- percent-encodes the value
 * but still presents it as the *plain* `filename` parameter, which browsers
 * take literally: "my report.md" (a name `sanitizeFilename` explicitly
 * allows) downloaded as the file literally named "my%20report.md".
 *
 * RFC 6266 / 5987's fix is to carry two parameters: an ASCII-only
 * `filename` for clients that don't understand the extended form, and a
 * `filename*=UTF-8''...` with the real (percent-encoded) name for clients
 * that do. Every modern browser prefers the latter when both are present.
 */
export function contentDisposition(filename: string): string {
  // Non-ASCII and quote/backslash characters can't appear in the plain
  // `filename` parameter's value at all; replace them with "_" there --
  // the extended parameter below carries the real name.
  const asciiFallback = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
