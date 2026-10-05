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
    const parsed = ranges.map((r) => ({ start: Number(r.start), end: Number(r.end) }));
    if (parsed.some((r) => !Number.isInteger(r.start) || !Number.isInteger(r.end) || r.start < 1)) {
      toast.error("Each range needs valid start and end page numbers.");
      return;
    }
    setRunning(true);
    try {
      const result = await runPdfTool({ operation: "split", fileIds: [pdf.fileId], options: { ranges: parsed } });
      setOutputs(result.outputs);
    } catch (err) {
      const message = err instanceof ClientConversionError ? err.message : "Split failed. Please try again.";
      toast.error(message);
    } finally {
      setRunning(false);
    }
  }, [pdf.fileId, ranges]);

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
          <Label>Page ranges</Label>
          {ranges.map((r) => (
            <div key={r.id} className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={pdf.pageCount ?? undefined}
                value={r.start}
                onChange={(e) => updateRange(r.id, { start: e.target.value })}
                placeholder="Start"
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
          <Button onClick={run} disabled={running} className="self-start">
            {running ? "Splitting…" : "Split PDF"}
          </Button>
        </div>
      )}

      <OutputList outputs={outputs} />
    </div>
  );
}
