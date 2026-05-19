// artifacts/api-server/src/services/scrapers/jsearch.scraper.ts
// Uses the JSearch API (RapidAPI) to search Google Jobs data.
// This is optional — works if the user configures JSEARCH_API_KEY.
// Fallback: Uses a direct DuckDuckGo HTML scrape when no API key is set.

import { type ScrapedJob, type SearchOptions, type JobEmitter, type LogEmitter } from "./types.js";
import { isJobRelevant } from "./relevance.js";
import { logger } from "../../lib/logger.js";

const SOURCE_JSEARCH = "JSearch";
const SOURCE_DDG = "Web Search";
const BASE_COLOR = "#f59e0b";

interface JSearchJob {
  job_id: string;
  employer_name: string;
  job_title: string;
  job_city?: string;
  job_country?: string;
  job_description: string;
  job_apply_link: string;
  job_posted_at_timestamp?: number;
  job_min_salary?: number;
  job_max_salary?: number;
  job_salary_currency?: string;
}

/**
 * Scrape jobs via JSearch API (RapidAPI) if JSEARCH_API_KEY is set,
 * otherwise fall back to a DuckDuckGo HTML search.
 */
export async function scrapeJSearch(
  opts: SearchOptions,
  onJob: JobEmitter,
  onLog: LogEmitter
): Promise<ScrapedJob[]> {
  const apiKey = process.env["JSEARCH_API_KEY"];

  if (apiKey) {
    return scrapeViaJSearchApi(opts, onJob, onLog, apiKey);
  } else {
    return scrapeViaDuckDuckGo(opts, onJob, onLog);
  }
}

async function scrapeViaJSearchApi(
  opts: SearchOptions,
  onJob: JobEmitter,
  onLog: LogEmitter,
  apiKey: string
): Promise<ScrapedJob[]> {
  const results: ScrapedJob[] = [];

  try {
    onLog("info", `JSearch (RapidAPI): searching for "${opts.role}" in "${opts.region}"...`);

    const query = `${opts.role} ${opts.region}`;
    const datePosted = dateFilterToJSearchParam(opts.dateFilter);

    const res = await fetch(
      `https://jsearch.p.rapidapi.com/search?query=${encodeURIComponent(query)}&page=1&num_pages=2&date_posted=${datePosted}`,
      {
        headers: {
          "X-RapidAPI-Key": apiKey,
          "X-RapidAPI-Host": "jsearch.p.rapidapi.com",
        },
      }
    );

    if (!res.ok) {
      onLog("error", `JSearch API: HTTP ${res.status}`);
      return results;
    }

    const data: { data: JSearchJob[] } = await res.json();
    const jobs = data.data || [];

    for (const job of jobs) {
        const location = `${job.job_city || ""}, ${job.job_country || ""}`.trim();
        const salary = job.job_min_salary ? `$${job.job_min_salary} - $${job.job_max_salary}` : "Not listed";

        if (!isJobRelevant(job.job_title, job.job_description || "", [`loc:${location}`], opts.role, opts.aliases || [], opts.exclusions || [], opts.region)) {
          continue;
        }

        const scrapedJob: ScrapedJob = {
          title: job.job_title,
          company: job.employer_name,
          location,
          salary,
          description: (job.job_description || "").substring(0, 500),
          url: job.job_apply_link,
          postedAt: job.job_posted_at_timestamp
            ? new Date(job.job_posted_at_timestamp * 1000).toISOString()
            : undefined,
          source: SOURCE_JSEARCH,
          externalId: `jsearch-${job.job_id}`,
          logo: "JS",
          color: BASE_COLOR,
        };

        results.push(scrapedJob);
        onJob(scrapedJob);
      }

      onLog("success", `JSearch: found ${results.length} listings`);
    } catch (err: any) {
    onLog("error", `JSearch API error: ${err.message}`);
    logger.error({ err }, "JSearch scraper failed");
  }

  return results;
}

/**
 * DuckDuckGo HTML search fallback — no API key needed.
 * Searches for job listings on the web and extracts result snippets.
 */
async function scrapeViaDuckDuckGo(
  opts: SearchOptions,
  onJob: JobEmitter,
  onLog: LogEmitter
): Promise<ScrapedJob[]> {
  const results: ScrapedJob[] = [];

  try {
    onLog("info", `Web Search (DuckDuckGo): searching for "${opts.role}" jobs in "${opts.region}"...`);

    // Build targeted job search queries
    const queries = [
      `${opts.role} jobs in ${opts.region} site:linkedin.com/jobs`,
      `${opts.role} jobs in ${opts.region} site:indeed.com`,
      `"${opts.role}" "${opts.region}" hiring site:glassdoor.com`,
    ];

    for (const query of queries) {
      try {
        const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

        const res = await fetch(searchUrl, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "text/html",
            "Accept-Language": "en-US,en;q=0.9",
          },
        });

        if (!res.ok) continue;

        const html = await res.text();

        // DDG blocks most automated requests with anomaly detection
        if (html.includes("anomaly") || !html.includes("uddg=")) {
          onLog("info", `DuckDuckGo: blocked by anomaly detection — skipping`);
          break; // No point trying more queries if DDG is blocking us
        }

        const extracted = parseDDGResults(html, opts, SOURCE_DDG);

        for (const job of extracted) {
          // Deduplicate within session
          if (!results.some((r) => r.url === job.url)) {
            results.push(job);
            onJob(job);
          }
        }

        await new Promise((r) => setTimeout(r, 1200 + Math.random() * 800));
      } catch (qErr: any) {
        onLog("info", `DuckDuckGo: query failed — ${qErr.message}`);
      }
    }

    onLog("success", `Web Search: found ${results.length} job links`);
  } catch (err: any) {
    onLog("error", `Web Search error: ${err.message}`);
    logger.error({ err }, "DuckDuckGo scraper failed");
  }

  return results;
}

function parseDDGResults(html: string, opts: SearchOptions, source: string): ScrapedJob[] {
  const jobs: ScrapedJob[] = [];

  // DDG HTML endpoint uses multiple possible patterns depending on version.
  // Try multiple extraction strategies.

  // Strategy 1: Modern DDG HTML with result links
  const resultLinkPattern = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  const snippetAfterLink = /<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g;

  // Strategy 2: DDG with result-link class
  const altLinkPattern = /<a[^>]*class="[^"]*result-link[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;

  // Collect all links from both patterns
  const rawResults: Array<{ url: string; title: string; snippet: string }> = [];

  // Extract using Strategy 1
  let m: RegExpExecArray | null;
  const snippets: string[] = [];
  while ((m = snippetAfterLink.exec(html))) {
    snippets.push(cleanHtml(m[1]));
  }

  let idx = 0;
  while ((m = resultLinkPattern.exec(html))) {
    let url = decodeURIComponent(m[1] || "");
    // DDG wraps URLs in redirect: /l/?uddg=ENCODED_URL&rut=...
    if (url.includes("/l/?uddg=") || url.includes("duckduckgo.com/l/")) {
      try {
        const match = url.match(/[?&]uddg=([^&]+)/);
        if (match) url = decodeURIComponent(match[1]);
      } catch { /* keep original */ }
    }
    const title = cleanHtml(m[2]);
    rawResults.push({ url, title, snippet: snippets[idx] || "" });
    idx++;
  }

  // Extract using Strategy 2 if Strategy 1 found nothing
  if (rawResults.length === 0) {
    while ((m = altLinkPattern.exec(html))) {
      let url = decodeURIComponent(m[1] || "");
      if (url.includes("/l/?uddg=") || url.includes("duckduckgo.com/l/")) {
        try {
          const match = url.match(/[?&]uddg=([^&]+)/);
          if (match) url = decodeURIComponent(match[1]);
        } catch { /* keep original */ }
      }
      const title = cleanHtml(m[2]);
      rawResults.push({ url, title, snippet: "" });
    }
  }

  // Strategy 3: Fallback — extract all <a href> that point to job sites
  if (rawResults.length === 0) {
    const allLinksPattern = /<a[^>]*href="([^"]*(?:linkedin\.com\/jobs|indeed\.com|glassdoor\.com|greenhouse\.io|lever\.co|workable\.com)[^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
    while ((m = allLinksPattern.exec(html))) {
      let url = decodeURIComponent(m[1] || "");
      if (url.includes("/l/?uddg=") || url.includes("duckduckgo.com/l/")) {
        try {
          const match = url.match(/[?&]uddg=([^&]+)/);
          if (match) url = decodeURIComponent(match[1]);
        } catch { /* keep original */ }
      }
      const title = cleanHtml(m[2]);
      if (url.startsWith("http") && title.length > 3) {
        rawResults.push({ url, title, snippet: "" });
      }
    }
  }

  for (const { url, title: titleText, snippet } of rawResults) {
    if (!url.startsWith("http")) continue;

    const locationText = opts.region; 

    // Strict relevance check
    if (!isJobRelevant(titleText, snippet, [`loc:${locationText}`], opts.role, opts.aliases || [], opts.exclusions || [], opts.region)) continue;

    // Check if it's a job URL
    const isJobUrl =
      url.includes("linkedin.com/jobs") ||
      url.includes("indeed.com/viewjob") ||
      url.includes("indeed.com/job") ||
      url.includes("greenhouse.io") ||
      url.includes("lever.co") ||
      url.includes("workable.com") ||
      url.includes("smartrecruiters.com") ||
      url.includes("careers.") ||
      url.includes("/jobs/") ||
      url.includes("glassdoor.com/job") ||
      url.includes("bayt.com") ||
      url.includes("naukrigulf.com") ||
      url.includes("gulftalent.com");

    if (!isJobUrl) continue;

    // Try to extract company from title like "Senior Engineer at Google | LinkedIn"
    const atMatch = titleText.match(/(.+?)\s+at\s+(.+?)(?:\s+[|–-]|$)/i);
    const title = atMatch ? atMatch[1].trim() : opts.role;
    const company = atMatch ? atMatch[2].trim() : extractDomainName(url);

    jobs.push({
      title,
      company,
      location: opts.region || "Remote",
      salary: "Not listed",
      description: snippet,
      url,
      source,
      externalId: `ddg-${Buffer.from(url).toString("base64").substring(0, 20)}`,
      logo: "WS",
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

function extractDomainName(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, "").split(".")[0] || "Unknown";
  } catch {
    return "Unknown";
  }
}

function dateFilterToJSearchParam(dateFilter?: string): string {
  if (!dateFilter) return "week";
  if (dateFilter.includes("24")) return "today";
  if (dateFilter.includes("7")) return "week";
  if (dateFilter.includes("30")) return "month";
  return "week";
}

function formatSalary(
  min?: number,
  max?: number,
  currency: string = "USD"
): string {
  if (!min && !max) return "Not listed";
  const fmt = (n: number) =>
    currency === "USD" || currency === "GBP" || currency === "EUR"
      ? `${n >= 1000 ? `${(n / 1000).toFixed(0)}k` : n}`
      : `${n}`;
  if (min && max) return `${currency} ${fmt(min)}–${fmt(max)}`;
  if (min) return `${currency} ${fmt(min)}+`;
  return `${currency} up to ${fmt(max!)}`;
}
