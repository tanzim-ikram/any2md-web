"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { PdfDropzone } from "../pdf-dropzone";
import { FileStatusCard } from "../file-status-card";
import { OutputList } from "../output-list";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { useSinglePdf } from "../../../lib/pdf/use-single-pdf";
import { runPdfTool, ClientConversionError, type PdfToolsOutput } from "../../../lib/pdf/client";
import { parsePageList } from "../../../lib/pdf/page-list";

export function ExtractPanel() {
  const pdf = useSinglePdf();
  const [pagesInput, setPagesInput] = useState("");
  const [running, setRunning] = useState(false);
  const [outputs, setOutputs] = useState<PdfToolsOutput[]>([]);

  const run = useCallback(async () => {
    if (!pdf.fileId) return;
    let pages: number[];
    try {
      pages = parsePageList(pagesInput, pdf.pageCount ?? undefined);
    } catch (err) {
      toast.error((err as Error).message);
      return;
    }
    setRunning(true);
    try {
      const result = await runPdfTool({ operation: "extract", fileIds: [pdf.fileId], options: { pages } });
      setOutputs(result.outputs);
    } catch (err) {
      const message = err instanceof ClientConversionError ? err.message : "Extract failed. Please try again.";
      toast.error(message);
    } finally {
      setRunning(false);
    }
  }, [pdf.fileId, pdf.pageCount, pagesInput]);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">Pull selected pages out into a new PDF.</p>

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
            <Label htmlFor="extract-pages">Pages to extract</Label>
            <Input
              id="extract-pages"
              value={pagesInput}
              onChange={(e) => setPagesInput(e.target.value)}
              placeholder={`e.g. 1,3,5-7 (of ${pdf.pageCount ?? "?"} pages)`}
            />
          </div>
          <Button onClick={run} disabled={running || !pagesInput.trim()} className="self-start">
            {running ? "Extracting…" : "Extract pages"}
          </Button>
        </div>
      )}

      <OutputList outputs={outputs} />
    </div>
  );
}
