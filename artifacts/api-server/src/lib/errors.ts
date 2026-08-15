import type { Response } from "express";
import type { ErrorCode, ErrorResponse } from "@workspace/api-zod";

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  EMPTY_INPUT: 400,
  INPUT_TOO_LONG: 400,
  OCR_EMPTY: 400,
  OCR_FAILED: 400,
  UNSUPPORTED_MEDIA_TYPE: 415,
  FILE_TOO_LARGE: 413,
  UNAUTHENTICATED: 401,
  AUTH_NOT_CONFIGURED: 503,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  HISTORY_NOT_CONFIGURED: 503,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

/**
 * An error with a stable machine-readable code and a message that is safe to
 * show a user directly. Anything a caller might reasonably branch on gets its
 * own code rather than collapsing into a generic failure.
 */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly details: string | null;

  constructor(code: ErrorCode, message: string, details: string | null = null) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.details = details;
  }

  get status(): number {
    return STATUS_BY_CODE[this.code];
  }

  toBody(): ErrorResponse {
    return {
      error: { code: this.code, message: this.message, details: this.details },
    };
  }
}

export function sendError(res: Response, error: unknown): void {
  const apiError =
    error instanceof ApiError
      ? error
      : new ApiError(
          "INTERNAL_ERROR",
          "Something failed on our side while handling this request.",
        );

  res.status(apiError.status).json(apiError.toBody());
}
