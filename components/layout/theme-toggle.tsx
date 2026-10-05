"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "../ui/button";

const subscribeNever = () => () => {};
/** True only once mounted on the client -- the real theme isn't knowable
 * until then (localStorage/system preference). useSyncExternalStore (rather
 * than an effect + setState) is the pattern React itself recommends for
 * this "has hydration happened yet" flag: getServerSnapshot always returns
 * false, so it's correct on both the server-rendered and first-client
 * passes, then flips once the client's real snapshot is read post-mount. */
function useMounted(): boolean {
  return useSyncExternalStore(subscribeNever, () => true, () => false);
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();

  if (!mounted) {
    // This placeholder is only ever rendered for the brief window before
    // the mount effect below fires -- by design it's a different element
    // (disabled, no click handler) than what replaces it client-side a
    // moment later, so React's hydration diff on it is a known, expected
    // mismatch (see the "server/client branch" case in React's own
    // hydration-mismatch message), not a real bug. suppressHydrationWarning
    // tells React not to flag that one, intentional difference.
    return <Button variant="ghost" size="icon" aria-hidden disabled className="opacity-0" suppressHydrationWarning />;
  }

  const isDark = theme === "dark";
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      suppressHydrationWarning
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
