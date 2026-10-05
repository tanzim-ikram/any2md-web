/**
 * POST /api/pdf-tools -- { operation, fileIds, options? }
 *
 * Page-preserving PDF operations (merge/split/rotate/extract/reorder/
 * compress) never change format, so they don't go through
 * lib/conversion/registry.ts -- they're reached through this route instead
 * and lib/pdf/toolbox.ts does the actual work. Inputs are files already
 * uploaded via /api/upload (so they're already validated and stored); this
 * route only loads them by fileId, runs the operation, stores the
 * output(s), and deletes the inputs -- mirroring /api/convert's lifecycle
 * handling.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getFileStorage } from "../../../lib/storage";
import { createFileRecord, deleteFile, getFileRecord, markFailed, updateFileRecord } from "../../../lib/lifecycle";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "../../../lib/rate-limit";
import { errorResponse } from "../../../lib/api/errors";
import { ConversionError } from "../../../lib/conversion/types";
import {
  compressPdf,
  extractPages,
  mergePdfs,
  reorderPages,
  rotatePdf,
  splitPdf,
  type PageRange,
} from "../../../lib/pdf/toolbox";

export const runtime = "nodejs";
export const maxDuration = 120;

type Operation = "merge" | "split" | "rotate" | "extract" | "reorder" | "compress";
const OPERATIONS: Operation[] = ["merge", "split", "rotate", "extract", "reorder", "compress"];

interface PdfToolsRequestBody {
  operation?: string;
  fileIds?: string[];
  options?: {
    ranges?: PageRange[];
    degrees?: number;
    pages?: number[];
    order?: number[];
    quality?: number;
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

    const body = (await request.json()) as PdfToolsRequestBody;
    if (!isOperation(body.operation)) {
      throw new ConversionError("UNSUPPORTED_FORMAT", "Invalid request", "A valid operation is required.");
    }
    fileIds = (body.fileIds ?? []).filter((id): id is string => typeof id === "string" && id.length > 0);
    if (fileIds.length === 0) {
      throw new ConversionError("FILE_NOT_FOUND", "No files given", "At least one file is required.");
    }
    if (body.operation !== "merge" && fileIds.length !== 1) {
      throw new ConversionError("UNSUPPORTED_FORMAT", "Invalid request", `"${body.operation}" takes exactly one file.`);
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
          const ranges = body.options?.ranges ?? [];
          outputs.push(...(await splitPdf(buffer, filename, ranges)));
          break;
        }
        case "rotate": {
          const deg = body.options?.degrees;
          if (deg !== 90 && deg !== 180 && deg !== 270 && deg !== -90) {
            throw new ConversionError("INVALID_PAGE_RANGE", "Invalid rotation", "Rotation must be 90, 180, 270, or -90 degrees.");
          }
          outputs.push(await rotatePdf(buffer, filename, deg, body.options?.pages));
          break;
        }
        case "extract": {
          outputs.push(await extractPages(buffer, filename, body.options?.pages ?? []));
          break;
        }
        case "reorder": {
          outputs.push(await reorderPages(buffer, filename, body.options?.order ?? []));
          break;
        }
        case "compress": {
          const result = await compressPdf(buffer, filename, body.options?.quality);
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

    // Inputs are no longer needed once the operation succeeds.
    await Promise.all(fileIds.map((id) => deleteFile(id)));

    return NextResponse.json({ outputs: stored, warnings });
  } catch (err) {
    if (fileIds.length) {
      const message = err instanceof ConversionError ? err.message : "PDF operation failed";
      await Promise.all(fileIds.map((id) => markFailed(id, "failed", message).catch(() => void 0)));
    }
    return errorResponse(err);
  }
}
