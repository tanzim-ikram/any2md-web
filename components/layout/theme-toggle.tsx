"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "../ui/button";
import { useMounted } from "../../lib/hooks/use-mounted";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();

  if (!mounted) {
    // The real theme isn't knowable until the client reads
    // localStorage/system preference, so this placeholder renders on both
    // the server pass and the client's hydration pass -- see useMounted's
    // own doc comment for why that means there's no hydration mismatch to
    // suppress here.
    return <Button variant="ghost" size="icon" aria-hidden disabled className="opacity-0" />;
  }

  // `theme` (not used here) can be "system"; `resolvedTheme` is next-themes'
  // already-resolved light/dark value, which is what the icon and label
  // must reflect -- `theme === "dark"` was false for every system-dark
  // user (ThemeProvider sets defaultTheme="system"), so the toggle showed
  // the wrong icon/label and the first click was a no-op.
  const isDark = resolvedTheme === "dark";
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
