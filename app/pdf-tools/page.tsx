import type { Metadata } from "next";
import { PdfToolsWorkspace } from "../../components/pdf-tools/pdf-tools-workspace";

export const metadata: Metadata = {
  title: "PDF Tools",
  description: "Merge, split, rotate, extract, reorder, and compress PDF files.",
};

export default function PdfToolsPage() {
  return <PdfToolsWorkspace />;
}
