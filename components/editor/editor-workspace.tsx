"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Loader2 } from "lucide-react";
import { EditorToolbar, type WrapAction } from "./editor-toolbar";
import { Button } from "../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { FORMAT_LABELS, type FormatId } from "../../lib/conversion/types";
import { convertOneFile, downloadUrl, ClientConversionError } from "../../lib/conversion/client";

const DRAFT_KEY = "any2md-editor-draft";
const DEFAULT_MARKDOWN = `# Untitled document

Start writing in Markdown. The preview on the right updates as you type.
`;

const EXPORT_FORMATS: FormatId[] = ["docx", "pdf", "html", "pptx"];

function loadDraft(): string {
  try {
    return localStorage.getItem(DRAFT_KEY) ?? DEFAULT_MARKDOWN;
  } catch {
    return DEFAULT_MARKDOWN;
  }
}

export function EditorWorkspace() {
  // Lazy initializer runs once on mount, not in an effect -- avoids an
  // extra render pass just to pull the draft out of localStorage, and
  // typeof window guards the server-rendered pass before hydration.
  const [markdown, setMarkdown] = useState(() => (typeof window !== "undefined" ? loadDraft() : DEFAULT_MARKDOWN));
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [exportFormat, setExportFormat] = useState<FormatId>("docx");
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<{ fileId: string; filename: string } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, markdown);
    } catch {
      // best-effort only -- e.g. private browsing can throw
    }
  }, [markdown]);

  // Debounced live preview: renders server-side via the same pipeline every
  // export format uses, so the preview is never out of sync with what
  // exporting will actually produce.
  useEffect(() => {
    const handle = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const res = await fetch("/api/markdown-preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ markdown }),
        });
        if (res.ok) {
          const { html } = (await res.json()) as { html: string };
          setPreviewHtml(html);
        }
      } catch {
        // transient network errors shouldn't interrupt typing
      } finally {
        setPreviewLoading(false);
      }
    }, 400);
    return () => clearTimeout(handle);
  }, [markdown]);

  const applyAction = useCallback(
    (action: WrapAction) => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const { selectionStart, selectionEnd, value } = textarea;
      const selected = value.slice(selectionStart, selectionEnd) || action.placeholder || "";
      const after = action.after ?? "";
      const next = value.slice(0, selectionStart) + action.before + selected + after + value.slice(selectionEnd);
      setMarkdown(next);
      requestAnimationFrame(() => {
        const cursor = selectionStart + action.before.length;
        textarea.focus();
        textarea.setSelectionRange(cursor, cursor + selected.length);
      });
    },
    [],
  );

  const runExport = useCallback(async () => {
    setExporting(true);
    setExportResult(null);
    try {
      const file = new File([markdown], "document.md", { type: "text/markdown" });
      const result = await convertOneFile({
        file,
        targetFormat: exportFormat,
        onProgress: () => void 0,
      });
      setExportResult({ fileId: result.outputFileId, filename: result.filename });
      for (const w of result.warnings) toast.warning(w.message);
    } catch (err) {
      const message = err instanceof ClientConversionError ? err.message : "Export failed. Please try again.";
      toast.error(message);
    } finally {
      setExporting(false);
    }
  }, [markdown, exportFormat]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Markdown editor</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Write Markdown with a live preview, then export to Word, PDF, HTML, or PowerPoint.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={exportFormat} onValueChange={(v) => setExportFormat(v as FormatId)}>
            <SelectTrigger className="w-32" aria-label="Export format">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXPORT_FORMATS.map((f) => (
                <SelectItem key={f} value={f}>
                  {FORMAT_LABELS[f]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={runExport} disabled={exporting}>
            {exporting ? "Exporting…" : `Export to ${FORMAT_LABELS[exportFormat]}`}
          </Button>
          {exportResult && (
            <Button
              variant="secondary"
              render={
                <a href={downloadUrl(exportResult.fileId)} download={exportResult.filename}>
                  <Download className="size-4" aria-hidden />
                  Download
                </a>
              }
            />
          )}
        </div>
      </div>

      <EditorToolbar onAction={applyAction} />

      <div className="grid gap-4 lg:grid-cols-2">
        <textarea
          ref={textareaRef}
          value={markdown}
          onChange={(e) => setMarkdown(e.target.value)}
          spellCheck
          className="min-h-[60vh] w-full resize-none rounded-lg border border-border bg-card p-4 font-mono text-sm leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          aria-label="Markdown source"
        />
        <div className="relative min-h-[60vh] overflow-hidden rounded-lg border border-border bg-card">
          {previewLoading && (
            <Loader2 className="absolute top-3 right-3 size-4 animate-spin text-muted-foreground" aria-hidden />
          )}
          <iframe title="Preview" srcDoc={previewHtml} className="h-full min-h-[60vh] w-full" sandbox="" />
        </div>
      </div>
    </div>
  );
}
