// artifacts/api-server/src/services/job-search.service.ts
// Hybrid job search orchestrator — runs structured API feeds AND AI discovery in parallel.
// All job URLs are validated before being stored or emitted.

import { db } from "@workspace/db";
import { jobsTable } from "@workspace/db/schema/jobs";
import { portalsTable } from "@workspace/db/schema/portals";
import { eq, or } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import crypto from "crypto";
import {
  type ScrapedJob,
  type SearchOptions,
  type JobEmitter,
  type LogEmitter,
} from "./scrapers/types.js";

// ── Pipeline 1: Reliable API/Feed scrapers (no Playwright) ──────────────────
import { scrapeRemoteOK } from "./scrapers/remoteok.scraper.js";
import { scrapeLinkedInGuest } from "./scrapers/linkedin-guest.scraper.js";
import { scrapeArbeitnow } from "./scrapers/arbeitnow.scraper.js";
import { scrapeJSearch } from "./scrapers/jsearch.scraper.js";
import { scrapeNaukriGulf } from "./scrapers/naukrigulf.scraper.js";
import { scrapeCompanyCareers } from "./scrapers/company-careers.scraper.js";
import { scrapeIndiaPortals } from "./scrapers/india-portals.scraper.js";
import { scrapeGCCPortals } from "./scrapers/gcc-portals.scraper.js";

// ── Pipeline 2: Legacy Playwright scrapers (fallback, unreliable) ────────────
import { scrapeLinkedIn } from "./scrapers/linkedin.scraper.js";
import { scrapeNaukri } from "./scrapers/naukri.scraper.js";
import { scrapeIndeed } from "./scrapers/indeed.scraper.js";
import { scrapeHirect } from "./scrapers/hirect.scraper.js";
import { scrapeInstaHyre } from "./scrapers/instahyre.scraper.js";
import { scrapeBayt } from "./scrapers/bayt.scraper.js";
import { scrapeCustomPortal } from "./scrapers/custom-portal.scraper.js";

// ── Pipeline 3: AI-powered discovery ─────────────────────────────────────────
import { runAIDiscovery } from "./ai-discovery.service.js";
import { AIService } from "./ai.service.js";

export interface SearchRequest {
  role: string;
  region: string;
  sources: string[];          // e.g. ["LinkedIn", "RemoteOK", "Arbeitnow", "JSearch", "AI Discovery"]
  customPortalIds?: number[];
  dateFilter?: string;
}

export interface SearchProgress {
  type: "job" | "log" | "done" | "error";
  job?: ScrapedJob & { dbId?: number };
  level?: "info" | "success" | "error";
  message?: string;
  summary?: { total: number; bySource: Record<string, number> };
}

// ── Scraper Registry ──────────────────────────────────────────────────────────

/**
 * API-based scrapers — reliable, no browser required.
 * Always try these first.
 */
const API_SCRAPERS: Record<
  string,
  (opts: SearchOptions, onJob: JobEmitter, onLog: LogEmitter) => Promise<ScrapedJob[]>
> = {
  "RemoteOK":         scrapeRemoteOK,
  "LinkedIn":         scrapeLinkedInGuest,
  "Arbeitnow":        scrapeArbeitnow,
  "JSearch":          scrapeJSearch,
  "NaukriGulf":       scrapeNaukriGulf,
  "Company Careers":  scrapeCompanyCareers,
  "India Portals":    scrapeIndiaPortals,
  "GCC Portals":      scrapeGCCPortals,
};

/**
 * Playwright-based scrapers — may fail due to bot detection.
 * Only used for sources not in API_SCRAPERS.
 */
const PLAYWRIGHT_SCRAPERS: Record<
  string,
  (opts: SearchOptions, onJob: JobEmitter, onLog: LogEmitter) => Promise<ScrapedJob[]>
> = {
  "Naukri":    scrapeNaukri,
  "Indeed":    scrapeIndeed,
  "Hirect":    scrapeHirect,
  "InstaHyre": scrapeInstaHyre,
  "Bayt":      scrapeBayt,      // 🇺🇦 #1 UAE/Gulf job board
};

const SOURCE_COLORS: Record<string, string> = {
  "LinkedIn":     "#0A66C2",
  "Naukri":       "#ff7555",
  "NaukriGulf":   "#e63946",
  "Indeed":       "#003a9b",
  "Hirect":       "#6c47ff",
  "InstaHyre":    "#00b386",
  "RemoteOK":     "#00b16a",
  "Arbeitnow":    "#6d28d9",
  "JSearch":      "#f59e0b",
  "AI Discovery":     "#818cf8",
  "Web Search":        "#818cf8",
  "Bayt":              "#e8441c",
  "Company Careers":   "#1e293b",
  "India Portals":     "#FF7555",
  "GCC Portals":       "#16A085",
};

const SOURCE_LOGOS: Record<string, string> = {
  "LinkedIn":     "LI",
  "Naukri":       "NA",
  "NaukriGulf":   "NG",
  "Indeed":       "IN",
  "Hirect":       "HI",
  "InstaHyre":    "IH",
  "RemoteOK":     "RO",
  "Arbeitnow":    "AN",
  "JSearch":      "JS",
  "AI Discovery":     "AI",
  "Web Search":        "WS",
  "Bayt":              "BY",
  "Company Careers":   "CC",
  "India Portals":     "IP",
  "GCC Portals":       "GP",
};

// ── Region detection helpers ──────────────────────────────────────────────────

/** Platforms that ONLY serve India — skip for Gulf/international searches */
const INDIA_ONLY_SOURCES = ["Naukri", "Hirect", "InstaHyre"];

/** Gulf/Middle East region keywords */
const GULF_REGIONS = ["dubai", "uae", "abu dhabi", "sharjah", "qatar", "doha",
                      "saudi", "riyadh", "bahrain", "kuwait", "oman", "muscat"];

function isGulfRegion(region: string): boolean {
  const r = region.toLowerCase();
  return GULF_REGIONS.some((g) => r.includes(g));
}

function isIndiaRegion(region: string): boolean {
  const r = region.toLowerCase();
  return ["india", "bangalore", "bengaluru", "mumbai", "delhi", "hyderabad",
          "chennai", "pune", "kolkata", "noida", "gurgaon"].some((c) => r.includes(c));
}

// ── Main Orchestrator ─────────────────────────────────────────────────────────

export async function runJobSearch(
  req: SearchRequest,
  onProgress: (p: SearchProgress) => void
): Promise<void> {
  const { role, region, sources, customPortalIds, dateFilter } = req;
  
  const ai = new AIService();
  const emit = (p: SearchProgress) => onProgress(p);

  // 0. Dynamic Role Intelligence (User Input -> AI Understanding)
  emit({ type: "log", level: "info", message: `🔍 Analyzing role: "${role}"...` });
  const sessionId = (crypto as any).randomUUID?.() || `job-search-${Date.now()}`;

  const expansion = await ai.expandRole(role).catch(() => ({ 
    variations: [role], relatedKeywords: role.split(/\s+/), exclusionKeywords: [] 
  }));
  
  const opts: SearchOptions = { 
    role, 
    region, 
    dateFilter, 
    aliases: expansion.variations 
  };

  const allJobs: ScrapedJob[] = [];
  const bySource: Record<string, number> = {};
  const seen = new Set<string>(); // dedup key: title|company

  // Redefine emit for scoping
  const currentEmit = (p: SearchProgress) => onProgress(p);

  const onLog: LogEmitter = (level, msg) => {
    emit({ type: "log", level, message: msg });
    logger.info({ level, msg }, "Job search log");
  };

  /**
   * Save a job to DB and emit it to the frontend.
   * Deduplication happens here (title|company key).
   */
  const saveAndEmit = async (job: ScrapedJob) => {
    const key = `${job.title.toLowerCase()}|${job.company.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);

    // Enrich with source branding if missing
    if (!job.color) job.color = SOURCE_COLORS[job.source] || "#64748b";
    if (!job.logo)  job.logo  = SOURCE_LOGOS[job.source]  || job.source.substring(0, 2).toUpperCase();

    allJobs.push(job);
    bySource[job.source] = (bySource[job.source] || 0) + 1;

    // Persist to DB
    let dbId: number | undefined;
    try {
      const existing = job.externalId
        ? await db
            .select({ id: jobsTable.id })
            .from(jobsTable)
            .where(eq(jobsTable.externalId, job.externalId))
            .limit(1)
        : [];

      if (existing.length > 0) {
        dbId = existing[0]!.id;
      } else {
        const inserted = await db
          .insert(jobsTable)
          .values({
            title:      job.title,
            company:    job.company,
            location:   job.location,
            salary:     job.salary,
            description: job.description,
            source:     job.source,
            externalId: job.externalId,
            url:        job.url,
            status:     "discovered",
            postedAt:
              job.postedAt && !isNaN(new Date(job.postedAt).getTime())
                ? new Date(job.postedAt).toISOString()
                : job.postedAt,
          })
          .returning({ id: jobsTable.id });
        dbId = inserted[0]?.id;
      }
    } catch (dbErr) {
      logger.warn({ dbErr }, "Failed to save job to DB");
    }

    emit({ type: "job", job: { ...job, dbId } });
  };

  const onJob: JobEmitter = (job) => {
    saveAndEmit(job).catch(() => {});
  };

  // ── Build scraper task list ─────────────────────────────────────────────────

  const promises: Promise<ScrapedJob[]>[] = [];

  const runAIDiscoveryPipeline = sources.includes("AI Discovery");
  let standardSources = sources.filter((s) => s !== "AI Discovery");

  // ── Region-aware source selection ──────────────────────────────────────────
  // India-only platforms will always return 0 for Gulf searches.
  // Auto-inject Gulf-specific sources and skip India-only ones.
  if (isGulfRegion(region)) {
    standardSources = standardSources.filter(s => !INDIA_ONLY_SOURCES.includes(s));
    for (const s of ["NaukriGulf", "Bayt", "GCC Portals", "Company Careers"]) {
      if (!standardSources.includes(s)) {
        standardSources.push(s);
        emit({ type: "log", level: "info", message: `Auto-added ${s} for Gulf region search` });
      }
    }
  } else if (isIndiaRegion(region)) {
    standardSources = standardSources.filter(s => s !== "NaukriGulf" && s !== "Bayt" && s !== "GCC Portals");
    for (const s of ["India Portals", "Company Careers"]) {
      if (!standardSources.includes(s)) {
        standardSources.push(s);
        emit({ type: "log", level: "info", message: `Auto-added ${s} for India region search` });
      }
    }
  }

  for (const source of standardSources) {
    if (source in API_SCRAPERS) {
      // API-based (reliable)
      emit({ type: "log", level: "info", message: `Starting ${source} (API)...` });
      promises.push(
        API_SCRAPERS[source]!(opts, onJob, onLog).catch((err) => {
          emit({ type: "log", level: "error", message: `${source} failed: ${err.message}` });
          return [];
        })
      );
    } else if (source in PLAYWRIGHT_SCRAPERS) {
      // Playwright-based (may fail)
      emit({ type: "log", level: "info", message: `Starting ${source} (browser)...` });
      promises.push(
        PLAYWRIGHT_SCRAPERS[source]!(opts, onJob, onLog).catch((err) => {
          emit({ type: "log", level: "error", message: `${source} browser scraper failed: ${err.message}` });
          return [];
        })
      );
    }
  }

  // Custom portals
  if (customPortalIds && customPortalIds.length > 0) {
    try {
      const portals = await db
        .select()
        .from(portalsTable)
        .where(
          // @ts-ignore
          or(...customPortalIds.map((id) => eq(portalsTable.id, id)))
        );

      for (const portal of portals) {
        emit({ type: "log", level: "info", message: `Opening ${(portal as any).name}...` });
        promises.push(
          scrapeCustomPortal(
            { name: (portal as any).name, url: (portal as any).url, role },
            onJob,
            onLog
          ).catch((err) => {
            emit({
              type: "log",
              level: "error",
              message: `${(portal as any).name} failed: ${err.message}`,
            });
            return [];
          })
        );
      }
    } catch (err) {
      logger.error({ err }, "Failed to fetch custom portals");
    }
  }

  // ── Run all scrapers in parallel ─────────────────────────────────────────────
  await Promise.allSettled(promises);

  // ── AI Discovery (runs after feed scrapers) ──────────────────────────────────
  if (runAIDiscoveryPipeline) {
    try {
      emit({ type: "log", level: "info", message: "🤖 AI Discovery pipeline starting..." });
      await runAIDiscovery(
        { role, region, dateFilter, sessionId },
        (p) => {
          if (p.type === "job" && p.job) {
            onJob(p.job);
          } else if (p.type === "log" && p.level && p.message) {
            emit({ type: "log", level: p.level, message: p.message });
          }
        }
      );
    } catch (err: any) {
      emit({ type: "log", level: "error", message: `AI Discovery failed: ${err.message}` });
    }
  }

  // ── If no results at all, run AI Discovery as fallback ───────────────────────
  if (allJobs.length === 0 && !runAIDiscoveryPipeline) {
    emit({
      type: "log",
      level: "info",
      message: "⚠️ No results from feed scrapers — activating AI Discovery fallback...",
    });
    try {
      await runAIDiscovery(
        { role, region, dateFilter, sessionId },
        (p) => {
          if (p.type === "job" && p.job) {
            onJob(p.job);
          } else if (p.type === "log" && p.level && p.message) {
            emit({ type: "log", level: p.level, message: p.message });
          }
        }
      );
    } catch (err: any) {
      emit({ type: "log", level: "error", message: `AI Discovery fallback failed: ${err.message}` });
    }
  }

  // ── Done ─────────────────────────────────────────────────────────────────────
  emit({
    type: "done",
    summary: { total: allJobs.length, bySource },
  });
}
