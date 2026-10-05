"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { uploadPdf, ClientConversionError } from "./client";

export type SinglePdfStatus = "idle" | "uploading" | "ready" | "error";

export interface SinglePdfState {
  status: SinglePdfStatus;
  file: File | null;
  fileId: string | null;
  pageCount: number | null;
  errorMessage: string | null;
}

/** Shared upload flow for every single-PDF-in, single-or-many-PDF-out tool
 * (split/rotate/extract/reorder/compress). Merge uploads multiple files
 * instead and manages its own state -- see merge-panel.tsx. */
export function useSinglePdf() {
  const [state, setState] = useState<SinglePdfState>({
    status: "idle",
    file: null,
    fileId: null,
    pageCount: null,
    errorMessage: null,
  });

  const onFiles = useCallback(async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setState({ status: "uploading", file, fileId: null, pageCount: null, errorMessage: null });
    try {
      const uploaded = await uploadPdf(file);
      setState({
        status: "ready",
        file,
        fileId: uploaded.fileId,
        pageCount: uploaded.pageCount ?? null,
        errorMessage: null,
      });
    } catch (err) {
      const message = err instanceof ClientConversionError ? err.message : "Upload failed. Please try again.";
      setState({ status: "error", file, fileId: null, pageCount: null, errorMessage: message });
      toast.error(message);
    }
  }, []);

  const reset = useCallback(() => {
    setState({ status: "idle", file: null, fileId: null, pageCount: null, errorMessage: null });
  }, []);

  return { ...state, onFiles, reset };
}
