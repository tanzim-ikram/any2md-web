/** Minimal shape of a pdf.js TextItem we actually read. Declared locally
 * rather than imported from pdfjs-dist's types because the legacy ESM
 * build's bundled .d.ts does not cleanly resolve under `moduleResolution:
 * bundler` for a dynamically-imported module. */
export interface PdfTextItem {
  str: string;
  dir: string;
  transform: number[]; // [a, b, c, d, e, f] -- e,f are x,y; sqrt(a*a+b*b) ~ font size
  width: number;
  height: number;
  fontName: string;
  hasEOL: boolean;
}

export interface PdfFontInfo {
  name: string; // e.g. "g_d0_f1" (internal) resolved to the real family name
}

/** A single line of text reconstructed from items on (roughly) the same
 * baseline, in left-to-right reading order. */
export interface PdfLine {
  text: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  x: number;
  y: number;
  /** Per-run formatting, for inline bold/italic rendering within a line. */
  runs: PdfRun[];
}

export interface PdfRun {
  text: string;
  bold: boolean;
  italic: boolean;
}

export interface PdfTableGrid {
  rows: string[][];
  /** Bounding box in PDF user-space units, used to exclude the table's text
   * items from the surrounding paragraph/line reconstruction. */
  bbox: { x0: number; y0: number; x1: number; y1: number };
}
