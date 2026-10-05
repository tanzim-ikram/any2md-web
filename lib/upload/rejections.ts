/**
 * Turns react-dropzone's `fileRejections` into toast-ready messages.
 * Previously ignored entirely by both dropzones (converter/dropzone.tsx,
 * pdf-tools/pdf-dropzone.tsx) -- `onDrop` only read its first (accepted)
 * argument, so dropping a rejected file (wrong type, too large, or past
 * the file-count cap) did nothing visible at all.
 */

/** Mirrors react-dropzone's own `ErrorCode` enum values (file-too-large,
 * file-invalid-type, too-many-files, file-too-small) without importing the
 * enum itself, so this stays a plain data-in/data-out module. */
interface RejectedFile {
  file: { name: string };
  errors: readonly { code: string; message: string }[];
}

function describeOne(rejection: RejectedFile): string {
  const name = rejection.file.name;
  const codes = new Set(rejection.errors.map((e) => e.code));
  if (codes.has("file-too-large")) return `"${name}" is too large.`;
  if (codes.has("file-invalid-type")) return `"${name}" isn't a supported file type.`;
  // Fall back to whatever react-dropzone itself said, rather than a
  // generic message that throws away real information.
  return rejection.errors[0]?.message ?? `"${name}" couldn't be added.`;
}

/** One message per rejected file -- except "too many files", which always
 * rejects every file past the cap at once (drop 15 files with a cap of 10
 * and every one of the last 5 is its own distinct-by-filename rejection),
 * so those are collapsed into a single count instead of flooding the
 * toast queue with near-identical lines. Capped so an unusually large bad
 * drop still can't produce an unbounded number of toasts. */
export function describeRejections(rejections: readonly RejectedFile[]): string[] {
  const tooMany = rejections.filter((r) => r.errors.some((e) => e.code === "too-many-files"));
  const rest = rejections.filter((r) => !r.errors.some((e) => e.code === "too-many-files"));

  const messages: string[] = [];
  if (tooMany.length === 1) {
    messages.push(`"${tooMany[0].file.name}" wasn't added -- too many files at once.`);
  } else if (tooMany.length > 1) {
    messages.push(`${tooMany.length} files weren't added -- too many at once.`);
  }

  for (const rejection of rest) {
    if (messages.length >= 5) break;
    messages.push(describeOne(rejection));
  }
  return messages;
}
