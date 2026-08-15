import type { NextFunction, Request, Response } from "express";
import { ApiError, sendError } from "../lib/errors";
import { firebaseAvailable, verifyIdToken, type VerifiedUser } from "../lib/firebase";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: VerifiedUser | null;
    }
  }
}

function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

/**
 * Attaches `req.user` when a valid token is present, and otherwise leaves it
 * null. Used on endpoints that work for anyone but do something extra - here,
 * saving to history - for signed-in callers.
 */
export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const token = bearerToken(req);
  req.user = token ? await verifyIdToken(token) : null;
  next();
}

/**
 * Rejects anything without a verifiable token. Identity is established from the
 * token alone - never from a header, body field, or query parameter the client
 * could set, which is what makes cross-user access impossible to request.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!(await firebaseAvailable())) {
    sendError(
      res,
      new ApiError(
        "AUTH_NOT_CONFIGURED",
        "Sign-in isn't available on this deployment yet.",
      ),
    );
    return;
  }

  const token = bearerToken(req);
  const user = token ? await verifyIdToken(token) : null;

  if (!user) {
    sendError(
      res,
      new ApiError("UNAUTHENTICATED", "Sign in to access this."),
    );
    return;
  }

  req.user = user;
  next();
}
