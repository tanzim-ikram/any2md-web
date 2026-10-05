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

export function ReorderPanel() {
  const pdf = useSinglePdf();
  const [orderInput, setOrderInput] = useState("");
  const [running, setRunning] = useState(false);
  const [outputs, setOutputs] = useState<PdfToolsOutput[]>([]);

  // Adjust the prefilled order whenever a new PDF arrives, by detecting the
  // change during render rather than in an effect (React's documented
  // pattern for state derived from a prop that just changed). Keyed on
  // fileId, not pageCount -- two different uploads can share a page count,
  // and keying on the count alone left a stale custom order in place when
  // a *different* same-length PDF replaced the current one.
  const [prefilledFor, setPrefilledFor] = useState<string | null>(null);
  if (pdf.fileId !== prefilledFor) {
    setPrefilledFor(pdf.fileId);
    setOrderInput(pdf.pageCount ? Array.from({ length: pdf.pageCount }, (_, i) => i + 1).join(",") : "");
  }

  const run = useCallback(async () => {
    if (!pdf.fileId) return;
    const order = orderInput
      .split(",")
      .map((p) => Number(p.trim()))
      .filter((n) => !Number.isNaN(n));
    if (order.length !== pdf.pageCount) {
      toast.error(`List all ${pdf.pageCount} pages exactly once.`);
      return;
    }
    setRunning(true);
    try {
      const result = await runPdfTool({ operation: "reorder", fileIds: [pdf.fileId], options: { order } });
      setOutputs(result.outputs);
    } catch (err) {
      const message = err instanceof ClientConversionError ? err.message : "Reorder failed. Please try again.";
      toast.error(message);
    } finally {
      setRunning(false);
    }
  }, [pdf.fileId, pdf.pageCount, orderInput]);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">Change the page order of a PDF.</p>

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
            <Label htmlFor="reorder-order">New page order</Label>
            <Input id="reorder-order" value={orderInput} onChange={(e) => setOrderInput(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              Comma-separated list of all {pdf.pageCount} pages in their new order, e.g. 3,1,2.
            </p>
          </div>
          <Button onClick={run} disabled={running || !pdf.fileId} className="self-start">
            {running ? "Reordering…" : "Reorder pages"}
          </Button>
        </div>
      )}

      <OutputList outputs={outputs} />
    </div>
  );
}
