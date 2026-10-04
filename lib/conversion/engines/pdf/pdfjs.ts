/**
 * Thin loader around pdfjs-dist's legacy Node build. pdfjs-dist ships ESM
 * only in its "legacy" (no-DOM-API-required) build, so this is a dynamic
 * import wrapped once and cached, rather than scattering `await import()`
 * across the pdf engine's modules.
 */
export async function getPdfjs() {
  return import("pdfjs-dist/legacy/build/pdf.mjs");
}

export type PdfjsModule = Awaited<ReturnType<typeof getPdfjs>>;
