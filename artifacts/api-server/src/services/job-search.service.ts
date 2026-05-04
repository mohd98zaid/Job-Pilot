// artifacts/api-server/src/services/job-search.service.ts
// Orchestrates all scrapers, runs them in parallel, deduplicates, saves to DB

import { db } from "@workspace/db";
import { jobsTable } from "@workspace/db/schema/jobs";
import { portalsTable } from "@workspace/db/schema/portals";
import { eq, or } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { type ScrapedJob, type SearchOptions, type JobEmitter, type LogEmitter } from "./scrapers/types.js";
import { scrapeLinkedIn } from "./scrapers/linkedin.scraper.js";
import { scrapeNaukri } from "./scrapers/naukri.scraper.js";
import { scrapeIndeed } from "./scrapers/indeed.scraper.js";
import { scrapeHirect } from "./scrapers/hirect.scraper.js";
import { scrapeInstaHyre } from "./scrapers/instahyre.scraper.js";
import { scrapeCustomPortal } from "./scrapers/custom-portal.scraper.js";

export interface SearchRequest {
  role: string;
  region: string;
  sources: string[];          // e.g. ["LinkedIn", "Naukri", "Indeed", "Hirect", "InstaHyre"]
  customPortalIds?: number[]; // IDs from portals table to include
  dateFilter?: string;
}

export interface SearchProgress {
  type: "job" | "log" | "done" | "error";
  job?: ScrapedJob & { dbId?: number };
  level?: "info" | "success" | "error";
  message?: string;
  summary?: { total: number; bySource: Record<string, number> };
}

const SCRAPER_MAP: Record<string, (opts: SearchOptions, onJob: JobEmitter, onLog: LogEmitter) => Promise<ScrapedJob[]>> = {
  "LinkedIn": scrapeLinkedIn,
  "Naukri": scrapeNaukri,
  "Indeed": scrapeIndeed,
  "Hirect": scrapeHirect,
  "InstaHyre": scrapeInstaHyre,
};

// Color palette for job cards
const SOURCE_COLORS: Record<string, string> = {
  "LinkedIn": "#0A66C2",
  "Naukri": "#ff7555",
  "Indeed": "#003a9b",
  "Hirect": "#6c47ff",
  "InstaHyre": "#00b386",
};

const SOURCE_LOGOS: Record<string, string> = {
  "LinkedIn": "LI",
  "Naukri": "NA",
  "Indeed": "IN",
  "Hirect": "HI",
  "InstaHyre": "IH",
};

export async function runJobSearch(
  req: SearchRequest,
  onProgress: (p: SearchProgress) => void
): Promise<void> {
  const { role, region, sources, customPortalIds, dateFilter } = req;
  const opts: SearchOptions = { role, region, dateFilter };
  const allJobs: ScrapedJob[] = [];
  const bySource: Record<string, number> = {};
  const seen = new Set<string>(); // dedup key: title|company

  const emit = (p: SearchProgress) => onProgress(p);

  const onLog: LogEmitter = (level, msg) => {
    emit({ type: "log", level, message: msg });
    logger.info({ level, msg }, "Job search log");
  };

  const saveAndEmit = async (job: ScrapedJob) => {
    // Dedup in-memory
    const key = `${job.title.toLowerCase()}|${job.company.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);

    allJobs.push(job);
    bySource[job.source] = (bySource[job.source] || 0) + 1;

    // Save to DB
    let dbId: number | undefined;
    try {
      const existing = job.externalId
        ? await db.select({ id: jobsTable.id }).from(jobsTable).where(eq(jobsTable.externalId, job.externalId)).limit(1)
        : [];

      if (existing.length > 0) {
        dbId = existing[0]!.id;
      } else {
        const inserted = await db.insert(jobsTable).values({
          title: job.title,
          company: job.company,
          location: job.location,
          salary: job.salary,
          description: job.description,
          source: job.source,
          externalId: job.externalId,
          url: job.url,
          status: "discovered",
          postedAt: job.postedAt && !isNaN(new Date(job.postedAt).getTime()) 
            ? new Date(job.postedAt).toISOString() 
            : job.postedAt,
        }).returning({ id: jobsTable.id });
        dbId = inserted[0]?.id;
      }
    } catch (dbErr) {
      logger.warn({ dbErr }, "Failed to save job to DB");
    }

    emit({ type: "job", job: { ...job, dbId } });
  };

  const onJob: JobEmitter = (job) => { saveAndEmit(job).catch(() => {}); };

  // Run all selected standard scrapers in parallel
  const scraperPromises = sources
    .filter(s => s in SCRAPER_MAP)
    .map(source => {
      emit({ type: "log", level: "info", message: `Starting ${source} scraper...` });
      return SCRAPER_MAP[source]!(opts, onJob, onLog).catch(err => {
        emit({ type: "log", level: "error", message: `${source} failed: ${err.message}` });
        return [];
      });
    });

  // Fetch and run custom portals if any
  let customPortalPromises: Promise<ScrapedJob[]>[] = [];
  if (customPortalIds && customPortalIds.length > 0) {
    try {
      const portals = await db.select().from(portalsTable).where(
        // @ts-ignore
        or(...customPortalIds.map(id => eq(portalsTable.id, id)))
      );
      customPortalPromises = portals.map((portal: any) => {
        emit({ type: "log", level: "info", message: `Opening ${portal.name} (${portal.url})...` });
        return scrapeCustomPortal(
          { name: portal.name, url: portal.url, role },
          onJob,
          onLog
        ).catch(err => {
          emit({ type: "log", level: "error", message: `${portal.name} failed: ${err.message}` });
          return [];
        });
      });
    } catch (err) {
      logger.error({ err }, "Failed to fetch custom portals");
    }
  }

  // Wait for all scrapers to finish
  await Promise.allSettled([...scraperPromises, ...customPortalPromises]);

  // Done
  emit({
    type: "done",
    summary: { total: allJobs.length, bySource },
  });
}
