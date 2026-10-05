"use client";

import { useCallback, useState } from "react";
import { zipSync, type Zippable } from "fflate";
import { Download, FileText } from "lucide-react";
import { Button } from "../ui/button";
import { downloadUrl, type PdfToolsOutput } from "../../lib/pdf/client";

/** Renders one or more output files from a PDF-tools operation. A single
 * output gets a plain download link; several (e.g. split's page ranges)
 * also get a "download all as ZIP" button, same pattern as
 * converter-workspace.tsx's downloadAllAsZip. */
export function OutputList({ outputs }: { outputs: PdfToolsOutput[] }) {
  const [zipping, setZipping] = useState(false);

  const downloadAllAsZip = useCallback(async () => {
    setZipping(true);
    try {
      const entries: Zippable = {};
      for (const out of outputs) {
        const res = await fetch(downloadUrl(out.fileId));
        if (!res.ok) continue;
        entries[out.filename] = new Uint8Array(await res.arrayBuffer());
      }
      const zipped = zipSync(entries);
      const blob = new Blob([zipped], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "pdf-tools-output.zip";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setZipping(false);
    }
  }, [outputs]);

  if (outputs.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">
          {outputs.length} file{outputs.length === 1 ? "" : "s"} ready
        </p>
        {outputs.length > 1 && (
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
            <Button
              size="sm"
              variant="secondary"
              render={
                <a href={downloadUrl(out.fileId)} download={out.filename}>
                  <Download className="size-4" aria-hidden />
                  Download
                </a>
              }
            />
          </div>
        ))}
      </div>
    </div>
  );
}
