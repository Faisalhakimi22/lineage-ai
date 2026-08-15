import { createWorker } from "tesseract.js";
import { ApiError } from "./errors";
import { assertDecodableImage } from "./image-validation";
import { logger } from "./logger";

const OCR_TIMEOUT_MS = Number(process.env["OCR_TIMEOUT_MS"] ?? 20_000);
const MAX_CONCURRENT_OCR = Number(process.env["OCR_MAX_CONCURRENT"] ?? 2);

if (!Number.isSafeInteger(OCR_TIMEOUT_MS) || OCR_TIMEOUT_MS < 1) {
  throw new Error("OCR_TIMEOUT_MS must be a positive integer.");
}

if (!Number.isSafeInteger(MAX_CONCURRENT_OCR) || MAX_CONCURRENT_OCR < 1) {
  throw new Error("OCR_MAX_CONCURRENT must be a positive integer.");
}

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
  let worker: Awaited<ReturnType<typeof createWorker>> | null = null;

  try {
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
