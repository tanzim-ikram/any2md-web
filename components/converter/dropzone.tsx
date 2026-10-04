"use client";

import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { UploadCloud } from "lucide-react";
import { cn } from "../../lib/utils";
import { MAX_FILES_PER_BATCH, MAX_FILE_SIZE_BYTES } from "../../lib/security/validation";

const ACCEPT = {
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
  "text/html": [".html", ".htm"],
  "text/csv": [".csv"],
  "text/plain": [".txt"],
  "text/markdown": [".md"],
};

export function Dropzone({ onFiles }: { onFiles: (files: File[]) => void }) {
  const onDrop = useCallback(
    (accepted: File[]) => {
      if (accepted.length > 0) onFiles(accepted);
    },
    [onFiles],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPT,
    maxSize: MAX_FILE_SIZE_BYTES,
    maxFiles: MAX_FILES_PER_BATCH,
  });

  return (
    <div
      {...getRootProps()}
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-14 text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isDragActive ? "border-primary bg-accent/50" : "border-border hover:border-primary/50 hover:bg-accent/20",
      )}
    >
      <input {...getInputProps()} aria-label="Upload files to convert" />
      <UploadCloud className="size-8 text-muted-foreground" aria-hidden />
      <div>
        <p className="font-medium">Drag &amp; drop files here</p>
        <p className="text-sm text-muted-foreground">or click to choose files</p>
      </div>
      <p className="text-xs text-muted-foreground">
        PDF · DOCX · XLSX · PPTX · HTML · CSV · TXT · MD — up to {MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB each
      </p>
    </div>
  );
}
