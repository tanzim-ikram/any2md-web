/**
 * Browser-side conversion pipeline. Calls the real /api/upload and
 * /api/convert routes directly (not Server Actions) so each file's
 * progress can be tracked independently and multiple files run in
 * parallel with a concurrency cap -- see the plan's "batches are
 * orchestrated client-side" design. The two-hop composition itself lives
 * server-side in lib/conversion/registry.ts; this file just calls
 * /api/convert once with the real target format and lets the server work
 * out whether that's a direct or two-hop conversion.
 */
import type { FormatId } from "./types";

export interface ConvertOnePayload {
  file: File;
  targetFormat: FormatId;
  onProgress: (message: string) => void;
}

export interface ConvertOneResult {
  outputFileId: string;
  filename: string;
  warnings: { code: string; message: string }[];
}

export class ClientConversionError extends Error {
  constructor(
    message: string,
    public readonly title: string,
  ) {
    super(message);
  }
}

export async function parseErrorResponse(res: Response): Promise<never> {
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

export async function convertOneFile({ file, targetFormat, onProgress }: ConvertOnePayload): Promise<ConvertOneResult> {
  onProgress("Uploading…");
  const form = new FormData();
  form.append("file", file);

  const uploadRes = await fetch("/api/upload", { method: "POST", body: form });
  if (!uploadRes.ok) await parseErrorResponse(uploadRes);
  const uploaded = (await uploadRes.json()) as { fileId: string };

  onProgress("Converting…");
  const convertRes = await fetch("/api/convert", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileId: uploaded.fileId, targetFormat }),
  });
  if (!convertRes.ok) await parseErrorResponse(convertRes);
  const result = (await convertRes.json()) as ConvertOneResult;

  onProgress("Done");
  return result;
}

export function downloadUrl(outputFileId: string): string {
  return `/api/download?fileId=${encodeURIComponent(outputFileId)}`;
}

/** URL for /api/download-zip, which zips several outputs server-side and
 * deletes each input exactly once -- see that route's own doc comment for
 * why this replaced a client-side fetch-loop-then-zip pattern. */
export function downloadZipUrl(fileIds: string[]): string {
  return `/api/download-zip?fileIds=${encodeURIComponent(fileIds.join(","))}`;
}

/** Run conversions with a concurrency cap so a large batch doesn't fire 30
 * simultaneous uploads. Each item's own onProgress callback still fires
 * independently, which is what gives the UI honest per-file progress
 * instead of one shared bar. */
export async function runBatch<T>(
  tasks: (() => Promise<T>)[],
  concurrency = 4,
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length);
  let next = 0;

  async function worker() {
    while (true) {
      const i = next++;
      if (i >= tasks.length) return;
      try {
        results[i] = { status: "fulfilled", value: await tasks[i]() };
      } catch (err) {
        results[i] = { status: "rejected", reason: err };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  return results;
}
