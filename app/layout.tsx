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
    default: "Any2MD — Convert anything to Markdown",
    template: "%s · Any2MD",
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
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <ThemeProvider>
          <SiteNav />
          <main className="flex-1">{children}</main>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
