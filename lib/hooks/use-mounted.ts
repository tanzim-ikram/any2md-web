"use client";

import { useSyncExternalStore } from "react";

const subscribeNever = () => () => {};

/** True only once the client's post-hydration render has happened.
 * `useSyncExternalStore`'s `getServerSnapshot` (the third argument) is used
 * for BOTH the server-rendered pass and the client's hydration pass -- so
 * server HTML and the hydration render both produce `false` here, and
 * there is no mismatch between them to warn about. The flip to `true`
 * happens in an ordinary post-hydration update, not a hydration diff.
 *
 * Used wherever a value genuinely isn't knowable until the client reads
 * something only the client has (localStorage, system theme, ...) -- see
 * components/layout/theme-toggle.tsx and components/editor/editor-workspace.tsx. */
export function useMounted(): boolean {
  return useSyncExternalStore(subscribeNever, () => true, () => false);
}
