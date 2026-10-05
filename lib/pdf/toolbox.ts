/**
 * PDF toolbox operations (merge/split/rotate/extract/reorder/compress). Unlike
 * lib/conversion/registry.ts these never change format (pdf -> pdf), so they
 * live outside the format-pair registry and are reached through
 * app/api/pdf-tools/route.ts instead of /api/convert. Built on pdf-lib, which
 * is already a dependency of lib/conversion/engines/to-pdf.ts.
 */
import { PDFDocument, PDFName, PDFRawStream, PDFNumber, degrees } from "pdf-lib";
import sharp from "sharp";
import { ConversionError } from "../conversion/types";
import { stripExt } from "../conversion/engines/util";

const MAX_PAGES = 300; // mirrors lib/conversion/engines/pdf/index.ts

export interface PdfToolOutput {
  buffer: Buffer;
  filename: string;
}

export interface PdfToolWarning {
  code: string;
  message: string;
}

async function loadPdf(input: Buffer, filename: string): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(input, { ignoreEncryption: false });
  } catch (err) {
    const message = String((err as Error)?.message ?? err);
    if (/encrypt/i.test(message)) {
      throw new ConversionError(
        "PASSWORD_PROTECTED",
        "This PDF is password-protected",
        `"${filename}" is encrypted. Please remove the password and try again.`,
        { cause: err },
      );
    }
    throw new ConversionError(
      "CORRUPTED_FILE",
      "Couldn't read this PDF",
      `"${filename}" could not be opened. It may be corrupted or not a valid PDF file.`,
      { cause: err },
    );
  }
}

function assertPageCount(count: number, filename: string): void {
  if (count === 0) {
    throw new ConversionError("CORRUPTED_FILE", "Nothing to process", `"${filename}" has no pages.`);
  }
  if (count > MAX_PAGES) {
    throw new ConversionError(
      "PAGE_LIMIT_EXCEEDED",
      "This PDF is too long",
      `"${filename}" has ${count} pages. The limit is ${MAX_PAGES} pages.`,
    );
  }
}

/** Validate a 1-indexed page number against a document's page count,
 * converting to the 0-indexed form pdf-lib's API expects. */
function toZeroIndexed(page: number, pageCount: number, filename: string): number {
  if (!Number.isInteger(page) || page < 1 || page > pageCount) {
    throw new ConversionError(
      "INVALID_PAGE_RANGE",
      "Invalid page number",
      `"${filename}" only has ${pageCount} page${pageCount === 1 ? "" : "s"}; page ${page} doesn't exist.`,
    );
  }
  return page - 1;
}

export async function getPdfPageCount(input: Buffer, filename: string): Promise<number> {
  const doc = await loadPdf(input, filename);
  return doc.getPageCount();
}

export async function mergePdfs(files: { buffer: Buffer; filename: string }[]): Promise<PdfToolOutput> {
  const merged = await PDFDocument.create();
  for (const file of files) {
    const doc = await loadPdf(file.buffer, file.filename);
    assertPageCount(doc.getPageCount(), file.filename);
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    for (const page of pages) merged.addPage(page);
  }
  if (merged.getPageCount() > MAX_PAGES) {
    throw new ConversionError(
      "PAGE_LIMIT_EXCEEDED",
      "Merged PDF is too long",
      `The merged PDF would have ${merged.getPageCount()} pages. The limit is ${MAX_PAGES} pages.`,
    );
  }
  const buffer = Buffer.from(await merged.save());
  return { buffer, filename: "merged.pdf" };
}

export interface PageRange {
  start: number; // 1-indexed, inclusive
  end: number; // 1-indexed, inclusive
}

export async function splitPdf(
  input: Buffer,
  filename: string,
  ranges: PageRange[],
): Promise<PdfToolOutput[]> {
  const source = await loadPdf(input, filename);
  const pageCount = source.getPageCount();
  assertPageCount(pageCount, filename);
  if (ranges.length === 0) {
    throw new ConversionError("INVALID_PAGE_RANGE", "No page ranges given", "Specify at least one page range to split.");
  }

  const base = stripExt(filename);
  const outputs: PdfToolOutput[] = [];
  for (const range of ranges) {
    if (range.start > range.end) {
      throw new ConversionError(
        "INVALID_PAGE_RANGE",
        "Invalid page range",
        `Range ${range.start}-${range.end} is backwards; start must come before end.`,
      );
    }
    const indices = [];
    for (let p = range.start; p <= range.end; p++) indices.push(toZeroIndexed(p, pageCount, filename));

    const out = await PDFDocument.create();
    const pages = await out.copyPages(source, indices);
    for (const page of pages) out.addPage(page);
    const buffer = Buffer.from(await out.save());
    const suffix = range.start === range.end ? `p${range.start}` : `p${range.start}-${range.end}`;
    outputs.push({ buffer, filename: `${base}_${suffix}.pdf` });
  }
  return outputs;
}

export async function rotatePdf(
  input: Buffer,
  filename: string,
  rotationDegrees: 90 | 180 | 270 | -90,
  pages?: number[],
): Promise<PdfToolOutput> {
  const doc = await loadPdf(input, filename);
  const pageCount = doc.getPageCount();
  assertPageCount(pageCount, filename);

  const targets = pages?.length ? pages.map((p) => toZeroIndexed(p, pageCount, filename)) : doc.getPageIndices();
  for (const index of targets) {
    const page = doc.getPage(index);
    // Normalize into [0, 360) -- pdf-lib's own validator only checks the
    // angle is a multiple of 90, not that it's in range, so repeated
    // rotations (e.g. 270 then 180) would otherwise accumulate past 360
    // and write out a technically-valid but needlessly large /Rotate value.
    const normalized = ((page.getRotation().angle + rotationDegrees) % 360 + 360) % 360;
    page.setRotation(degrees(normalized));
  }

  const buffer = Buffer.from(await doc.save());
  return { buffer, filename: `${stripExt(filename)}_rotated.pdf` };
}

export async function extractPages(input: Buffer, filename: string, pages: number[]): Promise<PdfToolOutput> {
  const source = await loadPdf(input, filename);
  const pageCount = source.getPageCount();
  assertPageCount(pageCount, filename);
  if (pages.length === 0) {
    throw new ConversionError("INVALID_PAGE_RANGE", "No pages given", "Select at least one page to extract.");
  }

  const indices = pages.map((p) => toZeroIndexed(p, pageCount, filename));
  const out = await PDFDocument.create();
  const copied = await out.copyPages(source, indices);
  for (const page of copied) out.addPage(page);

  const buffer = Buffer.from(await out.save());
  return { buffer, filename: `${stripExt(filename)}_extracted.pdf` };
}

export async function reorderPages(input: Buffer, filename: string, order: number[]): Promise<PdfToolOutput> {
  const source = await loadPdf(input, filename);
  const pageCount = source.getPageCount();
  assertPageCount(pageCount, filename);

  if (order.length !== pageCount) {
    throw new ConversionError(
      "INVALID_PAGE_RANGE",
      "Invalid page order",
      `The new order must list all ${pageCount} pages exactly once.`,
    );
  }
  const indices = order.map((p) => toZeroIndexed(p, pageCount, filename));
  const seen = new Set(indices);
  if (seen.size !== pageCount) {
    throw new ConversionError(
      "INVALID_PAGE_RANGE",
      "Invalid page order",
      "The new order must list every page exactly once, with no repeats.",
    );
  }

  const out = await PDFDocument.create();
  const copied = await out.copyPages(source, indices);
  for (const page of copied) out.addPage(page);

  const buffer = Buffer.from(await out.save());
  return { buffer, filename: `${stripExt(filename)}_reordered.pdf` };
}

const DEFAULT_COMPRESS_QUALITY = 60;

/**
 * Re-encodes embedded JPEG (DCTDecode) images at a lower quality, in place,
 * by reassigning each image's existing indirect reference to a new raw
 * stream -- this avoids touching any page's /Resources dictionary. Images
 * in color spaces other than DeviceRGB/DeviceGray (e.g. CMYK, indexed) are
 * left untouched rather than risk sharp mis-decoding them. If the result
 * isn't actually smaller, the original bytes are returned unchanged (see
 * the tool's documented limitation in lib/conversion/tools.ts).
 */
export async function compressPdf(
  input: Buffer,
  filename: string,
  quality: number = DEFAULT_COMPRESS_QUALITY,
): Promise<PdfToolOutput & { warnings: PdfToolWarning[] }> {
  const doc = await loadPdf(input, filename);
  assertPageCount(doc.getPageCount(), filename);
  const clampedQuality = Math.round(Math.min(100, Math.max(1, quality)));

  const context = doc.context;
  const filterName = PDFName.of("Filter");
  const subtypeName = PDFName.of("Subtype");
  const colorSpaceName = PDFName.of("ColorSpace");
  let touched = 0;

  for (const [ref, obj] of context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    const dict = obj.dict;
    if (dict.lookup(subtypeName)?.toString() !== "/Image") continue;
    if (dict.lookup(filterName)?.toString() !== "/DCTDecode") continue;
    const colorSpace = dict.lookup(colorSpaceName)?.toString();
    if (colorSpace && colorSpace !== "/DeviceRGB" && colorSpace !== "/DeviceGray") continue;

    try {
      const recompressed = await sharp(Buffer.from(obj.getContents())).jpeg({ quality: clampedQuality }).toBuffer();
      if (recompressed.length >= obj.getContentsSize()) continue;

      const newDict = dict.clone(context);
      newDict.set(PDFName.of("Length"), PDFNumber.of(recompressed.length));
      context.assign(ref, PDFRawStream.of(newDict, recompressed));
      touched += 1;
    } catch {
      // Not a plain re-encodable JPEG (e.g. unusual color transform) --
      // leave this image exactly as it was.
    }
  }

  const buffer = Buffer.from(await doc.save());
  const warnings: PdfToolWarning[] = [];

  if (touched === 0 || buffer.length >= input.length) {
    warnings.push({
      code: "NO_REDUCTION",
      message: `"${filename}" couldn't be shrunk further -- returning the original file unchanged.`,
    });
    return { buffer: input, filename: `${stripExt(filename)}.pdf`, warnings };
  }

  return { buffer, filename: `${stripExt(filename)}_compressed.pdf`, warnings };
}
