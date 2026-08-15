import type { NextFunction, Request, Response } from "express";
import { ApiError, sendError } from "./errors";

interface Bucket {
  count: number;
  resetAt: number;
}

const MAX_BUCKETS = 10_000;

export function positiveIntegerEnv(
  rawValue: string | undefined,
  fallback: number,
  name: string,
): number {
  if (rawValue === undefined || rawValue.trim() === "") return fallback;

  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return value;
}

/**
 * Small fixed-window limiter held in memory.
 *
 * Analysis is the expensive path - OCR and LLM calls - so it is worth
 * protecting even in a prototype. In-memory state is adequate for a
 * single-instance deployment; a multi-instance deployment would need a shared
 * store, which is noted in the deployment docs rather than built speculatively.
 */
export function rateLimit(options: {
  windowMs: number;
  max: number;
  name: string;
}) {
  const buckets = new Map<string, Bucket>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = `${options.name}:${req.ip ?? "unknown"}`;
    const bucket = buckets.get(key);

    if (!bucket || now >= bucket.resetAt) {
      // Bound the map: an attacker cannot create an unbounded entry for every
      // spoofed/unique address and consume the process over time.
      if (!bucket && buckets.size >= MAX_BUCKETS) {
        for (const [bucketKey, value] of buckets) {
          if (now >= value.resetAt) buckets.delete(bucketKey);
        }
      }

      if (!bucket && buckets.size >= MAX_BUCKETS) {
        sendError(
          res,
          new ApiError(
            "RATE_LIMITED",
            "The service is busy. Try again in a moment.",
          ),
        );
        return;
      }

      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    if (bucket.count >= options.max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      sendError(
        res,
        new ApiError(
          "RATE_LIMITED",
          `Too many requests. Try again in ${retryAfter} seconds.`,
        ),
      );
      return;
    }

    bucket.count += 1;
    next();
  };
}
