/**
 * Pass 2: ruled-table recovery from PDF drawing operators.
 *
 * Verified empirically against a real Chromium-rendered PDF (see
 * scripts/spike-check-table-ops.ts) rather than assumed from docs: browsers
 * render CSS `border: 1px solid` table cells as many thin FILLED rectangles
 * (one per edge, via `constructPath` with paint-op `fill`), not stroked
 * lines. Each rectangle's corner coordinates are in LOCAL path space and
 * must be mapped through the content stream's own save/transform/restore
 * stack to land in the same PDF user-space coordinates that
 * `page.getTextContent()` item transforms already use -- pdf.js's operator
 * list never applies the viewport used by `page.render()`, so there is no
 * extra scale/flip to account for here.
 *
 * Only *ruled* tables (visible cell borders) are recoverable this way.
 * Borderless, whitespace-aligned tables are explicitly out of v1 -- see
 * lib/conversion/tools.ts's `limitations` for "pdf:md".
 */
import type { PdfBlock } from "./lines";
import type { PdfTableGrid, PdfTextItem } from "./types";
import type { PdfjsModule } from "./pdfjs";

type Matrix = [number, number, number, number, number, number]; // a,b,c,d,e,f

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** Canvas-2D `transform()` composition: CTM_new = CTM_old ∘ M. */
function multiply(m1: Matrix, m2: Matrix): Matrix {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

function applyPoint(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Decode one constructPath's packed draw-ops array (DrawOPS: 0=moveTo,
 * 1=lineTo, 2=curveTo, 3=quadraticCurveTo, 4=closePath -- see
 * scripts/spike-check-table-ops.ts for how this was confirmed against
 * pdfjs-dist's source) into a flat list of (x, y) points. Curves are
 * approximated by their endpoints only -- sufficient for detecting
 * axis-aligned border rectangles, which never curve. */
function decodePathPoints(packed: ArrayLike<number>): [number, number][] {
  const points: [number, number][] = [];
  let i = 0;
  while (i < packed.length) {
    const op = packed[i++];
    if (op === 0 || op === 1) {
      // moveTo | lineTo
      points.push([packed[i], packed[i + 1]]);
      i += 2;
    } else if (op === 2) {
      // curveTo: 3 control points, we only need the endpoint
      points.push([packed[i + 4], packed[i + 5]]);
      i += 6;
    } else if (op === 3) {
      // quadraticCurveTo: 2 control points, endpoint only
      points.push([packed[i + 2], packed[i + 3]]);
      i += 4;
    } else if (op === 4) {
      // closePath: no coordinates
    } else {
      break; // unrecognized op -- stop rather than misread the rest
    }
  }
  return points;
}

const THIN_PX = 2.5; // a border hairline is at most this wide, in PDF points

/** Find thin, axis-aligned filled/stroked rectangles across the whole page
 * and convert each to page-space coordinates via a manually-tracked CTM. */
function findBorderSegments(opList: { fnArray: number[]; argsArray: unknown[] }, pdfjs: PdfjsModule): Rect[] {
  const OPS = pdfjs.OPS;
  const segments: Rect[] = [];
  const stack: Matrix[] = [];
  let ctm: Matrix = IDENTITY;

  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i];
    const args = opList.argsArray[i];

    if (fn === OPS.save) {
      stack.push(ctm);
    } else if (fn === OPS.restore) {
      ctm = stack.pop() ?? IDENTITY;
    } else if (fn === OPS.transform) {
      const [a, b, c, d, e, f] = args as number[];
      ctm = multiply(ctm, [a, b, c, d, e, f]);
    } else if (fn === OPS.constructPath) {
      const [paintOp, pathDataList] = args as [number, ArrayLike<number>[], unknown];
      const isPainted =
        paintOp === OPS.fill ||
        paintOp === OPS.eoFill ||
        paintOp === OPS.stroke ||
        paintOp === OPS.fillStroke ||
        paintOp === OPS.eoFillStroke;
      if (!isPainted) continue;

      for (const packed of pathDataList) {
        const points = decodePathPoints(packed);
        if (points.length < 2) continue;
        const mapped = points.map(([x, y]) => applyPoint(ctm, x, y));
        const xs = mapped.map((p) => p[0]);
        const ys = mapped.map((p) => p[1]);
        const x0 = Math.min(...xs);
        const x1 = Math.max(...xs);
        const y0 = Math.min(...ys);
        const y1 = Math.max(...ys);
        const w = x1 - x0;
        const h = y1 - y0;
        // A border hairline: thin in exactly one axis, with real extent in
        // the other (excludes dots/specks and large filled boxes alike).
        if ((w <= THIN_PX && h > THIN_PX * 2) || (h <= THIN_PX && w > THIN_PX * 2)) {
          segments.push({ x0, y0, x1, y1 });
        }
      }
    }
  }

  return segments;
}

function clusterCoordinates(values: number[], tolerance = 1.5): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const clusters: number[][] = [];
  for (const v of sorted) {
    const last = clusters[clusters.length - 1];
    if (last && v - last[last.length - 1] <= tolerance) last.push(v);
    else clusters.push([v]);
  }
  return clusters.map((c) => c.reduce((a, b) => a + b, 0) / c.length);
}

/** Build a grid from clustered horizontal/vertical line positions and
 * populate each cell with the text items whose center falls inside it. */
function buildGridFromSegments(segments: Rect[], textItems: PdfTextItem[]): PdfTableGrid[] {
  if (segments.length === 0) return [];

  // A vertical border segment is tall and thin; a horizontal one is wide and
  // thin. Collect each kind's constant coordinate.
  const verticalXs: number[] = [];
  const horizontalYs: number[] = [];
  for (const s of segments) {
    const w = s.x1 - s.x0;
    const h = s.y1 - s.y0;
    if (w <= THIN_PX && h > THIN_PX * 2) verticalXs.push((s.x0 + s.x1) / 2);
    else if (h <= THIN_PX && w > THIN_PX * 2) horizontalYs.push((s.y0 + s.y1) / 2);
  }

  const colLines = clusterCoordinates(verticalXs);
  const rowLines = clusterCoordinates(horizontalYs).sort((a, b) => b - a); // PDF y grows upward; want top-to-bottom

  // Need at least a 2x2 grid (header + one row, 2+ columns) to call this a table.
  if (colLines.length < 2 || rowLines.length < 2) return [];

  // A single page may contain multiple separate tables; group grid lines into
  // one table per contiguous bounding region by overall span for v1 (most
  // documents have at most one table per page region of interest).
  const bbox = {
    x0: Math.min(...colLines),
    x1: Math.max(...colLines),
    y0: Math.min(...rowLines),
    y1: Math.max(...rowLines),
  };

  const rows: string[][] = [];
  for (let r = 0; r < rowLines.length - 1; r++) {
    const cellTop = rowLines[r];
    const cellBottom = rowLines[r + 1];
    const row: string[] = [];
    for (let c = 0; c < colLines.length - 1; c++) {
      const cellLeft = colLines[c];
      const cellRight = colLines[c + 1];
      const cellText = textItems
        .filter((it) => {
          const x = it.transform[4];
          const y = it.transform[5];
          return x >= cellLeft - 1 && x <= cellRight + 1 && y >= cellBottom - 1 && y <= cellTop + 1;
        })
        .sort((a, b) => a.transform[4] - b.transform[4])
        .map((it) => it.str)
        .join("")
        .trim();
      row.push(cellText);
    }
    rows.push(row);
  }

  return [{ rows, bbox }];
}

export function detectRuledTables(
  opList: { fnArray: number[]; argsArray: unknown[] },
  pdfjs: PdfjsModule,
  textItems: PdfTextItem[],
): PdfTableGrid[] {
  const segments = findBorderSegments(opList, pdfjs);
  return buildGridFromSegments(segments, textItems);
}

/** Remove text items that fall inside a detected table's bounding box, so
 * Pass 1's paragraph/heading reconstruction doesn't also re-emit the
 * table's cell text as stray lines. */
export function removeItemsInTables(items: PdfTextItem[], tables: PdfTableGrid[]): PdfTextItem[] {
  return items.filter((it) => {
    const x = it.transform[4];
    const y = it.transform[5];
    return !tables.some((t) => x >= t.bbox.x0 - 1 && x <= t.bbox.x1 + 1 && y >= t.bbox.y0 - 1 && y <= t.bbox.y1 + 1);
  });
}

function escapeCell(cell: string): string {
  return cell.replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

export function tableToBlock(table: PdfTableGrid): PdfBlock {
  const colCount = Math.max(...table.rows.map((r) => r.length), 1);
  const pad = (r: string[]) => {
    const copy = r.slice(0, colCount);
    while (copy.length < colCount) copy.push("");
    return copy;
  };
  const [header, ...rest] = table.rows.map(pad);
  const lines = [
    `| ${header.map(escapeCell).join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...rest.map((r) => `| ${r.map(escapeCell).join(" | ")} |`),
  ];
  return { kind: "paragraph", text: lines.join("\n") };
}
