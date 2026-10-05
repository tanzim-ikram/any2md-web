/**
 * Maps any thrown error to a stable JSON error shape the client can render
 * (plan section 8: "never return raw stack traces to users"). A
 * ConversionError's own title/message are user-safe by construction; any
 * other error is logged server-side (never with document content -- see
 * lib/lifecycle's logging note) and replaced with a generic message.
 */
import { NextResponse } from "next/server";
import { ConversionError, type ErrorCode } from "../conversion/types";

export function errorResponse(err: unknown, httpStatus?: number): NextResponse {
  if (err instanceof ConversionError) {
    // A ConversionError's title/message are always user-safe, but a wrapped
    // `cause` (the real underlying failure -- a Chromium launch error, a
    // mammoth parse failure, ...) is server-only detail. Without this, an
    // engine failure in production surfaces to the user with zero signal
    // in the logs (see lib/conversion/engines/to-pdf.ts and friends, which
    // pass `cause` precisely so this can log it).
    if (err.cause !== undefined || statusForCode(err.code) >= 500) {
      console.error(`[any2md] ${err.code}: ${err.message}`, err.cause ?? "");
    }
    return NextResponse.json(
      { error: { code: err.code, title: err.title, message: err.message } },
      { status: httpStatus ?? statusForCode(err.code) },
    );
  }

  // Unknown error: log server-side only, never leak internals to the client.
  console.error("[any2md] unhandled error:", err);
  return NextResponse.json(
    {
      error: {
        code: "INTERNAL_ERROR" satisfies ErrorCode,
        title: "Something went wrong",
        message: "An unexpected error occurred. Please try again.",
      },
    },
    { status: 500 },
  );
}

function statusForCode(code: ErrorCode): number {
  switch (code) {
    case "FILE_NOT_FOUND":
    case "FILE_EXPIRED":
      return 404;
    case "INVALID_REQUEST":
    case "FILE_TOO_LARGE":
    case "TOO_MANY_FILES":
    case "PAGE_LIMIT_EXCEEDED":
    case "UNSUPPORTED_FORMAT":
    case "LEGACY_FORMAT_UNSUPPORTED":
    case "SAME_FORMAT":
    case "INVALID_FILE_TYPE":
    case "CORRUPTED_FILE":
    case "PASSWORD_PROTECTED":
    case "INVALID_PAGE_RANGE":
    case "TOOL_UNAVAILABLE":
      return 422;
    case "RATE_LIMITED":
      return 429;
    case "TIMEOUT":
      return 504;
    default:
      return 500;
  }
}

/** Parses a route's JSON body, turning a malformed body into a clean 422
 * instead of letting `SyntaxError` fall through to the generic 500 path
 * (which also skips the error-specific cleanup each route's catch block
 * does, e.g. not destroying an upload over unparseable JSON). */
export async function readJsonBody<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new ConversionError("INVALID_REQUEST", "Invalid request", "The request body was not valid JSON.");
  }
}
