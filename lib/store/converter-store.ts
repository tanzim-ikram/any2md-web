/**
 * Client-side queue state for the converter workspace. This is the one
 * place Zustand is used (plan section 9: "lightweight state management...
 * only where client-side global state is actually useful") -- the queue of
 * in-flight files is genuinely shared across the dropzone, the file list,
 * and the results view, so it earns a store; nothing else in the app does.
 */
import { create } from "zustand";
import type { FormatId } from "../conversion/types";
import { getToolsForSource } from "../conversion/tools";

export type QueueItemStatus =
  | "queued"
  | "uploading"
  | "converting"
  | "done"
  | "error";

export interface QueueItem {
  id: string; // client-generated, stable across the item's lifetime in the UI
  file: File;
  sourceFormat: FormatId | null;
  targetFormat: FormatId;
  status: QueueItemStatus;
  progressMessage: string;
  uploadedFileId?: string;
  outputFileId?: string;
  outputFilename?: string;
  errorMessage?: string;
}

interface ConverterState {
  items: QueueItem[];
  addFiles: (files: File[]) => void;
  updateItem: (id: string, patch: Partial<QueueItem>) => void;
  setTargetFormat: (id: string, format: FormatId) => void;
  removeItem: (id: string) => void;
  clear: () => void;
}

function guessFormatFromExtension(filename: string): FormatId | null {
  const ext = filename.split(".").pop()?.toLowerCase();
  const map: Record<string, FormatId> = {
    pdf: "pdf",
    docx: "docx",
    xlsx: "xlsx",
    xlsm: "xlsx",
    pptx: "pptx",
    html: "html",
    htm: "html",
    csv: "csv",
    txt: "txt",
    md: "md",
    markdown: "md",
  };
  return ext ? (map[ext] ?? null) : null;
}

/** "To Markdown" is the product's primary direction and the sensible
 * default for every non-Markdown source. A Markdown file itself defaults
 * to Word, matching the spec's listed priority order (MD -> DOCX before
 * MD -> PDF/HTML/PPTX). Falls back to whatever the format actually
 * supports if neither preference applies. */
function defaultTargetFor(sourceFormat: FormatId | null): FormatId {
  if (!sourceFormat) return "md";
  if (sourceFormat !== "md") return "md";
  const options = getToolsForSource("md");
  const preferred = options.find((t) => t.targetFormats[0] === "docx");
  return preferred?.targetFormats[0] ?? options[0]?.targetFormats[0] ?? "docx";
}

export const useConverterStore = create<ConverterState>((set) => ({
  items: [],

  addFiles: (files) =>
    set((state) => ({
      items: [
        ...state.items,
        ...files.map((file) => {
          const sourceFormat = guessFormatFromExtension(file.name);
          return {
            id: crypto.randomUUID(),
            file,
            sourceFormat,
            targetFormat: defaultTargetFor(sourceFormat),
            status: "queued" as const,
            progressMessage: "",
          };
        }),
      ],
    })),

  updateItem: (id, patch) =>
    set((state) => ({
      items: state.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    })),

  setTargetFormat: (id, format) =>
    set((state) => ({
      items: state.items.map((item) => (item.id === id ? { ...item, targetFormat: format } : item)),
    })),

  removeItem: (id) => set((state) => ({ items: state.items.filter((item) => item.id !== id) })),

  clear: () => set({ items: [] }),
}));
