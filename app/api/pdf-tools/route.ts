/**
 * POST /api/pdf-tools -- { operation, fileIds, options? }
 *
 * Page-preserving PDF operations (merge/split/rotate/extract/reorder/
 * compress) never change format, so they don't go through
 * lib/conversion/registry.ts -- they're reached through this route instead
 * and lib/pdf/toolbox.ts does the actual work. Inputs are files already
 * uploaded via /api/upload (so they're already validated and stored); this
 * route only loads them by fileId and runs the operation. Unlike
 * /api/convert, a successful PDF-tools operation does NOT change the
 * input's format, so the input is left in place (reset to "uploaded")
 * rather than deleted -- one upload can feed split, then rotate, then
 * extract, the way a "toolbox" is expected to work, up to its normal
 * one-hour retention window.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getFileStorage } from "../../../lib/storage";
import { createFileRecord, getFileRecord, markFailed, updateFileRecord } from "../../../lib/lifecycle";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "../../../lib/rate-limit";
import { errorResponse, readJsonBody } from "../../../lib/api/errors";
import { ConversionError, isRecoverable } from "../../../lib/conversion/types";
import { MAX_FILES_PER_BATCH } from "../../../lib/security/validation";
import { parsePageNumbers, parseQuality, parseRanges } from "../../../lib/pdf/request";
import {
  compressPdf,
  extractPages,
  mergePdfs,
  reorderPages,
  rotatePdf,
  splitPdf,
} from "../../../lib/pdf/toolbox";

export const runtime = "nodejs";
// Vercel Hobby's ceiling (60s) is the actual deploy target -- see the smoke
// test plan.
export const maxDuration = 60;

type Operation = "merge" | "split" | "rotate" | "extract" | "reorder" | "compress";
const OPERATIONS: Operation[] = ["merge", "split", "rotate", "extract", "reorder", "compress"];

interface PdfToolsRequestBody {
  operation?: string;
  fileIds?: string[];
  options?: {
    ranges?: unknown;
    degrees?: number;
    pages?: unknown;
    order?: unknown;
    quality?: unknown;
  };
}

function isOperation(value: string | undefined): value is Operation {
  return !!value && OPERATIONS.includes(value as Operation);
}

/** Loads each fileId's bytes, asserting it's a PDF that's still available.
 * Never trusts the client's claimed source format -- only the lifecycle
 * record's, which was set by /api/upload's own magic-byte sniffing. */
async function loadInput(fileId: string): Promise<{ buffer: Buffer; filename: string }> {
  const record = await getFileRecord(fileId);
  if (!record || record.sourceFormat !== "pdf") {
    throw new ConversionError(
      "FILE_EXPIRED",
      "File no longer available",
      "This upload has expired or was already processed. Please upload the file again.",
    );
  }
  const storage = getFileStorage();
  const buffer = await storage.get(fileId);
  if (!buffer) {
    throw new ConversionError(
      "FILE_EXPIRED",
      "File no longer available",
      "This upload has expired. Please upload the file again.",
    );
  }
  return { buffer, filename: record.originalFilename };
}

export async function POST(request: NextRequest) {
  let fileIds: string[] = [];
  try {
    const ip = getClientIp(request.headers);
    const rate = await checkRateLimit(RATE_LIMITS.pdfTools, ip);
    if (!rate.success) {
      throw new ConversionError(
        "RATE_LIMITED",
        "Too many requests",
        "You've reached the PDF tools limit for now. Please try again later.",
      );
    }

    const body = await readJsonBody<PdfToolsRequestBody>(request);
    if (!isOperation(body.operation)) {
      throw new ConversionError("INVALID_REQUEST", "Invalid request", "A valid operation is required.");
    }
    fileIds = (body.fileIds ?? []).filter((id): id is string => typeof id === "string" && id.length > 0);
    if (fileIds.length === 0) {
      throw new ConversionError("FILE_NOT_FOUND", "No files given", "At least one file is required.");
    }
    if (fileIds.length > MAX_FILES_PER_BATCH) {
      throw new ConversionError(
        "TOO_MANY_FILES",
        "Too many files",
        `You can process up to ${MAX_FILES_PER_BATCH} files at a time.`,
      );
    }
    if (body.operation !== "merge" && fileIds.length !== 1) {
      throw new ConversionError("INVALID_REQUEST", "Invalid request", `"${body.operation}" takes exactly one file.`);
    }

    await Promise.all(fileIds.map((id) => updateFileRecord(id, { status: "processing" })));

    const outputs: { buffer: Buffer; filename: string }[] = [];
    const warnings: { code: string; message: string }[] = [];

    if (body.operation === "merge") {
      const inputs = await Promise.all(fileIds.map(loadInput));
      outputs.push(await mergePdfs(inputs));
    } else {
      const { buffer, filename } = await loadInput(fileIds[0]);
      switch (body.operation) {
        case "split": {
          const ranges = parseRanges(body.options?.ranges ?? []);
          outputs.push(...(await splitPdf(buffer, filename, ranges)));
          break;
        }
        case "rotate": {
          const deg = body.options?.degrees;
          if (deg !== 90 && deg !== 180 && deg !== 270 && deg !== -90) {
            throw new ConversionError("INVALID_PAGE_RANGE", "Invalid rotation", "Rotation must be 90, 180, 270, or -90 degrees.");
          }
          const pages = body.options?.pages !== undefined ? parsePageNumbers(body.options.pages) : undefined;
          outputs.push(await rotatePdf(buffer, filename, deg, pages));
          break;
        }
        case "extract": {
          outputs.push(await extractPages(buffer, filename, parsePageNumbers(body.options?.pages ?? [])));
          break;
        }
        case "reorder": {
          outputs.push(await reorderPages(buffer, filename, parsePageNumbers(body.options?.order ?? [])));
          break;
        }
        case "compress": {
          const result = await compressPdf(buffer, filename, parseQuality(body.options?.quality));
          outputs.push(result);
          warnings.push(...result.warnings);
          break;
        }
      }
    }

    const storage = getFileStorage();
    const stored = await Promise.all(
      outputs.map(async (out) => {
        const outStored = await storage.put(out.buffer);
        await createFileRecord(outStored.fileId, out.filename, out.buffer.length);
        await updateFileRecord(outStored.fileId, { status: "available", sourceFormat: "pdf", targetFormat: "pdf" });
        return { fileId: outStored.fileId, filename: out.filename };
      }),
    );

    // The operation never changes the input's format, so -- unlike
    // /api/convert -- it's left in place rather than deleted: one upload
    // can feed split, then rotate, then extract, up to its normal TTL.
    await Promise.all(fileIds.map((id) => updateFileRecord(id, { status: "uploaded" })));

    return NextResponse.json({ outputs: stored, warnings });
  } catch (err) {
    if (fileIds.length) {
      if (isRecoverable(err)) {
        await Promise.all(
          fileIds.map((id) => updateFileRecord(id, { status: "uploaded", error: undefined }).catch(() => void 0)),
        );
      } else {
        const message = err instanceof ConversionError ? err.message : "PDF operation failed";
        await Promise.all(fileIds.map((id) => markFailed(id, "failed", message).catch(() => void 0)));
      }
    }
    return errorResponse(err);
  }
}
