"use client";

import { FileText, X, Download, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "../ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { FORMAT_LABELS, type FormatId } from "../../lib/conversion/types";
import { getToolsForSource } from "../../lib/conversion/tools";
import { downloadUrl } from "../../lib/conversion/client";
import type { QueueItem } from "../../lib/store/converter-store";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function QueueItemRow({
  item,
  onTargetChange,
  onRemove,
  onConvert,
  onDownloaded,
}: {
  item: QueueItem;
  onTargetChange: (id: string, format: FormatId) => void;
  onRemove: (id: string) => void;
  onConvert: (id: string) => void;
  onDownloaded: (id: string) => void;
}) {
  const availableTargets = item.sourceFormat ? getToolsForSource(item.sourceFormat) : [];
  const isBusy = item.status === "uploading" || item.status === "converting";

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <FileText className="size-5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0">
          <p className="truncate font-medium">{item.file.name}</p>
          <p className="text-xs text-muted-foreground">
            {formatBytes(item.file.size)}
            {item.sourceFormat ? ` · ${FORMAT_LABELS[item.sourceFormat]}` : ""}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
        {item.status === "queued" && item.sourceFormat && (
          <>
            <Select
              value={item.targetFormat}
              onValueChange={(v) => onTargetChange(item.id, v as FormatId)}
            >
              <SelectTrigger className="w-37.5" aria-label="Target format">
                <SelectValue placeholder="Target format" />
              </SelectTrigger>
              <SelectContent>
                {availableTargets.map((tool) => {
                  const target = tool.targetFormats[0];
                  return (
                    <SelectItem key={tool.id} value={target}>
                      {FORMAT_LABELS[target]}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={() => onConvert(item.id)} disabled={availableTargets.length === 0}>
              Convert
            </Button>
          </>
        )}

        {!item.sourceFormat && item.status === "queued" && (
          <span className="inline-flex items-center gap-1.5 text-sm text-destructive">
            <AlertCircle className="size-4" aria-hidden />
            Unsupported file type
          </span>
        )}

        {isBusy && (
          <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {item.progressMessage || "Working…"}
          </span>
        )}

        {item.status === "done" && item.outputFileId && !item.downloaded && (
          <>
            <span className="inline-flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-4" aria-hidden />
              Done
            </span>
            <Button
              size="sm"
              variant="secondary"
              render={
                <a
                  href={downloadUrl(item.outputFileId)}
                  download={item.outputFilename}
                  onClick={() => onDownloaded(item.id)}
                >
                  <Download className="size-4" aria-hidden />
                  Download
                </a>
              }
            />
          </>
        )}

        {item.status === "done" && item.downloaded && (
          <span className="text-sm text-muted-foreground">Downloaded -- convert again to re-download</span>
        )}

        {item.status === "error" && (
          <span className="inline-flex items-center gap-1.5 text-sm text-destructive" role="alert">
            <AlertCircle className="size-4" aria-hidden />
            {item.errorMessage ?? "Conversion failed"}
          </span>
        )}

        <Button
          size="icon"
          variant="ghost"
          aria-label={`Remove ${item.file.name}`}
          onClick={() => onRemove(item.id)}
          disabled={isBusy}
        >
          <X className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
