import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // lib/markdown/markdown.css and print.css are read at runtime via
  // path.join(process.cwd(), ...) (app/api/markdown-preview/route.ts,
  // lib/conversion/engines/html.ts, lib/conversion/engines/to-pdf.ts) --
  // Next's build-time file tracer (@vercel/nft) only sees imports/requires
  // statically, so a process.cwd()-joined path is invisible to it and
  // these files are not guaranteed to land in the deployed function. This
  // keys off every route ('/*') since all three of the editor preview,
  // md:html, and md:pdf can hit this at runtime.
  outputFileTracingIncludes: {
    "/*": ["lib/markdown/*.css"],
  },
};

export default nextConfig;
