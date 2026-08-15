import { Router, type IRouter } from "express";
import type { UserProfile } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { historyRepository } from "../domain/history";
import { ApiError, sendError } from "../lib/errors";
import { param } from "../lib/params";

const router: IRouter = Router();

/**
 * Minimal user record. Everything here already comes from the verified token,
 * so no additional personal information is collected or stored to serve it.
 */
const firstSeen = new Map<string, string>();

router.get("/me", requireAuth, (req, res) => {
  try {
    const user = req.user!;
    const now = new Date().toISOString();

    if (!firstSeen.has(user.userId)) firstSeen.set(user.userId, now);

    const profile: UserProfile = {
      userId: user.userId,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      createdAt: firstSeen.get(user.userId)!,
      lastLoginAt: now,
    };

    res.json(profile);
  } catch (err) {
    sendError(res, err);
  }
});

router.get("/history", requireAuth, async (req, res) => {
  try {
    res.json(await historyRepository.listForUser(req.user!.userId));
  } catch (err) {
    sendError(res, err);
  }
});

router.get("/history/:id", requireAuth, async (req, res) => {
  try {
    const record = await historyRepository.getOwned(
      req.user!.userId,
      param(req.params.id),
    );

    // A record owned by someone else is reported as absent rather than
    // forbidden, so the endpoint cannot be used to probe which ids exist.
    if (!record) {
      throw new ApiError("NOT_FOUND", "We couldn't find that analysis.");
    }

    res.json(record);
  } catch (err) {
    sendError(res, err);
  }
});

router.delete("/history/:id", requireAuth, async (req, res) => {
  try {
    const deleted = await historyRepository.deleteOwned(
      req.user!.userId,
      param(req.params.id),
    );

    if (!deleted) {
      throw new ApiError("NOT_FOUND", "We couldn't find that analysis.");
    }

    res.status(204).send();
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
