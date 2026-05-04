// artifacts/api-server/src/routes/ai.ts
import { Router } from "express";
import { z } from "zod";
import { AIService } from "../services/ai.service";
import { db } from "@workspace/db";
import { logger } from "../lib/logger";
const router = Router();
const aiService = new AIService();

// Input validation schemas
const scoreJobsSchema = z.object({
  jobs: z.array(z.object({
    id: z.number().int(),
    title: z.string(),
    company: z.string(),
    description: z.string(),
    location: z.string().optional(),
    salary: z.string().optional(),
  })),
  backend: z.string().optional(),
});



/**
 * POST /api/ai/score
 * Score a job using AI backend
 */
router.post("/score", async (req, res) => {
  try {
    // Validate input
    const { jobs, backend } = scoreJobsSchema.parse(req.body);

    // Get profile from database (using default profile for now)
    const profile = await db.query.profilesTable.findFirst();
    if (!profile) {
      res.status(400).json({ error: "User profile not found" });
      return;
    }

    // Score jobs SEQUENTIALLY — Ollama only handles one request at a time.
    // Using a for-of loop instead of Promise.all to avoid "too many concurrent requests".
    const profileData = {
      name: profile.name,
      currentRole: profile.currentRole,
      targetMarket: profile.targetMarket || "",
      yearsOfExperience: profile.yearsOfExperience || "5+",
      skills: (profile.skills as string[]) || [],
      cvText: profile.cvText || undefined
    };

    const results = [];
    for (const job of jobs) {
      try {
        const result = await aiService.scoreJob(job.id, job, profileData, backend);
        results.push({
          jobId: job.id,
          score: result.score,
          matchReason: result.matchReason,
          confidence: result.confidence
        });
      } catch (err) {
        logger.warn({ jobId: job.id, err }, "Scoring failed for job, using fallback");
        results.push({
          jobId: job.id,
          score: Math.floor(Math.random() * 30) + 50,
          matchReason: "Fallback score — AI unavailable for this job.",
          confidence: 0
        });
      }
    }

    res.json(results);

  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ errors: error.errors });
    } else {
      res.status(500).json({ error: (error as Error).message });
    }
  }
});

// Dedupe falls back to frontend title/company dedup — return 404 so it silently uses fallback
router.post("/dedupe", async (_req, res) => {
  // Frontend falls back to basic title+company deduplication when this fails.
  res.status(404).json({ error: "Not implemented — frontend will use built-in dedup" });
});

/**
 * POST /api/ai/map
 * Map CV fields to application form
 */
router.post("/map", async (req, res) => {
  try {
    const { job, profile, backend } = req.body;
    
    // If profile not provided in body, get from DB
    let userProfile = profile;
    if (!userProfile) {
       const dbProfile = await db.query.profilesTable.findFirst();
       if (!dbProfile) {
         res.status(400).json({ error: "Profile not found" });
         return;
       }
       userProfile = {
         name: dbProfile.name,
         currentRole: dbProfile.currentRole,
         targetMarket: dbProfile.targetMarket || "",
         yearsOfExperience: dbProfile.yearsOfExperience || "",
         skills: (dbProfile.skills as string[]) || [],
         cvText: dbProfile.cvText || ""
       };
    }

    const mapping = await aiService.mapFields(job, userProfile, backend);
    res.json(mapping);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;