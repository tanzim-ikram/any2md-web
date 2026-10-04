/**
 * Font-size and bold/italic heuristics, ported from the desktop app's
 * any2md/conversion/pdf_markdown.py (_detect_body_size, _detect_heading_sizes,
 * and the bold/italic-from-font-name trick pdfplumber also uses).
 */
import type { PdfTextItem } from "./types";

/** sqrt(a^2 + b^2) of the text matrix ~ the rendered font size in PDF units. */
export function itemFontSize(item: PdfTextItem): number {
  const [a, b] = item.transform;
  return Math.sqrt(a * a + b * b);
}

/** The most common font size, weighted by character count, is treated as
 * "body text" -- exactly the desktop app's _detect_body_size approach. Using
 * character-count weighting (not occurrence count) keeps one giant heading
 * item from skewing the histogram. */
export function detectBodySize(items: PdfTextItem[]): number {
  const weighted = new Map<number, number>();
  for (const item of items) {
    const text = item.str.trim();
    if (!text) continue;
    const size = Math.round(itemFontSize(item) * 10) / 10; // bucket to 0.1pt
    weighted.set(size, (weighted.get(size) ?? 0) + text.length);
  }
  if (weighted.size === 0) return 12;
  let bodySize = 12;
  let maxWeight = -1;
  for (const [size, weight] of weighted) {
    if (weight > maxWeight) {
      maxWeight = weight;
      bodySize = size;
    }
  }
  return bodySize;
}

/** Map font sizes strictly larger than body text to heading levels 1-4,
 * largest size -> h1. Sizes within ~5% of each other are treated as the
 * same heading level (PDF renderers often emit slightly different sizes
 * for what is visually the same heading style). */
export function detectHeadingSizes(items: PdfTextItem[], bodySize: number): Map<number, number> {
  const sizes = new Set<number>();
  for (const item of items) {
    if (!item.str.trim()) continue;
    sizes.add(Math.round(itemFontSize(item) * 10) / 10);
  }

  const candidates = [...sizes].filter((s) => s > bodySize * 1.05).sort((a, b) => b - a);

  // Cluster near-equal sizes together so e.g. 20.0 and 20.4 both map to h1.
  const clusters: number[][] = [];
  for (const size of candidates) {
    const last = clusters[clusters.length - 1];
    if (last && size >= last[0] * 0.95) {
      last.push(size);
    } else {
      clusters.push([size]);
    }
  }

  const map = new Map<number, number>();
  clusters.slice(0, 4).forEach((cluster, idx) => {
    for (const size of cluster) map.set(size, idx + 1); // h1..h4
  });
  return map;
}

const BOLD_RE = /bold|black|heavy|semibold|demibold/i;
const ITALIC_RE = /italic|oblique/i;

/** Resolve the *real* font family name for an item's internal font id and
 * test it for bold/italic markers in the name -- the same trick pdfplumber
 * uses (and the desktop app relies on), since embedded font subsets rarely
 * carry explicit weight/style fields but do carry descriptive names like
 * "Calibri-Bold" or "TimesNewRomanPS-ItalicMT". */
export function isBoldItalicFromFontName(realFontName: string | undefined): { bold: boolean; italic: boolean } {
  const name = realFontName ?? "";
  return { bold: BOLD_RE.test(name), italic: ITALIC_RE.test(name) };
}
