// artifacts/api-server/src/routes/index.ts
import { Router } from "express";
import healthRouter from "./health";
import aiRouter from "./ai";
import jobsRouter from "./jobs";
import profileRouter from "./profile";

const router = Router();

// Health check
router.use(healthRouter);

// AI endpoints
router.use("/ai", aiRouter);

// Job search + portals
router.use("/jobs", jobsRouter);

// Profile management
router.use("/profile", profileRouter);

export default router;