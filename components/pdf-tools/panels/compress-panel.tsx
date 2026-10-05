"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { PdfDropzone } from "../pdf-dropzone";
import { FileStatusCard } from "../file-status-card";
import { OutputList } from "../output-list";
import { Button } from "../../ui/button";
import { Label } from "../../ui/label";
import { useSinglePdf } from "../../../lib/pdf/use-single-pdf";
import { runPdfTool, ClientConversionError, type PdfToolsOutput } from "../../../lib/pdf/client";

export function CompressPanel() {
  const pdf = useSinglePdf();
  const [quality, setQuality] = useState(60);
  const [running, setRunning] = useState(false);
  const [outputs, setOutputs] = useState<PdfToolsOutput[]>([]);

  const run = useCallback(async () => {
    if (!pdf.fileId) return;
    setRunning(true);
    try {
      const result = await runPdfTool({ operation: "compress", fileIds: [pdf.fileId], options: { quality } });
      setOutputs(result.outputs);
      for (const w of result.warnings) toast.message(w.message);
    } catch (err) {
      const message = err instanceof ClientConversionError ? err.message : "Compress failed. Please try again.";
      toast.error(message);
    } finally {
      setRunning(false);
    }
  }, [pdf.fileId, quality]);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Shrink file size by re-encoding embedded images. Only meaningfully reduces image-heavy PDFs — text-heavy PDFs may
        barely change, and the original is returned unchanged if compression would not help.
      </p>

      {!pdf.file && <PdfDropzone onFiles={pdf.onFiles} />}
      {pdf.file && (
        <FileStatusCard
          file={pdf.file}
          pageCount={pdf.pageCount}
          uploading={pdf.status === "uploading"}
          errorMessage={pdf.errorMessage}
          onRemove={pdf.reset}
        />
      )}

      {pdf.status === "ready" && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="compress-quality">Image quality: {quality}</Label>
            <input
              id="compress-quality"
              type="range"
              min={10}
              max={95}
              step={5}
              value={quality}
              onChange={(e) => setQuality(Number(e.target.value))}
              className="w-64"
            />
            <p className="text-xs text-muted-foreground">Lower = smaller file, more visible compression artifacts.</p>
          </div>
          <Button onClick={run} disabled={running} className="self-start">
            {running ? "Compressing…" : "Compress PDF"}
          </Button>
        </div>
      )}

      <OutputList outputs={outputs} />
    </div>
  );
}
