"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { PdfDropzone } from "../pdf-dropzone";
import { FileStatusCard } from "../file-status-card";
import { OutputList } from "../output-list";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { useSinglePdf } from "../../../lib/pdf/use-single-pdf";
import { runPdfTool, ClientConversionError, type PdfToolsOutput } from "../../../lib/pdf/client";
import { validateRangeInputs } from "../../../lib/pdf/page-list";

interface RangeInput {
  id: string;
  start: string;
  end: string;
}

export function SplitPanel() {
  const pdf = useSinglePdf();
  const [ranges, setRanges] = useState<RangeInput[]>([{ id: crypto.randomUUID(), start: "1", end: "1" }]);
  const [running, setRunning] = useState(false);
  const [outputs, setOutputs] = useState<PdfToolsOutput[]>([]);

  const addRange = useCallback(() => {
    setRanges((prev) => [...prev, { id: crypto.randomUUID(), start: "", end: "" }]);
  }, []);

  const removeRange = useCallback((id: string) => {
    setRanges((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const updateRange = useCallback((id: string, patch: Partial<RangeInput>) => {
    setRanges((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  const run = useCallback(async () => {
    if (!pdf.fileId) return;
    // Was: Number(r.start)/Number(r.end) with only `start` bounds-checked.
    // Number("") is 0, which IS an integer, so a blank End field passed
    // this check and shipped { start: 1, end: 0 } to the server.
    const result = validateRangeInputs(ranges, pdf.pageCount);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    setRunning(true);
    try {
      const response = await runPdfTool({ operation: "split", fileIds: [pdf.fileId], options: { ranges: result.ranges } });
      setOutputs(response.outputs);
    } catch (err) {
      const message = err instanceof ClientConversionError ? err.message : "Split failed. Please try again.";
      toast.error(message);
    } finally {
      setRunning(false);
    }
  }, [pdf.fileId, pdf.pageCount, ranges]);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">Split a PDF into separate files by page range.</p>

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
          <Label id="split-ranges-label">Page ranges</Label>
          {ranges.map((r) => (
            <div key={r.id} className="flex items-center gap-2" role="group" aria-labelledby="split-ranges-label">
              <Input
                type="number"
                min={1}
                max={pdf.pageCount ?? undefined}
                value={r.start}
                onChange={(e) => updateRange(r.id, { start: e.target.value })}
                placeholder="Start"
                aria-label="Start page"
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">to</span>
              <Input
                type="number"
                min={1}
                max={pdf.pageCount ?? undefined}
                value={r.end}
                onChange={(e) => updateRange(r.id, { end: e.target.value })}
                placeholder="End"
                aria-label="End page"
                className="w-24"
              />
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Remove range"
                onClick={() => removeRange(r.id)}
                disabled={ranges.length === 1}
              >
                <X className="size-4" aria-hidden />
              </Button>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={addRange} className="self-start">
            <Plus className="size-4" aria-hidden />
            Add range
          </Button>
          <Button onClick={run} disabled={running || !pdf.fileId} className="self-start">
            {running ? "Splitting…" : "Split PDF"}
          </Button>
        </div>
      )}

      <OutputList outputs={outputs} />
    </div>
  );
}
