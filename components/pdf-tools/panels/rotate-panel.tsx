"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { PdfDropzone } from "../pdf-dropzone";
import { FileStatusCard } from "../file-status-card";
import { OutputList } from "../output-list";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { useSinglePdf } from "../../../lib/pdf/use-single-pdf";
import { runPdfTool, ClientConversionError, type PdfToolsOutput } from "../../../lib/pdf/client";
import { parsePageList } from "../../../lib/pdf/page-list";

const ROTATIONS = [90, 180, 270, -90] as const;

export function RotatePanel() {
  const pdf = useSinglePdf();
  const [degrees, setDegrees] = useState<string>("90");
  const [pagesInput, setPagesInput] = useState("");
  const [running, setRunning] = useState(false);
  const [outputs, setOutputs] = useState<PdfToolsOutput[]>([]);

  const run = useCallback(async () => {
    if (!pdf.fileId) return;
    let pages: number[] | undefined;
    if (pagesInput.trim()) {
      try {
        pages = parsePageList(pagesInput, pdf.pageCount ?? undefined);
      } catch (err) {
        toast.error((err as Error).message);
        return;
      }
    }
    setRunning(true);
    try {
      const result = await runPdfTool({
        operation: "rotate",
        fileIds: [pdf.fileId],
        options: { degrees: Number(degrees), pages },
      });
      setOutputs(result.outputs);
    } catch (err) {
      const message = err instanceof ClientConversionError ? err.message : "Rotate failed. Please try again.";
      toast.error(message);
    } finally {
      setRunning(false);
    }
  }, [pdf.fileId, pdf.pageCount, degrees, pagesInput]);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">Rotate one or more pages in a PDF.</p>

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
            <Label>Rotation</Label>
            <Select value={degrees} onValueChange={(v) => v && setDegrees(v)}>
              <SelectTrigger className="w-40" aria-label="Rotation degrees">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROTATIONS.map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    {d}°
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rotate-pages">Pages (optional)</Label>
            <Input
              id="rotate-pages"
              value={pagesInput}
              onChange={(e) => setPagesInput(e.target.value)}
              placeholder={`e.g. 1,3,5-7 — leave blank for all ${pdf.pageCount ?? ""} pages`}
            />
          </div>
          <Button onClick={run} disabled={running} className="self-start">
            {running ? "Rotating…" : "Rotate PDF"}
          </Button>
        </div>
      )}

      <OutputList outputs={outputs} />
    </div>
  );
}
