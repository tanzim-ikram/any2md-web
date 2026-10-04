/**
 * Upload validation (plan section 8: "every uploaded file is untrusted").
 *
 * Three independent checks, all of which must pass:
 *   1. Extension allow-list (never a deny-list).
 *   2. Magic-byte sniffing via `file-type` -- the declared/client MIME type
 *      is used only for a fast client-side reject; the server never trusts it.
 *   3. Size cap, checked before any conversion work begins.
 *
 * Filenames are sanitized for *display* only. They never touch a
 * filesystem path -- storage always uses a random generated fileId (see
 * lib/storage), so there is no path-traversal surface here to defend
 * beyond not reflecting the raw name back unescaped in UI/HTML.
 */
import { fileTypeFromBuffer } from "file-type";
import { ConversionError, EXTENSION_TO_FORMAT, LEGACY_UNSUPPORTED_EXTENSIONS, type FormatId } from "../conversion/types";

export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB, per the plan
export const MAX_FILES_PER_BATCH = 10;

/** Extensions whose "magic bytes" are not meaningfully sniffable (plain
 * text formats) -- content-sniffing is skipped for these and only the
 * extension + a UTF-8/text heuristic is used. */
const TEXT_FORMATS: FormatId[] = ["md", "txt", "csv", "html"];

/** Real (sniffed) file-type signatures accepted for each binary format.
 * OOXML formats (.docx/.xlsx/.pptx) are all ZIP containers at the magic-byte
 * level ("PK\x03\x04"), so file-type reports them generically as "zip"
 * unless it can see further into the archive -- which it does via its own
 * OOXML-aware detection, reporting the specific mime. We accept both the
 * specific and the generic zip signature and let the engine itself be the
 * final word (it will throw CORRUPTED_FILE on a real mismatch). */
const BINARY_SIGNATURES: Record<string, string[]> = {
  pdf: ["application/pdf"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/zip"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/zip"],
  pptx: ["application/vnd.openxmlformats-officedocument.presentationml.presentation", "application/zip"],
};

function sanitizeFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "file";
  // Strip control characters and anything that isn't a conservative safe
  // set; this is for *display* safety (the name is never used as a path).
  return base.replace(/[^\w.\- ]/g, "_").slice(0, 200) || "file";
}

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(dot + 1).toLowerCase() : "";
}

export interface ValidatedUpload {
  sanitizedFilename: string;
  format: FormatId;
}

export async function validateUpload(buffer: Buffer, originalFilename: string): Promise<ValidatedUpload> {
  const sanitizedFilename = sanitizeFilename(originalFilename);
  const ext = extensionOf(originalFilename);

  if (buffer.length === 0) {
    throw new ConversionError("CORRUPTED_FILE", "Empty file", `"${sanitizedFilename}" is empty.`);
  }
  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    throw new ConversionError(
      "FILE_TOO_LARGE",
      "File too large",
      `"${sanitizedFilename}" exceeds the ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB limit.`,
    );
  }

  if (LEGACY_UNSUPPORTED_EXTENSIONS.has(ext)) {
    throw new ConversionError(
      "LEGACY_FORMAT_UNSUPPORTED",
      "Legacy format not supported",
      `".${ext}" files need a different conversion engine than this app can run. Please save "${sanitizedFilename}" as its modern equivalent (.docx/.pptx/.xlsx) and try again.`,
    );
  }

  const format = EXTENSION_TO_FORMAT[ext];
  if (!format) {
    throw new ConversionError(
      "UNSUPPORTED_FORMAT",
      "Unsupported file type",
      `"${sanitizedFilename}" isn't a supported format.`,
    );
  }

  if (TEXT_FORMATS.includes(format)) {
    // No reliable magic bytes for plain text; a NUL byte in the first slice
    // is a strong signal this is actually a binary file wearing a text
    // extension, which is the main thing worth catching here.
    const sample = buffer.subarray(0, Math.min(buffer.length, 8000));
    if (sample.includes(0)) {
      throw new ConversionError(
        "INVALID_FILE_TYPE",
        "File doesn't match its extension",
        `"${sanitizedFilename}" doesn't look like a valid .${ext} file.`,
      );
    }
    return { sanitizedFilename, format };
  }

  const sniffed = await fileTypeFromBuffer(buffer);
  const allowed = BINARY_SIGNATURES[format];
  if (!sniffed || !allowed?.includes(sniffed.mime)) {
    throw new ConversionError(
      "INVALID_FILE_TYPE",
      "File doesn't match its extension",
      `"${sanitizedFilename}" doesn't look like a valid .${ext} file${sniffed ? ` (detected ${sniffed.mime})` : ""}.`,
    );
  }

  return { sanitizedFilename, format };
}

export function validateBatchSize(fileCount: number): void {
  if (fileCount > MAX_FILES_PER_BATCH) {
    throw new ConversionError(
      "TOO_MANY_FILES",
      "Too many files",
      `You can convert up to ${MAX_FILES_PER_BATCH} files at a time.`,
    );
  }
}
