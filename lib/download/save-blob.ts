"use client";

/**
 * Triggers a browser "Save As" for an in-memory Blob. Centralizes two
 * fixes over the ad-hoc version each ZIP download used to inline:
 *
 *  - the anchor is appended to the document before `.click()` and removed
 *    right after -- Safari and Firefox can silently no-op a `.click()` on
 *    an anchor that was never attached to the DOM.
 *  - `URL.revokeObjectURL` is deferred to the next tick instead of called
 *    synchronously right after `.click()`, which raced the same two
 *    browsers into cancelling the download they'd just been told to start.
 */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
