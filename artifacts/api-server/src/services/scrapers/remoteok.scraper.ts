// artifacts/api-server/src/services/scrapers/remoteok.scraper.ts
// RemoteOK has a public JSON API — no Playwright needed, no auth required.
// Docs: https://remoteok.com/api

import { type ScrapedJob, type SearchOptions, type JobEmitter, type LogEmitter } from "./types.js";
import { isJobRelevant } from "./relevance.js";
import { logger } from "../../lib/logger.js";

const SOURCE = "RemoteOK";
const BASE_COLOR = "#00b16a";
const API_URL = "https://remoteok.com/api";

interface RemoteOKJob {
  id: string;
  position: string;
  company: string;
  location: string;
  description: string;
  tags: string[];
  url: string;
  date: string;
  salary_min?: number;
  salary_max?: number;
  logo?: string;
}

export async function scrapeRemoteOK(
  opts: SearchOptions,
  onJob: JobEmitter,
  onLog: LogEmitter
): Promise<ScrapedJob[]> {
  const results: ScrapedJob[] = [];

  try {
    onLog("info", `RemoteOK: searching for "${opts.role}"...`);

    const res = await fetch(`${API_URL}?tags=${encodeURIComponent(opts.role.toLowerCase().replace(/\s+/g, "+"))}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 JobPilot/2.0",
        "Accept": "application/json",
      },
    });

    if (!res.ok) {
      onLog("error", `RemoteOK: HTTP ${res.status} — skipping`);
      return results;
    }

    const raw: RemoteOKJob[] = await res.json();
    
    // First item is metadata, skip it
    const jobs = Array.isArray(raw) ? raw.slice(1) : [];

    const filtered = jobs.filter((j) => {
      return isJobRelevant(j.position || "", j.description || "", j.tags || [], opts.role, opts.aliases || [], opts.exclusions || [], opts.region);
    });

    // Apply date filter
    const maxDays = dateFilterToDays(opts.dateFilter);
    const cutoff = Date.now() - maxDays * 24 * 60 * 60 * 1000;

    for (const job of filtered) {
      try {
        const postedDate = new Date(job.date).getTime();
        if (!isNaN(postedDate) && postedDate < cutoff) continue;

        const salary =
          job.salary_min && job.salary_max
            ? `$${(job.salary_min / 1000).toFixed(0)}k–$${(job.salary_max / 1000).toFixed(0)}k`
            : "Not listed";

        const scrapedJob: ScrapedJob = {
          title: job.position || "Unknown Role",
          company: job.company || "Unknown Company",
          location: job.location || "Remote",
          salary,
          description: (job.description || "").replace(/<[^>]*>/g, "").substring(0, 500),
          url: job.url || `https://remoteok.com/remote-jobs/${job.id}`,
          postedAt: job.date,
          source: SOURCE,
          externalId: `remoteok-${job.id}`,
          logo: "RO",
          color: BASE_COLOR,
        };

        results.push(scrapedJob);
        onJob(scrapedJob);
      } catch (_) {}
    }

    onLog("success", `RemoteOK: found ${results.length} listings`);
  } catch (err: any) {
    onLog("error", `RemoteOK error: ${err.message}`);
    logger.error({ err }, "RemoteOK scraper failed");
  }

  return results;
}

function dateFilterToDays(dateFilter?: string): number {
  if (!dateFilter) return 7;
  if (dateFilter.includes("24")) return 1;
  if (dateFilter.includes("7")) return 7;
  if (dateFilter.includes("14")) return 14;
  if (dateFilter.includes("30")) return 30;
  return 7;
}
