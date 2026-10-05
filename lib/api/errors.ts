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
