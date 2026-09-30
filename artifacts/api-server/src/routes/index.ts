import { Router, type IRouter } from "express";
import cruiseRouter from "./cruises";
import healthRouter from "./health";
import operationsRouter from "./operations";

const router: IRouter = Router();

router.use(healthRouter);
router.use(cruiseRouter);
router.use(operationsRouter);

export default router;
