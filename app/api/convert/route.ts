/**
 * POST /api/convert -- { fileId, targetFormat, options? }
 *
 * Loads the uploaded file by its lifecycle record, runs it through
 * lib/conversion/registry.ts (the only place that knows how a conversion
 * actually works), stores the result under a NEW fileId, and immediately
 * deletes the original input (plan section 7: files are deleted as soon as
 * they're no longer needed, not left to expire). The response carries only
 * the output fileId -- never a storage URL or path.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getFileStorage } from "../../../lib/storage";
import { createFileRecord, deleteFile, getFileRecord, markFailed, updateFileRecord } from "../../../lib/lifecycle";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "../../../lib/rate-limit";
import { runConversion } from "../../../lib/conversion/registry";
import { errorResponse } from "../../../lib/api/errors";
import { ConversionError, type ConversionOptions, type FormatId } from "../../../lib/conversion/types";
import { EXTENSION_TO_FORMAT } from "../../../lib/conversion/types";

export const runtime = "nodejs";
// PDF rendering (Chromium cold start) and large documents need headroom;
// actual ceiling is clamped by the Vercel plan at deploy time regardless.
export const maxDuration = 300;

interface ConvertRequestBody {
  fileId?: string;
  targetFormat?: string;
  options?: {
    preserveImages?: boolean;
    customOutputName?: string;
    detectTables?: boolean;
    includeSpeakerNotes?: boolean;
  };
}

/** Only a small, typed allowlist of client-supplied options is ever
 * forwarded to an engine -- never an arbitrary passthrough object, and
 * never anything like a pre-rendered HTML string (that must always be
 * produced server-side by lib/markdown/render.ts, which sanitizes it). */
function sanitizeOptions(input: ConvertRequestBody["options"]): ConversionOptions {
  const out: ConversionOptions = {};
  if (typeof input?.preserveImages === "boolean") out.preserveImages = input.preserveImages;
  if (typeof input?.detectTables === "boolean") out.detectTables = input.detectTables;
  if (typeof input?.includeSpeakerNotes === "boolean") out.includeSpeakerNotes = input.includeSpeakerNotes;
  if (typeof input?.customOutputName === "string") {
    out.customOutputName = input.customOutputName.replace(/[^\w.\- ]/g, "_").slice(0, 150);
  }
  return out;
}

function isFormatId(value: string | undefined): value is FormatId {
  return !!value && Object.values(EXTENSION_TO_FORMAT).includes(value as FormatId);
}

export async function POST(request: NextRequest) {
  let fileId: string | undefined;
  try {
    const ip = getClientIp(request.headers);
    const rate = await checkRateLimit(RATE_LIMITS.convert, ip);
    if (!rate.success) {
      throw new ConversionError(
        "RATE_LIMITED",
        "Too many conversions",
        "You've reached the conversion limit for now. Please try again later.",
      );
    }

    const body = (await request.json()) as ConvertRequestBody;
    fileId = body.fileId;
    if (!fileId || !isFormatId(body.targetFormat)) {
      throw new ConversionError("UNSUPPORTED_FORMAT", "Invalid request", "A fileId and targetFormat are required.");
    }
    const targetFormat = body.targetFormat;

    const record = await getFileRecord(fileId);
    if (!record) {
      throw new ConversionError(
        "FILE_EXPIRED",
        "File no longer available",
        "This upload has expired or was already processed. Please upload the file again.",
      );
    }
    if (!record.sourceFormat) {
      throw new ConversionError("INTERNAL_ERROR", "Internal error", "Upload is missing format metadata.");
    }

    await updateFileRecord(fileId, { status: "processing", targetFormat });
    const storage = getFileStorage();
    const inputBuffer = await storage.get(fileId);
    if (!inputBuffer) {
      throw new ConversionError(
        "FILE_EXPIRED",
        "File no longer available",
        "This upload has expired. Please upload the file again.",
      );
    }

    const options = sanitizeOptions(body.options);
    const result = await runConversion(
      record.sourceFormat as FormatId,
      targetFormat,
      inputBuffer,
      record.originalFilename,
      options,
    );

    const outStored = await storage.put(result.buffer);
    await createFileRecord(outStored.fileId, result.filename, result.buffer.length);
    await updateFileRecord(outStored.fileId, {
      status: "available",
      sourceFormat: record.sourceFormat,
      targetFormat,
    });

    // The input is no longer needed once conversion succeeds -- delete now
    // rather than waiting for its TTL.
    await deleteFile(fileId);

    return NextResponse.json({
      outputFileId: outStored.fileId,
      filename: result.filename,
      warnings: result.warnings ?? [],
    });
  } catch (err) {
    if (fileId) {
      const message = err instanceof ConversionError ? err.message : "Conversion failed";
      await markFailed(fileId, "failed", message).catch(() => void 0);
    }
    return errorResponse(err);
  }
}
