// artifacts/api-server/src/routes/jobs.ts
import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { portalsTable } from "@workspace/db/schema/portals";
import { jobsTable } from "@workspace/db/schema/jobs";
import { eq } from "drizzle-orm";
import { runJobSearch } from "../services/job-search.service.js";
import { logger } from "../lib/logger.js";

const router = Router();

// ─── Schema ─────────────────────────────────────────────────────────────────
const searchSchema = z.object({
  role: z.string().min(1),
  region: z.string().min(1),
  sources: z.array(z.string()).min(1),
  customPortalIds: z.array(z.number()).optional(),
  dateFilter: z.string().optional(),
});

const portalSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  type: z.enum(["company", "custom"]).default("company"),
});

// ─── POST /api/jobs/search  (SSE streaming) ──────────────────────────────────
router.post("/search", async (req, res) => {
  let parsed: z.infer<typeof searchSchema>;
  try {
    parsed = searchSchema.parse(req.body);
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ errors: err.errors }); return; }
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  const send = (event: string, data: object) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    await runJobSearch(parsed, (progress) => {
      if (progress.type === "job" && progress.job) {
        send("job", progress.job);
      } else if (progress.type === "log") {
        send("log", { level: progress.level, message: progress.message });
      } else if (progress.type === "done") {
        send("done", progress.summary!);
      } else if (progress.type === "error") {
        send("error", { message: progress.message });
      }
    });
  } catch (err: any) {
    logger.error({ err }, "Job search failed");
    send("error", { message: err.message });
  } finally {
    res.end();
  }
});

// ─── GET /api/jobs/portals ────────────────────────────────────────────────────
router.get("/portals", async (_req, res) => {
  try {
    const portals = await db.select().from(portalsTable).orderBy(portalsTable.createdAt);
    res.json(portals);
  } catch (err: any) {
    logger.error({ err }, "Failed to fetch portals");
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/jobs/portals ───────────────────────────────────────────────────
router.post("/portals", async (req, res) => {
  try {
    const data = portalSchema.parse(req.body);
    const [created] = await db.insert(portalsTable).values({
      name: data.name,
      url: data.url,
      type: data.type,
    }).returning();
    res.status(201).json(created);
  } catch (err: any) {
    if (err instanceof z.ZodError) { res.status(400).json({ errors: err.errors }); return; }
    logger.error({ err }, "Failed to create portal");
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/jobs/portals/:id ─────────────────────────────────────────────
router.delete("/portals/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id!, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    await db.delete(portalsTable).where(eq(portalsTable.id, id));
    res.json({ success: true });
  } catch (err: any) {
    logger.error({ err }, "Failed to delete portal");
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/jobs/:id ─────────────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id!, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
    await db.delete(jobsTable).where(eq(jobsTable.id, id));
    res.json({ success: true });
  } catch (err: any) {
    logger.error({ err }, "Failed to delete job");
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/jobs ─────────────────────────────────────────────────────────
router.delete("/", async (_req, res) => {
  try {
    await db.delete(jobsTable);
    res.json({ success: true });
  } catch (err: any) {
    logger.error({ err }, "Failed to clear all jobs");
    res.status(500).json({ error: err.message });
  }
});

export default router;
