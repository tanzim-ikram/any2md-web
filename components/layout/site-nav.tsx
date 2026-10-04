"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileStack } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { cn } from "../../lib/utils";

const NAV_LINKS = [
  { href: "/convert", label: "Convert" },
  { href: "/pdf-tools", label: "PDF Tools" },
  { href: "/editor", label: "Markdown Editor" },
];

export function SiteNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <FileStack className="size-5" aria-hidden />
          <span>Any2MD</span>
        </Link>

        <nav className="hidden items-center gap-1 sm:flex" aria-label="Primary">
          {NAV_LINKS.map((link) => {
            const active = pathname === link.href || pathname.startsWith(link.href + "/");
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-1">
          <ThemeToggle />
        </div>
      </div>

      {/* Mobile nav: simple horizontal scroll row under the header, per the
       * plan's "simplify navigation" guidance for small screens. */}
      <nav className="flex gap-1 overflow-x-auto border-t border-border/60 px-4 py-1.5 sm:hidden" aria-label="Primary">
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="shrink-0 rounded-md px-3 py-1 text-sm font-medium text-muted-foreground hover:bg-accent/60 hover:text-foreground"
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
