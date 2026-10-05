/**
 * Core conversion types. The UI and API routes depend only on this file and
 * `registry.ts` — never on an individual engine. See lib/conversion/registry.ts
 * for why this indirection exists.
 */

/** Formats that participate in the conversion graph. "md" is the hub format:
 * every non-md format converts to md, and md converts to every output format. */
export type FormatId =
  | "pdf"
  | "docx"
  | "xlsx"
  | "pptx"
  | "html"
  | "csv"
  | "txt"
  | "md";

export const INPUT_FORMATS: FormatId[] = [
  "pdf",
  "docx",
  "xlsx",
  "pptx",
  "html",
  "csv",
  "txt",
  "md",
];

export const OUTPUT_FORMATS: FormatId[] = ["md", "pdf", "docx", "html", "pptx"];

/** True for a value that is one of the formats this app can actually
 * produce. Distinct from "is a known FormatId at all" (every input format,
 * e.g. "xlsx"/"csv"/"txt", is a valid FormatId but none of them can ever be
 * a conversion *target* -- see OUTPUT_FORMATS). Validating against the
 * wrong list here is what let a request ask for an unreachable target and
 * only fail deep inside the registry, after the file had already been
 * marked "processing". */
export function isOutputFormat(value: unknown): value is FormatId {
  return typeof value === "string" && (OUTPUT_FORMATS as string[]).includes(value);
}

/** Extension (without dot) -> canonical FormatId. Deliberately only OOXML —
 * legacy .doc/.ppt/.xls need LibreOffice, which cannot run on Vercel. */
export const EXTENSION_TO_FORMAT: Record<string, FormatId> = {
  pdf: "pdf",
  docx: "docx",
  xlsx: "xlsx",
  xlsm: "xlsx",
  pptx: "pptx",
  html: "html",
  htm: "html",
  csv: "csv",
  txt: "txt",
  md: "md",
  markdown: "md",
};

/** Extensions we explicitly recognize but refuse, so the error can name the
 * real reason ("needs LibreOffice") instead of a generic "unsupported type". */
export const LEGACY_UNSUPPORTED_EXTENSIONS = new Set([
  "doc",
  "ppt",
  "xls",
]);

export const FORMAT_LABELS: Record<FormatId, string> = {
  pdf: "PDF",
  docx: "Word",
  xlsx: "Excel",
  pptx: "PowerPoint",
  html: "HTML",
  csv: "CSV",
  txt: "Text",
  md: "Markdown",
};

export const FORMAT_MIME: Record<FormatId, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  html: "text/html",
  csv: "text/csv",
  txt: "text/plain",
  md: "text/markdown",
};

export type ToolStatus = "stable" | "beta" | "unavailable";

/**
 * Describes one entry in the conversion registry. `status` and `limitations`
 * are load-bearing, not cosmetic: the UI greys out anything that isn't
 * "stable"/"beta" and shows the stated reason, rather than ever shipping a
 * silently-bad conversion. See lib/conversion/registry.ts.
 */
export interface ToolDefinition {
  id: string; // `${source}:${target}`
  name: string;
  description: string;
  sourceFormats: FormatId[];
  targetFormats: FormatId[];
  category: "conversion" | "pdf" | "markdown";
  status: ToolStatus;
  limitations?: string[];
}

export interface ConversionOptions {
  preserveImages?: boolean;
  customOutputName?: string;
  /** Carries HTML through the md-hub pipeline so md:docx / md:pdf / md:pptx
   * only ever render it once (see "Markdown rendered to HTML exactly once"). */
  renderedHtml?: string;
  [key: string]: unknown;
}

export interface EngineWarning {
  code: string;
  message: string;
}

export interface EngineOutput {
  /** Raw bytes of the converted file, OR markdown text for *:md conversions. */
  buffer: Buffer;
  /** Suggested filename (without directory), e.g. "report.md". */
  filename: string;
  mimeType: string;
  warnings?: EngineWarning[];
}

export type ConversionEngine = (
  input: Buffer,
  filename: string,
  options: ConversionOptions,
) => Promise<EngineOutput>;

/** Stable, enumerable error codes. The UI maps these to copy — see
 * lib/security/errors.ts — so a raw exception never reaches the client. */
export type ErrorCode =
  | "INVALID_REQUEST"
  | "UNSUPPORTED_FORMAT"
  | "LEGACY_FORMAT_UNSUPPORTED"
  | "SAME_FORMAT"
  | "FILE_TOO_LARGE"
  | "TOO_MANY_FILES"
  | "PAGE_LIMIT_EXCEEDED"
  | "FILE_NOT_FOUND"
  | "FILE_EXPIRED"
  | "INVALID_FILE_TYPE"
  | "CORRUPTED_FILE"
  | "PASSWORD_PROTECTED"
  | "INVALID_PAGE_RANGE"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "TOOL_UNAVAILABLE"
  | "INTERNAL_ERROR";

export interface UserFacingError {
  code: ErrorCode;
  title: string;
  message: string;
}

export class ConversionError extends Error {
  readonly code: ErrorCode;
  readonly title: string;

  constructor(code: ErrorCode, title: string, message: string, options?: { cause?: unknown }) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.code = code;
    this.title = title;
    this.name = "ConversionError";
  }

  toUserFacingError(): UserFacingError {
    return { code: this.code, title: this.title, message: this.message };
  }
}

/** Error codes that describe a problem with the *request* (a bad page
 * range, an unreachable target format, too many requests) rather than the
 * uploaded file itself. On these, the upload must survive so the user can
 * correct their input and retry with the same fileId -- see isRecoverable. */
const RECOVERABLE_CODES: ReadonlySet<ErrorCode> = new Set([
  "INVALID_REQUEST",
  "INVALID_PAGE_RANGE",
  "SAME_FORMAT",
  "UNSUPPORTED_FORMAT",
  "RATE_LIMITED",
  "PAGE_LIMIT_EXCEEDED",
  "TOO_MANY_FILES",
]);

/** True when `err` is a request-input problem the user can fix by
 * resubmitting against the *same* upload (a typo'd page range, an
 * unreachable target format, ...), as opposed to the file itself being
 * unusable (corrupted, password-protected, an internal failure). Routes
 * that destroy the input on every error (see app/api/convert/route.ts and
 * app/api/pdf-tools/route.ts) must check this before deleting anything. */
export function isRecoverable(err: unknown): boolean {
  return err instanceof ConversionError && RECOVERABLE_CODES.has(err.code);
}

export type ConversionRequest = {
  sourceFormat: FormatId;
  targetFormat: FormatId;
  fileId: string;
  options?: ConversionOptions;
};

export type ConversionResult =
  | {
      success: true;
      outputFileId: string;
      filename: string;
      warnings?: EngineWarning[];
    }
  | {
      success: false;
      error: UserFacingError;
    };
