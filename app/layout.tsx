import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "../components/layout/theme-provider";
import { SiteNav } from "../components/layout/site-nav";
import { Toaster } from "../components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Docsmith — Markdown converter, PDF toolbox & live editor",
    template: "%s · Docsmith",
  },
  description:
    "Convert documents, PDFs, spreadsheets, presentations, and web pages into clean Markdown — then turn Markdown back into polished documents.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* suppressHydrationWarning: browser extensions (Grammarly, etc.) inject
          attributes like data-gr-ext-installed onto <body> before React
          hydrates, which would otherwise always flag as a false-positive
          mismatch here -- see https://react.dev/link/hydration-mismatch */}
      <body className="flex min-h-full flex-col bg-background text-foreground" suppressHydrationWarning>
        <ThemeProvider>
          <SiteNav />
          <main className="flex-1">{children}</main>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
