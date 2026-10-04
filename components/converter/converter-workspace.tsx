"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { zipSync, type Zippable } from "fflate";
import { Dropzone } from "./dropzone";
import { QueueItemRow } from "./queue-item-row";
import { Button } from "../ui/button";
import { useConverterStore, type QueueItem } from "../../lib/store/converter-store";
import { convertOneFile, downloadUrl, ClientConversionError } from "../../lib/conversion/client";

export function ConverterWorkspace() {
  const { items, addFiles, updateItem, setTargetFormat, removeItem, clear } = useConverterStore();
  const [downloadingZip, setDownloadingZip] = useState(false);

  const handleFiles = useCallback((files: File[]) => addFiles(files), [addFiles]);

  const runConversion = useCallback(
    async (id: string) => {
      const item = items.find((i) => i.id === id);
      if (!item || !item.sourceFormat) return;

      updateItem(id, { status: "uploading", progressMessage: "Uploading…", errorMessage: undefined });
      try {
        const result = await convertOneFile({
          file: item.file,
          targetFormat: item.targetFormat,
          onProgress: (message) => updateItem(id, { status: "converting", progressMessage: message }),
        });
        updateItem(id, {
          status: "done",
          outputFileId: result.outputFileId,
          outputFilename: result.filename,
        });
        for (const w of result.warnings) {
          toast.warning(w.message);
        }
      } catch (err) {
        const message = err instanceof ClientConversionError ? err.message : "Conversion failed. Please try again.";
        updateItem(id, { status: "error", errorMessage: message });
        toast.error(message);
      }
    },
    [items, updateItem],
  );

  const doneItems = items.filter((i): i is QueueItem & { outputFileId: string } => i.status === "done" && !!i.outputFileId);

  const downloadAllAsZip = useCallback(async () => {
    setDownloadingZip(true);
    try {
      const entries: Zippable = {};
      for (const item of doneItems) {
        const res = await fetch(downloadUrl(item.outputFileId));
        if (!res.ok) continue;
        const buf = new Uint8Array(await res.arrayBuffer());
        entries[item.outputFilename ?? `${item.id}.bin`] = buf;
      }
      const zipped = zipSync(entries);
      const blob = new Blob([zipped], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "any2md-conversions.zip";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloadingZip(false);
    }
  }, [doneItems]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Convert your files</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Files are processed temporarily and automatically deleted after you download the result. No account
          required.
        </p>
      </div>

      <Dropzone onFiles={handleFiles} />

      {items.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">
              {items.length} file{items.length === 1 ? "" : "s"}
            </h2>
            <div className="flex gap-2">
              {doneItems.length > 1 && (
                <Button size="sm" variant="outline" onClick={downloadAllAsZip} disabled={downloadingZip}>
                  {downloadingZip ? "Zipping…" : "Download all as ZIP"}
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={clear}>
                Clear all
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {items.map((item) => (
              <QueueItemRow
                key={item.id}
                item={item}
                onTargetChange={setTargetFormat}
                onRemove={removeItem}
                onConvert={runConversion}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
