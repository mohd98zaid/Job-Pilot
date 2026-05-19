// artifacts/api-server/src/services/scrapers/arbeitnow.scraper.ts
// Arbeitnow has a completely free, open JSON API for job listings.
// No API key required. Great coverage of Europe, Remote, and tech roles globally.
// Docs: https://www.arbeitnow.com/api/job-board-api

import { type ScrapedJob, type SearchOptions, type JobEmitter, type LogEmitter } from "./types.js";
import { isJobRelevant } from "./relevance.js";
import { logger } from "../../lib/logger.js";

const SOURCE = "Arbeitnow";
const BASE_COLOR = "#6d28d9";
const API_BASE = "https://www.arbeitnow.com/api/job-board-api";

interface ArbeitnowJob {
  slug: string;
  company_name: string;
  title: string;
  description: string;
  remote: boolean;
  url: string;
  tags: string[];
  job_types: string[];
  location: string;
  created_at: number;
}

export async function scrapeArbeitnow(
  opts: SearchOptions,
  onJob: JobEmitter,
  onLog: LogEmitter
): Promise<ScrapedJob[]> {
  const results: ScrapedJob[] = [];

  try {
    onLog("info", `Arbeitnow: searching for "${opts.role}"...`);

    const maxDays = dateFilterToDays(opts.dateFilter);
    const cutoffTimestamp = Math.floor(Date.now() / 1000) - maxDays * 86400;

    // Arbeitnow API doesn't support keyword search — it returns ALL jobs.
    // We need to fetch multiple pages and filter client-side.
    // To improve relevance, also try the search page URL which may filter server-side.
    const roleSlug = opts.role.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    
    const apiUrls = [
      // Try search endpoint first (may support filtering)
      `${API_BASE}?search=${encodeURIComponent(opts.role)}&page=1`,
      `${API_BASE}?page=1`,
    ];

    let page = 1;
    const maxPages = 3;
    let usedUrl = apiUrls[0];

    // Test which URL returns relevant results
    for (const testUrl of apiUrls) {
      const testRes = await fetch(testUrl, {
        headers: { "User-Agent": "Mozilla/5.0 JobPilot/2.0", "Accept": "application/json" },
      });
      if (testRes.ok) {
        usedUrl = testUrl.replace(/page=\d+/, "page=");
        break;
      }
    }

    while (page <= maxPages) {
      const fetchUrl = usedUrl.includes("page=") 
        ? usedUrl + page 
        : `${usedUrl}&page=${page}`;
        
      const res = await fetch(fetchUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 JobPilot/2.0",
          "Accept": "application/json",
        },
      });

      if (!res.ok) {
        onLog("error", `Arbeitnow: HTTP ${res.status} — stopping`);
        break;
      }

      const data: { data: ArbeitnowJob[]; links?: any } = await res.json();
      const jobs = data.data || [];

      if (jobs.length === 0) break;

      let found = 0;
      for (const job of jobs) {
        // Date filter
        if (job.created_at < cutoffTimestamp) continue;

        // Role relevance filter
        if (!isJobRelevant(job.title, job.description, job.tags || [], opts.role, opts.aliases || [], opts.exclusions || [], opts.region)) continue;

        // Region filter — include remote and matching location
        const regionLower = opts.region.toLowerCase();
        const locationLower = (job.location || "").toLowerCase();
        const isLocationMatch =
          job.remote ||
          regionLower === "" ||
          locationLower.includes(regionLower) ||
          regionLower.includes(locationLower.split(",")[0] || "");

        if (!isLocationMatch) continue;

        const scrapedJob: ScrapedJob = {
          title: job.title,
          company: job.company_name,
          location: job.remote ? `Remote (${job.location || "Global"})` : job.location || "Not specified",
          salary: "Not listed",
          description: job.description.replace(/<[^>]*>/g, "").substring(0, 500),
          url: job.url,
          postedAt: new Date(job.created_at * 1000).toISOString(),
          source: SOURCE,
          externalId: `arbeitnow-${job.slug}`,
          logo: "AN",
          color: BASE_COLOR,
        };

        results.push(scrapedJob);
        onJob(scrapedJob);
        found++;
      }

      onLog("info", `Arbeitnow: page ${page} — ${found} relevant jobs`);

      if (!data.links || jobs.length < 50) break;
      page++;
      await new Promise((r) => setTimeout(r, 500));
    }

    onLog("success", `Arbeitnow: total ${results.length} listings`);
  } catch (err: any) {
    onLog("error", `Arbeitnow error: ${err.message}`);
    logger.error({ err }, "Arbeitnow scraper failed");
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
