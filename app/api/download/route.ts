/**
 * GET /api/download?fileId=... -- streams the converted file and then
 * deletes it (plan section 7's delete-on-download path). The browser never
 * sees the underlying storage URL, only this route. See /api/download-zip
 * for downloading several outputs as a single archive.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getFileStorage } from "../../../lib/storage";
import { deleteFile, getFileRecord } from "../../../lib/lifecycle";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "../../../lib/rate-limit";
import { errorResponse } from "../../../lib/api/errors";
import { contentDisposition } from "../../../lib/api/http";
import { ConversionError } from "../../../lib/conversion/types";
import { FORMAT_MIME, EXTENSION_TO_FORMAT } from "../../../lib/conversion/types";

export const runtime = "nodejs";
export const maxDuration = 30;

function mimeForFilename(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const format = EXTENSION_TO_FORMAT[ext];
  return format ? FORMAT_MIME[format] : "application/octet-stream";
}

export async function GET(request: NextRequest) {
  try {
    const ip = getClientIp(request.headers);
    const rate = await checkRateLimit(RATE_LIMITS.download, ip);
    if (!rate.success) {
      throw new ConversionError("RATE_LIMITED", "Too many requests", "Please slow down and try again shortly.");
    }

    const fileId = request.nextUrl.searchParams.get("fileId");
    if (!fileId) {
      throw new ConversionError("FILE_NOT_FOUND", "File not found", "No file was specified.");
    }

    const record = await getFileRecord(fileId);
    if (!record || record.status !== "available") {
      throw new ConversionError(
        "FILE_EXPIRED",
        "File no longer available",
        "This download link has expired or was already used. Please convert the file again.",
      );
    }

    const storage = getFileStorage();
    const buffer = await storage.get(fileId);
    if (!buffer) {
      throw new ConversionError(
        "FILE_EXPIRED",
        "File no longer available",
        "This download link has expired. Please convert the file again.",
      );
    }

    // Delete-on-download: this file has now been handed to its one
    // recipient and is removed immediately rather than waiting on its TTL.
    await deleteFile(fileId);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": mimeForFilename(record.originalFilename),
        "Content-Disposition": contentDisposition(record.originalFilename),
        // No manual Content-Length: Next's response compression (on by
        // default) can change the wire length, making a hand-set value
        // wrong; the platform sets the real one.
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
