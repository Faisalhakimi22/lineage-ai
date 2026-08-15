import { logger } from "./logger";

/**
 * Ensures an unexpected process-level failure is logged before the process
 * exits and the deployment supervisor can start a clean instance.
 *
 * The concrete case this exists for: tesseract.js reports some malformed
 * images by emitting an error on its worker thread rather than rejecting the
 * promise we are awaiting. That escapes the route's try/catch entirely and
 * reaches the process as an uncaught exception. A truncated upload - a valid
 * PNG header with a cut-off body - is enough to trigger it, so this is
 * reachable by accident, never mind deliberately.
 *
 * A route should turn malformed input into a typed error before it reaches
 * here. Tesseract has one known exception to that rule: malformed images can
 * emit this exact worker error after the route has already converted the OCR
 * failure into a 4xx response. That expected decoder failure is logged and
 * contained; every other process-level failure restarts the service.
 */
export function installProcessGuards(): void {
  let shuttingDown = false;

  const failFast = (context: string, value: unknown): void => {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.fatal(
      { err: value instanceof Error ? value.message : String(value) },
      context,
    );

    // Give Pino a moment to flush, then rely on the process manager to start a
    // clean replacement. `unref` prevents this timer from keeping tests alive.
    setTimeout(() => process.exit(1), 100).unref();
  };

  process.on("uncaughtException", (err) => {
    if (
      err instanceof Error &&
      /Error attempting to read image\.?$/i.test(err.message)
    ) {
      logger.warn(
        { err: err.message },
        "Tesseract rejected a malformed image after the request was handled",
      );
      return;
    }

    failFast("Uncaught exception; restarting process", err);
  });

  process.on("unhandledRejection", (reason) => {
    failFast("Unhandled promise rejection; restarting process", reason);
  });
}
