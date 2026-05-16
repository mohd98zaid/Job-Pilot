// artifacts/api-server/src/routes/jobs.ts
import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { portalsTable } from "@workspace/db/schema/portals";
import { jobsTable } from "@workspace/db/schema/jobs";
import { eq, desc } from "drizzle-orm";
import { runJobSearch } from "../services/job-search.service.js";
import { logger } from "../lib/logger.js";

const router = Router();

// ─── Schema ───────────────────────────────────────────────────────────────────
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

const patchJobSchema = z.object({
  status: z.string().optional(),
  aiScore: z.number().int().optional(),
  aiMatchReason: z.string().optional(),
});

// ─── GET /api/jobs  ───────────────────────────────────────────────────────────
// Returns ALL persisted jobs from the DB, most recent first.
// This is the key persistence endpoint — called on every page load.
router.get("/", async (_req, res) => {
  try {
    const jobs = await db
      .select()
      .from(jobsTable)
      .orderBy(desc(jobsTable.createdAt))
      .limit(500);

    const mapped = jobs.map((j) => ({
      id:          j.id,
      dbId:        j.id,
      title:       j.title,
      company:     j.company,
      location:    j.location      ?? "Not specified",
      salary:      j.salary        ?? "Not listed",
      description: j.description   ?? "",
      source:      j.source,
      externalId:  j.externalId,
      url:         j.url           ?? "",
      status:      capitalizeFirst(j.status ?? "discovered"),
      score:       j.aiScore       ?? 0,
      match:       j.aiMatchReason ?? "",
      posted:      j.postedAt      ?? j.createdAt ?? "",
      logo:        sourceToLogo(j.source),
      color:       sourceToColor(j.source),
    }));

    res.json(mapped);
  } catch (err: any) {
    logger.error({ err }, "Failed to fetch jobs");
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/jobs/search  (SSE streaming) ───────────────────────────────────
router.post("/search", async (req, res) => {
  let parsed: z.infer<typeof searchSchema>;
  try {
    parsed = searchSchema.parse(req.body);
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ errors: err.errors }); return; }
    res.status(400).json({ error: "Invalid request" });
    return;
  }

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

// ─── PATCH /api/jobs/:id  (update status / AI score) ─────────────────────────
router.patch("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id!, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

    const body = patchJobSchema.parse(req.body);
    const updateData: Record<string, any> = {
      updatedAt: new Date().toISOString(),
    };
    if (body.status !== undefined)       updateData["status"]       = body.status.toLowerCase();
    if (body.aiScore !== undefined)      updateData["aiScore"]      = body.aiScore;
    if (body.aiMatchReason !== undefined) updateData["aiMatchReason"] = body.aiMatchReason;

    await db.update(jobsTable).set(updateData).where(eq(jobsTable.id, id));
    res.json({ success: true });
  } catch (err: any) {
    if (err instanceof z.ZodError) { res.status(400).json({ errors: err.errors }); return; }
    logger.error({ err }, "Failed to update job");
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function sourceToColor(source: string): string {
  const map: Record<string, string> = {
    "LinkedIn":     "#0A66C2",
    "Naukri":       "#ff7555",
    "Indeed":       "#003a9b",
    "Hirect":       "#6c47ff",
    "InstaHyre":    "#00b386",
    "RemoteOK":     "#00b16a",
    "Arbeitnow":    "#6d28d9",
    "JSearch":      "#f59e0b",
    "AI Discovery": "#818cf8",
    "Web Search":   "#818cf8",
  };
  return map[source] ?? "#64748b";
}

function sourceToLogo(source: string): string {
  const map: Record<string, string> = {
    "LinkedIn":     "LI",
    "Naukri":       "NA",
    "Indeed":       "IN",
    "Hirect":       "HI",
    "InstaHyre":    "IH",
    "RemoteOK":     "RO",
    "Arbeitnow":    "AN",
    "JSearch":      "JS",
    "AI Discovery": "AI",
    "Web Search":   "WS",
  };
  return map[source] ?? source.substring(0, 2).toUpperCase();
}
