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
    // the server pass and the client's hydration pass -- useMounted's own
    // doc comment explains why that should mean there's no hydration
    // mismatch here. In practice, Base UI's Button primitive has still
    // been observed computing its `disabled`-related DOM attributes
    // differently between the server-rendered markup and the client's
    // first paint for this exact placeholder (verified: not reproducible
    // via a direct SSR-output diff or a scripted headless-browser load,
    // so it looks environment/timing-dependent rather than a logic bug in
    // this component). This placeholder is disabled and aria-hidden
    // either way -- nothing a user can interact with before it's replaced
    // -- so suppressing is a safe, inert guard against that divergence
    // rather than a sign something here is actually wrong.
    return <Button variant="ghost" size="icon" aria-hidden disabled className="opacity-0" suppressHydrationWarning />;
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
