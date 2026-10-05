"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Dropzone } from "./dropzone";
import { QueueItemRow } from "./queue-item-row";
import { Button } from "../ui/button";
import { useConverterStore, type QueueItem } from "../../lib/store/converter-store";
import { convertOneFile, downloadZipUrl, parseErrorResponse, ClientConversionError } from "../../lib/conversion/client";
import { saveBlob } from "../../lib/download/save-blob";

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

  // Items already downloaded individually are consumed server-side
  // (/api/download deletes on GET) and can't be zipped again.
  const doneItems = items.filter(
    (i): i is QueueItem & { outputFileId: string } => i.status === "done" && !!i.outputFileId && !i.downloaded,
  );

  const downloadAllAsZip = useCallback(async () => {
    setDownloadingZip(true);
    try {
      const res = await fetch(downloadZipUrl(doneItems.map((i) => i.outputFileId)));
      if (!res.ok) await parseErrorResponse(res);
      const blob = await res.blob();
      saveBlob(blob, "docsmith-conversions.zip");
      for (const item of doneItems) updateItem(item.id, { downloaded: true });
    } catch (err) {
      const message = err instanceof ClientConversionError ? err.message : "Couldn't download the ZIP. Please try again.";
      toast.error(message);
    } finally {
      setDownloadingZip(false);
    }
  }, [doneItems, updateItem]);

  const markDownloaded = useCallback((id: string) => updateItem(id, { downloaded: true }), [updateItem]);

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
                onDownloaded={markDownloaded}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
