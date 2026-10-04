import type { Metadata } from "next";
import { ConverterWorkspace } from "../../components/converter/converter-workspace";

export const metadata: Metadata = {
  title: "Convert",
  description: "Convert documents, PDFs, spreadsheets, and presentations to and from Markdown.",
};

export default function ConvertPage() {
  return <ConverterWorkspace />;
}
