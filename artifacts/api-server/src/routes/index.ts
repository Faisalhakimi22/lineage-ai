import { Router, type IRouter } from "express";
import healthRouter from "./health";
import lineagesRouter from "./lineages";
import analyzeRouter from "./analyze";
import accountRouter from "./account";

const router: IRouter = Router();

router.use(healthRouter);
router.use(lineagesRouter);
router.use(analyzeRouter);
router.use(accountRouter);

export default router;
