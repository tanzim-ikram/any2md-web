/**
 * Browser-side helpers for the PDF toolbox. Uploads go through the same
 * /api/upload route the converter uses (so they get the same validation,
 * rate limiting, and lifecycle tracking); the operation itself is a single
 * call to /api/pdf-tools. See lib/conversion/client.ts for the analogous
 * conversion-side helpers this mirrors.
 */
import { ClientConversionError } from "../conversion/client";

export interface PdfToolsOutput {
  fileId: string;
  filename: string;
}

export interface PdfToolsResult {
  outputs: PdfToolsOutput[];
  warnings: { code: string; message: string }[];
}

async function parseErrorResponse(res: Response): Promise<never> {
  let title = "Something went wrong";
  let message = `Request failed (${res.status}).`;
  try {
    const body = (await res.json()) as { error?: { title?: string; message?: string } };
    if (body.error?.title) title = body.error.title;
    if (body.error?.message) message = body.error.message;
  } catch {
    // response wasn't JSON -- keep the generic message
  }
  throw new ClientConversionError(message, title);
}

export async function uploadPdf(file: File): Promise<{ fileId: string; size: number; pageCount?: number }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: form });
  if (!res.ok) await parseErrorResponse(res);
  return (await res.json()) as { fileId: string; size: number; pageCount?: number };
}

export interface RunPdfToolPayload {
  operation: "merge" | "split" | "rotate" | "extract" | "reorder" | "compress";
  fileIds: string[];
  options?: {
    ranges?: { start: number; end: number }[];
    degrees?: number;
    pages?: number[];
    order?: number[];
    quality?: number;
  };
}

export async function runPdfTool(payload: RunPdfToolPayload): Promise<PdfToolsResult> {
  const res = await fetch("/api/pdf-tools", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseErrorResponse(res);
  return (await res.json()) as PdfToolsResult;
}

export { downloadUrl } from "../conversion/client";
export { ClientConversionError };
