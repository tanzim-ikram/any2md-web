"use client";

import { useCallback } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { cn } from "../../lib/utils";
import { MAX_FILE_SIZE_BYTES, MAX_FILES_PER_BATCH } from "../../lib/security/validation";
import { describeRejections } from "../../lib/upload/rejections";

const ACCEPT = { "application/pdf": [".pdf"] };

export function PdfDropzone({
  onFiles,
  multiple = false,
  label,
}: {
  onFiles: (files: File[]) => void;
  multiple?: boolean;
  label?: string;
}) {
  const onDrop = useCallback(
    (accepted: File[], rejections: FileRejection[]) => {
      if (accepted.length > 0) onFiles(accepted);
      for (const message of describeRejections(rejections)) toast.error(message);
    },
    [onFiles],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPT,
    maxSize: MAX_FILE_SIZE_BYTES,
    maxFiles: multiple ? MAX_FILES_PER_BATCH : 1,
    multiple,
  });

  return (
    <div
      {...getRootProps()}
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isDragActive ? "border-primary bg-accent/50" : "border-border hover:border-primary/50 hover:bg-accent/20",
      )}
    >
      <input {...getInputProps()} aria-label="Upload PDF files" />
      <UploadCloud className="size-7 text-muted-foreground" aria-hidden />
      <p className="text-sm font-medium">{label ?? (multiple ? "Drag & drop PDFs here" : "Drag & drop a PDF here")}</p>
      <p className="text-xs text-muted-foreground">
        or click to choose {multiple ? "files" : "a file"} — up to {MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB each
      </p>
    </div>
  );
}
