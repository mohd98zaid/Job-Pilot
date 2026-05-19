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

    // RemoteOK API uses tags separated by commas or individual words.
    // Multi-word queries like "agentic AI" need to be split into individual tags
    // or simplified to the most relevant single tag.
    const roleLower = opts.role.toLowerCase();
    const tags = roleLower
      .replace(/[^a-z0-9\s]/g, "")  // Remove special chars
      .split(/\s+/)
      .filter(t => t.length > 1)
      .join(",");

    // Also try the full phrase as a single tag (hyphenated)
    const slugTag = roleLower.replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

    // Also try individual keywords (e.g., just "ai" for "agentic AI")
    const individualTags = roleLower
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter(t => t.length > 1);

    // Try multiple query formats for better coverage
    const urls = [
      `${API_URL}?tags=${encodeURIComponent(tags)}`,
      `${API_URL}?tags=${encodeURIComponent(slugTag)}`,
      // Also try each individual keyword (broader search)
      ...individualTags.map(t => `${API_URL}?tags=${encodeURIComponent(t)}`),
    ];
    // Deduplicate URLs
    const uniqueUrls = [...new Set(urls)];

    let allJobs: RemoteOKJob[] = [];
    const seenIds = new Set<string>();

    for (const apiUrl of uniqueUrls) {
      try {
        const res = await fetch(apiUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 JobPilot/2.0",
            "Accept": "application/json",
          },
        });

        if (!res.ok) continue;

        const raw: RemoteOKJob[] = await res.json();
        // First item is metadata, skip it
        const jobs = Array.isArray(raw) ? raw.slice(1) : [];
        for (const j of jobs) {
          if (!seenIds.has(j.id)) {
            seenIds.add(j.id);
            allJobs.push(j);
          }
        }
      } catch { /* try next URL */ }
    }

    const filtered = allJobs.filter((j) => {
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
