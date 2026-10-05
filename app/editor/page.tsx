import type { Metadata } from "next";
import { EditorWorkspace } from "../../components/editor/editor-workspace";

export const metadata: Metadata = {
  title: "Markdown Editor",
  description: "Write Markdown with a live preview and export to Word, PDF, HTML, or PowerPoint.",
};

export default function EditorPage() {
  return <EditorWorkspace />;
}
