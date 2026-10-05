"use client";

import { FileText, X, Loader2, AlertCircle } from "lucide-react";
import { Button } from "../ui/button";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileStatusCard({
  file,
  pageCount,
  uploading,
  errorMessage,
  onRemove,
}: {
  file: File;
  pageCount: number | null;
  uploading: boolean;
  errorMessage: string | null;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex min-w-0 items-center gap-3">
        <FileText className="size-5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0">
          <p className="truncate font-medium">{file.name}</p>
          <p className="text-xs text-muted-foreground">
            {formatBytes(file.size)}
            {pageCount ? ` · ${pageCount} page${pageCount === 1 ? "" : "s"}` : ""}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {uploading && (
          <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Uploading…
          </span>
        )}
        {errorMessage && (
          <span className="inline-flex items-center gap-1.5 text-sm text-destructive" role="alert">
            <AlertCircle className="size-4" aria-hidden />
            {errorMessage}
          </span>
        )}
        <Button size="icon" variant="ghost" aria-label={`Remove ${file.name}`} onClick={onRemove}>
          <X className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
