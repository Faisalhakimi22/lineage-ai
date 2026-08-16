import { ApiError } from "./errors";
import { assertDecodableImage } from "./image-validation";
import { logger } from "./logger";
import { positiveIntegerEnv } from "./rate-limit";

// tesseract.js is loaded lazily (see extractTextFromImage), never at module
// load. It is marked `external` in the esbuild bundle, so a top-level
// `import { createWorker } from "tesseract.js"` compiles to a `require` that
// runs the instant this module is first imported. On Vercel that is at function
// *boot* for every route — this file sits in the /analyze import graph — so if
// the file tracer fails to include the externalized package (a known pnpm +
// sibling-bundle hazard) the require throws and the whole API answers 500 on
// every endpoint, including /healthz. Deferring the import keeps any such
// failure contained to image requests, surfaced as a normal OCR error.
type CreateWorker = (typeof import("tesseract.js"))["createWorker"];

// Parsed via positiveIntegerEnv (not a bare Number()) so an empty env value —
// e.g. a key added in the Vercel dashboard with a blank value — falls back to
// the default instead of becoming 0 and throwing here at module load.
const OCR_TIMEOUT_MS = positiveIntegerEnv(
  process.env["OCR_TIMEOUT_MS"],
  20_000,
  "OCR_TIMEOUT_MS",
);
const MAX_CONCURRENT_OCR = positiveIntegerEnv(
  process.env["OCR_MAX_CONCURRENT"],
  2,
  "OCR_MAX_CONCURRENT",
);

let activeOcrJobs = 0;

/**
 * Rejects with a typed timeout error if the underlying work outruns its
 * budget. The worker is still terminated by the caller's `finally`, so a timed
 * out job does not leak a thread.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new ApiError(
          "OCR_FAILED",
          "That image took too long to read. Try a smaller or clearer screenshot, or paste the text directly.",
        ),
      );
    }, ms);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err as Error);
      },
    );
  });
}

/**
 * Extracts text from an image using tesseract.js (pure JS/WASM - no system
 * binary required).
 *
 * Failures surface as specific, actionable errors rather than a generic one,
 * because "we couldn't read your image" and "we read it and found nothing"
 * mean different things to a user and warrant different next steps.
 */
export async function extractTextFromImage(buffer: Buffer): Promise<string> {
  // Validated before the decoder sees it. Tesseract's worker reports some
  // malformed input by emitting an error event rather than rejecting its
  // promise, which escapes try/catch and surfaces as an unhandled exception -
  // enough to take the process down on a hostile upload.
  assertDecodableImage(buffer);

  if (activeOcrJobs >= MAX_CONCURRENT_OCR) {
    throw new ApiError(
      "RATE_LIMITED",
      "Image analysis is busy. Try again in a moment, or paste the text directly.",
    );
  }

  activeOcrJobs += 1;
  let worker: Awaited<ReturnType<CreateWorker>> | null = null;

  try {
    // Externalized dependency, imported here so a resolution failure degrades
    // to an OCR error for this one request instead of crashing the process.
    const { createWorker } = await import("tesseract.js");
    worker = await createWorker("eng");
    // Recognition is unbounded by default: a large or adversarially-crafted
    // image can occupy a worker indefinitely, which on a single-instance demo
    // is enough to stall the service for everyone. Losing the request is
    // strictly better than losing the process.
    const {
      data: { text },
    } = await withTimeout(worker.recognize(buffer), OCR_TIMEOUT_MS);
    return text.trim();
  } catch (err) {
    if (err instanceof ApiError) throw err;

    logger.error(
      { err: err instanceof Error ? err.message : "unknown" },
      "OCR failed",
    );
    throw new ApiError(
      "OCR_FAILED",
      "We couldn't read that image. It may be corrupted — try a PNG or JPEG screenshot, or paste the text directly.",
    );
  } finally {
    if (worker) {
      await worker.terminate().catch(() => {
        // Terminating a worker that already failed can itself reject; that is
        // not something the caller can act on.
      });
    }
    activeOcrJobs -= 1;
  }
}
