"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

/** Dark/light/system theme support (plan section 9/13), matching the
 * desktop app's theming. Wraps next-themes, which toggles the `.dark`
 * class that app/globals.css's shadcn tokens already key off. */
export function ThemeProvider({ children, ...props }: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange {...props}>
      {children}
    </NextThemesProvider>
  );
}
