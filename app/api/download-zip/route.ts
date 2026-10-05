/**
 * GET /api/download-zip?fileIds=a,b,c -- zips several outputs into a single
 * archive server-side and streams it back, then deletes every input once.
 *
 * Replaces the client-side pattern (converter-workspace.tsx /
 * output-list.tsx used to) of fetching each /api/download URL in a loop and
 * zipping in the browser. That pattern fought /api/download's own
 * delete-on-download policy: zipping N outputs consumed all N via the same
 * single-use URLs the per-file "Download" buttons still pointed at, so
 * clicking one after a ZIP download 404'd even though the row still said
 * "Done". Doing it server-side means each input is read and deleted
 * exactly once, from here, and the per-file links are never touched by the
 * ZIP flow at all.
 */
import { NextResponse, type NextRequest } from "next/server";
import { zipSync, type Zippable } from "fflate";
import { getFileStorage } from "../../../lib/storage";
import { deleteFile, getFileRecord } from "../../../lib/lifecycle";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "../../../lib/rate-limit";
import { errorResponse } from "../../../lib/api/errors";
import { contentDisposition } from "../../../lib/api/http";
import { uniqueZipName } from "../../../lib/download/zip-names";
import { MAX_FILES_PER_BATCH } from "../../../lib/security/validation";
import { ConversionError } from "../../../lib/conversion/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const ip = getClientIp(request.headers);
    const rate = await checkRateLimit(RATE_LIMITS.download, ip);
    if (!rate.success) {
      throw new ConversionError("RATE_LIMITED", "Too many requests", "Please slow down and try again shortly.");
    }

    const raw = request.nextUrl.searchParams.get("fileIds") ?? "";
    const fileIds = raw
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    if (fileIds.length === 0) {
      throw new ConversionError("FILE_NOT_FOUND", "No files given", "At least one file is required.");
    }
    if (fileIds.length > MAX_FILES_PER_BATCH) {
      throw new ConversionError(
        "TOO_MANY_FILES",
        "Too many files",
        `You can download up to ${MAX_FILES_PER_BATCH} files at a time.`,
      );
    }

    const storage = getFileStorage();
    const taken = new Set<string>();
    const entries: Zippable = {};

    // Every record is checked before anything is deleted -- a partially
    // expired batch should fail the whole request with a clear error
    // rather than silently zip a subset and delete only those.
    const loaded = await Promise.all(
      fileIds.map(async (fileId) => {
        const record = await getFileRecord(fileId);
        if (!record || record.status !== "available") {
          throw new ConversionError(
            "FILE_EXPIRED",
            "File no longer available",
            "One or more of these files has expired or was already downloaded. Please convert again.",
          );
        }
        const buffer = await storage.get(fileId);
        if (!buffer) {
          throw new ConversionError(
            "FILE_EXPIRED",
            "File no longer available",
            "One or more of these files has expired. Please convert again.",
          );
        }
        return { fileId, buffer, filename: record.originalFilename };
      }),
    );

    for (const { buffer, filename } of loaded) {
      entries[uniqueZipName(taken, filename)] = new Uint8Array(buffer);
    }
    const zipped = zipSync(entries);

    // Delete-on-download, same policy as /api/download, applied once per
    // input rather than once per individual GET.
    await Promise.all(fileIds.map((id) => deleteFile(id)));

    return new NextResponse(new Uint8Array(zipped), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": contentDisposition("any2md-conversions.zip"),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
