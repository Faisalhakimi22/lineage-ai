import { Router, type IRouter } from "express";
import type { HealthStatus } from "@workspace/api-zod";
import { llmAvailable } from "../lib/llm";
import { semanticMatchingAvailable } from "../lib/embeddings";
import { firebaseAvailable } from "../lib/firebase";
import { historyRepository } from "../domain/history";
import { liveSearchAvailable } from "../lib/live-search";

const router: IRouter = Router();

/**
 * Health doubles as a capability report: which optional subsystems are actually
 * live. The frontend uses this to describe its own limits honestly rather than
 * implying full capability it does not have.
 */
router.get("/healthz", async (_req, res) => {
  const [semanticAvailable, authConfigured, historyConfigured] = await Promise.all([
    semanticMatchingAvailable(),
    firebaseAvailable(),
    historyRepository.isAvailable(),
  ]);

  const status: HealthStatus = {
    status: "ok",
    llm_available: llmAvailable(),
    semantic_matching_available: semanticAvailable,
    auth_configured: authConfigured,
    history_configured: historyConfigured,
    live_search_available: liveSearchAvailable(),
  };
  res.json(status);
});

export default router;
