// artifacts/api-server/src/services/scrapers/linkedin-guest.scraper.ts
// Uses LinkedIn's public guest JSON API — no login, no Playwright required.
// This is the same endpoint LinkedIn uses on its public job listing pages.

import { type ScrapedJob, type SearchOptions, type JobEmitter, type LogEmitter } from "./types.js";
import { isJobRelevant } from "./relevance.js";
import { logger } from "../../lib/logger.js";

const SOURCE = "LinkedIn";
const BASE_COLOR = "#0A66C2";

function toTimeParam(dateFilter?: string): string {
  if (!dateFilter) return "r604800"; // default: 7 days
  if (dateFilter.includes("24")) return "r86400";
  if (dateFilter.includes("7")) return "r604800";
  if (dateFilter.includes("14")) return "r1209600";
  if (dateFilter.includes("30")) return "r2592000";
  return "r604800";
}

interface LinkedInGuestJob {
  title?: string;
  companyName?: string;
  location?: string;
  listedAt?: number;
  jobState?: string;
  entityUrn?: string;
  trackingUrn?: string;
}

export async function scrapeLinkedInGuest(
  opts: SearchOptions,
  onJob: JobEmitter,
  onLog: LogEmitter
): Promise<ScrapedJob[]> {
  const results: ScrapedJob[] = [];
  const tpr = toTimeParam(opts.dateFilter);
  const seen = new Set<string>();

  try {
    onLog("info", `LinkedIn (guest API): searching for "${opts.role}" in "${opts.region}"...`);

    const maxPages = 5;   // 5 pages × 25 results = up to 125 candidates
    const pageSize = 25;
    let consecutiveEmpty = 0;

    for (let page = 0; page < maxPages; page++) {
      const start = page * pageSize;

      // LinkedIn guest API — two endpoints (try both for resilience)
      const primaryUrl =
        `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search` +
        `?keywords=${encodeURIComponent(opts.role)}` +
        `&location=${encodeURIComponent(opts.region)}` +
        `&f_TPR=${tpr}` +
        `&f_JT=F,P,C` + // Full-time, Part-time, Contract
        `&start=${start}`;

      let res = await fetch(primaryUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
          "Referer": "https://www.linkedin.com/jobs/search/",
          "X-Li-Lang": "en_US",
          "X-Requested-With": "XMLHttpRequest",
        },
      });

      if (res.status === 429) {
        onLog("info", `LinkedIn guest: rate limited on page ${page + 1} — waiting 3s then retrying once`);
        await new Promise((r) => setTimeout(r, 3000));
        res = await fetch(primaryUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
        if (res.status === 429) { onLog("info", "LinkedIn guest: still rate limited — stopping"); break; }
      }

      if (!res.ok) {
        onLog("error", `LinkedIn guest: HTTP ${res.status} on page ${page + 1}`);
        break;
      }

      const html = await res.text();

      // Parse job cards card-by-card (not via global regex arrays)
      const extracted = parseLinkedInHtml(html, opts.region);

      if (extracted.length === 0) {
        consecutiveEmpty++;
        if (consecutiveEmpty >= 2) break; // Stop if two pages in a row are empty
        continue;
      }
      consecutiveEmpty = 0;

      for (const job of extracted) {
        if (seen.has(job.externalId || job.url)) continue;
        seen.add(job.externalId || job.url);

        if (!isJobRelevant(
          job.title,
          job.description || "",
          [`loc:${job.location}`],
          opts.role,
          opts.aliases || [],
          opts.exclusions || [],
          opts.region
        )) continue;

        results.push(job);
        onJob(job);
      }

      // Respectful delay (800–1500ms)
      await new Promise((r) => setTimeout(r, 800 + Math.random() * 700));
    }

    onLog("success", `LinkedIn (guest): found ${results.length} listings`);
  } catch (err: any) {
    onLog("error", `LinkedIn guest error: ${err.message}`);
    logger.error({ err }, "LinkedIn guest scraper failed");
  }

  return results;
}

/**
 * Parse LinkedIn's server-rendered HTML fragments (returned by the guest API).
 * Parses CARD-BY-CARD to prevent array misalignment from missing fields in some cards.
 */
function parseLinkedInHtml(html: string, defaultRegion: string): ScrapedJob[] {
  const jobs: ScrapedJob[] = [];

  // Split HTML into individual job cards using the data-entity-urn boundary
  // LinkedIn wraps each job in a <li> or <div class="base-card">
  // We split on job card boundaries then extract from each chunk independently
  const cardBoundary = html.split(/(?=<(?:li|div)[^>]*(?:class="[^"]*base-card[^"]*"|data-entity-urn))/i);

  for (const chunk of cardBoundary) {
    // Skip header/footer chunks that don't contain job data
    if (!chunk.includes("base-search-card__title") && !chunk.includes("data-entity-urn")) continue;

    // Extract each field from within this single card chunk
    const titleMatch = chunk.match(/<h3[^>]*class="[^"]*base-search-card__title[^"]*"[^>]*>\s*([\s\S]*?)\s*<\/h3>/);
    const companyMatch = chunk.match(/<h4[^>]*class="[^"]*base-search-card__subtitle[^"]*"[^>]*>[\s\S]*?<a[^>]*>\s*([\s\S]*?)\s*<\/a>/);
    const locationMatch = chunk.match(/<span[^>]*class="[^"]*job-search-card__location[^"]*"[^>]*>\s*([\s\S]*?)\s*<\/span>/);
    const linkMatch = chunk.match(/href="(https:\/\/[^"]*linkedin\.com\/jobs\/view\/[^"]*)"/);
    const timeMatch = chunk.match(/<time[^>]*datetime="([^"]*)"/);
    const jobIdMatch = chunk.match(/data-entity-urn="urn:li:jobPosting:(\d+)"/);
    const listDateMatch = chunk.match(/job-search-card__listdate[^>]*>\s*([\s\S]*?)\s*<\/time>/);

    const title = titleMatch ? cleanHtml(titleMatch[1]) : "";
    const company = companyMatch ? cleanHtml(companyMatch[1]) : "";

    if (!title || !company) continue;

    const jobId = jobIdMatch?.[1];
    const url = (linkMatch?.[1]?.split("?")[0]) ||
      (jobId ? `https://www.linkedin.com/jobs/view/${jobId}` : "");

    if (!url) continue;

    const location = locationMatch ? cleanHtml(locationMatch[1]) : defaultRegion;
    const postedAt = timeMatch?.[1] || listDateMatch?.[1];

    jobs.push({
      title,
      company,
      location,
      salary: "Not listed",
      url,
      postedAt,
      source: SOURCE,
      externalId: jobId ? `li-${jobId}` : url,
      logo: "LI",
      color: BASE_COLOR,
    });
  }

  return jobs;
}

function cleanHtml(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
