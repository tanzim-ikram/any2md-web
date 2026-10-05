"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { MergePanel } from "./panels/merge-panel";
import { SplitPanel } from "./panels/split-panel";
import { RotatePanel } from "./panels/rotate-panel";
import { ExtractPanel } from "./panels/extract-panel";
import { ReorderPanel } from "./panels/reorder-panel";
import { CompressPanel } from "./panels/compress-panel";

const TOOLS = [
  { value: "merge", label: "Merge", panel: <MergePanel /> },
  { value: "split", label: "Split", panel: <SplitPanel /> },
  { value: "rotate", label: "Rotate", panel: <RotatePanel /> },
  { value: "extract", label: "Extract", panel: <ExtractPanel /> },
  { value: "reorder", label: "Reorder", panel: <ReorderPanel /> },
  { value: "compress", label: "Compress", panel: <CompressPanel /> },
];

export function PdfToolsWorkspace() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">PDF toolbox</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Merge, split, rotate, extract, reorder, or compress PDFs. Files are processed temporarily and automatically
          deleted after you download the result. No account required.
        </p>
      </div>

      <Tabs defaultValue="merge" className="gap-4">
        <TabsList variant="line" className="w-full justify-start">
          {TOOLS.map((tool) => (
            <TabsTrigger key={tool.value} value={tool.value}>
              {tool.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {TOOLS.map((tool) => (
          <TabsContent key={tool.value} value={tool.value}>
            {tool.panel}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
