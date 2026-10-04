import Link from "next/link";
import {
  FileText,
  FileSpreadsheet,
  Presentation,
  FileCode,
  ArrowRight,
  ShieldCheck,
  PenLine,
} from "lucide-react";
import { Button } from "../components/ui/button";

const POPULAR_TOOLS = [
  { href: "/convert", label: "PDF → Markdown", icon: FileText },
  { href: "/convert", label: "Word → Markdown", icon: FileText },
  { href: "/convert", label: "Excel → Markdown", icon: FileSpreadsheet },
  { href: "/convert", label: "PowerPoint → Markdown", icon: Presentation },
  { href: "/convert", label: "Markdown → PDF", icon: FileCode },
  { href: "/convert", label: "Markdown → Word", icon: FileCode },
];

export default function HomePage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
      <section className="flex flex-col items-center gap-6 text-center">
        <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          Convert anything to Markdown.
          <br />
          Edit, transform, and export.
        </h1>
        <p className="max-w-xl text-pretty text-muted-foreground sm:text-lg">
          Convert documents, PDFs, spreadsheets, presentations, and web pages into clean Markdown — then turn
          Markdown back into polished documents.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button
            size="lg"
            render={
              <Link href="/convert">
                Start converting
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            }
          />
          <Button size="lg" variant="outline" render={<Link href="/editor">Open Markdown editor</Link>} />
        </div>
      </section>

      <section className="mt-16">
        <h2 className="mb-4 text-center text-sm font-medium text-muted-foreground">Popular tools</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {POPULAR_TOOLS.map(({ href, label, icon: Icon }) => (
            <Link
              key={label}
              href={href}
              className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-accent/40"
            >
              <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              {label}
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-16 grid gap-6 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-6">
          <PenLine className="mb-3 size-6 text-muted-foreground" aria-hidden />
          <h3 className="font-semibold">Live Markdown editor</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Write and preview Markdown side by side, then export straight to PDF, Word, HTML, or PowerPoint.
          </p>
          <Button
            variant="link"
            className="mt-2 h-auto p-0"
            render={
              <Link href="/editor">
                Open the editor
                <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            }
          />
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <ShieldCheck className="mb-3 size-6 text-muted-foreground" aria-hidden />
          <h3 className="font-semibold">Your files don&apos;t belong on our servers.</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Files are processed temporarily and automatically deleted after you download the result. There&apos;s no
            permanent document library, and we don&apos;t log file contents.
          </p>
        </div>
      </section>
    </div>
  );
}
