import type { NextFunction, Request, Response } from "express";
import { ApiError, sendError } from "../lib/errors";
import { logger } from "../lib/logger";

interface BodyParserError extends Error {
  status?: number;
  statusCode?: number;
  type?: string;
}

/**
 * Terminal error handler.
 *
 * Without this, errors raised inside Express middleware - malformed JSON and
 * oversized bodies are the reachable ones - fall through to Express's default
 * handler, which replies with an HTML page containing the stack trace and
 * absolute filesystem paths. That is both an information disclosure and a
 * break of the API's own contract, since every documented error is JSON with a
 * stable code.
 *
 * Errors are translated into the same typed shape as everything else, and the
 * detail is logged rather than returned.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof ApiError) {
    sendError(res, err);
    return;
  }

  const parserError = err as BodyParserError;
  const status = parserError?.status ?? parserError?.statusCode;

  if (parserError?.type === "entity.too.large" || status === 413) {
    sendError(
      res,
      new ApiError(
        "FILE_TOO_LARGE",
        "That request was too large. Send at most 5000 characters of text.",
      ),
    );
    return;
  }

  if (parserError?.type === "entity.parse.failed" || status === 400) {
    sendError(
      res,
      new ApiError("VALIDATION_ERROR", "That request body wasn't valid JSON."),
    );
    return;
  }

  // Anything unrecognised is logged in full and reported generically - the
  // client learns that it failed, not how the server is put together.
  logger.error(
    { err: err instanceof Error ? err.message : String(err) },
    "Unhandled error reached the error handler",
  );

  sendError(res, err);
}
