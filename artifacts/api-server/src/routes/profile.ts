// artifacts/api-server/src/routes/profile.ts
import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { profilesTable } from "@workspace/db/schema/profiles";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

// ─── GET /api/profile ────────────────────────────────────────────────────────
router.get("/", async (_req, res) => {
  try {
    const profile = await db.query.profilesTable.findFirst();
    if (!profile) {
      // Return a default structure if none exists
      res.json({
        name: "User",
        currentRole: "Software Engineer",
        targetMarket: "Global",
        yearsOfExperience: "5",
        skills: [],
        aiBackends: []
      });
      return;
    }
    res.json(profile);
  } catch (err: any) {
    logger.error({ err }, "Failed to fetch profile");
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/profile ───────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const data = req.body;
    
    // We only have one user for now, so we use a constant ID or check if any exists
    const existing = await db.query.profilesTable.findFirst();
    
    if (existing) {
      await db.update(profilesTable)
        .set({
          name: data.name || data.Name || existing.name,
          currentRole: data.currentRole || data["Current Role"] || existing.currentRole,
          targetMarket: data.targetMarket || data["Target Market"] || existing.targetMarket,
          yearsOfExperience: data.yearsOfExperience || data["Years of Exp."] || existing.yearsOfExperience,
          skills: data.skills || existing.skills,
          aiBackends: data.aiBackends || existing.aiBackends,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(profilesTable.id, existing.id));
      res.json({ success: true, id: existing.id });
    } else {
      const [created] = await db.insert(profilesTable).values({
        userId: "default_user",
        name: data.name || data.Name || "User",
        currentRole: data.currentRole || data["Current Role"] || "Software Engineer",
        targetMarket: data.targetMarket || data["Target Market"] || "Global",
        yearsOfExperience: data.yearsOfExperience || data["Years of Exp."] || "5",
        skills: data.skills || [],
        aiBackends: data.aiBackends || [],
      }).returning();
      res.json({ success: true, id: created.id });
    }
  } catch (err: any) {
    logger.error({ err }, "Failed to save profile");
    res.status(500).json({ error: err.message });
  }
});


// ─── POST /api/profile/scrape ────────────────────────────────────────────────
import { scrapeLinkedInFootprint } from "../services/scrapers/linkedin-profile.scraper";

router.post("/scrape", async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      res.status(400).json({ error: "Missing sessionId (li_at cookie)" });
      return;
    }

    // Set up SSE headers to stream logs back to the frontend
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const onLog = (level: "info" | "warn" | "error", message: string) => {
      res.write(`data: ${JSON.stringify({ type: "log", level, message })}\n\n`);
    };

    const data = await scrapeLinkedInFootprint(sessionId, onLog);

    // Write final result
    res.write(`data: ${JSON.stringify({ type: "done", data })}\n\n`);
    res.end();
  } catch (err: any) {
    logger.error({ err }, "Scrape failed");
    res.write(`data: ${JSON.stringify({ type: "log", level: "error", message: err.message })}\n\n`);
    res.end();
  }
});

export default router;
