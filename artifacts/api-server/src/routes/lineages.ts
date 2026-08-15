import { Router, type IRouter } from "express";
import { lineageRepository } from "../domain/repository";
import { ApiError, sendError } from "../lib/errors";
import { param } from "../lib/params";

const router: IRouter = Router();

router.get("/lineages", async (_req, res) => {
  try {
    res.json(await lineageRepository.listSummaries());
  } catch (err) {
    sendError(res, err);
  }
});

router.get("/lineages/:id", async (req, res) => {
  try {
    const lineage = await lineageRepository.getById(param(req.params.id));

    if (!lineage) {
      throw new ApiError(
        "NOT_FOUND",
        "We have no documented lineage with that id.",
      );
    }

    res.json(lineage);
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
