"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Download, FileText } from "lucide-react";
import { Button } from "../ui/button";
import { downloadUrl, downloadZipUrl, parseErrorResponse, ClientConversionError, type PdfToolsOutput } from "../../lib/pdf/client";
import { saveBlob } from "../../lib/download/save-blob";

/** Renders one or more output files from a PDF-tools operation. A single
 * output gets a plain download link; several (e.g. split's page ranges)
 * also get a "download all as ZIP" button, via /api/download-zip -- see
 * that route's doc comment for why this isn't a client-side fetch loop. */
export function OutputList({ outputs }: { outputs: PdfToolsOutput[] }) {
  const [zipping, setZipping] = useState(false);
  // Per-file download links are single-use (/api/download deletes on GET);
  // tracked locally since `outputs` is this panel's own transient result,
  // not persisted state like the converter queue.
  const [downloaded, setDownloaded] = useState<Set<string>>(new Set());

  const downloadAllAsZip = useCallback(async () => {
    setZipping(true);
    try {
      const res = await fetch(downloadZipUrl(outputs.map((o) => o.fileId)));
      if (!res.ok) await parseErrorResponse(res);
      const blob = await res.blob();
      saveBlob(blob, "pdf-tools-output.zip");
      setDownloaded((prev) => new Set([...prev, ...outputs.map((o) => o.fileId)]));
    } catch (err) {
      const message = err instanceof ClientConversionError ? err.message : "Couldn't download the ZIP. Please try again.";
      toast.error(message);
    } finally {
      setZipping(false);
    }
  }, [outputs]);

  const markDownloaded = useCallback((fileId: string) => {
    setDownloaded((prev) => new Set(prev).add(fileId));
  }, []);

  if (outputs.length === 0) return null;
  const remaining = outputs.filter((o) => !downloaded.has(o.fileId));

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">
          {outputs.length} file{outputs.length === 1 ? "" : "s"} ready
        </p>
        {remaining.length > 1 && (
          <Button size="sm" variant="outline" onClick={downloadAllAsZip} disabled={zipping}>
            {zipping ? "Zipping…" : "Download all as ZIP"}
          </Button>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        {outputs.map((out) => (
          <div key={out.fileId} className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-3 py-2">
            <span className="flex min-w-0 items-center gap-2 text-sm">
              <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="truncate">{out.filename}</span>
            </span>
            {downloaded.has(out.fileId) ? (
              <span className="text-xs text-muted-foreground">Downloaded</span>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                render={
                  <a href={downloadUrl(out.fileId)} download={out.filename} onClick={() => markDownloaded(out.fileId)}>
                    <Download className="size-4" aria-hidden />
                    Download
                  </a>
                }
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
