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
import { errorResponse, readJsonBody } from "../../../lib/api/errors";
import { ConversionError, isOutputFormat, isRecoverable, type ConversionOptions, type FormatId } from "../../../lib/conversion/types";

export const runtime = "nodejs";
// Vercel Hobby's ceiling (60s) is the actual deploy target -- see the smoke
// test plan. A md:pdf cold Chromium start plus render must fit inside this.
export const maxDuration = 60;

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

export async function POST(request: NextRequest) {
  // Not assigned until the request itself has been validated -- a bad
  // targetFormat or a missing fileId must never reach the catch below with
  // fileId set, or markFailed would delete a perfectly good upload over a
  // pure request error (see isRecoverable / the smoke test's finding).
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

    const body = await readJsonBody<ConvertRequestBody>(request);
    if (!body.fileId || !isOutputFormat(body.targetFormat)) {
      throw new ConversionError("INVALID_REQUEST", "Invalid request", "A fileId and targetFormat are required.");
    }
    const targetFormat = body.targetFormat;
    fileId = body.fileId;

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
      if (isRecoverable(err)) {
        // The problem is the request (e.g. SAME_FORMAT, an unreachable
        // targetFormat), not the file -- restore it to "uploaded" so the
        // user can retry against the same fileId instead of having to
        // re-upload after every typo.
        await updateFileRecord(fileId, { status: "uploaded", error: undefined }).catch(() => void 0);
      } else {
        const message = err instanceof ConversionError ? err.message : "Conversion failed";
        await markFailed(fileId, "failed", message).catch(() => void 0);
      }
    }
    return errorResponse(err);
  }
}
