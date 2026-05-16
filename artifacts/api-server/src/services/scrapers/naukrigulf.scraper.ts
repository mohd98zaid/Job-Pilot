// artifacts/api-server/src/services/scrapers/naukrigulf.scraper.ts
// NaukriGulf — the Gulf-specific version of Naukri, covering UAE, Saudi Arabia, Qatar, etc.
// Uses NaukriGulf's public search API (JSON endpoint, no login required).

import { type ScrapedJob, type SearchOptions, type JobEmitter, type LogEmitter } from "./types.js";
import { isJobRelevant } from "./relevance.js";
import { logger } from "../../lib/logger.js";

const SOURCE = "NaukriGulf";
const BASE_COLOR = "#e63946";

interface NaukriGulfJob {
  jobId?: string;
  title?: string;
  companyName?: string;
  location?: string;
  salary?: string;
  experience?: string;
  skills?: string[];
  postedOn?: string;
  jobUrl?: string;
  description?: string;
}

export async function scrapeNaukriGulf(
  opts: SearchOptions,
  onJob: JobEmitter,
  onLog: LogEmitter
): Promise<ScrapedJob[]> {
  const results: ScrapedJob[] = [];

  try {
    onLog("info", `NaukriGulf: searching for "${opts.role}" in "${opts.region}"...`);

    // NaukriGulf's public search endpoint (same pattern as Naukri India)
    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept": "application/json, text/html,*/*",
      "Accept-Language": "en-US,en;q=0.9",
      "Referer": "https://www.naukrigulf.com/",
      "systemId": "default",
    };

    // Try up to 3 pages
    for (let page = 1; page <= 3; page++) {
      const searchUrl = `https://www.naukrigulf.com/njapi/v2/job/search?` +
        `searchType=query` +
        `&keyword=${encodeURIComponent(opts.role)}` +
        `&location=${encodeURIComponent(opts.region)}` +
        `&pageNo=${page}` +
        `&noOfResults=25` +
        `&sort=1`; // sort=1 → newest first

      const res = await fetch(searchUrl, { headers });

      if (!res.ok) {
        if (res.status === 429 || res.status === 403) {
          onLog("info", `NaukriGulf: rate limited on page ${page} — stopping`);
          break;
        }
        // Try HTML fallback
        if (page === 1) {
          await scrapeNaukriGulfHtml(opts, onJob, onLog, results);
        }
        break;
      }

      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("json")) {
        // Got HTML back — fall through to HTML scraper
        if (page === 1) await scrapeNaukriGulfHtml(opts, onJob, onLog, results);
        break;
      }

      const data = await res.json();
      const jobs: NaukriGulfJob[] = data?.jobDetails || data?.data || data?.jobs || [];

      if (!jobs.length) break;

      for (const job of jobs) {
        const title = job.title?.trim() || "";
        const company = job.companyName?.trim() || "Unknown";
        const location = job.location?.trim() || opts.region;

        if (!title) continue;

        if (!isJobRelevant(
          title,
          job.description || (job.skills || []).join(" "),
          [`loc:${location}`],
          opts.role,
          opts.aliases || [],
          opts.exclusions || [],
          opts.region
        )) continue;

        const url = job.jobUrl?.startsWith("http")
          ? job.jobUrl
          : `https://www.naukrigulf.com${job.jobUrl || ""}`;

        const scrapedJob: ScrapedJob = {
          title,
          company,
          location,
          salary: job.salary || "Not listed",
          description: job.description?.substring(0, 500) || (job.skills || []).join(", "),
          url,
          postedAt: job.postedOn,
          source: SOURCE,
          externalId: `ng-${job.jobId || Buffer.from(url).toString("base64").substring(0, 12)}`,
          logo: "NG",
          color: BASE_COLOR,
        };

        results.push(scrapedJob);
        onJob(scrapedJob);
      }

      await new Promise((r) => setTimeout(r, 600 + Math.random() * 500));
    }

    onLog("success", `NaukriGulf: found ${results.length} listings`);
  } catch (err: any) {
    onLog("error", `NaukriGulf error: ${err.message}`);
    logger.error({ err }, "NaukriGulf scraper failed");
  }

  return results;
}

/**
 * HTML fallback — scrape NaukriGulf's search page directly when the JSON API returns HTML.
 */
async function scrapeNaukriGulfHtml(
  opts: SearchOptions,
  onJob: JobEmitter,
  onLog: LogEmitter,
  results: ScrapedJob[]
): Promise<void> {
  try {
    const roleSlug = opts.role.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const regionSlug = opts.region.toLowerCase().replace(/[\s/,]+/g, "-").replace(/[^a-z0-9-]/g, "");
    const url = `https://www.naukrigulf.com/${roleSlug}-jobs-in-${regionSlug}`;

    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!res.ok) return;

    const html = await res.text();

    // NaukriGulf embeds job data in a JSON script tag
    const jsonMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});\s*<\/script>/);
    if (jsonMatch) {
      try {
        const state = JSON.parse(jsonMatch[1]);
        const jobs: any[] = state?.jobSearch?.jobData || state?.jobList || [];

        for (const job of jobs.slice(0, 30)) {
          const title = job.title || job.jobTitle || "";
          const company = job.companyName || job.company || "Unknown";
          const location = job.location || opts.region;

          if (!title || !isJobRelevant(title, "", [`loc:${location}`], opts.role, opts.aliases || [], [], opts.region)) continue;

          const jobUrl = job.jobUrl || job.applyUrl || `https://www.naukrigulf.com/job-${job.jobId}`;
          const scrapedJob: ScrapedJob = {
            title,
            company,
            location,
            salary: job.salary || "Not listed",
            url: jobUrl.startsWith("http") ? jobUrl : `https://www.naukrigulf.com${jobUrl}`,
            postedAt: job.postedOn,
            source: SOURCE,
            externalId: `ng-${job.jobId || Date.now()}`,
            logo: "NG",
            color: BASE_COLOR,
          };

          results.push(scrapedJob);
          onJob(scrapedJob);
        }
        return;
      } catch (_) {}
    }

    // Regex fallback on HTML
    const titleRe = /<a[^>]*class="[^"]*designation[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
    const companyRe = /<span[^>]*class="[^"]*company-name[^"]*"[^>]*>([\s\S]*?)<\/span>/gi;
    const locationRe = /<span[^>]*class="[^"]*location[^"]*"[^>]*>([\s\S]*?)<\/span>/gi;
    const linkRe = /<a[^>]*href="(\/[^"]*job[^"]*)"[^>]*>/gi;

    const titles: string[] = [], companies: string[] = [], locations: string[] = [], links: string[] = [];
    let m: RegExpExecArray | null;

    while ((m = titleRe.exec(html))) titles.push(m[1].replace(/<[^>]*>/g, "").trim());
    while ((m = companyRe.exec(html))) companies.push(m[1].replace(/<[^>]*>/g, "").trim());
    while ((m = locationRe.exec(html))) locations.push(m[1].replace(/<[^>]*>/g, "").trim());
    while ((m = linkRe.exec(html))) links.push(`https://www.naukrigulf.com${m[1]}`);

    for (let i = 0; i < Math.min(titles.length, companies.length); i++) {
      const title = titles[i];
      const company = companies[i];
      if (!title || !company) continue;
      if (!isJobRelevant(title, "", [`loc:${locations[i] || ""}`], opts.role, opts.aliases || [], [], opts.region)) continue;

      const scrapedJob: ScrapedJob = {
        title, company,
        location: locations[i] || opts.region,
        salary: "Not listed",
        url: links[i] || `https://www.naukrigulf.com/jobs?q=${encodeURIComponent(opts.role)}`,
        source: SOURCE,
        externalId: `ng-html-${i}-${Date.now()}`,
        logo: "NG",
        color: BASE_COLOR,
      };

      results.push(scrapedJob);
      onJob(scrapedJob);
    }
  } catch (err: any) {
    logger.warn({ err }, "NaukriGulf HTML fallback failed");
  }
}
