/**
 * POST /api/upload -- multipart/form-data with one `file` field.
 *
 * Validates the upload (magic bytes, size, extension -- lib/security),
 * stores the bytes (lib/storage), and creates a file lifecycle record
 * (lib/lifecycle) in "uploaded" status. Returns only a fileId: the client
 * never sees a filesystem path or storage URL (plan section 5: "do not
 * expose uploaded files through predictable public URLs").
 */
import { NextResponse, type NextRequest } from "next/server";
import { validateUpload } from "../../../lib/security/validation";
import { getFileStorage } from "../../../lib/storage";
import { createFileRecord, updateFileRecord } from "../../../lib/lifecycle";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "../../../lib/rate-limit";
import { errorResponse } from "../../../lib/api/errors";
import { ConversionError } from "../../../lib/conversion/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request.headers);
    const rate = await checkRateLimit(RATE_LIMITS.upload, ip);
    if (!rate.success) {
      throw new ConversionError(
        "RATE_LIMITED",
        "Too many uploads",
        "You've reached the upload limit for now. Please try again later.",
      );
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new ConversionError("CORRUPTED_FILE", "No file received", "No file was included in the request.");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { sanitizedFilename, format } = await validateUpload(buffer, file.name);

    const storage = getFileStorage();
    const { fileId } = await storage.put(buffer);
    const record = await createFileRecord(fileId, sanitizedFilename, buffer.length);
    await updateFileRecord(fileId, { sourceFormat: format });

    return NextResponse.json({
      fileId: record.fileId,
      filename: sanitizedFilename,
      format,
      size: buffer.length,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
