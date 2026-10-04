/**
 * TXT -> Markdown. Plain text has no structure to recover, so this mostly
 * escapes Markdown-significant characters so the original text renders as
 * itself rather than being accidentally interpreted as Markdown syntax
 * (mirrors the desktop app's behavior for .txt input).
 */
import type { ConversionEngine } from "../types";
import { outputName } from "./util";
import { ConversionError } from "../types";

const ENCODINGS = ["utf-8", "utf-16le", "latin1"] as const;

/** Best-effort decode: try UTF-8 first (the common case), fall back through
 * a short list rather than failing outright on a non-UTF-8 text file. */
function decodeText(buffer: Buffer): string {
  for (const enc of ENCODINGS) {
    try {
      const text = new TextDecoder(enc, { fatal: enc === "utf-8" }).decode(buffer);
      return text;
    } catch {
      continue;
    }
  }
  // last resort: lossy decode
  return buffer.toString("utf-8");
}

/** Escape characters that would otherwise be interpreted as Markdown syntax. */
function escapeMarkdown(text: string): string {
  return text.replace(/([\`*_{}[\]()#+\-.!>|~])/g, "\$1");
}

export const txtToMarkdown: ConversionEngine = async (input, filename, options) => {
  if (input.length === 0) {
    throw new ConversionError(
      "CORRUPTED_FILE",
      "Nothing to convert",
      `"${filename}" is empty.`,
    );
  }

  const raw = decodeText(input);
  const escaped = raw
    .split(/\r?\n/)
    .map((line) => escapeMarkdown(line))
    .join("\n");

  return {
    buffer: Buffer.from(escaped, "utf-8"),
    filename: outputName(options.customOutputName, filename, "md"),
    mimeType: "text/markdown",
  };
};
