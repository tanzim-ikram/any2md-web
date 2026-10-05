"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, FileText, X } from "lucide-react";
import { PdfDropzone } from "../pdf-dropzone";
import { OutputList } from "../output-list";
import { Button } from "../../ui/button";
import { uploadPdf, runPdfTool, ClientConversionError, type PdfToolsOutput } from "../../../lib/pdf/client";

interface MergeFile {
  id: string;
  file: File;
  fileId: string | null;
  status: "uploading" | "ready" | "error";
  errorMessage?: string;
}

export function MergePanel() {
  const [files, setFiles] = useState<MergeFile[]>([]);
  const [merging, setMerging] = useState(false);
  const [outputs, setOutputs] = useState<PdfToolsOutput[]>([]);

  const onFiles = useCallback((newFiles: File[]) => {
    const entries: MergeFile[] = newFiles.map((file) => ({
      id: crypto.randomUUID(),
      file,
      fileId: null,
      status: "uploading",
    }));
    setFiles((prev) => [...prev, ...entries]);

    for (const entry of entries) {
      uploadPdf(entry.file)
        .then((uploaded) => {
          setFiles((prev) => prev.map((f) => (f.id === entry.id ? { ...f, fileId: uploaded.fileId, status: "ready" } : f)));
        })
        .catch((err) => {
          const message = err instanceof ClientConversionError ? err.message : "Upload failed.";
          setFiles((prev) => prev.map((f) => (f.id === entry.id ? { ...f, status: "error", errorMessage: message } : f)));
          toast.error(message);
        });
    }
  }, []);

  const move = useCallback((id: string, dir: -1 | 1) => {
    setFiles((prev) => {
      const index = prev.findIndex((f) => f.id === id);
      const target = index + dir;
      if (index < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const ready = files.filter((f) => f.status === "ready" && f.fileId);
  const canMerge = ready.length >= 2 && ready.length === files.length;

  const runMerge = useCallback(async () => {
    setMerging(true);
    try {
      const result = await runPdfTool({
        operation: "merge",
        fileIds: ready.map((f) => f.fileId!),
      });
      setOutputs(result.outputs);
      setFiles([]);
    } catch (err) {
      const message = err instanceof ClientConversionError ? err.message : "Merge failed. Please try again.";
      toast.error(message);
    } finally {
      setMerging(false);
    }
  }, [ready]);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">Combine two or more PDFs into one, in the order listed below.</p>
      <PdfDropzone multiple onFiles={onFiles} label="Drag & drop PDFs to merge" />

      {files.length > 0 && (
        <div className="flex flex-col gap-2">
          {files.map((f, i) => (
            <div key={f.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
              <span className="text-xs tabular-nums text-muted-foreground">{i + 1}</span>
              <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{f.file.name}</span>
              {f.status === "uploading" && <span className="text-xs text-muted-foreground">Uploading…</span>}
              {f.status === "error" && <span className="text-xs text-destructive">{f.errorMessage}</span>}
              <Button size="icon-sm" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => move(f.id, -1)}>
                <ArrowUp className="size-4" aria-hidden />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Move down"
                disabled={i === files.length - 1}
                onClick={() => move(f.id, 1)}
              >
                <ArrowDown className="size-4" aria-hidden />
              </Button>
              <Button size="icon-sm" variant="ghost" aria-label={`Remove ${f.file.name}`} onClick={() => remove(f.id)}>
                <X className="size-4" aria-hidden />
              </Button>
            </div>
          ))}
          <Button onClick={runMerge} disabled={!canMerge || merging} className="self-start">
            {merging ? "Merging…" : `Merge ${files.length} files`}
          </Button>
          {!canMerge && files.length > 0 && (
            <p className="text-xs text-muted-foreground">Add at least 2 files and wait for uploads to finish.</p>
          )}
        </div>
      )}

      <OutputList outputs={outputs} />
    </div>
  );
}
