"use client";

import { Bold, Italic, Heading1, Heading2, List, ListOrdered, Link2, Code, Quote } from "lucide-react";
import { Button } from "../ui/button";

export interface WrapAction {
  before: string;
  after?: string;
  placeholder?: string;
}

const ACTIONS: { icon: typeof Bold; label: string; action: WrapAction }[] = [
  { icon: Bold, label: "Bold", action: { before: "**", after: "**", placeholder: "bold text" } },
  { icon: Italic, label: "Italic", action: { before: "_", after: "_", placeholder: "italic text" } },
  { icon: Heading1, label: "Heading 1", action: { before: "# ", placeholder: "Heading" } },
  { icon: Heading2, label: "Heading 2", action: { before: "## ", placeholder: "Heading" } },
  { icon: List, label: "Bulleted list", action: { before: "- ", placeholder: "List item" } },
  { icon: ListOrdered, label: "Numbered list", action: { before: "1. ", placeholder: "List item" } },
  { icon: Link2, label: "Link", action: { before: "[", after: "](https://)", placeholder: "link text" } },
  { icon: Code, label: "Code", action: { before: "`", after: "`", placeholder: "code" } },
  { icon: Quote, label: "Quote", action: { before: "> ", placeholder: "Quote" } },
];

export function EditorToolbar({ onAction }: { onAction: (action: WrapAction) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card p-1.5">
      {ACTIONS.map(({ icon: Icon, label, action }) => (
        <Button key={label} size="icon-sm" variant="ghost" aria-label={label} onClick={() => onAction(action)}>
          <Icon className="size-4" aria-hidden />
        </Button>
      ))}
    </div>
  );
}
